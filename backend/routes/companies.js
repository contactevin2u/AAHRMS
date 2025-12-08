const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { requireSystemAdmin, isSuperAdmin } = require('../middleware/tenant');

// All routes require authentication
router.use(authenticateAdmin);

// =====================================================
// COMPANY MANAGEMENT (Super Admin Only)
// =====================================================

// Get all companies (Super Admin only)
router.get('/', requireSystemAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM employees WHERE company_id = c.id) as employee_count,
             (SELECT COUNT(*) FROM admin_users WHERE company_id = c.id) as admin_count,
             (SELECT COUNT(*) FROM departments WHERE company_id = c.id) as department_count
      FROM companies c
      ORDER BY c.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Get single company details
router.get('/:id', requireSystemAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM employees WHERE company_id = c.id) as employee_count,
             (SELECT COUNT(*) FROM admin_users WHERE company_id = c.id) as admin_count,
             (SELECT COUNT(*) FROM departments WHERE company_id = c.id) as department_count
      FROM companies c
      WHERE c.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// Create new company
router.post('/', requireSystemAdmin, async (req, res) => {
  try {
    const {
      name,
      code,
      logo_url,
      address,
      phone,
      email,
      registration_number,
      settings
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Company name and code are required' });
    }

    // Check if code already exists
    const existing = await pool.query('SELECT id FROM companies WHERE code = $1', [code.toUpperCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Company code already exists' });
    }

    const result = await pool.query(`
      INSERT INTO companies (name, code, logo_url, address, phone, email, registration_number, settings)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, code.toUpperCase(), logo_url, address, phone, email, registration_number, settings || {}]);

    const company = result.rows[0];

    // Create default leave types for the new company
    await pool.query(`
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id)
      SELECT code, name, is_paid, default_days_per_year, description, $1
      FROM leave_types
      WHERE company_id = 1
      ON CONFLICT DO NOTHING
    `, [company.id]);

    // Create default letter templates for the new company
    await pool.query(`
      INSERT INTO letter_templates (letter_type, name, subject, content, is_active, company_id)
      SELECT letter_type, name, subject, content, is_active, $1
      FROM letter_templates
      WHERE company_id = 1
      ON CONFLICT DO NOTHING
    `, [company.id]);

    // Create default departments for the new company
    await pool.query(`
      INSERT INTO departments (name, salary_type, company_id)
      SELECT name, salary_type, $1
      FROM departments
      WHERE company_id = 1
      ON CONFLICT DO NOTHING
    `, [company.id]);

    res.status(201).json({
      message: 'Company created successfully',
      company
    });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Update company
router.put('/:id', requireSystemAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      logo_url,
      address,
      phone,
      email,
      registration_number,
      status,
      settings
    } = req.body;

    const result = await pool.query(`
      UPDATE companies
      SET name = COALESCE($1, name),
          logo_url = COALESCE($2, logo_url),
          address = COALESCE($3, address),
          phone = COALESCE($4, phone),
          email = COALESCE($5, email),
          registration_number = COALESCE($6, registration_number),
          status = COALESCE($7, status),
          settings = COALESCE($8, settings),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [name, logo_url, address, phone, email, registration_number, status, settings, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({
      message: 'Company updated successfully',
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// Suspend/Deactivate company
router.patch('/:id/status', requireSystemAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, suspended, or inactive' });
    }

    // Prevent deactivating default company
    if (parseInt(id) === 1 && status !== 'active') {
      return res.status(400).json({ error: 'Cannot deactivate the default company' });
    }

    const result = await pool.query(`
      UPDATE companies
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({
      message: `Company ${status === 'active' ? 'activated' : status}`,
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating company status:', error);
    res.status(500).json({ error: 'Failed to update company status' });
  }
});

// Create company admin
router.post('/:id/admin', requireSystemAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, name, email, role = 'boss' } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }

    // Verify company exists
    const company = await pool.query('SELECT id, name FROM companies WHERE id = $1', [id]);
    if (company.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check if username already exists
    const existing = await pool.query('SELECT id FROM admin_users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create admin user for the company
    const result = await pool.query(`
      INSERT INTO admin_users (username, password_hash, name, email, role, status, company_id)
      VALUES ($1, $2, $3, $4, $5, 'active', $6)
      RETURNING id, username, name, email, role, status, company_id
    `, [username, passwordHash, name, email, role, id]);

    res.status(201).json({
      message: 'Company admin created successfully',
      admin: result.rows[0],
      company_name: company.rows[0].name
    });
  } catch (error) {
    console.error('Error creating company admin:', error);
    res.status(500).json({ error: 'Failed to create company admin' });
  }
});

// Get company admins
router.get('/:id/admins', requireSystemAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT au.id, au.username, au.name, au.email, au.role, au.status, au.last_login, au.created_at,
             ar.display_name as role_display_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      WHERE au.company_id = $1
      ORDER BY au.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching company admins:', error);
    res.status(500).json({ error: 'Failed to fetch company admins' });
  }
});

// Get company statistics
router.get('/:id/stats', requireSystemAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM employees WHERE company_id = $1 AND status = 'active') as active_employees,
        (SELECT COUNT(*) FROM employees WHERE company_id = $1) as total_employees,
        (SELECT COUNT(*) FROM admin_users WHERE company_id = $1 AND status = 'active') as active_admins,
        (SELECT COUNT(*) FROM departments WHERE company_id = $1) as departments,
        (SELECT COUNT(*) FROM leave_requests lr
         JOIN employees e ON lr.employee_id = e.id
         WHERE e.company_id = $1 AND lr.status = 'pending') as pending_leaves,
        (SELECT COUNT(*) FROM claims cl
         JOIN employees e ON cl.employee_id = e.id
         WHERE e.company_id = $1 AND cl.status = 'pending') as pending_claims,
        (SELECT COUNT(*) FROM payroll_runs WHERE company_id = $1 AND status = 'finalized') as finalized_payrolls
    `, [id]);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching company stats:', error);
    res.status(500).json({ error: 'Failed to fetch company statistics' });
  }
});

// Get current user's company info (for any authenticated user)
router.get('/current/info', async (req, res) => {
  try {
    // If super_admin without company, return null
    if (isSuperAdmin(req)) {
      return res.json({
        is_super_admin: true,
        company: null
      });
    }

    if (!req.companyId) {
      return res.status(400).json({ error: 'No company context' });
    }

    const result = await pool.query(`
      SELECT id, name, code, logo_url, address, phone, email, registration_number, status
      FROM companies
      WHERE id = $1
    `, [req.companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({
      is_super_admin: false,
      company: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching current company:', error);
    res.status(500).json({ error: 'Failed to fetch company info' });
  }
});

module.exports = router;
