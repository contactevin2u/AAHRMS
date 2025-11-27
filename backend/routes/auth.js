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

    const result = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
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

    const result = await pool.query(
      'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );

    res.status(201).json({
      message: 'Admin account created successfully',
      admin: result.rows[0],
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

module.exports = router;
