const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get employees with probation ending soon (within 7 days or already past)
router.get('/pending', authenticateAdmin, async (req, res) => {
  try {
    // First, auto-update probation_status to 'pending_review' for employees within 7 days
    await pool.query(`
      UPDATE employees
      SET probation_status = 'pending_review', updated_at = NOW()
      WHERE status = 'active'
        AND employment_type = 'probation'
        AND probation_status = 'ongoing'
        AND probation_end_date <= CURRENT_DATE + INTERVAL '7 days'
    `);

    // Get all employees pending review
    const result = await pool.query(`
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
        AND e.employment_type = 'probation'
        AND (
          e.probation_status = 'pending_review'
          OR (e.probation_status = 'ongoing' AND e.probation_end_date <= CURRENT_DATE + INTERVAL '7 days')
          OR (e.probation_status = 'extended' AND e.probation_end_date <= CURRENT_DATE + INTERVAL '7 days')
        )
      ORDER BY e.probation_end_date ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending probations:', error);
    res.status(500).json({ error: 'Failed to fetch pending probations' });
  }
});

// Get all employees with probation info
router.get('/all', authenticateAdmin, async (req, res) => {
  try {
    const { employment_type, probation_status } = req.query;

    let query = `
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
    `;
    const params = [];
    let paramCount = 0;

    if (employment_type) {
      paramCount++;
      query += ` AND e.employment_type = $${paramCount}`;
      params.push(employment_type);
    }

    if (probation_status) {
      paramCount++;
      query += ` AND e.probation_status = $${paramCount}`;
      params.push(probation_status);
    }

    query += ' ORDER BY e.probation_end_date ASC NULLS LAST, e.name ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all probations:', error);
    res.status(500).json({ error: 'Failed to fetch probations' });
  }
});

// Confirm employee (end probation, update salary)
router.post('/:id/confirm', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { notes, generate_letter } = req.body;

    await client.query('BEGIN');

    // Get current employee data
    const empResult = await client.query(
      'SELECT * FROM employees WHERE id = $1 AND status = $2',
      [id, 'active']
    );

    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    const employee = empResult.rows[0];

    // Check if already confirmed
    if (employee.employment_type === 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Employee is already confirmed' });
    }

    const oldSalary = parseFloat(employee.default_basic_salary) || 0;
    const newSalary = parseFloat(employee.salary_after_confirmation) || oldSalary;
    const confirmationDate = new Date().toISOString().split('T')[0];

    // Update employee record
    await client.query(`
      UPDATE employees SET
        employment_type = 'confirmed',
        probation_status = 'confirmed',
        confirmation_date = $1,
        default_basic_salary = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [confirmationDate, newSalary, id]);

    // Create probation history record
    await client.query(`
      INSERT INTO probation_history (
        employee_id, action, old_status, new_status,
        old_salary, new_salary, notes, performed_by
      ) VALUES ($1, 'confirmed', $2, 'confirmed', $3, $4, $5, $6)
    `, [
      id,
      employee.probation_status,
      oldSalary,
      newSalary,
      notes || 'Probation completed successfully',
      req.admin?.id || null
    ]);

    // Generate confirmation letter if requested
    let letterId = null;
    if (generate_letter !== false) {
      const letterContent = `Dear ${employee.name},

We are pleased to inform you that you have successfully completed your probationary period with AA Alive Sdn. Bhd.

Your employment has been confirmed effective ${new Date(confirmationDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}.

Employment Details:
- Join Date: ${employee.join_date ? new Date(employee.join_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
- Probation Period: ${employee.probation_months || 3} months
- Confirmation Date: ${new Date(confirmationDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}

Salary Adjustment:
- Previous Basic Salary: RM ${oldSalary.toFixed(2)}
- New Basic Salary: RM ${newSalary.toFixed(2)}
- Increment Amount: RM ${(newSalary - oldSalary).toFixed(2)}
- Effective From: ${new Date(confirmationDate).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}

We appreciate your dedication and hard work during the probationary period. We look forward to your continued contribution to the company.

Congratulations on your confirmation!`;

      const letterResult = await client.query(`
        INSERT INTO hr_letters (
          employee_id, letter_type, subject, content,
          issued_by, issued_by_name, issued_by_designation, status
        ) VALUES ($1, 'confirmation', 'Employment Confirmation Letter', $2, $3, $4, $5, 'unread')
        RETURNING id
      `, [
        id,
        letterContent,
        req.admin?.id || null,
        req.admin?.name || 'HR Department',
        req.admin?.designation || 'Human Resources'
      ]);

      letterId = letterResult.rows[0].id;

      // Create notification for employee
      await client.query(`
        INSERT INTO notifications (
          employee_id, type, title, message, reference_type, reference_id
        ) VALUES ($1, 'letter', 'Employment Confirmation', 'Congratulations! Your employment has been confirmed.', 'hr_letter', $2)
      `, [id, letterId]);
    }

    await client.query('COMMIT');

    // Get updated employee
    const updatedEmp = await pool.query(
      'SELECT e.*, d.name as department_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = $1',
      [id]
    );

    res.json({
      message: 'Employee confirmed successfully',
      employee: updatedEmp.rows[0],
      letter_id: letterId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming employee:', error);
    res.status(500).json({ error: 'Failed to confirm employee' });
  } finally {
    client.release();
  }
});

// Extend probation
router.post('/:id/extend', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { extension_months, notes } = req.body;

    if (!extension_months || extension_months < 1 || extension_months > 6) {
      return res.status(400).json({ error: 'Extension months must be between 1 and 6' });
    }

    await client.query('BEGIN');

    // Get current employee data
    const empResult = await client.query(
      'SELECT * FROM employees WHERE id = $1 AND status = $2',
      [id, 'active']
    );

    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    const employee = empResult.rows[0];

    // Check if already confirmed
    if (employee.employment_type === 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot extend probation for confirmed employee' });
    }

    // Calculate new probation end date
    const currentEndDate = employee.probation_end_date ? new Date(employee.probation_end_date) : new Date();
    currentEndDate.setMonth(currentEndDate.getMonth() + extension_months);
    const newEndDate = currentEndDate.toISOString().split('T')[0];

    // Track total extension months
    const totalExtension = (employee.probation_extended_months || 0) + extension_months;

    // Update employee record
    await client.query(`
      UPDATE employees SET
        probation_status = 'extended',
        probation_end_date = $1,
        probation_extended_months = $2,
        probation_notes = COALESCE(probation_notes || E'\\n', '') || $3,
        updated_at = NOW()
      WHERE id = $4
    `, [newEndDate, totalExtension, notes || `Extended by ${extension_months} month(s)`, id]);

    // Create probation history record
    await client.query(`
      INSERT INTO probation_history (
        employee_id, action, old_status, new_status,
        extension_months, notes, performed_by
      ) VALUES ($1, 'extended', $2, 'extended', $3, $4, $5)
    `, [
      id,
      employee.probation_status,
      extension_months,
      notes || `Probation extended by ${extension_months} month(s)`,
      req.admin?.id || null
    ]);

    await client.query('COMMIT');

    // Get updated employee
    const updatedEmp = await pool.query(
      'SELECT e.*, d.name as department_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = $1',
      [id]
    );

    res.json({
      message: `Probation extended by ${extension_months} month(s)`,
      employee: updatedEmp.rows[0],
      new_end_date: newEndDate
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error extending probation:', error);
    res.status(500).json({ error: 'Failed to extend probation' });
  } finally {
    client.release();
  }
});

// Get probation history for an employee
router.get('/:id/history', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT ph.*, au.name as performed_by_name
      FROM probation_history ph
      LEFT JOIN admin_users au ON ph.performed_by = au.id
      WHERE ph.employee_id = $1
      ORDER BY ph.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching probation history:', error);
    res.status(500).json({ error: 'Failed to fetch probation history' });
  }
});

module.exports = router;
