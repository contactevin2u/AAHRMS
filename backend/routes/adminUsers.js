const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateAdmin, requirePermission } = require('../middleware/auth');
const { getCompanyFilter, isSuperAdmin } = require('../middleware/tenant');

// Get all admin users (filtered by company)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT
        au.id, au.username, au.name, au.email, au.role, au.status,
        au.last_login, au.created_at, au.updated_at, au.company_id, au.outlet_id,
        ar.display_name as role_display_name,
        creator.username as created_by_name,
        c.name as company_name,
        o.name as outlet_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      LEFT JOIN admin_users creator ON au.created_by = creator.id
      LEFT JOIN companies c ON au.company_id = c.id
      LEFT JOIN outlets o ON au.outlet_id = o.id
    `;

    let params = [];
    // If not super_admin, only show users from same company
    if (companyId !== null) {
      query += ' WHERE au.company_id = $1';
      params = [companyId];
    }

    query += ' ORDER BY au.created_at DESC';

    const result = await pool.query(query, params);

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

// Get login history (must be before /:id route)
router.get('/login-history', authenticateAdmin, async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { date, days } = req.query;
    let dateFilter;
    const params = [];

    if (date) {
      params.push(date);
      dateFilter = `WHERE lh.login_at::date = $1`;
    } else {
      const d = parseInt(days) || 7;
      params.push(d);
      dateFilter = `WHERE lh.login_at >= NOW() - ($1 || ' days')::interval`;
    }

    const result = await pool.query(`
      SELECT lh.id, lh.admin_user_id, lh.username,
             au.name, au.role, au.company_id,
             lh.ip_address, lh.user_agent, lh.login_at, lh.success
      FROM admin_login_history lh
      LEFT JOIN admin_users au ON lh.admin_user_id = au.id
      ${dateFilter}
      ORDER BY lh.login_at DESC
      LIMIT 500
    `, params);

    const summary = await pool.query(`
      SELECT lh.username, au.name, COUNT(*) as login_count,
             COUNT(*) FILTER (WHERE lh.success = true) as success_count,
             COUNT(*) FILTER (WHERE lh.success = false) as failed_count,
             array_agg(DISTINCT lh.ip_address) as ip_addresses,
             MAX(lh.login_at) as last_login
      FROM admin_login_history lh
      LEFT JOIN admin_users au ON lh.admin_user_id = au.id
      ${dateFilter}
      GROUP BY lh.username, au.name
      ORDER BY login_count DESC
    `, params);

    res.json({ history: result.rows, summary: summary.rows });
  } catch (error) {
    console.error('Login history error:', error);
    res.status(500).json({ error: 'Failed to fetch login history' });
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
    const { username, password, name, email, role, company_id, outlet_id } = req.body;

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

    // Determine company_id - use provided one or current user's company
    const userCompanyId = company_id || req.companyId || null;

    // Create user
    const result = await pool.query(`
      INSERT INTO admin_users (username, password_hash, name, email, role, status, created_by, company_id, outlet_id)
      VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
      RETURNING id, username, name, email, role, status, created_at, company_id, outlet_id
    `, [username, passwordHash, name || null, email || null, role || 'hr', req.admin.id, userCompanyId, outlet_id || null]);

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
    const { name, email, role, status, outlet_id } = req.body;

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
          outlet_id = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, username, name, email, role, status, outlet_id, updated_at
    `, [name, email, role, status, outlet_id, id]);

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

// ==================== PROFILE MANAGEMENT ====================

// Get current user's profile
router.get('/me/profile', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        au.id, au.username, au.name, au.email, au.role, au.status,
        au.designation, au.phone, au.signature_text,
        au.last_login, au.created_at, au.updated_at,
        ar.display_name as role_display_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role = ar.name
      WHERE au.id = $1
    `, [req.admin.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update current user's own profile
router.put('/me/profile', authenticateAdmin, async (req, res) => {
  try {
    const { name, email, designation, phone, signature_text } = req.body;

    const result = await pool.query(`
      UPDATE admin_users
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          designation = COALESCE($3, designation),
          phone = COALESCE($4, phone),
          signature_text = COALESCE($5, signature_text),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, username, name, email, role, designation, phone, signature_text, updated_at
    `, [name, email, designation, phone, signature_text, req.admin.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change own password
router.post('/me/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    const user = await pool.query(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash and update new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, req.admin.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Super Admin: Update any user's profile
router.put('/profile/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, designation, phone, signature_text } = req.body;

    // Check if current user is super_admin
    const currentUser = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    if (currentUser.rows[0]?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can edit other users\' profiles' });
    }

    const result = await pool.query(`
      UPDATE admin_users
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          designation = COALESCE($3, designation),
          phone = COALESCE($4, phone),
          signature_text = COALESCE($5, signature_text),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, username, name, email, role, designation, phone, signature_text, updated_at
    `, [name, email, designation, phone, signature_text, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ==================== ROLE MANAGEMENT (Super Admin Only) ====================

// Check if user is super_admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    if (result.rows.length === 0 || result.rows[0].role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can manage roles' });
    }

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ error: 'Permission check failed' });
  }
};

// Get single role
router.get('/roles/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM admin_roles WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

// Create new role
router.post('/roles', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { name, display_name, description, permissions } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'Name and display name are required' });
    }

    // Validate name format (lowercase, underscores only)
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return res.status(400).json({ error: 'Role name must be lowercase letters, numbers, and underscores only' });
    }

    // Check if role name already exists
    const existing = await pool.query(
      'SELECT id FROM admin_roles WHERE name = $1',
      [name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Role name already exists' });
    }

    const result = await pool.query(`
      INSERT INTO admin_roles (name, display_name, description, permissions, is_system)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING *
    `, [name, display_name, description || '', permissions || {}]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update role
router.put('/roles/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, permissions } = req.body;

    // Check if role exists
    const existingRole = await pool.query(
      'SELECT * FROM admin_roles WHERE id = $1',
      [id]
    );

    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // For system roles, only allow updating permissions
    const role = existingRole.rows[0];

    let query, params;
    if (role.is_system) {
      // System roles: only update permissions
      query = `
        UPDATE admin_roles
        SET permissions = COALESCE($1, permissions),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      params = [permissions, id];
    } else {
      // Custom roles: can update everything except name
      query = `
        UPDATE admin_roles
        SET display_name = COALESCE($1, display_name),
            description = COALESCE($2, description),
            permissions = COALESCE($3, permissions),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;
      params = [display_name, description, permissions, id];
    }

    const result = await pool.query(query, params);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete role
router.delete('/roles/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if role exists
    const existingRole = await pool.query(
      'SELECT * FROM admin_roles WHERE id = $1',
      [id]
    );

    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const role = existingRole.rows[0];

    // Prevent deleting system roles
    if (role.is_system) {
      return res.status(403).json({ error: 'System roles cannot be deleted' });
    }

    // Check if any users have this role
    const usersWithRole = await pool.query(
      'SELECT COUNT(*) FROM admin_users WHERE role = $1',
      [role.name]
    );

    if (parseInt(usersWithRole.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete role that is assigned to users. Reassign users first.'
      });
    }

    await pool.query('DELETE FROM admin_roles WHERE id = $1', [id]);

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Assign supervisor to outlet
router.put('/:id/assign-outlet', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { outlet_id } = req.body;

    // Check permissions
    const currentUser = await pool.query(
      'SELECT role, company_id FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    const currentRole = currentUser.rows[0]?.role;
    if (!['super_admin', 'owner', 'admin', 'director'].includes(currentRole)) {
      return res.status(403).json({ error: 'You do not have permission to assign outlets' });
    }

    // Verify outlet exists and belongs to same company (if not super_admin)
    if (outlet_id) {
      let outletQuery = 'SELECT id, name, company_id FROM outlets WHERE id = $1';
      const outlet = await pool.query(outletQuery, [outlet_id]);

      if (outlet.rows.length === 0) {
        return res.status(404).json({ error: 'Outlet not found' });
      }

      // Non-super_admin can only assign outlets from their own company
      if (currentRole !== 'super_admin' && outlet.rows[0].company_id !== currentUser.rows[0].company_id) {
        return res.status(403).json({ error: 'Cannot assign outlet from different company' });
      }
    }

    const result = await pool.query(`
      UPDATE admin_users
      SET outlet_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, username, name, role, outlet_id
    `, [outlet_id || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get outlet name
    let outletName = null;
    if (outlet_id) {
      const outlet = await pool.query('SELECT name FROM outlets WHERE id = $1', [outlet_id]);
      outletName = outlet.rows[0]?.name;
    }

    res.json({
      message: outlet_id ? `User assigned to outlet: ${outletName}` : 'User unassigned from outlet',
      user: {
        ...result.rows[0],
        outlet_name: outletName
      }
    });
  } catch (error) {
    console.error('Error assigning outlet:', error);
    res.status(500).json({ error: 'Failed to assign outlet' });
  }
});

// Get supervisors for an outlet
router.get('/outlet/:outletId/supervisors', authenticateAdmin, async (req, res) => {
  try {
    const { outletId } = req.params;

    const result = await pool.query(`
      SELECT au.id, au.username, au.name, au.email, au.role, au.status
      FROM admin_users au
      WHERE au.outlet_id = $1 AND au.role = 'supervisor' AND au.status = 'active'
      ORDER BY au.name
    `, [outletId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching outlet supervisors:', error);
    res.status(500).json({ error: 'Failed to fetch supervisors' });
  }
});

// Get available permissions list
router.get('/permissions/list', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    // Define all available permissions in the system
    const permissions = [
      { key: 'all', label: 'Full Access', description: 'Complete access to all features' },
      { key: 'dashboard', label: 'Dashboard', description: 'View dashboard and statistics' },
      { key: 'employees', label: 'Employees', description: 'Manage employee records' },
      { key: 'employees_view', label: 'Employees (View Only)', description: 'View employee records only' },
      { key: 'payroll', label: 'Payroll', description: 'Full payroll management' },
      { key: 'payroll_view', label: 'Payroll (View Only)', description: 'View payroll records only' },
      { key: 'payroll_approve', label: 'Payroll Approve', description: 'Approve/finalize payroll runs' },
      { key: 'leave', label: 'Leave', description: 'Manage leave requests' },
      { key: 'leave_approve', label: 'Leave Approve', description: 'Approve leave requests' },
      { key: 'claims', label: 'Claims', description: 'Manage claims' },
      { key: 'claims_approve', label: 'Claims Approve', description: 'Approve claims' },
      { key: 'resignations', label: 'Resignations', description: 'Manage resignations' },
      { key: 'letters', label: 'HR Letters', description: 'Issue HR letters' },
      { key: 'departments', label: 'Departments', description: 'Manage departments' },
      { key: 'contributions', label: 'Contributions', description: 'View government contributions' },
      { key: 'feedback', label: 'Feedback', description: 'View anonymous feedback' },
      { key: 'users', label: 'User Management', description: 'Manage admin users' },
      { key: 'reports', label: 'Reports', description: 'View and export reports' },
    ];

    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions list:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

module.exports = router;
