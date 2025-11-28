const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get all employees
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, status, search } = req.query;

    let query = `
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (status) {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      query += ` AND (e.name ILIKE $${paramCount} OR e.employee_id ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get single employee
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT e.*, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Create employee
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, name, email, phone, ic_number, department_id, position, join_date } = req.body;

    if (!employee_id || !name || !department_id) {
      return res.status(400).json({ error: 'Employee ID, name, and department are required' });
    }

    const result = await pool.query(
      `INSERT INTO employees (employee_id, name, email, phone, ic_number, department_id, position, join_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [employee_id, name, email, phone, ic_number, department_id, position, join_date]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating employee:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Update employee
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_id, name, email, phone, ic_number, department_id, position, join_date, status } = req.body;

    const result = await pool.query(
      `UPDATE employees
       SET employee_id = $1, name = $2, email = $3, phone = $4, ic_number = $5,
           department_id = $6, position = $7, join_date = $8, status = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [employee_id, name, email, phone, ic_number, department_id, position, join_date, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee (soft delete - change status to inactive)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE employees SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deactivated successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Get employee stats
router.get('/stats/overview', authenticateAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive
      FROM employees
    `);

    const byDepartment = await pool.query(`
      SELECT d.name, COUNT(e.id) as count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
      GROUP BY d.id, d.name
      ORDER BY d.name
    `);

    res.json({
      overview: stats.rows[0],
      byDepartment: byDepartment.rows
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
