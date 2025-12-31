/**
 * ESS Shift Swap Routes
 * Allows outlet employees to swap shifts with colleagues
 * Includes supervisor approval workflow (Mimix only)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../../middleware/errorHandler');
const {
  isSupervisorOrManager,
  getManagedOutlets,
  isMimixCompany,
  canApproveForOutlet
} = require('../../middleware/essPermissions');

// Middleware to verify employee token
const authenticateEmployee = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'employee') {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.employee = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper to format time for display
const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 5); // HH:MM
};

// Get outlet calendar (all shifts for employees in same outlet)
router.get('/outlet-calendar', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month are required' });
  }

  // Get employee's outlet
  const empResult = await pool.query(
    'SELECT outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (!empResult.rows[0]?.outlet_id) {
    return res.status(400).json({ error: 'You are not assigned to an outlet' });
  }

  const outletId = empResult.rows[0].outlet_id;

  // Get all schedules for this outlet for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT s.*,
            e.name as employee_name,
            e.id as employee_id
     FROM schedules s
     JOIN employees e ON s.employee_id = e.id
     WHERE e.outlet_id = $1
       AND s.schedule_date BETWEEN $2 AND $3
       AND s.status = 'scheduled'
     ORDER BY s.schedule_date, s.shift_start`,
    [outletId, startDate, endDate]
  );

  // Format the schedules
  const schedules = result.rows.map(s => ({
    ...s,
    shift_start: formatTime(s.shift_start),
    shift_end: formatTime(s.shift_end),
    is_mine: s.employee_id === employeeId
  }));

  res.json(schedules);
}));

// Get colleagues in same outlet
router.get('/outlet-colleagues', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  // Get employee's outlet
  const empResult = await pool.query(
    'SELECT outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (!empResult.rows[0]?.outlet_id) {
    return res.status(400).json({ error: 'You are not assigned to an outlet' });
  }

  const outletId = empResult.rows[0].outlet_id;

  // Get all active employees in the same outlet (excluding self)
  const result = await pool.query(
    `SELECT id, name, employee_id as emp_code
     FROM employees
     WHERE outlet_id = $1
       AND id != $2
       AND status = 'active'
     ORDER BY name`,
    [outletId, employeeId]
  );

  res.json(result.rows);
}));

// Get my swap requests (sent and received)
router.get('/my-requests', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  // Get requests where I am requester OR target
  const result = await pool.query(
    `SELECT ssr.*,
            req.name as requester_name,
            tgt.name as target_name,
            rs.schedule_date as requester_shift_date,
            rs.shift_start as requester_shift_start,
            rs.shift_end as requester_shift_end,
            ts.schedule_date as target_shift_date,
            ts.shift_start as target_shift_start,
            ts.shift_end as target_shift_end,
            o.name as outlet_name
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     JOIN employees tgt ON ssr.target_id = tgt.id
     JOIN schedules rs ON ssr.requester_shift_id = rs.id
     JOIN schedules ts ON ssr.target_shift_id = ts.id
     LEFT JOIN outlets o ON ssr.outlet_id = o.id
     WHERE ssr.requester_id = $1 OR ssr.target_id = $1
     ORDER BY ssr.created_at DESC`,
    [employeeId]
  );

  // Categorize requests
  const requests = result.rows.map(r => ({
    ...r,
    requester_shift_start: formatTime(r.requester_shift_start),
    requester_shift_end: formatTime(r.requester_shift_end),
    target_shift_start: formatTime(r.target_shift_start),
    target_shift_end: formatTime(r.target_shift_end),
    is_incoming: r.target_id === employeeId,
    is_outgoing: r.requester_id === employeeId
  }));

  res.json(requests);
}));

// Create swap request
router.post('/request', authenticateEmployee, asyncHandler(async (req, res) => {
  const requesterId = req.employee.id;
  const { requester_shift_id, target_id, target_shift_id, reason } = req.body;

  if (!requester_shift_id || !target_id || !target_shift_id) {
    return res.status(400).json({
      error: 'Requester shift, target employee, and target shift are required'
    });
  }

  // Validate requester owns the requester_shift
  const requesterShift = await pool.query(
    `SELECT s.*, e.outlet_id
     FROM schedules s
     JOIN employees e ON s.employee_id = e.id
     WHERE s.id = $1 AND s.employee_id = $2 AND s.status = 'scheduled'`,
    [requester_shift_id, requesterId]
  );

  if (requesterShift.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid requester shift or not your shift' });
  }

  const outletId = requesterShift.rows[0].outlet_id;
  const requesterShiftDate = requesterShift.rows[0].schedule_date;

  // Check shift is in the future
  if (new Date(requesterShiftDate) < new Date().setHours(0, 0, 0, 0)) {
    return res.status(400).json({ error: 'Cannot swap past shifts' });
  }

  // Validate target owns the target_shift and is in same outlet
  const targetShift = await pool.query(
    `SELECT s.*, e.outlet_id, e.name as target_name
     FROM schedules s
     JOIN employees e ON s.employee_id = e.id
     WHERE s.id = $1 AND s.employee_id = $2 AND s.status = 'scheduled'`,
    [target_shift_id, target_id]
  );

  if (targetShift.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid target shift or not their shift' });
  }

  if (targetShift.rows[0].outlet_id !== outletId) {
    return res.status(400).json({ error: 'Target employee must be in the same outlet' });
  }

  const targetShiftDate = targetShift.rows[0].schedule_date;

  // Check target shift is in the future
  if (new Date(targetShiftDate) < new Date().setHours(0, 0, 0, 0)) {
    return res.status(400).json({ error: 'Cannot swap past shifts' });
  }

  // Check for existing pending swap requests involving these shifts
  const existingSwap = await pool.query(
    `SELECT id FROM shift_swap_requests
     WHERE (requester_shift_id = $1 OR target_shift_id = $1
            OR requester_shift_id = $2 OR target_shift_id = $2)
       AND status IN ('pending_target', 'pending_supervisor', 'pending_admin')`,
    [requester_shift_id, target_shift_id]
  );

  if (existingSwap.rows.length > 0) {
    return res.status(400).json({
      error: 'One of these shifts already has a pending swap request'
    });
  }

  // Check for conflicts - if swap would result in double booking
  // After swap: requester works target's date, target works requester's date
  // Check if requester already has shift on target's date
  const requesterConflict = await pool.query(
    `SELECT id FROM schedules
     WHERE employee_id = $1 AND schedule_date = $2 AND id != $3 AND status = 'scheduled'`,
    [requesterId, targetShiftDate, requester_shift_id]
  );

  if (requesterConflict.rows.length > 0) {
    return res.status(400).json({
      error: 'You already have a shift on the target date'
    });
  }

  // Check if target already has shift on requester's date
  const targetConflict = await pool.query(
    `SELECT id FROM schedules
     WHERE employee_id = $1 AND schedule_date = $2 AND id != $3 AND status = 'scheduled'`,
    [target_id, requesterShiftDate, target_shift_id]
  );

  if (targetConflict.rows.length > 0) {
    return res.status(400).json({
      error: 'Target employee already has a shift on your shift date'
    });
  }

  // Create the swap request
  const result = await pool.query(
    `INSERT INTO shift_swap_requests
       (outlet_id, requester_id, requester_shift_id, target_id, target_shift_id, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending_target')
     RETURNING *`,
    [outletId, requesterId, requester_shift_id, target_id, target_shift_id, reason]
  );

  // Get requester name for notification
  const requesterInfo = await pool.query(
    'SELECT name FROM employees WHERE id = $1',
    [requesterId]
  );

  // Create notification for target employee
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Request', $2, 'shift_swap', $3)`,
    [
      target_id,
      `${requesterInfo.rows[0].name} wants to swap shifts with you`,
      result.rows[0].id
    ]
  );

  res.status(201).json({
    message: 'Swap request created successfully',
    request: result.rows[0]
  });
}));

// Respond to swap request (target accepts/rejects)
router.post('/:id/respond', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { id } = req.params;
  const { response } = req.body; // 'accepted' or 'rejected'

  if (!['accepted', 'rejected'].includes(response)) {
    return res.status(400).json({ error: 'Response must be "accepted" or "rejected"' });
  }

  // Get the swap request
  const swapResult = await pool.query(
    `SELECT ssr.*, req.name as requester_name
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     WHERE ssr.id = $1`,
    [id]
  );

  if (swapResult.rows.length === 0) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

  const swap = swapResult.rows[0];

  // Verify this employee is the target
  if (swap.target_id !== employeeId) {
    return res.status(403).json({ error: 'You are not the target of this swap request' });
  }

  // Verify status is pending_target
  if (swap.status !== 'pending_target') {
    return res.status(400).json({ error: 'This request has already been responded to' });
  }

  // Get target name for notification
  const targetInfo = await pool.query(
    'SELECT name FROM employees WHERE id = $1',
    [employeeId]
  );

  if (response === 'accepted') {
    // Update to pending_supervisor (supervisor/manager approval required)
    await pool.query(
      `UPDATE shift_swap_requests
       SET status = 'pending_supervisor',
           target_response = 'accepted',
           target_responded_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Notify requester
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'shift_swap', 'Swap Request Accepted', $2, 'shift_swap', $3)`,
      [
        swap.requester_id,
        `${targetInfo.rows[0].name} accepted your swap request. Pending supervisor approval.`,
        id
      ]
    );

    // Find and notify supervisor for this outlet
    const supervisorResult = await pool.query(
      `SELECT id FROM employees
       WHERE outlet_id = $1 AND employee_role = 'supervisor' AND status = 'active'
       LIMIT 1`,
      [swap.outlet_id]
    );

    if (supervisorResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
         VALUES ($1, 'shift_swap', 'Shift Swap Approval Required', $2, 'shift_swap', $3)`,
        [
          supervisorResult.rows[0].id,
          `${swap.requester_name} and ${targetInfo.rows[0].name} want to swap shifts`,
          id
        ]
      );
    }

    res.json({ message: 'You accepted the swap request. Waiting for supervisor approval.' });
  } else {
    // Rejected
    await pool.query(
      `UPDATE shift_swap_requests
       SET status = 'rejected',
           target_response = 'rejected',
           target_responded_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Notify requester
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'shift_swap', 'Swap Request Rejected', $2, 'shift_swap', $3)`,
      [
        swap.requester_id,
        `${targetInfo.rows[0].name} rejected your swap request.`,
        id
      ]
    );

    res.json({ message: 'You rejected the swap request.' });
  }
}));

// Cancel pending request (requester only, only if pending_target)
router.delete('/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { id } = req.params;

  // Get the swap request
  const swapResult = await pool.query(
    'SELECT * FROM shift_swap_requests WHERE id = $1',
    [id]
  );

  if (swapResult.rows.length === 0) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

  const swap = swapResult.rows[0];

  // Verify this employee is the requester
  if (swap.requester_id !== employeeId) {
    return res.status(403).json({ error: 'You can only cancel your own requests' });
  }

  // Verify status is pending_target
  if (swap.status !== 'pending_target') {
    return res.status(400).json({
      error: 'Cannot cancel request that has already been accepted or processed'
    });
  }

  // Delete the request
  await pool.query('DELETE FROM shift_swap_requests WHERE id = $1', [id]);

  res.json({ message: 'Swap request cancelled' });
}));

// Get my upcoming shifts (for swap modal)
router.get('/my-shifts', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const today = new Date().toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT id, schedule_date, shift_start, shift_end
     FROM schedules
     WHERE employee_id = $1
       AND schedule_date >= $2
       AND status = 'scheduled'
     ORDER BY schedule_date`,
    [employeeId, today]
  );

  const shifts = result.rows.map(s => ({
    ...s,
    shift_start: formatTime(s.shift_start),
    shift_end: formatTime(s.shift_end)
  }));

  res.json(shifts);
}));

// Get colleague's upcoming shifts (for swap modal)
router.get('/colleague-shifts/:colleagueId', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { colleagueId } = req.params;
  const today = new Date().toISOString().split('T')[0];

  // Verify colleague is in same outlet
  const myOutlet = await pool.query(
    'SELECT outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  const colleagueOutlet = await pool.query(
    'SELECT outlet_id FROM employees WHERE id = $1',
    [colleagueId]
  );

  if (!myOutlet.rows[0]?.outlet_id ||
      myOutlet.rows[0].outlet_id !== colleagueOutlet.rows[0]?.outlet_id) {
    return res.status(403).json({ error: 'Colleague is not in your outlet' });
  }

  const result = await pool.query(
    `SELECT id, schedule_date, shift_start, shift_end
     FROM schedules
     WHERE employee_id = $1
       AND schedule_date >= $2
       AND status = 'scheduled'
     ORDER BY schedule_date`,
    [colleagueId, today]
  );

  const shifts = result.rows.map(s => ({
    ...s,
    shift_start: formatTime(s.shift_start),
    shift_end: formatTime(s.shift_end)
  }));

  res.json(shifts);
}));

// =====================================================
// SUPERVISOR/MANAGER APPROVAL ENDPOINTS (Mimix only)
// =====================================================

/**
 * Get pending shift swap approvals for supervisor/manager
 */
router.get('/pending-approvals', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'Shift swap approval is only available for outlet-based companies.' });
  }

  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json([]);
  }

  // Get pending swap requests for managed outlets
  const result = await pool.query(
    `SELECT ssr.*,
            req.name as requester_name, req.employee_id as requester_emp_code,
            tgt.name as target_name, tgt.employee_id as target_emp_code,
            rs.schedule_date as requester_shift_date,
            rs.shift_start as requester_shift_start,
            rs.shift_end as requester_shift_end,
            ts.schedule_date as target_shift_date,
            ts.shift_start as target_shift_start,
            ts.shift_end as target_shift_end,
            o.name as outlet_name
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     JOIN employees tgt ON ssr.target_id = tgt.id
     JOIN schedules rs ON ssr.requester_shift_id = rs.id
     JOIN schedules ts ON ssr.target_shift_id = ts.id
     LEFT JOIN outlets o ON ssr.outlet_id = o.id
     WHERE ssr.outlet_id = ANY($1)
       AND ssr.status = 'pending_supervisor'
     ORDER BY ssr.created_at ASC`,
    [outletIds]
  );

  const requests = result.rows.map(r => ({
    ...r,
    requester_shift_start: formatTime(r.requester_shift_start),
    requester_shift_end: formatTime(r.requester_shift_end),
    target_shift_start: formatTime(r.target_shift_start),
    target_shift_end: formatTime(r.target_shift_end)
  }));

  res.json(requests);
}));

/**
 * Supervisor approves shift swap
 */
router.post('/:id/supervisor-approve', authenticateEmployee, asyncHandler(async (req, res) => {
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

  // Get the swap request
  const swapResult = await pool.query(
    `SELECT ssr.*, req.name as requester_name, tgt.name as target_name,
            rs.schedule_date as requester_date, ts.schedule_date as target_date
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     JOIN employees tgt ON ssr.target_id = tgt.id
     JOIN schedules rs ON ssr.requester_shift_id = rs.id
     JOIN schedules ts ON ssr.target_shift_id = ts.id
     WHERE ssr.id = $1`,
    [id]
  );

  if (swapResult.rows.length === 0) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

  const swap = swapResult.rows[0];

  // Verify status is pending_supervisor
  if (swap.status !== 'pending_supervisor') {
    return res.status(400).json({ error: 'This swap request is not pending supervisor approval' });
  }

  // Verify approver can approve for this outlet
  const canApprove = await canApproveForOutlet(approver, swap.outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot approve swaps for this outlet' });
  }

  // Execute the swap - update schedules
  // Swap the employee_id on both schedule records
  await pool.query(
    `UPDATE schedules SET employee_id = $1 WHERE id = $2`,
    [swap.target_id, swap.requester_shift_id]
  );

  await pool.query(
    `UPDATE schedules SET employee_id = $1 WHERE id = $2`,
    [swap.requester_id, swap.target_shift_id]
  );

  // Update swap request status
  await pool.query(
    `UPDATE shift_swap_requests
     SET status = 'approved',
         supervisor_id = $1,
         supervisor_approved = TRUE,
         supervisor_approved_at = NOW()
     WHERE id = $2`,
    [req.employee.id, id]
  );

  // Notify both employees
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Approved', $2, 'shift_swap', $3)`,
    [swap.requester_id, `Your shift swap with ${swap.target_name} has been approved. Check your new schedule.`, id]
  );

  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Approved', $2, 'shift_swap', $3)`,
    [swap.target_id, `Your shift swap with ${swap.requester_name} has been approved. Check your new schedule.`, id]
  );

  res.json({ message: 'Shift swap approved. Schedules have been updated.' });
}));

/**
 * Supervisor rejects shift swap
 */
router.post('/:id/supervisor-reject', authenticateEmployee, asyncHandler(async (req, res) => {
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

  // Get the swap request
  const swapResult = await pool.query(
    `SELECT ssr.*, req.name as requester_name, tgt.name as target_name
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     JOIN employees tgt ON ssr.target_id = tgt.id
     WHERE ssr.id = $1`,
    [id]
  );

  if (swapResult.rows.length === 0) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

  const swap = swapResult.rows[0];

  // Verify status is pending_supervisor
  if (swap.status !== 'pending_supervisor') {
    return res.status(400).json({ error: 'This swap request is not pending supervisor approval' });
  }

  // Verify approver can reject for this outlet
  const canApprove = await canApproveForOutlet(approver, swap.outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot reject swaps for this outlet' });
  }

  // Update swap request status
  await pool.query(
    `UPDATE shift_swap_requests
     SET status = 'rejected',
         supervisor_id = $1,
         supervisor_approved = FALSE,
         supervisor_approved_at = NOW(),
         rejection_reason = $2
     WHERE id = $3`,
    [req.employee.id, reason, id]
  );

  // Notify both employees
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Rejected', $2, 'shift_swap', $3)`,
    [swap.requester_id, `Your shift swap with ${swap.target_name} has been rejected. Reason: ${reason}`, id]
  );

  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Rejected', $2, 'shift_swap', $3)`,
    [swap.target_id, `Your shift swap with ${swap.requester_name} has been rejected. Reason: ${reason}`, id]
  );

  res.json({ message: 'Shift swap rejected.' });
}));

/**
 * Get count of pending swap approvals for supervisor/manager
 */
router.get('/pending-approvals-count', authenticateEmployee, asyncHandler(async (req, res) => {
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
     FROM shift_swap_requests
     WHERE outlet_id = ANY($1)
       AND status = 'pending_supervisor'`,
    [outletIds]
  );

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
