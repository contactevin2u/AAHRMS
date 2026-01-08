/**
 * ESS Manager Overview Routes
 * Comprehensive overview for managers - all data grouped by outlet
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { isSupervisorOrManager, getManagedOutlets, isMimixCompany } = require('../../middleware/essPermissions');

/**
 * Get complete manager overview with all outlets
 * Returns team, pending approvals, attendance all grouped by outlet
 */
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is manager
  if (req.employee.employee_role !== 'manager') {
    return res.status(403).json({ error: 'Access denied. Manager role required.' });
  }

  // Get employee's company
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const companyId = empResult.rows[0]?.company_id;

  if (!isMimixCompany(companyId)) {
    return res.status(403).json({ error: 'Manager overview is only available for outlet-based companies.' });
  }

  // Get all outlets managed by this manager
  const employee = { ...req.employee, company_id: companyId };
  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json({ outlets: [], summary: { total_staff: 0, pending_leave: 0, pending_claims: 0, clocked_in_today: 0 } });
  }

  // Get outlets info
  const outletsResult = await pool.query(
    'SELECT id, name FROM outlets WHERE id = ANY($1) ORDER BY name',
    [outletIds]
  );

  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Build comprehensive data for each outlet
  const outletsData = [];
  let totalStaff = 0;
  let totalPendingLeave = 0;
  let totalPendingClaims = 0;
  let totalClockedIn = 0;

  for (const outlet of outletsResult.rows) {
    // Get employees in this outlet
    const staffResult = await pool.query(`
      SELECT e.id, e.name, e.employee_id, e.employee_role, e.position,
             p.name as position_name
      FROM employees e
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE e.outlet_id = $1 AND e.status = 'active' AND e.id != $2
      ORDER BY
        CASE e.employee_role
          WHEN 'manager' THEN 1
          WHEN 'supervisor' THEN 2
          ELSE 3
        END,
        e.name
    `, [outlet.id, req.employee.id]);

    // Get pending leave requests for this outlet (at manager level = 2)
    const pendingLeaveResult = await pool.query(`
      SELECT lr.id, lr.start_date, lr.end_date, lr.total_days, lr.reason,
             lt.name as leave_type_name, lt.code as leave_type_code,
             e.name as employee_name, e.employee_id as emp_code
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e ON lr.employee_id = e.id
      WHERE e.outlet_id = $1
        AND lr.status = 'pending'
        AND lr.approval_level = 2
      ORDER BY lr.created_at ASC
    `, [outlet.id]);

    // Get pending claims for this outlet
    const pendingClaimsResult = await pool.query(`
      SELECT c.id, c.amount, c.description, c.claim_date, c.status,
             ct.name as claim_type_name,
             e.name as employee_name, e.employee_id as emp_code
      FROM claims c
      JOIN claim_types ct ON c.claim_type_id = ct.id
      JOIN employees e ON c.employee_id = e.id
      WHERE e.outlet_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at ASC
    `, [outlet.id]);

    // Get today's attendance for this outlet
    const attendanceResult = await pool.query(`
      SELECT cr.id, cr.clock_in_time, cr.clock_out_time, cr.status,
             e.name as employee_name, e.employee_id as emp_code
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      WHERE e.outlet_id = $1 AND cr.date = $2
      ORDER BY cr.clock_in_time DESC
    `, [outlet.id, today]);

    // Get scheduled today but not clocked in
    const scheduledResult = await pool.query(`
      SELECT s.id, e.id as employee_id, e.name as employee_name, e.employee_id as emp_code,
             s.shift_start, s.shift_end
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN clock_in_records cr ON cr.employee_id = e.id AND cr.date = $1
      WHERE e.outlet_id = $2
        AND s.schedule_date = $1
        AND s.status = 'scheduled'
        AND cr.id IS NULL
        AND e.status = 'active'
      ORDER BY s.shift_start
    `, [today, outlet.id]);

    const clockedInCount = attendanceResult.rows.filter(r => r.clock_in_time && !r.clock_out_time).length;

    outletsData.push({
      id: outlet.id,
      name: outlet.name,
      staff_count: staffResult.rows.length,
      staff: staffResult.rows,
      pending_leave: pendingLeaveResult.rows,
      pending_leave_count: pendingLeaveResult.rows.length,
      pending_claims: pendingClaimsResult.rows,
      pending_claims_count: pendingClaimsResult.rows.length,
      attendance_today: attendanceResult.rows,
      clocked_in_count: clockedInCount,
      not_clocked_in: scheduledResult.rows,
      not_clocked_in_count: scheduledResult.rows.length
    });

    totalStaff += staffResult.rows.length;
    totalPendingLeave += pendingLeaveResult.rows.length;
    totalPendingClaims += pendingClaimsResult.rows.length;
    totalClockedIn += clockedInCount;
  }

  res.json({
    outlets: outletsData,
    summary: {
      total_outlets: outletsData.length,
      total_staff: totalStaff,
      pending_leave: totalPendingLeave,
      pending_claims: totalPendingClaims,
      clocked_in_today: totalClockedIn
    }
  });
}));

/**
 * Get staff list for a specific outlet
 */
router.get('/outlet/:outletId/staff', authenticateEmployee, asyncHandler(async (req, res) => {
  const { outletId } = req.params;

  // Verify manager has access to this outlet
  const employee = { ...req.employee };
  const empResult = await pool.query('SELECT company_id FROM employees WHERE id = $1', [req.employee.id]);
  employee.company_id = empResult.rows[0]?.company_id;

  const managedOutlets = await getManagedOutlets(employee);
  if (!managedOutlets.includes(parseInt(outletId))) {
    return res.status(403).json({ error: 'Access denied to this outlet.' });
  }

  const result = await pool.query(`
    SELECT e.id, e.name, e.employee_id, e.employee_role, e.position, e.status,
           e.phone, e.email, e.ic_number,
           p.name as position_name
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    WHERE e.outlet_id = $1 AND e.status = 'active'
    ORDER BY
      CASE e.employee_role
        WHEN 'manager' THEN 1
        WHEN 'supervisor' THEN 2
        ELSE 3
      END,
      e.name
  `, [outletId]);

  res.json(result.rows);
}));

/**
 * Get attendance report for outlet
 */
router.get('/outlet/:outletId/attendance', authenticateEmployee, asyncHandler(async (req, res) => {
  const { outletId } = req.params;
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Verify access
  const employee = { ...req.employee };
  const empResult = await pool.query('SELECT company_id FROM employees WHERE id = $1', [req.employee.id]);
  employee.company_id = empResult.rows[0]?.company_id;

  const managedOutlets = await getManagedOutlets(employee);
  if (!managedOutlets.includes(parseInt(outletId))) {
    return res.status(403).json({ error: 'Access denied to this outlet.' });
  }

  // Get all staff with their attendance for the date
  const result = await pool.query(`
    SELECT e.id, e.name, e.employee_id, e.position,
           p.name as position_name,
           s.shift_start, s.shift_end, s.status as schedule_status,
           cr.clock_in_time, cr.clock_out_time, cr.status as attendance_status,
           cr.total_hours, cr.late_minutes, cr.ot_hours
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    LEFT JOIN schedules s ON s.employee_id = e.id AND s.schedule_date = $2
    LEFT JOIN clock_in_records cr ON cr.employee_id = e.id AND cr.date = $2
    WHERE e.outlet_id = $1 AND e.status = 'active'
    ORDER BY e.name
  `, [outletId, targetDate]);

  res.json({
    date: targetDate,
    attendance: result.rows
  });
}));

module.exports = router;
