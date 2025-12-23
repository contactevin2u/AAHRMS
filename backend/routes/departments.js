const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');
// Updated: Include employee count in department listing

// Seed default departments (run once to initialize) - requires auth
router.post('/seed', authenticateAdmin, async (req, res) => {
  try {
    // Get user's company_id (or default to 1 for super_admin)
    const companyId = req.companyId || req.admin?.company_id || 1;

    // Check if departments already exist for this company
    const existing = await pool.query(
      'SELECT COUNT(*) FROM departments WHERE company_id = $1',
      [companyId]
    );

    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: 'Departments already exist for this company', count: existing.rows[0].count });
    }

    // Insert default departments for the user's company (AA Alive structure)
    const result = await pool.query(`
      INSERT INTO departments (name, salary_type, payroll_structure_code, company_id) VALUES
        ('Driver', 'basic_trip_upsell_outstation_ot', 'driver', $1),
        ('Indoor Sales', 'basic_or_commission_higher', 'indoor_sales', $1),
        ('Office', 'basic_allowance_commission', 'office', $1),
        ('Outdoor Sales', 'basic_allowance_commission_tier', 'outdoor_sales', $1)
      RETURNING *
    `, [companyId]);

    res.json({ message: 'Departments seeded successfully', departments: result.rows });
  } catch (error) {
    console.error('Error seeding departments:', error);
    res.status(500).json({ error: 'Failed to seed departments' });
  }
});

// Public seed endpoint (for initial setup only - no auth required)
router.get('/init-seed', async (req, res) => {
  try {
    // Get company_id from query param or default to 1
    const companyId = parseInt(req.query.company_id) || 1;

    // Check if departments already exist for this company
    const existing = await pool.query(
      'SELECT COUNT(*) FROM departments WHERE company_id = $1',
      [companyId]
    );

    if (parseInt(existing.rows[0].count) > 0) {
      const depts = await pool.query(
        'SELECT * FROM departments WHERE company_id = $1 ORDER BY name',
        [companyId]
      );
      return res.json({ message: 'Departments already exist', count: existing.rows[0].count, departments: depts.rows });
    }

    // Insert default departments for the specified company
    const result = await pool.query(`
      INSERT INTO departments (name, salary_type, payroll_structure_code, company_id) VALUES
        ('Driver', 'basic_trip_upsell_outstation_ot', 'driver', $1),
        ('Indoor Sales', 'basic_or_commission_higher', 'indoor_sales', $1),
        ('Office', 'basic_allowance_commission', 'office', $1),
        ('Outdoor Sales', 'basic_allowance_commission_tier', 'outdoor_sales', $1)
      RETURNING *
    `, [companyId]);

    res.json({ message: 'Departments seeded successfully', departments: result.rows });
  } catch (error) {
    console.error('Error seeding departments:', error);
    res.status(500).json({ error: 'Failed to seed departments: ' + error.message });
  }
});

// Get all departments (filtered by company) with employee count
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT d.*,
        COUNT(e.id) as employee_count,
        sc.basic_salary, sc.has_commission, sc.commission_rate,
        sc.has_allowance, sc.allowance_amount, sc.has_per_trip, sc.per_trip_rate,
        sc.has_ot, sc.ot_rate, sc.has_outstation, sc.outstation_rate
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
      LEFT JOIN salary_configs sc ON d.id = sc.department_id
    `;
    let params = [];

    if (companyId !== null) {
      query += ' WHERE d.company_id = $1';
      params = [companyId];
    }

    query += ' GROUP BY d.id, sc.id ORDER BY d.name';

    const result = await pool.query(query, params);

    // Format the response to include salary_config as nested object
    const departments = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      salary_type: row.salary_type,
      company_id: row.company_id,
      created_at: row.created_at,
      employee_count: parseInt(row.employee_count) || 0,
      salary_config: row.basic_salary !== null ? {
        basic_salary: row.basic_salary,
        has_commission: row.has_commission,
        commission_rate: row.commission_rate,
        has_allowance: row.has_allowance,
        allowance_amount: row.allowance_amount,
        has_per_trip: row.has_per_trip,
        per_trip_rate: row.per_trip_rate,
        has_ot: row.has_ot,
        ot_rate: row.ot_rate,
        has_outstation: row.has_outstation,
        outstation_rate: row.outstation_rate
      } : null
    }));

    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Get department payroll components
router.get('/:id/payroll-components', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    // First verify the department belongs to the user's company
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

    // Get payroll components for this department
    const components = await pool.query(`
      SELECT *
      FROM department_payroll_components
      WHERE department_id = $1
      ORDER BY display_order
    `, [id]);

    res.json({
      department: dept.rows[0],
      components: components.rows
    });
  } catch (error) {
    console.error('Error fetching department payroll components:', error);
    res.status(500).json({ error: 'Failed to fetch payroll components' });
  }
});

// Get all departments with their payroll components
router.get('/with-components', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT d.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pc.id,
              'component_name', pc.component_name,
              'is_enabled', pc.is_enabled,
              'is_required', pc.is_required,
              'default_value', pc.default_value,
              'calculation_type', pc.calculation_type,
              'calculation_config', pc.calculation_config,
              'display_order', pc.display_order
            ) ORDER BY pc.display_order
          ) FILTER (WHERE pc.id IS NOT NULL),
          '[]'
        ) as payroll_components
      FROM departments d
      LEFT JOIN department_payroll_components pc ON d.id = pc.department_id
    `;

    let params = [];

    if (companyId !== null) {
      query += ' WHERE d.company_id = $1';
      params = [companyId];
    }

    query += ' GROUP BY d.id ORDER BY d.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching departments with components:', error);
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
