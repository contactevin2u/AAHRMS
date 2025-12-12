const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// Seed default departments (run once to initialize)
router.post('/seed', authenticateAdmin, async (req, res) => {
  try {
    // Check if departments already exist
    const existing = await pool.query('SELECT COUNT(*) FROM departments');

    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: 'Departments already exist', count: existing.rows[0].count });
    }

    // Insert default departments
    const result = await pool.query(`
      INSERT INTO departments (name, salary_type, company_id) VALUES
        ('Office', 'basic_allowance_bonus_ot', 1),
        ('Indoor Sales', 'basic_commission', 1),
        ('Outdoor Sales', 'basic_commission_allowance_bonus', 1),
        ('Driver', 'basic_upsell_outstation_ot_trip', 1)
      RETURNING *
    `);

    res.json({ message: 'Departments seeded successfully', departments: result.rows });
  } catch (error) {
    console.error('Error seeding departments:', error);
    res.status(500).json({ error: 'Failed to seed departments' });
  }
});

// Get all departments (filtered by company)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = 'SELECT * FROM departments';
    let params = [];

    if (companyId !== null) {
      query += ' WHERE company_id = $1';
      params = [companyId];
    }

    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Get department with salary config (with company check)
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let deptQuery = 'SELECT * FROM departments WHERE id = $1';
    let params = [id];

    if (companyId !== null) {
      deptQuery += ' AND company_id = $2';
      params.push(companyId);
    }

    const dept = await pool.query(deptQuery, params);
    if (dept.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const config = await pool.query(
      'SELECT * FROM salary_configs WHERE department_id = $1',
      [id]
    );

    res.json({
      ...dept.rows[0],
      salary_config: config.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// Update salary config for department
router.put('/:id/salary-config', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      basic_salary,
      has_commission,
      commission_rate,
      has_allowance,
      allowance_amount,
      has_per_trip,
      per_trip_rate,
      has_ot,
      ot_rate,
      has_outstation,
      outstation_rate
    } = req.body;

    // Check if config exists
    const existing = await pool.query(
      'SELECT id FROM salary_configs WHERE department_id = $1',
      [id]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update
      result = await pool.query(
        `UPDATE salary_configs SET
          basic_salary = $1, has_commission = $2, commission_rate = $3,
          has_allowance = $4, allowance_amount = $5, has_per_trip = $6,
          per_trip_rate = $7, has_ot = $8, ot_rate = $9,
          has_outstation = $10, outstation_rate = $11
         WHERE department_id = $12
         RETURNING *`,
        [basic_salary, has_commission, commission_rate, has_allowance, allowance_amount,
         has_per_trip, per_trip_rate, has_ot, ot_rate, has_outstation, outstation_rate, id]
      );
    } else {
      // Insert
      result = await pool.query(
        `INSERT INTO salary_configs
         (department_id, basic_salary, has_commission, commission_rate, has_allowance,
          allowance_amount, has_per_trip, per_trip_rate, has_ot, ot_rate, has_outstation, outstation_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [id, basic_salary, has_commission, commission_rate, has_allowance, allowance_amount,
         has_per_trip, per_trip_rate, has_ot, ot_rate, has_outstation, outstation_rate]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating salary config:', error);
    res.status(500).json({ error: 'Failed to update salary config' });
  }
});

module.exports = router;
