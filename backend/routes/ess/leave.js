/**
 * ESS Leave Routes
 * Handles employee leave balance, history, and applications
 * Includes supervisor/manager approval endpoints for Mimix
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const {
  isSupervisorOrManager,
  getManagedOutlets,
  getInitialApprovalLevel,
  isMimixCompany,
  canApproveForOutlet
} = require('../../middleware/essPermissions');

// Get leave balances
router.get('/balance', authenticateEmployee, asyncHandler(async (req, res) => {
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
}));

// Get leave history
router.get('/history', authenticateEmployee, asyncHandler(async (req, res) => {
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
}));

// Apply for leave
router.post('/apply', authenticateEmployee, asyncHandler(async (req, res) => {
  const { leave_type_id, start_date, end_date, reason } = req.body;

  if (!leave_type_id || !start_date || !end_date) {
    throw new ValidationError('Leave type, start date, and end date are required');
  }

  // Calculate total days (simple calculation, excludes weekends)
  const start = new Date(start_date);
  const end = new Date(end_date);

  if (start > end) {
    throw new ValidationError('End date must be after start date');
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
      throw new ValidationError(`Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`);
    }
  }

  // Get employee info for approval level
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = empResult.rows[0];

  // Determine initial approval level based on role and company
  const approvalLevel = getInitialApprovalLevel(employee);

  // Create leave request with approval_level
  const result = await pool.query(
    `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approval_level)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
     RETURNING *`,
    [req.employee.id, leave_type_id, start_date, end_date, totalDays, reason, approvalLevel]
  );

  console.log(`New leave request from employee ${req.employee.id}: ${totalDays} days, approval_level: ${approvalLevel}`);

  res.status(201).json(result.rows[0]);
}));

// Get leave types
router.get('/types', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM leave_types ORDER BY code'
  );
  res.json(result.rows);
}));

// =====================================================
// SUPERVISOR/MANAGER APPROVAL ENDPOINTS (Mimix only)
// =====================================================

/**
 * Get pending leave requests for supervisor/manager's team
 * Supervisors see their outlet's staff
 * Managers see all outlets they manage
 */
router.get('/team-pending', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info including role
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  // Only for Mimix (outlet-based companies)
  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'Team leave approval is only available for outlet-based companies.' });
  }

  // Get outlets this supervisor/manager can approve for
  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json([]);
  }

  // Get pending leave requests from employees in managed outlets
  // approval_level=1 means waiting for supervisor, approval_level=2 means waiting for manager
  const result = await pool.query(
    `SELECT lr.*, lt.code, lt.name as leave_type_name,
            e.name as employee_name, e.employee_id as emp_code, e.outlet_id,
            o.name as outlet_name
     FROM leave_requests lr
     JOIN leave_types lt ON lr.leave_type_id = lt.id
     JOIN employees e ON lr.employee_id = e.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.outlet_id = ANY($1)
       AND lr.status = 'pending'
       AND (
         (lr.approval_level = 1 AND $2 = 'supervisor')
         OR (lr.approval_level = 2 AND $2 = 'manager')
       )
     ORDER BY lr.created_at ASC`,
    [outletIds, employee.employee_role]
  );

  res.json(result.rows);
}));

/**
 * Approve leave request (supervisor/manager)
 */
router.post('/:id/approve', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  // Get the leave request with employee info
  const leaveResult = await pool.query(
    `SELECT lr.*, e.outlet_id as employee_outlet_id, e.name as employee_name
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE lr.id = $1`,
    [id]
  );

  if (leaveResult.rows.length === 0) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  const leaveRequest = leaveResult.rows[0];

  // Verify leave is pending
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Leave request is not pending' });
  }

  // Verify approver can approve for this outlet
  const canApprove = await canApproveForOutlet(approver, leaveRequest.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot approve leave for this employee' });
  }

  // Verify approval level matches approver's role
  if (leaveRequest.approval_level === 1 && approver.employee_role !== 'supervisor') {
    return res.status(400).json({ error: 'This leave request requires supervisor approval first' });
  }
  if (leaveRequest.approval_level === 2 && approver.employee_role !== 'manager') {
    return res.status(400).json({ error: 'This leave request requires manager approval' });
  }

  // Update leave request based on approval level
  if (approver.employee_role === 'supervisor') {
    // Supervisor approves - move to next level (manager or admin)
    await pool.query(
      `UPDATE leave_requests
       SET supervisor_id = $1, supervisor_approved = true, supervisor_approved_at = NOW(),
           approval_level = 2
       WHERE id = $2`,
      [req.employee.id, id]
    );

    // Create notification for employee
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'leave', 'Leave Request Update', 'Your leave request has been approved by supervisor. Pending final approval.', 'leave_request', $2)`,
      [leaveRequest.employee_id, id]
    );

    res.json({ message: 'Leave approved by supervisor. Pending manager/admin approval.' });

  } else if (approver.employee_role === 'manager') {
    // Manager approves - move to admin level
    await pool.query(
      `UPDATE leave_requests
       SET manager_id = $1, manager_approved = true, manager_approved_at = NOW(),
           approval_level = 3
       WHERE id = $2`,
      [req.employee.id, id]
    );

    // Create notification for employee
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'leave', 'Leave Request Update', 'Your leave request has been approved by manager. Pending final admin approval.', 'leave_request', $2)`,
      [leaveRequest.employee_id, id]
    );

    res.json({ message: 'Leave approved by manager. Pending admin approval.' });
  }
}));

/**
 * Reject leave request (supervisor/manager)
 */
router.post('/:id/reject', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  // Get the leave request with employee info
  const leaveResult = await pool.query(
    `SELECT lr.*, e.outlet_id as employee_outlet_id
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE lr.id = $1`,
    [id]
  );

  if (leaveResult.rows.length === 0) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  const leaveRequest = leaveResult.rows[0];

  // Verify leave is pending
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Leave request is not pending' });
  }

  // Verify approver can approve for this outlet
  const canApprove = await canApproveForOutlet(approver, leaveRequest.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot reject leave for this employee' });
  }

  // Update leave request to rejected
  await pool.query(
    `UPDATE leave_requests
     SET status = 'rejected', rejection_reason = $1, approver_id = $2, approved_at = NOW()
     WHERE id = $3`,
    [reason, req.employee.id, id]
  );

  // Create notification for employee
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'leave', 'Leave Request Rejected', $2, 'leave_request', $3)`,
    [leaveRequest.employee_id, `Your leave request has been rejected. Reason: ${reason}`, id]
  );

  res.json({ message: 'Leave request rejected.' });
}));

/**
 * Get count of pending leave approvals for supervisor/manager
 */
router.get('/team-pending-count', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.json({ count: 0 });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.json({ count: 0 });
  }

  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json({ count: 0 });
  }

  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE e.outlet_id = ANY($1)
       AND lr.status = 'pending'
       AND (
         (lr.approval_level = 1 AND $2 = 'supervisor')
         OR (lr.approval_level = 2 AND $2 = 'manager')
       )`,
    [outletIds, employee.employee_role]
  );

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
