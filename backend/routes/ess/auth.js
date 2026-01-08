/**
 * ESS Authentication Routes
 * Handles employee login, password reset, and initial password setup
 * Features HttpOnly cookie authentication for security
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../../db');
const { asyncHandler, ValidationError, AuthenticationError } = require('../../middleware/errorHandler');
const { authenticateEmployee } = require('../../middleware/auth');
const { buildPermissionFlags, isMimixCompany } = require('../../middleware/essPermissions');

// Cookie configuration
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  path: '/'
};

/**
 * Build feature flags based on company settings
 */
function buildFeatureFlags(employee, company) {
  const groupingType = company?.grouping_type || 'department';
  const companyId = employee.company_id;

  return {
    // Core features (all companies)
    profile: true,
    leave: true,
    payslips: true,
    notifications: true,
    claims: true,
    letters: true,
    clockIn: true,                                // Attendance available for all companies

    // Company-specific features
    clockInRequiresGPS: groupingType === 'outlet',    // Mimix requires GPS
    clockInRequiresPhoto: groupingType === 'outlet',  // Mimix requires photo
    clockInRequiresFace: groupingType === 'outlet',   // Mimix requires face
    benefitsInKind: companyId === 1,              // AA Alive only
    lettersWithPDF: companyId === 1               // AA Alive only (has letterhead)
  };
}

// Employee Login (email/password)
router.post('/login', asyncHandler(async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    throw new ValidationError('Login and password are required');
  }

  // Find employee by email/username or employee_id (case-insensitive), including company info
  const result = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.email, e.password_hash, e.status, e.ess_enabled,
            e.department_id, e.company_id, e.outlet_id, e.must_change_password,
            e.employee_role, e.position, e.clock_in_required,
            c.name as company_name, c.code as company_code, c.logo_url as company_logo,
            c.grouping_type as company_grouping_type, c.settings as company_settings
     FROM employees e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE (LOWER(e.email) = LOWER($1) OR LOWER(e.employee_id) = LOWER($1)) AND e.status = 'active'`,
    [login]
  );

  if (result.rows.length === 0) {
    throw new AuthenticationError('Invalid credentials');
  }

  const employee = result.rows[0];

  // Check if ESS is enabled for this employee
  if (!employee.ess_enabled) {
    throw new AuthenticationError('Self-service access is not enabled for your account. Please contact HR.');
  }

  // Check if password is set
  if (!employee.password_hash) {
    return res.status(401).json({
      error: 'Password not set. Please use the password reset function or contact HR.',
      requiresSetup: true
    });
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, employee.password_hash);
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Update last login
  await pool.query(
    'UPDATE employees SET last_login = NOW() WHERE id = $1',
    [employee.id]
  );

  // Build feature flags based on company
  const features = buildFeatureFlags(employee, {
    grouping_type: employee.company_grouping_type,
    settings: employee.company_settings
  });

  // Build role-based permission flags
  const permissions = await buildPermissionFlags(employee);

  // Generate JWT token with company context and features
  const token = jwt.sign(
    {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      role: 'employee',
      employee_role: employee.employee_role || 'staff',
      company_id: employee.company_id,
      outlet_id: employee.outlet_id,
      features
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  // Set HttpOnly cookie
  res.cookie('ess_token', token, COOKIE_OPTIONS);

  res.json({
    token, // Also return token for backward compatibility
    requiresPasswordChange: employee.must_change_password || false,
    employee: {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      company_id: employee.company_id,
      company_name: employee.company_name,
      company_code: employee.company_code,
      company_logo: employee.company_logo,
      company_grouping_type: employee.company_grouping_type,
      outlet_id: employee.outlet_id,
      employee_role: employee.employee_role || 'staff',
      position: employee.position,
      clock_in_required: employee.clock_in_required,
      features,
      permissions
    }
  });
}));

// Request Password Reset
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  // Find employee by email
  const result = await pool.query(
    'SELECT id, name, email FROM employees WHERE email = $1 AND status = $2',
    [email, 'active']
  );

  // Always return success to prevent email enumeration
  if (result.rows.length === 0) {
    return res.json({ message: 'If an account exists with this email, a password reset link will be sent.' });
  }

  const employee = result.rows[0];

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

  // Save token to database
  await pool.query(
    'UPDATE employees SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
    [resetToken, resetExpires, employee.id]
  );

  // In production, send email here
  console.log(`Password reset token for ${email}: ${resetToken}`);

  res.json({
    message: 'If an account exists with this email, a password reset link will be sent.',
    dev_token: process.env.NODE_ENV !== 'production' ? resetToken : undefined
  });
}));

// Reset Password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw new ValidationError('Token and new password are required');
  }

  if (newPassword.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long');
  }

  // Find employee with valid reset token
  const result = await pool.query(
    `SELECT id FROM employees
     WHERE password_reset_token = $1
     AND password_reset_expires > NOW()
     AND status = 'active'`,
    [token]
  );

  if (result.rows.length === 0) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const employee = result.rows[0];

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update password and clear reset token
  await pool.query(
    `UPDATE employees
     SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
     WHERE id = $2`,
    [passwordHash, employee.id]
  );

  res.json({ message: 'Password reset successfully. You can now login.' });
}));

// Login with Employee ID and IC Number (available for all companies)
router.post('/login-ic', asyncHandler(async (req, res) => {
  const { employee_id, ic_number } = req.body;

  if (!employee_id || !ic_number) {
    throw new ValidationError('Employee ID and IC number are required');
  }

  // Clean IC number - remove dashes
  const cleanIC = ic_number.replace(/-/g, '');

  // Find employee by employee_id and verify IC, including company info
  const result = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.email, e.ic_number, e.status, e.ess_enabled,
            e.department_id, e.outlet_id, e.company_id, e.must_change_password,
            e.employee_role, e.position, e.clock_in_required,
            c.name as company_name, c.code as company_code, c.logo_url as company_logo,
            c.grouping_type as company_grouping_type, c.settings as company_settings,
            o.name as outlet_name
     FROM employees e
     LEFT JOIN companies c ON e.company_id = c.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.employee_id = $1 AND e.status = 'active'`,
    [employee_id]
  );

  if (result.rows.length === 0) {
    throw new AuthenticationError('Invalid employee ID');
  }

  const employee = result.rows[0];

  // Verify IC number (compare without dashes)
  const storedIC = (employee.ic_number || '').replace(/-/g, '');
  if (storedIC !== cleanIC) {
    throw new AuthenticationError('Invalid IC number');
  }

  // Check if ESS is enabled for this employee
  if (!employee.ess_enabled) {
    throw new AuthenticationError('Self-service access is not enabled for your account. Please contact HR.');
  }

  // Update last login
  await pool.query(
    'UPDATE employees SET last_login = NOW() WHERE id = $1',
    [employee.id]
  );

  // Build feature flags based on company
  const features = buildFeatureFlags(employee, {
    grouping_type: employee.company_grouping_type,
    settings: employee.company_settings
  });

  // Build role-based permission flags
  const permissions = await buildPermissionFlags(employee);

  // Generate JWT token with company context and features
  const token = jwt.sign(
    {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      role: 'employee',
      employee_role: employee.employee_role || 'staff',
      company_id: employee.company_id,
      outlet_id: employee.outlet_id,
      features
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  // Set HttpOnly cookie
  res.cookie('ess_token', token, COOKIE_OPTIONS);

  res.json({
    token, // Also return token for backward compatibility
    requiresPasswordChange: employee.must_change_password || false,
    employee: {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      company_id: employee.company_id,
      company_name: employee.company_name,
      company_code: employee.company_code,
      company_logo: employee.company_logo,
      company_grouping_type: employee.company_grouping_type,
      outlet_id: employee.outlet_id,
      outlet_name: employee.outlet_name,
      employee_role: employee.employee_role || 'staff',
      position: employee.position,
      clock_in_required: employee.clock_in_required,
      features,
      permissions
    }
  });
}));

// Login with Full Name and IC Number (available for all companies)
router.post('/login-name', asyncHandler(async (req, res) => {
  const { name, ic_number } = req.body;

  if (!name || !ic_number) {
    throw new ValidationError('Full name and IC number are required');
  }

  // Clean IC number - remove dashes
  const cleanIC = ic_number.replace(/-/g, '');

  // Find employee by name (case-insensitive) and verify IC, including company info
  const result = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.email, e.ic_number, e.status, e.ess_enabled,
            e.department_id, e.outlet_id, e.company_id, e.must_change_password,
            e.employee_role, e.position, e.clock_in_required,
            c.name as company_name, c.code as company_code, c.logo_url as company_logo,
            c.grouping_type as company_grouping_type, c.settings as company_settings,
            o.name as outlet_name
     FROM employees e
     LEFT JOIN companies c ON e.company_id = c.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE LOWER(TRIM(e.name)) = LOWER(TRIM($1)) AND e.status = 'active'`,
    [name]
  );

  if (result.rows.length === 0) {
    throw new AuthenticationError('Invalid name or IC number');
  }

  const employee = result.rows[0];

  // Verify IC number (compare without dashes)
  const storedIC = (employee.ic_number || '').replace(/-/g, '');
  if (storedIC !== cleanIC) {
    throw new AuthenticationError('Invalid name or IC number');
  }

  // Check if ESS is enabled for this employee
  if (!employee.ess_enabled) {
    throw new AuthenticationError('Self-service access is not enabled for your account. Please contact HR.');
  }

  // Update last login
  await pool.query(
    'UPDATE employees SET last_login = NOW() WHERE id = $1',
    [employee.id]
  );

  // Build feature flags based on company
  const features = buildFeatureFlags(employee, {
    grouping_type: employee.company_grouping_type,
    settings: employee.company_settings
  });

  // Build role-based permission flags
  const permissions = await buildPermissionFlags(employee);

  // Generate JWT token with company context and features
  const token = jwt.sign(
    {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      role: 'employee',
      employee_role: employee.employee_role || 'staff',
      company_id: employee.company_id,
      outlet_id: employee.outlet_id,
      features
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  // Set HttpOnly cookie
  res.cookie('ess_token', token, COOKIE_OPTIONS);

  res.json({
    token, // Also return token for backward compatibility
    requiresPasswordChange: employee.must_change_password || false,
    employee: {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      company_id: employee.company_id,
      company_name: employee.company_name,
      company_code: employee.company_code,
      company_logo: employee.company_logo,
      company_grouping_type: employee.company_grouping_type,
      outlet_id: employee.outlet_id,
      outlet_name: employee.outlet_name,
      employee_role: employee.employee_role || 'staff',
      position: employee.position,
      clock_in_required: employee.clock_in_required,
      features,
      permissions
    }
  });
}));

// Set Initial Password (for first-time login)
router.post('/set-password', asyncHandler(async (req, res) => {
  const { employee_id, ic_number, newPassword } = req.body;

  if (!employee_id || !ic_number || !newPassword) {
    throw new ValidationError('Employee ID, IC number, and new password are required');
  }

  if (newPassword.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long');
  }

  // Find employee and verify IC number
  const result = await pool.query(
    `SELECT id, password_hash FROM employees
     WHERE employee_id = $1 AND ic_number = $2 AND status = 'active'`,
    [employee_id, ic_number]
  );

  if (result.rows.length === 0) {
    throw new ValidationError('Employee not found or IC number does not match');
  }

  const employee = result.rows[0];

  // Check if password is already set
  if (employee.password_hash) {
    throw new ValidationError('Password already set. Use forgot password if you need to reset.');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Set password
  await pool.query(
    'UPDATE employees SET password_hash = $1 WHERE id = $2',
    [passwordHash, employee.id]
  );

  res.json({ message: 'Password set successfully. You can now login.' });
}));

// Get current authenticated employee (session check)
router.get('/me', authenticateEmployee, asyncHandler(async (req, res) => {
  // Fetch fresh employee data
  const result = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.email, e.status, e.department_id, e.outlet_id, e.company_id,
            e.employee_role, e.position, e.clock_in_required,
            c.name as company_name, c.code as company_code, c.logo_url as company_logo,
            c.grouping_type as company_grouping_type, c.settings as company_settings,
            o.name as outlet_name
     FROM employees e
     LEFT JOIN companies c ON e.company_id = c.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.id = $1 AND e.status = 'active'`,
    [req.employee.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Employee not found or inactive' });
  }

  const employee = result.rows[0];

  // Build fresh feature flags
  const features = buildFeatureFlags(employee, {
    grouping_type: employee.company_grouping_type,
    settings: employee.company_settings
  });

  // Build role-based permission flags
  const permissions = await buildPermissionFlags(employee);

  res.json({
    employee: {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email,
      company_id: employee.company_id,
      company_name: employee.company_name,
      company_code: employee.company_code,
      company_logo: employee.company_logo,
      company_grouping_type: employee.company_grouping_type,
      outlet_id: employee.outlet_id,
      outlet_name: employee.outlet_name,
      employee_role: employee.employee_role || 'staff',
      position: employee.position,
      clock_in_required: employee.clock_in_required,
      features,
      permissions
    }
  });
}));

// Change Password (for authenticated employees) - also supports setting username on first login
router.post('/change-password', authenticateEmployee, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, newUsername } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  if (newPassword.length < 6) {
    throw new ValidationError('New password must be at least 6 characters long');
  }

  // Validate username if provided
  if (newUsername) {
    const trimmedUsername = newUsername.trim();
    if (trimmedUsername.length < 3) {
      throw new ValidationError('Username must be at least 3 characters');
    }

    // Only letters and numbers allowed (no symbols)
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(trimmedUsername)) {
      throw new ValidationError('Username can only contain letters and numbers (no symbols)');
    }

    // Check if username already in use by another employee (case-insensitive)
    const usernameCheck = await pool.query(
      'SELECT id FROM employees WHERE LOWER(email) = LOWER($1) AND id != $2',
      [trimmedUsername, req.employee.id]
    );
    if (usernameCheck.rows.length > 0) {
      throw new ValidationError('This username is already taken');
    }
  }

  // Get employee's current password hash
  const result = await pool.query(
    'SELECT password_hash FROM employees WHERE id = $1',
    [req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new AuthenticationError('Employee not found');
  }

  const employee = result.rows[0];

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, employee.password_hash);
  if (!isValidPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // Update password, username (stored in email field), and clear must_change_password flag
  if (newUsername) {
    await pool.query(
      'UPDATE employees SET password_hash = $1, email = $2, must_change_password = false WHERE id = $3',
      [newPasswordHash, newUsername.trim(), req.employee.id]
    );
  } else {
    await pool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newPasswordHash, req.employee.id]
    );
  }

  // Fetch updated employee data to return
  const updatedResult = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.email, e.company_id, e.outlet_id,
            e.employee_role,
            c.name as company_name, c.code as company_code, c.logo_url as company_logo,
            c.grouping_type as company_grouping_type
     FROM employees e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.id = $1`,
    [req.employee.id]
  );

  const updatedEmployee = updatedResult.rows[0];
  const features = buildFeatureFlags(updatedEmployee, {
    grouping_type: updatedEmployee.company_grouping_type
  });
  const permissions = await buildPermissionFlags(updatedEmployee);

  res.json({
    message: newUsername ? 'Account setup completed successfully' : 'Password changed successfully',
    employee: {
      id: updatedEmployee.id,
      employee_id: updatedEmployee.employee_id,
      name: updatedEmployee.name,
      email: updatedEmployee.email,
      company_id: updatedEmployee.company_id,
      company_name: updatedEmployee.company_name,
      company_code: updatedEmployee.company_code,
      company_logo: updatedEmployee.company_logo,
      outlet_id: updatedEmployee.outlet_id,
      employee_role: updatedEmployee.employee_role || 'staff',
      features,
      permissions
    }
  });
}));

// Logout (clear HttpOnly cookie)
router.post('/logout', (req, res) => {
  res.clearCookie('ess_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
