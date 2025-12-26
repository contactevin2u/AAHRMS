const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { calculateFinalSettlement, saveFinalSettlement } = require('../utils/finalSettlement');

// Get all resignations
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT r.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.default_basic_salary,
             d.name as department_name
      FROM resignations r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND r.status = $1`;
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching resignations:', error);
    res.status(500).json({ error: 'Failed to fetch resignations' });
  }
});

// Get single resignation with details
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT r.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.default_basic_salary,
             e.join_date,
             d.name as department_name
      FROM resignations r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found' });
    }

    // Get leave balances for encashment calculation
    const currentYear = new Date().getFullYear();
    const leaveBalances = await pool.query(`
      SELECT lb.*, lt.code, lt.name as leave_type_name
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2 AND lt.is_paid = true
    `, [result.rows[0].employee_id, currentYear]);

    res.json({
      ...result.rows[0],
      leave_balances: leaveBalances.rows
    });
  } catch (error) {
    console.error('Error fetching resignation:', error);
    res.status(500).json({ error: 'Failed to fetch resignation' });
  }
});

// Create resignation record
router.post('/', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { employee_id, notice_date, last_working_day, reason, remarks } = req.body;

    if (!employee_id || !notice_date || !last_working_day) {
      return res.status(400).json({ error: 'Employee, notice date, and last working day are required' });
    }

    await client.query('BEGIN');

    // Check if resignation already exists for this employee
    const existing = await client.query(
      "SELECT id FROM resignations WHERE employee_id = $1 AND status != 'cancelled'",
      [employee_id]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Resignation already exists for this employee' });
    }

    // Get employee details for calculations
    const empResult = await client.query(
      'SELECT default_basic_salary FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found' });
    }

    const basicSalary = parseFloat(empResult.rows[0].default_basic_salary) || 0;

    // Calculate leave encashment (Annual Leave only typically)
    const currentYear = new Date().getFullYear();
    const leaveBalance = await client.query(`
      SELECT lb.entitled_days, lb.used_days
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2 AND lt.code = 'AL'
    `, [employee_id, currentYear]);

    let encashmentDays = 0;
    let encashmentAmount = 0;

    if (leaveBalance.rows.length > 0) {
      const remaining = leaveBalance.rows[0].entitled_days - leaveBalance.rows[0].used_days;
      encashmentDays = Math.max(0, remaining);
      // Assuming 26 working days per month
      encashmentAmount = (basicSalary / 26) * encashmentDays;
    }

    // Create resignation record
    const result = await client.query(`
      INSERT INTO resignations (
        employee_id, notice_date, last_working_day, reason, remarks,
        leave_encashment_days, leave_encashment_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [employee_id, notice_date, last_working_day, reason, remarks, encashmentDays, encashmentAmount]);

    await client.query('COMMIT');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating resignation:', error);
    res.status(500).json({ error: 'Failed to create resignation' });
  } finally {
    client.release();
  }
});

// Update resignation
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notice_date, last_working_day, reason, remarks, leave_encashment_days, leave_encashment_amount } = req.body;

    const result = await pool.query(`
      UPDATE resignations SET
        notice_date = $1, last_working_day = $2, reason = $3, remarks = $4,
        leave_encashment_days = $5, leave_encashment_amount = $6, updated_at = NOW()
      WHERE id = $7 AND status = 'pending'
      RETURNING *
    `, [notice_date, last_working_day, reason, remarks, leave_encashment_days, leave_encashment_amount, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or not pending' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating resignation:', error);
    res.status(500).json({ error: 'Failed to update resignation' });
  }
});

// Process resignation (complete the exit)
router.post('/:id/process', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { final_salary_amount, settlement_date } = req.body;

    await client.query('BEGIN');

    // Get resignation details
    const resignation = await client.query(
      'SELECT * FROM resignations WHERE id = $1',
      [id]
    );

    if (resignation.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resignation not found' });
    }

    const r = resignation.rows[0];

    if (r.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Resignation already processed' });
    }

    // Update resignation status
    await client.query(`
      UPDATE resignations SET
        status = 'completed',
        final_salary_amount = $1,
        settlement_status = 'completed',
        settlement_date = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [final_salary_amount, settlement_date || new Date(), id]);

    // Update employee status
    await client.query(`
      UPDATE employees SET
        status = 'resigned',
        resign_date = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [r.last_working_day, r.employee_id]);

    await client.query('COMMIT');

    res.json({ message: 'Resignation processed successfully. Employee status updated to resigned.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing resignation:', error);
    res.status(500).json({ error: 'Failed to process resignation' });
  } finally {
    client.release();
  }
});

// Calculate final settlement
// Returns detailed breakdown without saving
router.get('/:id/settlement', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const settlement = await calculateFinalSettlement(id);
    res.json(settlement);
  } catch (error) {
    console.error('Error calculating settlement:', error);
    if (error.message === 'Resignation not found') {
      return res.status(404).json({ error: 'Resignation not found' });
    }
    res.status(500).json({ error: 'Failed to calculate settlement' });
  }
});

// Calculate and save final settlement
router.post('/:id/settlement', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Calculate settlement
    const settlement = await calculateFinalSettlement(id);

    // Save to resignation record
    const updated = await saveFinalSettlement(id, settlement);

    res.json({
      message: 'Settlement calculated and saved',
      settlement,
      resignation: updated
    });
  } catch (error) {
    console.error('Error saving settlement:', error);
    if (error.message === 'Resignation not found') {
      return res.status(404).json({ error: 'Resignation not found' });
    }
    res.status(500).json({ error: 'Failed to save settlement' });
  }
});

// Cancel resignation
router.post('/:id/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE resignations SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or not pending' });
    }

    res.json({ message: 'Resignation cancelled' });
  } catch (error) {
    console.error('Error cancelling resignation:', error);
    res.status(500).json({ error: 'Failed to cancel resignation' });
  }
});

// Delete resignation
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM resignations WHERE id = $1 AND status = 'pending' RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or cannot be deleted' });
    }

    res.json({ message: 'Resignation deleted' });
  } catch (error) {
    console.error('Error deleting resignation:', error);
    res.status(500).json({ error: 'Failed to delete resignation' });
  }
});

// Calculate final settlement
router.post('/calculate-settlement', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, last_working_day } = req.body;

    if (!employee_id || !last_working_day) {
      return res.status(400).json({ error: 'Employee ID and last working day are required' });
    }

    // Get employee details
    const empResult = await pool.query(
      'SELECT default_basic_salary, default_allowance FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];
    const basicSalary = parseFloat(emp.default_basic_salary) || 0;
    const allowance = parseFloat(emp.default_allowance) || 0;

    // Calculate pro-rated salary for the final month
    const lastDay = new Date(last_working_day);
    const daysWorked = lastDay.getDate();
    const daysInMonth = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0).getDate();
    const proRatedSalary = ((basicSalary + allowance) / daysInMonth) * daysWorked;

    // Get leave encashment (Annual Leave)
    const currentYear = lastDay.getFullYear();
    const leaveBalance = await pool.query(`
      SELECT lb.entitled_days, lb.used_days
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2 AND lt.code = 'AL'
    `, [employee_id, currentYear]);

    let encashmentDays = 0;
    let encashmentAmount = 0;

    if (leaveBalance.rows.length > 0) {
      const remaining = leaveBalance.rows[0].entitled_days - leaveBalance.rows[0].used_days;
      encashmentDays = Math.max(0, remaining);
      encashmentAmount = (basicSalary / 26) * encashmentDays; // 26 working days
    }

    // Get pending approved claims
    const claims = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM claims
      WHERE employee_id = $1 AND status = 'approved' AND linked_payroll_item_id IS NULL
    `, [employee_id]);

    const pendingClaims = parseFloat(claims.rows[0].total) || 0;

    res.json({
      basic_salary: basicSalary,
      allowance: allowance,
      days_worked: daysWorked,
      days_in_month: daysInMonth,
      pro_rated_salary: Math.round(proRatedSalary * 100) / 100,
      leave_encashment_days: encashmentDays,
      leave_encashment_amount: Math.round(encashmentAmount * 100) / 100,
      pending_claims: pendingClaims,
      total_final_settlement: Math.round((proRatedSalary + encashmentAmount + pendingClaims) * 100) / 100
    });
  } catch (error) {
    console.error('Error calculating settlement:', error);
    res.status(500).json({ error: 'Failed to calculate settlement' });
  }
});

module.exports = router;
