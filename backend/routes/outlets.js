const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// Get all outlets (filtered by company)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT o.*,
        COUNT(e.id) as employee_count
      FROM outlets o
      LEFT JOIN employees e ON o.id = e.outlet_id AND e.status = 'active'
    `;
    let params = [];

    if (companyId !== null) {
      query += ' WHERE o.company_id = $1';
      params = [companyId];
    }

    query += ' GROUP BY o.id ORDER BY o.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching outlets:', error);
    res.status(500).json({ error: 'Failed to fetch outlets' });
  }
});

// Get single outlet
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = 'SELECT * FROM outlets WHERE id = $1';
    let params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching outlet:', error);
    res.status(500).json({ error: 'Failed to fetch outlet' });
  }
});

// Create outlet
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, address, latitude, longitude } = req.body;
    const companyId = req.companyId || req.admin?.company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Outlet name is required' });
    }

    const result = await pool.query(
      `INSERT INTO outlets (company_id, name, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [companyId, name, address, latitude, longitude]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating outlet:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Outlet name already exists' });
    }
    res.status(500).json({ error: 'Failed to create outlet' });
  }
});

// Update outlet
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude } = req.body;
    const companyId = getCompanyFilter(req);

    // Verify outlet belongs to user's company
    let checkQuery = 'SELECT id FROM outlets WHERE id = $1';
    let checkParams = [id];
    if (companyId !== null) {
      checkQuery += ' AND company_id = $2';
      checkParams.push(companyId);
    }

    const check = await pool.query(checkQuery, checkParams);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    const result = await pool.query(
      `UPDATE outlets SET name = $1, address = $2, latitude = $3, longitude = $4
       WHERE id = $5
       RETURNING *`,
      [name, address, latitude, longitude, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating outlet:', error);
    res.status(500).json({ error: 'Failed to update outlet' });
  }
});

// Delete outlet
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    // Check if outlet has employees
    const empCheck = await pool.query(
      'SELECT COUNT(*) FROM employees WHERE outlet_id = $1 AND status = $2',
      [id, 'active']
    );

    if (parseInt(empCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete outlet with active employees. Reassign employees first.'
      });
    }

    let deleteQuery = 'DELETE FROM outlets WHERE id = $1';
    let deleteParams = [id];
    if (companyId !== null) {
      deleteQuery += ' AND company_id = $2';
      deleteParams.push(companyId);
    }

    const result = await pool.query(deleteQuery + ' RETURNING id', deleteParams);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    res.json({ message: 'Outlet deleted successfully' });
  } catch (error) {
    console.error('Error deleting outlet:', error);
    res.status(500).json({ error: 'Failed to delete outlet' });
  }
});

// Seed default outlets for Mimix A
router.post('/seed', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId || req.admin?.company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    // Check if outlets already exist
    const existing = await pool.query(
      'SELECT COUNT(*) FROM outlets WHERE company_id = $1',
      [companyId]
    );

    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: 'Outlets already exist', count: existing.rows[0].count });
    }

    // Insert sample outlets
    const result = await pool.query(`
      INSERT INTO outlets (company_id, name, address) VALUES
        ($1, 'Outlet Ampang', 'Ampang, Selangor'),
        ($1, 'Outlet Cheras', 'Cheras, Kuala Lumpur'),
        ($1, 'Outlet Kepong', 'Kepong, Kuala Lumpur')
      RETURNING *
    `, [companyId]);

    res.json({ message: 'Outlets seeded successfully', outlets: result.rows });
  } catch (error) {
    console.error('Error seeding outlets:', error);
    res.status(500).json({ error: 'Failed to seed outlets' });
  }
});

module.exports = router;
