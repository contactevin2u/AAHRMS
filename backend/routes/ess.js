const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { authenticateEmployee } = require('../middleware/auth');

// =====================================================
// AUTHENTICATION
// =====================================================

// Employee Login
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password are required' });
    }

    // Find employee by email or employee_id, including company info
    const result = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.email, e.password_hash, e.status, e.ess_enabled,
              e.department_id, e.company_id, e.position, e.employee_role, e.outlet_id,
              e.clock_in_required,
              c.name as company_name, c.code as company_code, c.logo_url as company_logo
       FROM employees e
       LEFT JOIN companies c ON e.company_id = c.id
       WHERE (e.email = $1 OR e.employee_id = $1) AND e.status = 'active'`,
      [login]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const employee = result.rows[0];

    // Check if ESS is enabled for this employee
    if (!employee.ess_enabled) {
      return res.status(403).json({ error: 'Self-service access is not enabled for your account. Please contact HR.' });
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE employees SET last_login = NOW() WHERE id = $1',
      [employee.id]
    );

    // Generate JWT token with company context
    const token = jwt.sign(
      {
        id: employee.id,
        employee_id: employee.employee_id,
        name: employee.name,
        email: employee.email,
        role: 'employee',
        company_id: employee.company_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      employee: {
        id: employee.id,
        employee_id: employee.employee_id,
        name: employee.name,
        email: employee.email,
        company_id: employee.company_id,
        company_name: employee.company_name,
        company_code: employee.company_code,
        company_logo: employee.company_logo,
        position: employee.position,
        employee_role: employee.employee_role,
        outlet_id: employee.outlet_id,
        clock_in_required: employee.clock_in_required
      }
    });
  } catch (error) {
    console.error('Employee login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Request Password Reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
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
    // For now, we'll just return the token (in production, this should NOT be returned)
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({
      message: 'If an account exists with this email, a password reset link will be sent.',
      // Remove this in production - only for development
      dev_token: process.env.NODE_ENV !== 'production' ? resetToken : undefined
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
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
      return res.status(400).json({ error: 'Invalid or expired reset token' });
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
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Set Initial Password (for first-time login)
router.post('/set-password', async (req, res) => {
  try {
    const { employee_id, ic_number, newPassword } = req.body;

    if (!employee_id || !ic_number || !newPassword) {
      return res.status(400).json({ error: 'Employee ID, IC number, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find employee and verify IC number
    const result = await pool.query(
      `SELECT id, password_hash FROM employees
       WHERE employee_id = $1 AND ic_number = $2 AND status = 'active'`,
      [employee_id, ic_number]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Employee not found or IC number does not match' });
    }

    const employee = result.rows[0];

    // Check if password is already set
    if (employee.password_hash) {
      return res.status(400).json({ error: 'Password already set. Use forgot password if you need to reset.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Set password
    await pool.query(
      'UPDATE employees SET password_hash = $1 WHERE id = $2',
      [passwordHash, employee.id]
    );

    res.json({ message: 'Password set successfully. You can now login.' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

// =====================================================
// PROFILE
// =====================================================

// Get current employee profile
router.get('/profile', authenticateEmployee, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = $1`,
      [req.employee.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = result.rows[0];

    // Remove sensitive fields
    delete employee.password_hash;
    delete employee.password_reset_token;
    delete employee.password_reset_expires;

    res.json(employee);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// =====================================================
// PAYSLIPS / SALARY RECORDS
// =====================================================

// Get employee's payslips
router.get('/payslips', authenticateEmployee, async (req, res) => {
  try {
    const { year } = req.query;

    let query = `
      SELECT pi.*, pr.month, pr.year, pr.status as run_status
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pi.employee_id = $1
    `;
    const params = [req.employee.id];

    if (year) {
      query += ' AND pr.year = $2';
      params.push(year);
    }

    query += ' ORDER BY pr.year DESC, pr.month DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payslips:', error);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

// Get single payslip details
router.get('/payslips/:id', authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pi.*, pr.month, pr.year, pr.status as run_status
       FROM payroll_items pi
       JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
       WHERE pi.id = $1 AND pi.employee_id = $2`,
      [id, req.employee.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payslip not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({ error: 'Failed to fetch payslip' });
  }
});

// =====================================================
// LEAVE
// =====================================================

// Get leave balances
router.get('/leave/balance', authenticateEmployee, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    const result = await pool.query(
      `SELECT lb.*, lt.code, lt.name as leave_type_name, lt.is_paid
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = $1 AND lb.year = $2
       ORDER BY lt.code`,
      [req.employee.id, currentYear]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    res.status(500).json({ error: 'Failed to fetch leave balance' });
  }
});

// Get leave history
router.get('/leave/history', authenticateEmployee, async (req, res) => {
  try {
    const { year, status } = req.query;

    let query = `
      SELECT lr.*, lt.code, lt.name as leave_type_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
    `;
    const params = [req.employee.id];
    let paramCount = 1;

    if (year) {
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM lr.start_date) = $${paramCount}`;
      params.push(year);
    }

    if (status) {
      paramCount++;
      query += ` AND lr.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY lr.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leave history:', error);
    res.status(500).json({ error: 'Failed to fetch leave history' });
  }
});

// Apply for leave
router.post('/leave/apply', authenticateEmployee, async (req, res) => {
  try {
    const { leave_type_id, start_date, end_date, reason } = req.body;

    if (!leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Leave type, start date, and end date are required' });
    }

    // Calculate total days (simple calculation, excludes weekends in basic version)
    const start = new Date(start_date);
    const end = new Date(end_date);

    if (start > end) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    let totalDays = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) { // Not Sunday or Saturday
        totalDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    // Check leave balance
    const currentYear = new Date().getFullYear();
    const balanceResult = await pool.query(
      `SELECT lb.*, lt.is_paid
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = $1 AND lb.leave_type_id = $2 AND lb.year = $3`,
      [req.employee.id, leave_type_id, currentYear]
    );

    if (balanceResult.rows.length > 0) {
      const balance = balanceResult.rows[0];
      const available = parseFloat(balance.entitled_days) + parseFloat(balance.carried_forward) - parseFloat(balance.used_days);

      if (balance.is_paid && totalDays > available) {
        return res.status(400).json({
          error: `Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`
        });
      }
    }

    // Create leave request
    const result = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [req.employee.id, leave_type_id, start_date, end_date, totalDays, reason]
    );

    // Create notification for admin (we'll handle this later)
    // For now, just log it
    console.log(`New leave request from employee ${req.employee.id}: ${totalDays} days`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error applying for leave:', error);
    res.status(500).json({ error: 'Failed to submit leave request' });
  }
});

// Get leave types
router.get('/leave/types', authenticateEmployee, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM leave_types ORDER BY code'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leave types:', error);
    res.status(500).json({ error: 'Failed to fetch leave types' });
  }
});

// =====================================================
// CLAIMS
// =====================================================

// Get claims history
router.get('/claims', authenticateEmployee, async (req, res) => {
  try {
    const { status, year } = req.query;

    let query = `
      SELECT * FROM claims
      WHERE employee_id = $1
    `;
    const params = [req.employee.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (year) {
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM claim_date) = $${paramCount}`;
      params.push(year);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Submit a claim
router.post('/claims', authenticateEmployee, async (req, res) => {
  try {
    const { claim_date, category, description, amount, receipt_url } = req.body;

    if (!claim_date || !category || !amount) {
      return res.status(400).json({ error: 'Claim date, category, and amount are required' });
    }

    const result = await pool.query(
      `INSERT INTO claims (employee_id, claim_date, category, description, amount, receipt_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [req.employee.id, claim_date, category, description, amount, receipt_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting claim:', error);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

// =====================================================
// NOTIFICATIONS
// =====================================================

// Get notifications
router.get('/notifications', authenticateEmployee, async (req, res) => {
  try {
    const { unread_only } = req.query;

    let query = `
      SELECT * FROM notifications
      WHERE employee_id = $1
    `;
    const params = [req.employee.id];

    if (unread_only === 'true') {
      query += ' AND is_read = FALSE';
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND employee_id = $2
       RETURNING *`,
      [id, req.employee.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all notifications as read
router.put('/notifications/read-all', authenticateEmployee, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE employee_id = $1',
      [req.employee.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Get unread notification count
router.get('/notifications/unread-count', authenticateEmployee, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE employee_id = $1 AND is_read = FALSE',
      [req.employee.id]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// =====================================================
// HR LETTERS / DOCUMENTS
// =====================================================

// Get employee's letters
router.get('/letters', authenticateEmployee, async (req, res) => {
  try {
    const { status, letter_type } = req.query;

    let query = `
      SELECT * FROM hr_letters
      WHERE employee_id = $1
    `;
    const params = [req.employee.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (letter_type) {
      paramCount++;
      query += ` AND letter_type = $${paramCount}`;
      params.push(letter_type);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching letters:', error);
    res.status(500).json({ error: 'Failed to fetch letters' });
  }
});

// Get single letter and mark as read
router.get('/letters/:id', authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the letter (only if it belongs to this employee)
    const result = await pool.query(
      'SELECT * FROM hr_letters WHERE id = $1 AND employee_id = $2',
      [id, req.employee.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    const letter = result.rows[0];

    // If unread, mark as read
    if (letter.status === 'unread') {
      await pool.query(
        `UPDATE hr_letters SET status = 'read', read_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );
      letter.status = 'read';
      letter.read_at = new Date();
    }

    res.json(letter);
  } catch (error) {
    console.error('Error fetching letter:', error);
    res.status(500).json({ error: 'Failed to fetch letter' });
  }
});

// Get unread letters count
router.get('/letters/unread/count', authenticateEmployee, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM hr_letters
       WHERE employee_id = $1 AND status = 'unread'`,
      [req.employee.id]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// =====================================================
// DASHBOARD SUMMARY
// =====================================================

// Get dashboard summary data
router.get('/dashboard', authenticateEmployee, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Get employee info
    const empResult = await pool.query(
      `SELECT e.name, e.employee_id, e.position, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = $1`,
      [req.employee.id]
    );

    // Get latest payslip
    const payslipResult = await pool.query(
      `SELECT pi.net_pay, pi.gross_salary, pr.month, pr.year
       FROM payroll_items pi
       JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
       WHERE pi.employee_id = $1 AND pr.status = 'finalized'
       ORDER BY pr.year DESC, pr.month DESC
       LIMIT 1`,
      [req.employee.id]
    );

    // Get leave balances summary
    const leaveResult = await pool.query(
      `SELECT lt.code, lb.entitled_days, lb.used_days, lb.carried_forward
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = $1 AND lb.year = $2
       ORDER BY lt.code`,
      [req.employee.id, currentYear]
    );

    // Get pending items count
    const pendingLeaveResult = await pool.query(
      `SELECT COUNT(*) as count FROM leave_requests
       WHERE employee_id = $1 AND status = 'pending'`,
      [req.employee.id]
    );

    const pendingClaimsResult = await pool.query(
      `SELECT COUNT(*) as count FROM claims
       WHERE employee_id = $1 AND status = 'pending'`,
      [req.employee.id]
    );

    // Get unread notifications
    const unreadResult = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE employee_id = $1 AND is_read = FALSE',
      [req.employee.id]
    );

    // Get unread letters
    const unreadLettersResult = await pool.query(
      `SELECT COUNT(*) as count FROM hr_letters WHERE employee_id = $1 AND status = 'unread'`,
      [req.employee.id]
    );

    res.json({
      employee: empResult.rows[0] || null,
      latestPayslip: payslipResult.rows[0] || null,
      leaveBalances: leaveResult.rows,
      pendingLeaveRequests: parseInt(pendingLeaveResult.rows[0].count),
      pendingClaims: parseInt(pendingClaimsResult.rows[0].count),
      unreadNotifications: parseInt(unreadResult.rows[0].count),
      unreadLetters: parseInt(unreadLettersResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
