const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get payroll for a month
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, department_id, status } = req.query;

    let query = `
      SELECT p.*, e.name as employee_name, e.employee_id as emp_id, d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (month) {
      paramCount++;
      query += ` AND p.month = $${paramCount}`;
      params.push(month);
    }

    if (year) {
      paramCount++;
      query += ` AND p.year = $${paramCount}`;
      params.push(year);
    }

    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY e.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

// Get single payroll record
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, e.name as employee_name, e.employee_id as emp_id, d.name as department_name, d.salary_type
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

// Generate payroll for all active employees for a month
router.post('/generate', authenticateAdmin, async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Get all active employees with their department salary config
    const employees = await pool.query(`
      SELECT e.id, e.department_id, sc.*
      FROM employees e
      LEFT JOIN salary_configs sc ON e.department_id = sc.department_id
      WHERE e.status = 'active'
    `);

    let created = 0;
    let skipped = 0;

    for (const emp of employees.rows) {
      // Check if payroll already exists
      const existing = await pool.query(
        'SELECT id FROM payroll WHERE employee_id = $1 AND month = $2 AND year = $3',
        [emp.id, month, year]
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      // Create payroll record with default values from salary config
      await pool.query(
        `INSERT INTO payroll (employee_id, month, year, basic_salary, allowance)
         VALUES ($1, $2, $3, $4, $5)`,
        [emp.id, month, year, emp.basic_salary || 0, emp.allowance_amount || 0]
      );
      created++;
    }

    res.json({
      message: `Payroll generated: ${created} created, ${skipped} already existed`,
      created,
      skipped
    });
  } catch (error) {
    console.error('Error generating payroll:', error);
    res.status(500).json({ error: 'Failed to generate payroll' });
  }
});

// Update payroll record (for entering sales, trips, OT, etc.)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      basic_salary,
      commission,
      allowance,
      trip_pay,
      ot_pay,
      outstation_pay,
      bonus,
      deductions,
      sales_amount,
      trip_count,
      ot_hours,
      outstation_days,
      notes,
      status
    } = req.body;

    // Calculate total
    const total = (
      parseFloat(basic_salary || 0) +
      parseFloat(commission || 0) +
      parseFloat(allowance || 0) +
      parseFloat(trip_pay || 0) +
      parseFloat(ot_pay || 0) +
      parseFloat(outstation_pay || 0) +
      parseFloat(bonus || 0) -
      parseFloat(deductions || 0)
    );

    const result = await pool.query(
      `UPDATE payroll SET
        basic_salary = $1, commission = $2, allowance = $3, trip_pay = $4,
        ot_pay = $5, outstation_pay = $6, bonus = $7, deductions = $8,
        total_salary = $9, sales_amount = $10, trip_count = $11, ot_hours = $12,
        outstation_days = $13, notes = $14, status = $15, updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [basic_salary, commission, allowance, trip_pay, ot_pay, outstation_pay,
       bonus, deductions, total, sales_amount, trip_count, ot_hours,
       outstation_days, notes, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payroll:', error);
    res.status(500).json({ error: 'Failed to update payroll' });
  }
});

// Calculate commission/trip pay based on inputs
router.post('/calculate', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, sales_amount, trip_count, ot_hours, outstation_days } = req.body;

    // Get employee's department config
    const emp = await pool.query(`
      SELECT e.*, sc.*
      FROM employees e
      LEFT JOIN salary_configs sc ON e.department_id = sc.department_id
      WHERE e.id = $1
    `, [employee_id]);

    if (emp.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const config = emp.rows[0];

    const calculations = {
      basic_salary: parseFloat(config.basic_salary) || 0,
      commission: config.has_commission ? (parseFloat(sales_amount || 0) * parseFloat(config.commission_rate || 0) / 100) : 0,
      allowance: config.has_allowance ? parseFloat(config.allowance_amount || 0) : 0,
      trip_pay: config.has_per_trip ? (parseInt(trip_count || 0) * parseFloat(config.per_trip_rate || 0)) : 0,
      ot_pay: config.has_ot ? (parseFloat(ot_hours || 0) * parseFloat(config.ot_rate || 0)) : 0,
      outstation_pay: config.has_outstation ? (parseInt(outstation_days || 0) * parseFloat(config.outstation_rate || 0)) : 0
    };

    calculations.total = Object.values(calculations).reduce((a, b) => a + b, 0);

    res.json(calculations);
  } catch (error) {
    console.error('Error calculating payroll:', error);
    res.status(500).json({ error: 'Failed to calculate payroll' });
  }
});

// Get payroll summary for a month
router.get('/summary/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;

    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_employees,
        SUM(total_salary) as total_payroll,
        SUM(basic_salary) as total_basic,
        SUM(commission) as total_commission,
        SUM(allowance) as total_allowance,
        SUM(trip_pay) as total_trip_pay,
        SUM(ot_pay) as total_ot,
        SUM(bonus) as total_bonus,
        SUM(deductions) as total_deductions
      FROM payroll
      WHERE year = $1 AND month = $2
    `, [year, month]);

    const byDepartment = await pool.query(`
      SELECT d.name, COUNT(p.id) as employee_count, SUM(p.total_salary) as total
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE p.year = $1 AND p.month = $2
      GROUP BY d.id, d.name
    `, [year, month]);

    res.json({
      summary: summary.rows[0],
      byDepartment: byDepartment.rows
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

module.exports = router;
