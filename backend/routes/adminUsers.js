const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateAdmin, requirePermission } = require('../middleware/auth');

// Get all admin users
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        au.id, au.username, au.name, au.email, au.role, au.status,
        au.last_login, au.created_at, au.updated_at,
        ar.display_name as role_display_name,
        creator.username as created_by_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      LEFT JOIN admin_users creator ON au.created_by = creator.id
      ORDER BY au.created_at DESC
    `);

    // Remove password_hash from results
    const users = result.rows.map(user => {
      delete user.password_hash;
      return user;
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single admin user
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        au.id, au.username, au.name, au.email, au.role, au.status,
        au.last_login, au.created_at, au.updated_at,
        ar.display_name as role_display_name, ar.permissions
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      WHERE au.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new admin user
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;

    // Check if current user has permission to create users
    const currentUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    const currentRole = currentUser.rows[0]?.role;
    if (!['super_admin', 'boss', 'director'].includes(currentRole)) {
      return res.status(403).json({ error: 'You do not have permission to create users' });
    }

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if username already exists
    const existing = await pool.query(
      'SELECT id FROM admin_users WHERE username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Prevent creating super_admin unless you are super_admin
    if (role === 'super_admin' && currentRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can create Super Admin accounts' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(`
      INSERT INTO admin_users (username, password_hash, name, email, role, status, created_by)
      VALUES ($1, $2, $3, $4, $5, 'active', $6)
      RETURNING id, username, name, email, role, status, created_at
    `, [username, passwordHash, name || null, email || null, role || 'hr', req.admin.id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update admin user
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status } = req.body;

    // Check permissions
    const currentUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    const currentRole = currentUser.rows[0]?.role;
    if (!['super_admin', 'boss', 'director'].includes(currentRole)) {
      return res.status(403).json({ error: 'You do not have permission to edit users' });
    }

    // Check if target user exists
    const targetUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [id]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent editing super_admin unless you are super_admin
    if (targetUser.rows[0].role === 'super_admin' && currentRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can edit Super Admin accounts' });
    }

    // Prevent changing role to super_admin unless you are super_admin
    if (role === 'super_admin' && currentRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can assign Super Admin role' });
    }

    const result = await pool.query(`
      UPDATE admin_users
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          role = COALESCE($3, role),
          status = COALESCE($4, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, username, name, email, role, status, updated_at
    `, [name, email, role, status, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset user password
router.post('/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Check permissions
    const currentUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    const currentRole = currentUser.rows[0]?.role;
    if (!['super_admin', 'boss', 'director'].includes(currentRole)) {
      return res.status(403).json({ error: 'You do not have permission to reset passwords' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if target user exists
    const targetUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [id]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent resetting super_admin password unless you are super_admin
    if (targetUser.rows[0].role === 'super_admin' && currentRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can reset Super Admin password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete admin user
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (parseInt(id) === req.admin.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Check permissions
    const currentUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    const currentRole = currentUser.rows[0]?.role;
    if (!['super_admin', 'boss'].includes(currentRole)) {
      return res.status(403).json({ error: 'You do not have permission to delete users' });
    }

    // Check if target user exists
    const targetUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [id]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting super_admin
    if (targetUser.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super Admin accounts cannot be deleted' });
    }

    await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get all roles
router.get('/roles/all', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM admin_roles ORDER BY is_system DESC, name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get current user's permissions
router.get('/me/permissions', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT au.*, ar.permissions, ar.display_name as role_display_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      WHERE au.id = $1
    `, [req.admin.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    delete user.password_hash;

    res.json(user);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

module.exports = router;
