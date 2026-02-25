/**
 * Salary Advances API
 *
 * Manage salary advances given to employees.
 * Advances are automatically deducted from payroll based on deduction method.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get all advances (with filters)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, status, month, year, department_id, outlet_id } = req.query;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    let query = `
      SELECT sa.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             au.name as approved_by_name,
             cu.name as created_by_name
      FROM salary_advances sa
      JOIN employees e ON sa.employee_id = e.id
      LEFT JOIN admin_users au ON sa.approved_by = au.id
      LEFT JOIN admin_users cu ON sa.created_by = cu.id
      WHERE sa.company_id = $1
    `;
    const params = [companyId];
    let paramCount = 1;

    if (employee_id) {
      paramCount++;
      query += ` AND sa.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (status) {
      paramCount++;
      query += ` AND sa.status = $${paramCount}`;
      params.push(status);
    }

    if (month && year) {
      paramCount++;
      query += ` AND sa.expected_deduction_month = $${paramCount}`;
      params.push(month);
      paramCount++;
      query += ` AND sa.expected_deduction_year = $${paramCount}`;
      params.push(year);
    }

    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (outlet_id) {
      paramCount++;
      query += ` AND e.outlet_id = $${paramCount}`;
      params.push(outlet_id);
    }

    query += ' ORDER BY sa.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching advances:', error);
    res.status(500).json({ error: 'Failed to fetch advances' });
  }
});

// Get advances summary for payroll period
router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, department_id, outlet_id } = req.query;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get pending advances per employee for the given month
    let query = `
      SELECT
        sa.employee_id,
        e.name as employee_name,
        e.employee_id as emp_code,
        SUM(sa.amount) as total_advances,
        SUM(sa.total_deducted) as total_deducted,
        SUM(sa.remaining_balance) as total_remaining,
        SUM(
          CASE
            WHEN sa.deduction_method = 'full' THEN sa.remaining_balance
            WHEN sa.deduction_method = 'installment' THEN LEAST(sa.installment_amount, sa.remaining_balance)
            ELSE sa.remaining_balance
          END
        ) as deduction_this_month
      FROM salary_advances sa
      JOIN employees e ON sa.employee_id = e.id
      WHERE sa.company_id = $1
        AND sa.status = 'active'
        AND (
          (sa.expected_deduction_year < $2) OR
          (sa.expected_deduction_year = $2 AND sa.expected_deduction_month <= $3)
        )
    `;
    const params = [companyId, year, month];
    let paramCount = 3;

    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (outlet_id) {
      paramCount++;
      query += ` AND e.outlet_id = $${paramCount}`;
      params.push(outlet_id);
    }

    query += `
      GROUP BY sa.employee_id, e.name, e.employee_id
      ORDER BY e.name
    `;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching advances summary:', error);
    res.status(500).json({ error: 'Failed to fetch advances summary' });
  }
});

// Get pending advance amount for an employee
router.get('/pending/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;

    const result = await pool.query(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN deduction_method = 'full' THEN remaining_balance
            WHEN deduction_method = 'installment' THEN LEAST(installment_amount, remaining_balance)
            ELSE remaining_balance
          END
        ), 0) as pending_amount,
        COUNT(*) as advance_count
      FROM salary_advances
      WHERE employee_id = $1
        AND status = 'active'
        AND (
          (expected_deduction_year < $2) OR
          (expected_deduction_year = $2 AND expected_deduction_month <= $3)
        )
    `, [employeeId, year || new Date().getFullYear(), month || new Date().getMonth() + 1]);

    res.json({
      pending_amount: parseFloat(result.rows[0]?.pending_amount || 0),
      advance_count: parseInt(result.rows[0]?.advance_count || 0)
    });
  } catch (error) {
    console.error('Error fetching pending advance:', error);
    res.status(500).json({ error: 'Failed to fetch pending advance' });
  }
});

// Create new advance
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      employee_id,
      amount,
      advance_date,
      reason,
      reference_number,
      deduction_method,
      installment_amount,
      expected_deduction_month,
      expected_deduction_year
    } = req.body;

    const companyId = req.companyId;
    const adminId = req.admin?.id;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!employee_id || !amount || !advance_date) {
      return res.status(400).json({ error: 'Employee, amount, and date are required' });
    }

    // Validate installment amount if method is installment
    if (deduction_method === 'installment' && !installment_amount) {
      return res.status(400).json({ error: 'Installment amount required for installment deduction' });
    }

    const result = await pool.query(`
      INSERT INTO salary_advances (
        employee_id, company_id, amount, advance_date, reason, reference_number,
        deduction_method, installment_amount, remaining_balance,
        expected_deduction_month, expected_deduction_year,
        status, approved_by, approved_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, NOW(), $12)
      RETURNING *
    `, [
      employee_id, companyId, amount, advance_date, reason, reference_number,
      deduction_method || 'full', installment_amount || null, amount,
      expected_deduction_month || new Date().getMonth() + 2,
      expected_deduction_year || new Date().getFullYear(),
      adminId
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating advance:', error);
    res.status(500).json({ error: 'Failed to create advance' });
  }
});

// Update advance
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      reason,
      reference_number,
      deduction_method,
      installment_amount,
      expected_deduction_month,
      expected_deduction_year,
      status
    } = req.body;

    // Don't allow editing completed or linked advances
    const existing = await pool.query(
      'SELECT * FROM salary_advances WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Advance not found' });
    }

    if (existing.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Cannot edit completed advance' });
    }

    if (existing.rows[0].linked_payroll_item_id) {
      return res.status(400).json({ error: 'Cannot edit advance linked to payroll' });
    }

    const result = await pool.query(`
      UPDATE salary_advances
      SET amount = COALESCE($1, amount),
          reason = COALESCE($2, reason),
          reference_number = COALESCE($3, reference_number),
          deduction_method = COALESCE($4, deduction_method),
          installment_amount = COALESCE($5, installment_amount),
          expected_deduction_month = COALESCE($6, expected_deduction_month),
          expected_deduction_year = COALESCE($7, expected_deduction_year),
          status = COALESCE($8, status),
          remaining_balance = COALESCE($1, amount) - total_deducted,
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      amount, reason, reference_number, deduction_method, installment_amount,
      expected_deduction_month, expected_deduction_year, status, id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating advance:', error);
    res.status(500).json({ error: 'Failed to update advance' });
  }
});

// Cancel advance
router.post('/:id/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE salary_advances
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'active')
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Cannot cancel this advance' });
    }

    res.json({ message: 'Advance cancelled', advance: result.rows[0] });
  } catch (error) {
    console.error('Error cancelling advance:', error);
    res.status(500).json({ error: 'Failed to cancel advance' });
  }
});

// Record deduction (called by payroll system)
router.post('/:id/deduct', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { amount, payroll_item_id, month, year } = req.body;

    await client.query('BEGIN');

    // Get current advance
    const advance = await client.query(
      'SELECT * FROM salary_advances WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (advance.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Advance not found' });
    }

    const adv = advance.rows[0];
    if (adv.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Advance is not active' });
    }

    // Calculate actual deduction amount (don't over-deduct)
    const actualDeduction = Math.min(amount, parseFloat(adv.remaining_balance));

    // Record the deduction
    await client.query(`
      INSERT INTO salary_advance_deductions (advance_id, payroll_item_id, amount, deduction_date, month, year)
      VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
    `, [id, payroll_item_id, actualDeduction, month, year]);

    // Update advance totals
    const newTotalDeducted = parseFloat(adv.total_deducted) + actualDeduction;
    const newRemaining = parseFloat(adv.amount) - newTotalDeducted;
    const newStatus = newRemaining <= 0 ? 'completed' : 'active';

    await client.query(`
      UPDATE salary_advances
      SET total_deducted = $1,
          remaining_balance = $2,
          status = $3,
          linked_payroll_item_id = CASE WHEN $3 = 'completed' THEN $4 ELSE linked_payroll_item_id END,
          updated_at = NOW()
      WHERE id = $5
    `, [newTotalDeducted, newRemaining, newStatus, payroll_item_id, id]);

    await client.query('COMMIT');

    res.json({
      message: 'Deduction recorded',
      deducted: actualDeduction,
      remaining: newRemaining,
      status: newStatus
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording deduction:', error);
    res.status(500).json({ error: 'Failed to record deduction' });
  } finally {
    client.release();
  }
});

// Get deduction history for an advance
router.get('/:id/history', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT sad.*,
             pr.period_label,
             pi.net_pay
      FROM salary_advance_deductions sad
      LEFT JOIN payroll_items pi ON sad.payroll_item_id = pi.id
      LEFT JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE sad.advance_id = $1
      ORDER BY sad.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching deduction history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
