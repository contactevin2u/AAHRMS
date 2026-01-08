/**
 * Positions Routes
 * Manages job positions for both department-based and outlet-based companies
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// Get all positions for current company
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { department_id } = req.query;

    let query = `
      SELECT p.*, d.name as department_name
      FROM positions p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (companyId !== null) {
      paramCount++;
      query += ` AND p.company_id = $${paramCount}`;
      params.push(companyId);
    }

    if (department_id) {
      paramCount++;
      query += ` AND p.department_id = $${paramCount}`;
      params.push(department_id);
    }

    query += ' ORDER BY p.name ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Get single position
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT p.*, d.name as department_name
      FROM positions p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.id = $1
    `;
    const params = [id];

    if (companyId !== null) {
      query += ` AND p.company_id = $2`;
      params.push(companyId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching position:', error);
    res.status(500).json({ error: 'Failed to fetch position' });
  }
});

// Valid position roles for permission control
// manager: Full access to schedules, can edit any schedule
// supervisor: Can view team schedules, can only edit future schedules (T+3 onwards)
// crew: Regular employee, no schedule edit access
const VALID_ROLES = ['manager', 'supervisor', 'crew'];

// Create position
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, department_id, is_multi_outlet, role } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Position name is required' });
    }

    // Validate role if provided
    const positionRole = role && VALID_ROLES.includes(role.toLowerCase()) ? role.toLowerCase() : 'crew';

    const result = await pool.query(
      `INSERT INTO positions (company_id, department_id, name, is_multi_outlet, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [companyId, department_id || null, name.trim(), is_multi_outlet || false, positionRole]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating position:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Position already exists' });
    }
    res.status(500).json({ error: 'Failed to create position' });
  }
});

// Update position
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department_id, is_multi_outlet, role } = req.body;
    const companyId = getCompanyFilter(req);

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Position name is required' });
    }

    // Validate role if provided
    const positionRole = role && VALID_ROLES.includes(role.toLowerCase()) ? role.toLowerCase() : 'crew';

    let query = `
      UPDATE positions
      SET name = $1, department_id = $2, is_multi_outlet = $3, role = $4
      WHERE id = $5
    `;
    const params = [name.trim(), department_id || null, is_multi_outlet || false, positionRole, id];

    if (companyId !== null) {
      query = `
        UPDATE positions
        SET name = $1, department_id = $2, is_multi_outlet = $3, role = $4
        WHERE id = $5 AND company_id = $6
      `;
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Delete position
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    // Check if any employees are using this position
    const employeeCheck = await pool.query(
      'SELECT COUNT(*) as count FROM employees WHERE position_id = $1',
      [id]
    );

    if (parseInt(employeeCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete position - employees are assigned to it'
      });
    }

    let query = 'DELETE FROM positions WHERE id = $1';
    const params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    console.error('Error deleting position:', error);
    res.status(500).json({ error: 'Failed to delete position' });
  }
});

module.exports = router;
