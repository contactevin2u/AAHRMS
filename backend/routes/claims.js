const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { processClaimAutoApproval, manualApproveClaim, rejectClaim, validateClaimCategory, getAllowedClaimTypesForEmployee } = require('../utils/claimsAutomation');
const { logClaimAction } = require('../utils/auditLog');

// Get all claims
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, status, month, year, unlinked_only } = req.query;

    let query = `
      SELECT c.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             d.name as department_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (employee_id) {
      paramCount++;
      query += ` AND c.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (status) {
      paramCount++;
      query += ` AND c.status = $${paramCount}`;
      params.push(status);
    }

    if (month && year) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM c.claim_date) = $${paramCount}`;
      params.push(month);
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM c.claim_date) = $${paramCount}`;
      params.push(year);
    }

    if (unlinked_only === 'true') {
      query += ` AND c.linked_payroll_item_id IS NULL`;
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Get pending claims count
router.get('/pending-count', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM claims WHERE status = 'pending'"
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching pending count:', error);
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

// Get claims summary by category
router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;

    let query = `
      SELECT
        category,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count
      FROM claims
      WHERE 1=1
    `;
    const params = [];

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM claim_date) = $1 AND EXTRACT(YEAR FROM claim_date) = $2`;
      params.push(month, year);
    }

    query += ' GROUP BY category ORDER BY category';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims summary:', error);
    res.status(500).json({ error: 'Failed to fetch claims summary' });
  }
});

// Get claims for payroll (approved, unlinked, in date range)
router.get('/for-payroll', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    let query = `
      SELECT c.employee_id, SUM(c.amount) as total_claims
      FROM claims c
      WHERE c.status = 'approved'
        AND c.linked_payroll_item_id IS NULL
        AND c.claim_date BETWEEN $1 AND $2
    `;
    const params = [startOfMonth, endOfMonth];

    if (employee_id) {
      query += ` AND c.employee_id = $3`;
      params.push(employee_id);
    }

    query += ' GROUP BY c.employee_id';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims for payroll:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Get allowed claim types for an employee (for dropdown filtering)
router.get('/allowed-types/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const restrictions = await getAllowedClaimTypesForEmployee(employeeId);
    res.json(restrictions);
  } catch (error) {
    console.error('Error fetching allowed claim types:', error);
    res.status(500).json({ error: 'Failed to fetch allowed claim types' });
  }
});

// Create claim
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, claim_date, category, description, amount, receipt_url } = req.body;

    if (!employee_id || !claim_date || !category || !amount) {
      return res.status(400).json({ error: 'Employee, date, category, and amount are required' });
    }

    // Validate claim category against department restrictions
    const validation = await validateClaimCategory(employee_id, category);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.reason,
        allowedTypes: validation.allowedTypes
      });
    }

    const result = await pool.query(`
      INSERT INTO claims (employee_id, claim_date, category, description, amount, receipt_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [employee_id, claim_date, category.toUpperCase(), description, amount, receipt_url]);

    const claim = result.rows[0];

    // Try auto-approval processing
    let autoApprovalResult = null;
    try {
      autoApprovalResult = await processClaimAutoApproval(claim.id);
      if (autoApprovalResult.autoApproved) {
        // Re-fetch the claim to get updated status
        const updatedClaim = await pool.query('SELECT * FROM claims WHERE id = $1', [claim.id]);
        return res.status(201).json({
          ...updatedClaim.rows[0],
          auto_approval_result: autoApprovalResult
        });
      }
    } catch (autoErr) {
      console.log('Auto-approval check failed (non-critical):', autoErr.message);
    }

    res.status(201).json({
      ...claim,
      auto_approval_result: autoApprovalResult
    });
  } catch (error) {
    console.error('Error creating claim:', error);
    res.status(500).json({ error: 'Failed to create claim' });
  }
});

// Update claim
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { claim_date, category, description, amount, receipt_url } = req.body;

    const result = await pool.query(`
      UPDATE claims
      SET claim_date = $1, category = $2, description = $3, amount = $4, receipt_url = $5, updated_at = NOW()
      WHERE id = $6 AND status = 'pending'
      RETURNING *
    `, [claim_date, category, description, amount, receipt_url, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found or not pending' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating claim:', error);
    res.status(500).json({ error: 'Failed to update claim' });
  }
});

// Approve claim (with audit logging)
router.post('/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await manualApproveClaim(id, req.admin.id, notes);

    if (!result.success) {
      return res.status(404).json({ error: result.reason });
    }

    res.json({ message: 'Claim approved', claim: result.claim });
  } catch (error) {
    console.error('Error approving claim:', error);
    res.status(500).json({ error: 'Failed to approve claim' });
  }
});

// Reject claim (with audit logging)
router.post('/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await rejectClaim(id, req.admin.id, rejection_reason);

    if (!result.success) {
      return res.status(404).json({ error: result.reason });
    }

    res.json({ message: 'Claim rejected', claim: result.claim });
  } catch (error) {
    console.error('Error rejecting claim:', error);
    res.status(500).json({ error: 'Failed to reject claim' });
  }
});

// Bulk approve claims
router.post('/bulk-approve', authenticateAdmin, async (req, res) => {
  try {
    const { claim_ids } = req.body;

    if (!claim_ids || !Array.isArray(claim_ids) || claim_ids.length === 0) {
      return res.status(400).json({ error: 'Claim IDs are required' });
    }

    const result = await pool.query(`
      UPDATE claims
      SET status = 'approved', approved_at = NOW(), updated_at = NOW()
      WHERE id = ANY($1) AND status = 'pending'
      RETURNING id
    `, [claim_ids]);

    res.json({
      message: `${result.rows.length} claims approved`,
      approved_ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error bulk approving claims:', error);
    res.status(500).json({ error: 'Failed to approve claims' });
  }
});

// Link claims to payroll item (called during payroll generation)
router.post('/link-to-payroll', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, payroll_item_id, month, year } = req.body;

    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await pool.query(`
      UPDATE claims
      SET linked_payroll_item_id = $1, updated_at = NOW()
      WHERE employee_id = $2
        AND status = 'approved'
        AND linked_payroll_item_id IS NULL
        AND claim_date BETWEEN $3 AND $4
      RETURNING id
    `, [payroll_item_id, employee_id, startOfMonth, endOfMonth]);

    res.json({
      message: `${result.rows.length} claims linked to payroll`,
      linked_ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error linking claims to payroll:', error);
    res.status(500).json({ error: 'Failed to link claims' });
  }
});

// Delete claim
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM claims WHERE id = $1 AND status = $2 RETURNING *',
      [id, 'pending']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found or cannot be deleted (not pending)' });
    }

    res.json({ message: 'Claim deleted' });
  } catch (error) {
    console.error('Error deleting claim:', error);
    res.status(500).json({ error: 'Failed to delete claim' });
  }
});

// Get claim categories (for dropdown)
router.get('/categories', authenticateAdmin, async (req, res) => {
  try {
    // Return predefined categories
    const categories = [
      { value: 'travel', label: 'Travel/Transport' },
      { value: 'parking', label: 'Parking' },
      { value: 'toll', label: 'Toll' },
      { value: 'meal', label: 'Meal/Entertainment' },
      { value: 'accommodation', label: 'Accommodation' },
      { value: 'medical', label: 'Medical' },
      { value: 'phone', label: 'Phone/Internet' },
      { value: 'office_supplies', label: 'Office Supplies' },
      { value: 'fuel', label: 'Fuel/Petrol' },
      { value: 'other', label: 'Other' }
    ];
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
