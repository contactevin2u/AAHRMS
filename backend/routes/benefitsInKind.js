const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

/**
 * Benefits In Kind (BIK) Routes
 *
 * Examples:
 * - Company car
 * - iPad for outdoor sales
 * - Laptop for indoor sales
 * - Mobile phone
 * - Fuel card
 */

// Get all benefits (filtered by company)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, status, benefit_type, department_id, outlet_id } = req.query;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT b.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.position,
             d.name as department_name,
             bt.name as benefit_type_name,
             bt.category as benefit_category,
             bt.taxable
      FROM benefits_in_kind b
      JOIN employees e ON b.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN benefit_types bt ON b.benefit_type = bt.code
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (companyId !== null) {
      paramCount++;
      query += ` AND b.company_id = $${paramCount}`;
      params.push(companyId);
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

    if (employee_id) {
      paramCount++;
      query += ` AND b.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }

    if (benefit_type) {
      paramCount++;
      query += ` AND b.benefit_type = $${paramCount}`;
      params.push(benefit_type);
    }

    query += ' ORDER BY b.assigned_date DESC, e.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching benefits:', error);
    res.status(500).json({ error: 'Failed to fetch benefits' });
  }
});

// Get benefits by employee
router.get('/employee/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT b.*,
             bt.name as benefit_type_name,
             bt.category as benefit_category,
             bt.taxable
      FROM benefits_in_kind b
      LEFT JOIN benefit_types bt ON b.benefit_type = bt.code
      WHERE b.employee_id = $1
    `;
    const params = [employeeId];

    if (companyId !== null) {
      query += ` AND b.company_id = $2`;
      params.push(companyId);
    }

    query += ' ORDER BY b.status DESC, b.assigned_date DESC';

    const result = await pool.query(query, params);

    // Calculate totals
    const activeTotal = result.rows
      .filter(b => b.status === 'active')
      .reduce((sum, b) => sum + parseFloat(b.annual_value || 0), 0);

    res.json({
      benefits: result.rows,
      summary: {
        total_benefits: result.rows.length,
        active_benefits: result.rows.filter(b => b.status === 'active').length,
        total_annual_value: activeTotal,
        total_monthly_value: Math.round(activeTotal / 12 * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error fetching employee benefits:', error);
    res.status(500).json({ error: 'Failed to fetch employee benefits' });
  }
});

// Get single benefit
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT b.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             bt.name as benefit_type_name,
             bt.category as benefit_category,
             bt.taxable
      FROM benefits_in_kind b
      JOIN employees e ON b.employee_id = e.id
      LEFT JOIN benefit_types bt ON b.benefit_type = bt.code
      WHERE b.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benefit not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching benefit:', error);
    res.status(500).json({ error: 'Failed to fetch benefit' });
  }
});

// Create new benefit
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      employee_id,
      benefit_name,
      benefit_type,
      description,
      annual_value,
      assigned_date,
      serial_number,
      asset_tag,
      condition,
      notes
    } = req.body;

    const companyId = req.companyId || 1;

    if (!employee_id || !benefit_name || !benefit_type || !assigned_date) {
      return res.status(400).json({
        error: 'Employee ID, benefit name, type, and assigned date are required'
      });
    }

    // Verify employee belongs to company
    const emp = await pool.query(
      'SELECT id, company_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (emp.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const monthlyValue = annual_value ? parseFloat(annual_value) / 12 : 0;

    const result = await pool.query(`
      INSERT INTO benefits_in_kind
      (company_id, employee_id, benefit_name, benefit_type, description, annual_value, monthly_value,
       assigned_date, serial_number, asset_tag, condition, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
      RETURNING *
    `, [
      emp.rows[0].company_id,
      employee_id,
      benefit_name,
      benefit_type,
      description || null,
      annual_value || 0,
      monthlyValue,
      assigned_date,
      serial_number || null,
      asset_tag || null,
      condition || 'good',
      notes || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating benefit:', error);
    res.status(500).json({ error: 'Failed to create benefit' });
  }
});

// Update benefit
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      benefit_name,
      benefit_type,
      description,
      annual_value,
      assigned_date,
      return_date,
      serial_number,
      asset_tag,
      condition,
      status,
      notes
    } = req.body;

    const monthlyValue = annual_value ? parseFloat(annual_value) / 12 : null;

    const result = await pool.query(`
      UPDATE benefits_in_kind SET
        benefit_name = COALESCE($1, benefit_name),
        benefit_type = COALESCE($2, benefit_type),
        description = COALESCE($3, description),
        annual_value = COALESCE($4, annual_value),
        monthly_value = COALESCE($5, monthly_value),
        assigned_date = COALESCE($6, assigned_date),
        return_date = $7,
        serial_number = COALESCE($8, serial_number),
        asset_tag = COALESCE($9, asset_tag),
        condition = COALESCE($10, condition),
        status = COALESCE($11, status),
        notes = COALESCE($12, notes),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      benefit_name, benefit_type, description, annual_value, monthlyValue,
      assigned_date, return_date, serial_number, asset_tag, condition,
      status, notes, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benefit not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating benefit:', error);
    res.status(500).json({ error: 'Failed to update benefit' });
  }
});

// Return benefit (mark as returned)
router.post('/:id/return', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { return_date, condition, notes } = req.body;

    const result = await pool.query(`
      UPDATE benefits_in_kind SET
        status = 'returned',
        return_date = $1,
        condition = COALESCE($2, condition),
        notes = COALESCE($3, notes),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [return_date || new Date().toISOString().split('T')[0], condition, notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benefit not found' });
    }

    res.json({
      message: 'Benefit marked as returned',
      benefit: result.rows[0]
    });
  } catch (error) {
    console.error('Error returning benefit:', error);
    res.status(500).json({ error: 'Failed to return benefit' });
  }
});

// Delete benefit
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = 'DELETE FROM benefits_in_kind WHERE id = $1';
    let params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benefit not found' });
    }

    res.json({ message: 'Benefit deleted' });
  } catch (error) {
    console.error('Error deleting benefit:', error);
    res.status(500).json({ error: 'Failed to delete benefit' });
  }
});

// Get BIK summary for payroll (by year)
router.get('/summary/payroll/:year', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT
        e.id as employee_id,
        e.employee_id as emp_code,
        e.name as employee_name,
        d.name as department_name,
        COUNT(b.id) as total_benefits,
        SUM(b.annual_value) as total_annual_value,
        SUM(b.monthly_value) as total_monthly_value,
        ARRAY_AGG(DISTINCT b.benefit_type) as benefit_types
      FROM employees e
      LEFT JOIN benefits_in_kind b ON e.id = b.employee_id
        AND b.status = 'active'
        AND (b.assigned_date <= $1::date OR EXTRACT(YEAR FROM b.assigned_date) <= $2)
        AND (b.return_date IS NULL OR b.return_date >= $1::date)
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
    `;
    const params = [`${year}-12-31`, year];
    let paramCount = 2;

    if (companyId !== null) {
      paramCount++;
      query += ` AND e.company_id = $${paramCount}`;
      params.push(companyId);
    }

    query += `
      GROUP BY e.id, e.employee_id, e.name, d.name
      HAVING COUNT(b.id) > 0
      ORDER BY e.name
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching BIK summary:', error);
    res.status(500).json({ error: 'Failed to fetch BIK summary' });
  }
});

// =====================================================
// BENEFIT TYPES MANAGEMENT
// =====================================================

// Get all benefit types
router.get('/types/all', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT * FROM benefit_types
      WHERE company_id IS NULL
    `;
    const params = [];

    if (companyId !== null) {
      query += ` OR company_id = $1`;
      params.push(companyId);
    }

    query += ' ORDER BY category, name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching benefit types:', error);
    res.status(500).json({ error: 'Failed to fetch benefit types' });
  }
});

// Create custom benefit type
router.post('/types', authenticateAdmin, async (req, res) => {
  try {
    const { code, name, category, default_annual_value, taxable, description } = req.body;
    const companyId = req.companyId;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    const result = await pool.query(`
      INSERT INTO benefit_types (company_id, code, name, category, default_annual_value, taxable, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [companyId, code.toUpperCase(), name, category || 'other', default_annual_value || 0, taxable !== false, description]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Benefit type code already exists' });
    }
    console.error('Error creating benefit type:', error);
    res.status(500).json({ error: 'Failed to create benefit type' });
  }
});

module.exports = router;
