const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get user with role, permissions, and company info
    const result = await pool.query(`
      SELECT au.*, ar.permissions, ar.display_name as role_display_name,
             c.id as company_id, c.name as company_name, c.code as company_code, c.logo_url as company_logo
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      LEFT JOIN companies c ON au.company_id = c.id
      WHERE au.username = $1
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];

    // Check if user is active
    if (admin.status !== 'active') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact administrator.' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [admin.id]
    );

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role || 'admin',
        name: admin.name,
        company_id: admin.company_id  // Include company_id in token (null for super_admin)
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role || 'admin',
        role_display_name: admin.role_display_name || 'Admin',
        permissions: admin.permissions || {},
        company_id: admin.company_id,
        company_name: admin.company_name,
        company_code: admin.company_code,
        company_logo: admin.company_logo
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Create initial admin (use once, then remove or protect)
router.post('/setup', async (req, res) => {
  try {
    const { username, password, setupKey } = req.body;

    // Simple setup key protection - change this in production
    if (setupKey !== 'HRMS_SETUP_2024') {
      return res.status(403).json({ error: 'Invalid setup key' });
    }

    // Check if admin already exists
    const existing = await pool.query('SELECT COUNT(*) FROM admin_users');
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Admin already exists. Use login instead.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // First user is always super_admin
    const result = await pool.query(
      `INSERT INTO admin_users (username, password_hash, name, role, status)
       VALUES ($1, $2, 'Super Admin', 'super_admin', 'active')
       RETURNING id, username, name, role`,
      [username, passwordHash]
    );

    res.status(201).json({
      message: 'Super Admin account created successfully',
      admin: result.rows[0],
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

module.exports = router;
