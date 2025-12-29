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

// Seed 11 Mimix A outlets
router.post('/seed', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId || req.admin?.company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    // Define the 11 Mimix A outlets
    const mimixOutlets = [
      { name: 'Mimix A IOI Mall Putrajaya', address: 'IOI Mall Putrajaya, Putrajaya' },
      { name: 'Mimix A IOI City Mall', address: 'IOI City Mall, Putrajaya' },
      { name: 'Mimix A Mid Valley', address: 'Mid Valley Megamall, Kuala Lumpur' },
      { name: 'Mimix A Sunway Pyramid', address: 'Sunway Pyramid, Bandar Sunway, Selangor' },
      { name: 'Mimix A One Utama', address: '1 Utama Shopping Centre, Petaling Jaya, Selangor' },
      { name: 'Mimix A KLCC', address: 'Suria KLCC, Kuala Lumpur' },
      { name: 'Mimix A Pavilion KL', address: 'Pavilion Kuala Lumpur, Bukit Bintang' },
      { name: 'Mimix A Johor Bahru', address: 'Johor Bahru City Centre, Johor' },
      { name: 'Mimix A Penang', address: 'Gurney Plaza, George Town, Penang' },
      { name: 'Mimix A Ipoh', address: 'Ipoh Parade, Ipoh, Perak' },
      { name: 'Mimix A Kota Kinabalu', address: 'Imago Shopping Mall, Kota Kinabalu, Sabah' }
    ];

    // Get existing outlet names
    const existing = await pool.query(
      'SELECT name FROM outlets WHERE company_id = $1',
      [companyId]
    );
    const existingNames = new Set(existing.rows.map(o => o.name));

    // Filter out already existing outlets
    const newOutlets = mimixOutlets.filter(o => !existingNames.has(o.name));

    if (newOutlets.length === 0) {
      return res.json({
        message: 'All 11 outlets already exist',
        count: existing.rows.length
      });
    }

    // Insert new outlets
    const values = newOutlets.map((o, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
    const params = [companyId, ...newOutlets.flatMap(o => [o.name, o.address])];

    const result = await pool.query(
      `INSERT INTO outlets (company_id, name, address) VALUES ${values} RETURNING *`,
      params
    );

    res.json({
      message: `Created ${result.rows.length} outlets`,
      created: result.rows,
      total: existing.rows.length + result.rows.length
    });
  } catch (error) {
    console.error('Error seeding outlets:', error);
    res.status(500).json({ error: 'Failed to seed outlets' });
  }
});

module.exports = router;
