const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { isAdmin } = require('../middleware/tenant');
const { processClaimAutoApproval, manualApproveClaim, rejectClaim, validateClaimCategory, getAllowedClaimTypesForEmployee } = require('../utils/claimsAutomation');
const { logClaimAction } = require('../utils/auditLog');

// Get all claims
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, status, month, year, unlinked_only, department_id, outlet_id } = req.query;
    const companyId = req.companyId;

    // CRITICAL: Tenant isolation - must have company context
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    let query = `
      SELECT c.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             d.name as department_name,
             o.name as outlet_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.company_id = $1
    `;
    const params = [companyId];
    let paramCount = 1;

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

    // Filter by department (for AA Alive)
    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    // Filter by outlet (for Mimix)
    if (outlet_id) {
      paramCount++;
      query += ` AND e.outlet_id = $${paramCount}`;
      params.push(outlet_id);
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
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'pending' AND e.company_id = $1
    `, [companyId]);
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
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    let query = `
      SELECT
        c.category,
        COUNT(*) as count,
        SUM(c.amount) FILTER (WHERE c.status = 'approved') as total_amount,
        SUM(c.amount) FILTER (WHERE c.status = 'pending') as pending_amount,
        COUNT(*) FILTER (WHERE c.status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE c.status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE c.status = 'rejected') as rejected_count
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE e.company_id = $1
    `;
    const params = [companyId];

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM c.claim_date) = $2 AND EXTRACT(YEAR FROM c.claim_date) = $3`;
      params.push(month, year);
    }

    query += ' GROUP BY c.category ORDER BY c.category';

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
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    let query = `
      SELECT c.employee_id, SUM(c.amount) as total_claims
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'approved'
        AND c.linked_payroll_item_id IS NULL
        AND c.claim_date BETWEEN $1 AND $2
        AND e.company_id = $3
    `;
    const params = [startOfMonth, endOfMonth, companyId];

    if (employee_id) {
      query += ` AND c.employee_id = $4`;
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

    // Apply accommodation cap - hotel claims capped at RM80
    let finalAmount = parseFloat(amount);
    let amountCapped = false;
    const ACCOMMODATION_CAP = 80.00;

    if (category.toLowerCase() === 'accommodation' && finalAmount > ACCOMMODATION_CAP) {
      finalAmount = ACCOMMODATION_CAP;
      amountCapped = true;
    }

    const result = await pool.query(`
      INSERT INTO claims (employee_id, claim_date, category, description, amount, receipt_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [employee_id, claim_date, category.toUpperCase(), description, finalAmount, receipt_url]);

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
      auto_approval_result: autoApprovalResult,
      amount_capped: amountCapped,
      original_amount: amountCapped ? parseFloat(amount) : null,
      cap_message: amountCapped ? `Accommodation claim capped from RM${parseFloat(amount).toFixed(2)} to RM${ACCOMMODATION_CAP.toFixed(2)}` : null
    });
  } catch (error) {
    console.error('Error creating claim:', error);
    res.status(500).json({ error: 'Failed to create claim' });
  }
});

// Update claim
// Admin can edit any claim (including amount) as long as it's not linked to payroll
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { claim_date, category, description, amount, receipt_url } = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Check if claim exists and belongs to this company
    const claimCheck = await pool.query(`
      SELECT c.*, e.company_id
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.id = $1 AND e.company_id = $2
    `, [id, companyId]);

    if (claimCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimCheck.rows[0];

    // Cannot update claims linked to payroll
    if (claim.linked_payroll_item_id) {
      return res.status(400).json({
        error: 'Cannot update claim linked to payroll',
        message: 'This claim is already included in a payroll run and cannot be modified.'
      });
    }

    // Admin can update any claim status, non-admin can only update pending
    if (!isAdmin(req) && claim.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending claims can be updated' });
    }

    // Apply accommodation cap - hotel claims capped at RM80
    let finalAmount = amount ? parseFloat(amount) : null;
    let amountCapped = false;
    const ACCOMMODATION_CAP = 80.00;
    const effectiveCategory = category || claim.category;

    if (finalAmount && effectiveCategory.toLowerCase() === 'accommodation' && finalAmount > ACCOMMODATION_CAP) {
      finalAmount = ACCOMMODATION_CAP;
      amountCapped = true;
    }

    const result = await pool.query(`
      UPDATE claims
      SET claim_date = COALESCE($1, claim_date),
          category = COALESCE($2, category),
          description = COALESCE($3, description),
          amount = COALESCE($4, amount),
          receipt_url = COALESCE($5, receipt_url),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [claim_date, category, description, finalAmount, receipt_url, id]);

    res.json({
      ...result.rows[0],
      amount_capped: amountCapped,
      original_amount: amountCapped ? parseFloat(amount) : null,
      cap_message: amountCapped ? `Accommodation claim capped from RM${parseFloat(amount).toFixed(2)} to RM${ACCOMMODATION_CAP.toFixed(2)}` : null
    });
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

// Revert approved claim back to pending
router.post('/:id/revert', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Check if claim exists and belongs to this company
    const claimCheck = await pool.query(`
      SELECT c.*, e.company_id
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.id = $1 AND e.company_id = $2
    `, [id, companyId]);

    if (claimCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimCheck.rows[0];

    // Can only revert approved claims
    if (claim.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved claims can be reverted' });
    }

    // Cannot revert claims linked to payroll
    if (claim.linked_payroll_item_id) {
      return res.status(400).json({
        error: 'Cannot revert claim linked to payroll',
        message: 'This claim is already included in a payroll run and cannot be reverted.'
      });
    }

    // Revert to pending status
    const result = await pool.query(`
      UPDATE claims
      SET status = 'pending',
          approved_at = NULL,
          auto_approved = false,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    // Log the revert action
    try {
      await logClaimAction(id, req.admin.id, 'revert', 'Reverted from approved to pending');
    } catch (logErr) {
      console.log('Audit log failed (non-critical):', logErr.message);
    }

    res.json({ message: 'Claim reverted to pending', claim: result.rows[0] });
  } catch (error) {
    console.error('Error reverting claim:', error);
    res.status(500).json({ error: 'Failed to revert claim' });
  }
});

// Bulk approve claims
router.post('/bulk-approve', authenticateAdmin, async (req, res) => {
  try {
    const { claim_ids } = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!claim_ids || !Array.isArray(claim_ids) || claim_ids.length === 0) {
      return res.status(400).json({ error: 'Claim IDs are required' });
    }

    // CRITICAL: Only approve claims belonging to this company
    // Also prevent approving already-linked claims
    const result = await pool.query(`
      UPDATE claims c
      SET status = 'approved', approved_at = NOW(), updated_at = NOW()
      FROM employees e
      WHERE c.employee_id = e.id
        AND e.company_id = $1
        AND c.id = ANY($2)
        AND c.status = 'pending'
        AND c.linked_payroll_item_id IS NULL
      RETURNING c.id
    `, [companyId, claim_ids]);

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
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    // CRITICAL: Only link claims for employees in this company
    const result = await pool.query(`
      UPDATE claims c
      SET linked_payroll_item_id = $1, updated_at = NOW()
      FROM employees e
      WHERE c.employee_id = e.id
        AND e.company_id = $5
        AND c.employee_id = $2
        AND c.status = 'approved'
        AND c.linked_payroll_item_id IS NULL
        AND c.claim_date BETWEEN $3 AND $4
      RETURNING c.id
    `, [payroll_item_id, employee_id, startOfMonth, endOfMonth, companyId]);

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
// Admin can delete any claim (pending, approved, rejected) as long as it's not linked to payroll
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Check if claim is linked to payroll (cannot delete linked claims)
    const claimCheck = await pool.query(`
      SELECT c.*, e.company_id
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.id = $1 AND e.company_id = $2
    `, [id, companyId]);

    if (claimCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimCheck.rows[0];

    // Cannot delete claims linked to payroll
    if (claim.linked_payroll_item_id) {
      return res.status(400).json({
        error: 'Cannot delete claim linked to payroll',
        message: 'This claim is already included in a payroll run and cannot be deleted.'
      });
    }

    // Admin can delete any claim status, non-admin can only delete pending
    if (!isAdmin(req) && claim.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending claims can be deleted' });
    }

    await pool.query('DELETE FROM claims WHERE id = $1', [id]);

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

// Get claim restrictions/rules
router.get('/restrictions', authenticateAdmin, async (req, res) => {
  try {
    // Return claim restrictions and rules
    const restrictions = [
      {
        category: 'accommodation',
        label: 'Accommodation/Hotel',
        maxAmount: 80.00,
        rule: 'Hotel claims must not exceed RM80 per night. Claims above RM80 will be automatically capped at RM80.',
        autoCapEnabled: true
      },
      {
        category: 'meal',
        label: 'Meal/Entertainment',
        maxAmount: 50.00,
        rule: 'Meal claims should not exceed RM50 per claim.',
        autoCapEnabled: false
      },
      {
        category: 'parking',
        label: 'Parking',
        maxAmount: 30.00,
        rule: 'Parking claims should not exceed RM30 per day.',
        autoCapEnabled: false
      },
      {
        category: 'toll',
        label: 'Toll',
        maxAmount: null,
        rule: 'Toll claims require receipt for verification.',
        autoCapEnabled: false
      },
      {
        category: 'travel',
        label: 'Travel/Transport',
        maxAmount: 200.00,
        rule: 'Travel claims should not exceed RM200 per trip. E-hailing receipts required.',
        autoCapEnabled: false
      },
      {
        category: 'fuel',
        label: 'Fuel/Petrol',
        maxAmount: null,
        rule: 'Fuel claims require petrol receipt with vehicle number.',
        autoCapEnabled: false
      },
      {
        category: 'medical',
        label: 'Medical',
        maxAmount: 500.00,
        rule: 'Medical claims require original receipt from clinic/pharmacy.',
        autoCapEnabled: false
      },
      {
        category: 'phone',
        label: 'Phone/Internet',
        maxAmount: 100.00,
        rule: 'Phone/Internet claims capped at RM100 per month.',
        autoCapEnabled: false
      },
      {
        category: 'office_supplies',
        label: 'Office Supplies',
        maxAmount: null,
        rule: 'Office supplies must be pre-approved by supervisor.',
        autoCapEnabled: false
      },
      {
        category: 'other',
        label: 'Other',
        maxAmount: null,
        rule: 'Other expenses require detailed description and receipt.',
        autoCapEnabled: false
      }
    ];
    res.json(restrictions);
  } catch (error) {
    console.error('Error fetching restrictions:', error);
    res.status(500).json({ error: 'Failed to fetch restrictions' });
  }
});

module.exports = router;
