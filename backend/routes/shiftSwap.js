/**
 * Admin Shift Swap Routes
 * Manage shift swap requests from employees
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getOutletFilter } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');

// Helper to format time for display
const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 5); // HH:MM
};

// Get pending swap requests (for admin approval)
router.get('/pending', authenticateAdmin, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const outletId = req.query.outlet_id || getOutletFilter(req);

  if (!companyId) {
    return res.status(403).json({ error: 'Company context required' });
  }

  let query = `
    SELECT ssr.*,
           req.name as requester_name,
           req.employee_id as requester_emp_code,
           tgt.name as target_name,
           tgt.employee_id as target_emp_code,
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
    WHERE req.company_id = $1
      AND ssr.status = 'pending_admin'
  `;

  const params = [companyId];

  if (outletId) {
    query += ` AND ssr.outlet_id = $2`;
    params.push(outletId);
  }

  query += ` ORDER BY ssr.created_at ASC`;

  const result = await pool.query(query, params);

  const requests = result.rows.map(r => ({
    ...r,
    requester_shift_start: formatTime(r.requester_shift_start),
    requester_shift_end: formatTime(r.requester_shift_end),
    target_shift_start: formatTime(r.target_shift_start),
    target_shift_end: formatTime(r.target_shift_end)
  }));

  res.json(requests);
}));

// Get all swap requests (for history/reports)
router.get('/', authenticateAdmin, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const outletId = req.query.outlet_id || getOutletFilter(req);
  const { status } = req.query;

  if (!companyId) {
    return res.status(403).json({ error: 'Company context required' });
  }

  let query = `
    SELECT ssr.*,
           req.name as requester_name,
           tgt.name as target_name,
           rs.schedule_date as requester_shift_date,
           rs.shift_start as requester_shift_start,
           rs.shift_end as requester_shift_end,
           ts.schedule_date as target_shift_date,
           ts.shift_start as target_shift_start,
           ts.shift_end as target_shift_end,
           o.name as outlet_name,
           adm.name as admin_name
    FROM shift_swap_requests ssr
    JOIN employees req ON ssr.requester_id = req.id
    JOIN employees tgt ON ssr.target_id = tgt.id
    JOIN schedules rs ON ssr.requester_shift_id = rs.id
    JOIN schedules ts ON ssr.target_shift_id = ts.id
    LEFT JOIN outlets o ON ssr.outlet_id = o.id
    LEFT JOIN admin_users adm ON ssr.admin_id = adm.id
    WHERE req.company_id = $1
  `;

  const params = [companyId];
  let paramCount = 1;

  if (outletId) {
    paramCount++;
    query += ` AND ssr.outlet_id = $${paramCount}`;
    params.push(outletId);
  }

  if (status) {
    paramCount++;
    query += ` AND ssr.status = $${paramCount}`;
    params.push(status);
  }

  query += ` ORDER BY ssr.created_at DESC LIMIT 100`;

  const result = await pool.query(query, params);

  const requests = result.rows.map(r => ({
    ...r,
    requester_shift_start: formatTime(r.requester_shift_start),
    requester_shift_end: formatTime(r.requester_shift_end),
    target_shift_start: formatTime(r.target_shift_start),
    target_shift_end: formatTime(r.target_shift_end)
  }));

  res.json(requests);
}));

// Get pending count (for badge)
router.get('/pending-count', authenticateAdmin, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const outletId = getOutletFilter(req);

  if (!companyId) {
    return res.status(403).json({ error: 'Company context required' });
  }

  let query = `
    SELECT COUNT(*) as count
    FROM shift_swap_requests ssr
    JOIN employees req ON ssr.requester_id = req.id
    WHERE req.company_id = $1
      AND ssr.status = 'pending_admin'
  `;

  const params = [companyId];

  if (outletId) {
    query += ` AND ssr.outlet_id = $2`;
    params.push(outletId);
  }

  const result = await pool.query(query, params);
  res.json({ count: parseInt(result.rows[0].count) });
}));

// Approve swap request
router.post('/:id/approve', authenticateAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.admin.id;
  const companyId = req.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company context required' });
  }

  // Get the swap request with validation
  const swapResult = await pool.query(
    `SELECT ssr.*, req.company_id
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     WHERE ssr.id = $1`,
    [id]
  );

  if (swapResult.rows.length === 0) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

  const swap = swapResult.rows[0];

  // Verify company access
  if (swap.company_id !== companyId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Verify status is pending_admin
  if (swap.status !== 'pending_admin') {
    return res.status(400).json({ error: 'This request is not pending admin approval' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Swap the employee_ids in the schedules
    // Schedule A (requester's shift) now belongs to target
    // Schedule B (target's shift) now belongs to requester
    await client.query(
      'UPDATE schedules SET employee_id = $1 WHERE id = $2',
      [swap.target_id, swap.requester_shift_id]
    );

    await client.query(
      'UPDATE schedules SET employee_id = $1 WHERE id = $2',
      [swap.requester_id, swap.target_shift_id]
    );

    // Update swap request status
    await client.query(
      `UPDATE shift_swap_requests
       SET status = 'approved',
           admin_response = 'approved',
           admin_id = $1,
           admin_responded_at = NOW()
       WHERE id = $2`,
      [adminId, id]
    );

    // Notify both employees
    await client.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'shift_swap', 'Shift Swap Approved', 'Your shift swap request has been approved. Your schedules have been updated.', 'shift_swap', $2)`,
      [swap.requester_id, id]
    );

    await client.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'shift_swap', 'Shift Swap Approved', 'A shift swap you agreed to has been approved. Your schedules have been updated.', 'shift_swap', $2)`,
      [swap.target_id, id]
    );

    await client.query('COMMIT');

    res.json({ message: 'Shift swap approved. Schedules have been updated.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// Reject swap request
router.post('/:id/reject', authenticateAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.admin.id;
  const companyId = req.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company context required' });
  }

  // Get the swap request with validation
  const swapResult = await pool.query(
    `SELECT ssr.*, req.company_id
     FROM shift_swap_requests ssr
     JOIN employees req ON ssr.requester_id = req.id
     WHERE ssr.id = $1`,
    [id]
  );

  if (swapResult.rows.length === 0) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

  const swap = swapResult.rows[0];

  // Verify company access
  if (swap.company_id !== companyId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Verify status is pending_admin
  if (swap.status !== 'pending_admin') {
    return res.status(400).json({ error: 'This request is not pending admin approval' });
  }

  // Update swap request status
  await pool.query(
    `UPDATE shift_swap_requests
     SET status = 'rejected',
         admin_response = 'rejected',
         admin_id = $1,
         admin_responded_at = NOW(),
         reason = COALESCE($2, reason)
     WHERE id = $3`,
    [adminId, reason, id]
  );

  // Notify both employees
  const rejectMessage = reason
    ? `Your shift swap request was rejected by admin. Reason: ${reason}`
    : 'Your shift swap request was rejected by admin.';

  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Rejected', $2, 'shift_swap', $3)`,
    [swap.requester_id, rejectMessage, id]
  );

  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'shift_swap', 'Shift Swap Rejected', $2, 'shift_swap', $3)`,
    [swap.target_id, rejectMessage, id]
  );

  res.json({ message: 'Shift swap rejected.' });
}));

module.exports = router;
