/**
 * ESS Schedule Routes
 * Employee schedule viewing, extra shift requests, and team management (supervisor/manager)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const jwt = require('jsonwebtoken');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const {
  isSupervisorOrManager,
  getManagedOutlets,
  getTeamEmployeeIds,
  requireSupervisorOrManager,
  requireMimixCompany
} = require('../../middleware/essPermissions');

// Middleware to verify employee token and load full employee info
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

    // Load full employee info including role
    const empResult = await pool.query(
      `SELECT id, employee_id, name, employee_role, outlet_id, company_id, department_id
       FROM employees WHERE id = $1 AND status = 'active'`,
      [decoded.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(401).json({ error: 'Employee not found' });
    }

    req.employee = {
      ...decoded,
      ...empResult.rows[0]
    };
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

// Get today's schedule (for clock-in check)
// Clock-in is ALWAYS allowed - this endpoint just provides schedule info
router.get('/today', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  // Use Malaysia timezone (UTC+8) for date calculation
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const today = malaysiaTime.toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT s.*,
            o.name as outlet_name
     FROM schedules s
     LEFT JOIN outlets o ON s.outlet_id = o.id
     WHERE s.employee_id = $1
       AND s.schedule_date = $2
       AND s.status = 'scheduled'`,
    [employeeId, today]
  );

  if (result.rows.length === 0) {
    // No schedule - but still allow clock-in
    return res.json({
      has_schedule: false,
      can_clock_in: true,  // Always allow clock-in
      schedule: null,
      message: 'No shift scheduled for today (attendance will be recorded)'
    });
  }

  const schedule = result.rows[0];

  // Always allow clock-in regardless of time
  // The backend will track if it's within schedule or not
  res.json({
    has_schedule: true,
    can_clock_in: true,  // Always allow clock-in
    schedule: {
      ...schedule,
      shift_start: formatTime(schedule.shift_start),
      shift_end: formatTime(schedule.shift_end)
    },
    message: 'You can clock in now'
  });
}));

// Get public holidays for a month
router.get('/public-holidays', authenticateEmployee, asyncHandler(async (req, res) => {
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month are required' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT id, name, date
     FROM public_holidays
     WHERE date BETWEEN $1 AND $2
     ORDER BY date`,
    [startDate, endDate]
  );

  // Format as a map for easy lookup
  const holidays = {};
  result.rows.forEach(h => {
    const dateKey = h.date.toISOString().split('T')[0];
    holidays[dateKey] = h.name;
  });

  res.json(holidays);
}));

// Get own schedule for a month
router.get('/my-schedule', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { year, month } = req.query;

  if (!year || !month) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return res.redirect(`/api/ess/schedules/my-schedule?year=${currentYear}&month=${currentMonth}`);
  }

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT s.*,
            o.name as outlet_name,
            cr.clock_in_1, cr.clock_out_1, cr.clock_in_2, cr.clock_out_2,
            cr.status as attendance_status
     FROM schedules s
     LEFT JOIN outlets o ON s.outlet_id = o.id
     LEFT JOIN clock_in_records cr ON s.employee_id = cr.employee_id
       AND s.schedule_date = cr.work_date
     WHERE s.employee_id = $1
       AND s.schedule_date BETWEEN $2 AND $3
     ORDER BY s.schedule_date ASC`,
    [employeeId, startDate, endDate]
  );

  // Group by date for calendar display
  const calendar = {};
  result.rows.forEach(schedule => {
    const dateKey = schedule.schedule_date.toISOString().split('T')[0];
    calendar[dateKey] = {
      ...schedule,
      shift_start: formatTime(schedule.shift_start),
      shift_end: formatTime(schedule.shift_end),
      attended: !!schedule.clock_in_1
    };
  });

  // Calculate summary
  const totalScheduled = result.rows.length;
  const attended = result.rows.filter(r => r.clock_in_1).length;
  const upcoming = result.rows.filter(r =>
    new Date(r.schedule_date) >= new Date().setHours(0, 0, 0, 0) && !r.clock_in_1
  ).length;

  res.json({
    year: parseInt(year),
    month: parseInt(month),
    schedules: calendar,
    summary: {
      total_scheduled: totalScheduled,
      attended,
      upcoming,
      absent: totalScheduled - attended - upcoming
    }
  });
}));

// Get own extra shift requests
router.get('/extra-shift-requests', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { status } = req.query;

  let query = `
    SELECT esr.*,
           o.name as outlet_name,
           au.name as approved_by_name,
           s.shift_start as approved_shift_start,
           s.shift_end as approved_shift_end
    FROM extra_shift_requests esr
    LEFT JOIN outlets o ON esr.outlet_id = o.id
    LEFT JOIN admin_users au ON esr.approved_by = au.id
    LEFT JOIN schedules s ON esr.schedule_id = s.id
    WHERE esr.employee_id = $1
  `;
  let params = [employeeId];

  if (status) {
    query += ' AND esr.status = $2';
    params.push(status);
  }

  query += ' ORDER BY esr.created_at DESC';

  const result = await pool.query(query, params);

  res.json(result.rows.map(r => ({
    ...r,
    shift_start: formatTime(r.shift_start),
    shift_end: formatTime(r.shift_end)
  })));
}));

// Submit extra shift request
router.post('/extra-shift-requests', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { request_date, shift_start, shift_end, reason } = req.body;

  if (!request_date || !shift_start || !shift_end) {
    throw new ValidationError('Date, shift start and end times are required');
  }

  // Check if date is in the future
  const requestDate = new Date(request_date);
  if (requestDate < new Date().setHours(0, 0, 0, 0)) {
    throw new ValidationError('Cannot request extra shift for past dates');
  }

  // Check if schedule already exists for this date
  const existingSchedule = await pool.query(
    'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
    [employeeId, request_date]
  );

  if (existingSchedule.rows.length > 0) {
    throw new ValidationError('You already have a schedule for this date');
  }

  // Check if request already exists for this date
  const existingRequest = await pool.query(
    `SELECT id FROM extra_shift_requests
     WHERE employee_id = $1 AND request_date = $2 AND status = 'pending'`,
    [employeeId, request_date]
  );

  if (existingRequest.rows.length > 0) {
    throw new ValidationError('You already have a pending request for this date');
  }

  // Get employee info
  const empResult = await pool.query(
    'SELECT company_id, outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const { company_id, outlet_id } = empResult.rows[0];

  const result = await pool.query(
    `INSERT INTO extra_shift_requests
       (employee_id, company_id, outlet_id, request_date, shift_start, shift_end, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [employeeId, company_id, outlet_id, request_date, shift_start, shift_end, reason]
  );

  res.status(201).json({
    message: 'Extra shift request submitted successfully',
    request: {
      ...result.rows[0],
      shift_start: formatTime(result.rows[0].shift_start),
      shift_end: formatTime(result.rows[0].shift_end)
    }
  });
}));

// Cancel extra shift request
router.delete('/extra-shift-requests/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { id } = req.params;

  // Check if request exists and belongs to employee
  const existing = await pool.query(
    `SELECT * FROM extra_shift_requests
     WHERE id = $1 AND employee_id = $2`,
    [id, employeeId]
  );

  if (existing.rows.length === 0) {
    throw new ValidationError('Request not found');
  }

  if (existing.rows[0].status !== 'pending') {
    throw new ValidationError('Can only cancel pending requests');
  }

  await pool.query('DELETE FROM extra_shift_requests WHERE id = $1', [id]);

  res.json({ message: 'Request cancelled successfully' });
}));

// ============================================
// SUPERVISOR/MANAGER TEAM SCHEDULE MANAGEMENT
// ============================================

// Get team employees for scheduling (supervisor/manager only)
router.get('/team-employees', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const managedOutlets = await getManagedOutlets(req.employee);

  if (managedOutlets.length === 0) {
    return res.json({ employees: [], outlets: [] });
  }

  // Get employees in managed outlets
  const empResult = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.outlet_id, o.name as outlet_name
     FROM employees e
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.outlet_id = ANY($1)
       AND e.status = 'active'
       AND e.company_id = $2
     ORDER BY o.name, e.name`,
    [managedOutlets, req.employee.company_id]
  );

  // Get outlet info
  const outletResult = await pool.query(
    `SELECT id, name FROM outlets WHERE id = ANY($1) ORDER BY name`,
    [managedOutlets]
  );

  res.json({
    employees: empResult.rows,
    outlets: outletResult.rows
  });
}));

// Get team schedules (supervisor/manager only)
router.get('/team-schedules', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { year, month, outlet_id } = req.query;
  const managedOutlets = await getManagedOutlets(req.employee);

  if (managedOutlets.length === 0) {
    return res.json({ schedules: {}, employees: [] });
  }

  // Filter by specific outlet if provided (must be in managed outlets)
  let outletFilter = managedOutlets;
  if (outlet_id && managedOutlets.includes(parseInt(outlet_id))) {
    outletFilter = [parseInt(outlet_id)];
  }

  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || (new Date().getMonth() + 1);
  const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

  // Get schedules
  const schedResult = await pool.query(
    `SELECT s.*, e.name as employee_name, e.employee_id as emp_code, o.name as outlet_name
     FROM schedules s
     JOIN employees e ON s.employee_id = e.id
     LEFT JOIN outlets o ON s.outlet_id = o.id
     WHERE s.outlet_id = ANY($1)
       AND s.schedule_date BETWEEN $2 AND $3
     ORDER BY s.schedule_date, e.name`,
    [outletFilter, startDate, endDate]
  );

  // Group by date
  const schedules = {};
  schedResult.rows.forEach(s => {
    const dateKey = s.schedule_date.toISOString().split('T')[0];
    if (!schedules[dateKey]) {
      schedules[dateKey] = [];
    }
    schedules[dateKey].push({
      ...s,
      shift_start: formatTime(s.shift_start),
      shift_end: formatTime(s.shift_end)
    });
  });

  // Get employees in outlets
  const empResult = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.outlet_id, o.name as outlet_name
     FROM employees e
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.outlet_id = ANY($1)
       AND e.status = 'active'
     ORDER BY e.name`,
    [outletFilter]
  );

  res.json({
    year: parseInt(currentYear),
    month: parseInt(currentMonth),
    schedules,
    employees: empResult.rows,
    outlets: outletFilter
  });
}));

// Create schedule for team member (supervisor/manager only)
router.post('/team-schedules', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { employee_id, schedule_date, shift_start, shift_end, break_duration, notes } = req.body;

  if (!employee_id || !schedule_date || !shift_start || !shift_end) {
    throw new ValidationError('Employee, date, shift start and end are required');
  }

  const managedOutlets = await getManagedOutlets(req.employee);

  // Verify target employee is in managed outlet
  const empResult = await pool.query(
    `SELECT id, outlet_id, company_id FROM employees
     WHERE id = $1 AND status = 'active'`,
    [employee_id]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const targetEmployee = empResult.rows[0];

  if (!managedOutlets.includes(targetEmployee.outlet_id)) {
    throw new ValidationError('You can only create schedules for employees in your outlet(s)');
  }

  // Check for existing schedule on same date
  const existing = await pool.query(
    `SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2`,
    [employee_id, schedule_date]
  );

  if (existing.rows.length > 0) {
    throw new ValidationError('Schedule already exists for this employee on this date');
  }

  // Create schedule
  const result = await pool.query(
    `INSERT INTO schedules
       (employee_id, outlet_id, company_id, schedule_date, shift_start, shift_end, break_duration, notes, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9)
     RETURNING *`,
    [employee_id, targetEmployee.outlet_id, targetEmployee.company_id, schedule_date, shift_start, shift_end, break_duration || 60, notes, req.employee.id]
  );

  res.status(201).json({
    message: 'Schedule created successfully',
    schedule: {
      ...result.rows[0],
      shift_start: formatTime(result.rows[0].shift_start),
      shift_end: formatTime(result.rows[0].shift_end)
    }
  });
}));

// Bulk create schedules (supervisor/manager only)
router.post('/team-schedules/bulk', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { schedules } = req.body;

  if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
    throw new ValidationError('Schedules array is required');
  }

  const managedOutlets = await getManagedOutlets(req.employee);
  const created = [];
  const errors = [];

  for (const sched of schedules) {
    try {
      const { employee_id, schedule_date, shift_start, shift_end, break_duration } = sched;

      if (!employee_id || !schedule_date || !shift_start || !shift_end) {
        errors.push({ employee_id, schedule_date, error: 'Missing required fields' });
        continue;
      }

      // Verify employee is in managed outlet
      const empResult = await pool.query(
        `SELECT id, outlet_id, company_id FROM employees WHERE id = $1 AND status = 'active'`,
        [employee_id]
      );

      if (empResult.rows.length === 0) {
        errors.push({ employee_id, schedule_date, error: 'Employee not found' });
        continue;
      }

      const targetEmployee = empResult.rows[0];

      if (!managedOutlets.includes(targetEmployee.outlet_id)) {
        errors.push({ employee_id, schedule_date, error: 'Employee not in your outlet' });
        continue;
      }

      // Check for existing
      const existing = await pool.query(
        `SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2`,
        [employee_id, schedule_date]
      );

      if (existing.rows.length > 0) {
        errors.push({ employee_id, schedule_date, error: 'Schedule already exists' });
        continue;
      }

      // Create
      const result = await pool.query(
        `INSERT INTO schedules
           (employee_id, outlet_id, company_id, schedule_date, shift_start, shift_end, break_duration, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)
         RETURNING id`,
        [employee_id, targetEmployee.outlet_id, targetEmployee.company_id, schedule_date, shift_start, shift_end, break_duration || 60, req.employee.id]
      );

      created.push({ id: result.rows[0].id, employee_id, schedule_date });
    } catch (err) {
      errors.push({ employee_id: sched.employee_id, schedule_date: sched.schedule_date, error: err.message });
    }
  }

  res.json({
    message: `Created ${created.length} schedules`,
    created,
    errors: errors.length > 0 ? errors : undefined
  });
}));

// Update schedule (supervisor/manager only)
router.put('/team-schedules/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { id } = req.params;
  const { shift_start, shift_end, break_duration, notes, status } = req.body;
  const managedOutlets = await getManagedOutlets(req.employee);

  // Check schedule exists and is in managed outlet
  const existing = await pool.query(
    `SELECT s.*, e.name as employee_name
     FROM schedules s
     JOIN employees e ON s.employee_id = e.id
     WHERE s.id = $1`,
    [id]
  );

  if (existing.rows.length === 0) {
    throw new ValidationError('Schedule not found');
  }

  const schedule = existing.rows[0];

  if (!managedOutlets.includes(schedule.outlet_id)) {
    throw new ValidationError('You can only edit schedules in your outlet(s)');
  }

  // Update schedule
  const result = await pool.query(
    `UPDATE schedules
     SET shift_start = COALESCE($1, shift_start),
         shift_end = COALESCE($2, shift_end),
         break_duration = COALESCE($3, break_duration),
         notes = COALESCE($4, notes),
         status = COALESCE($5, status),
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [shift_start, shift_end, break_duration, notes, status, id]
  );

  res.json({
    message: 'Schedule updated successfully',
    schedule: {
      ...result.rows[0],
      shift_start: formatTime(result.rows[0].shift_start),
      shift_end: formatTime(result.rows[0].shift_end)
    }
  });
}));

// Delete schedule (supervisor/manager only)
router.delete('/team-schedules/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { id } = req.params;
  const managedOutlets = await getManagedOutlets(req.employee);

  // Check schedule exists and is in managed outlet
  const existing = await pool.query(
    `SELECT s.*, c.id as attendance_id
     FROM schedules s
     LEFT JOIN clock_in_records c ON s.employee_id = c.employee_id AND s.schedule_date = c.work_date
     WHERE s.id = $1`,
    [id]
  );

  if (existing.rows.length === 0) {
    throw new ValidationError('Schedule not found');
  }

  const schedule = existing.rows[0];

  if (!managedOutlets.includes(schedule.outlet_id)) {
    throw new ValidationError('You can only delete schedules in your outlet(s)');
  }

  // Check if there's attendance for this schedule
  if (schedule.attendance_id) {
    throw new ValidationError('Cannot delete schedule with attendance records. Edit the schedule instead.');
  }

  await pool.query('DELETE FROM schedules WHERE id = $1', [id]);

  res.json({ message: 'Schedule deleted successfully' });
}));

// Get pending extra shift requests for approval (supervisor/manager only)
router.get('/team-extra-shift-requests', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const managedOutlets = await getManagedOutlets(req.employee);

  if (managedOutlets.length === 0) {
    return res.json([]);
  }

  const result = await pool.query(
    `SELECT esr.*, e.name as employee_name, e.employee_id as emp_code, o.name as outlet_name
     FROM extra_shift_requests esr
     JOIN employees e ON esr.employee_id = e.id
     LEFT JOIN outlets o ON esr.outlet_id = o.id
     WHERE esr.outlet_id = ANY($1)
       AND esr.status = 'pending'
     ORDER BY esr.request_date ASC`,
    [managedOutlets]
  );

  res.json(result.rows.map(r => ({
    ...r,
    shift_start: formatTime(r.shift_start),
    shift_end: formatTime(r.shift_end)
  })));
}));

// Approve extra shift request (supervisor/manager only)
router.post('/team-extra-shift-requests/:id/approve', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { id } = req.params;
  const managedOutlets = await getManagedOutlets(req.employee);

  // Check request exists and is in managed outlet
  const existing = await pool.query(
    `SELECT esr.*, e.company_id
     FROM extra_shift_requests esr
     JOIN employees e ON esr.employee_id = e.id
     WHERE esr.id = $1`,
    [id]
  );

  if (existing.rows.length === 0) {
    throw new ValidationError('Request not found');
  }

  const request = existing.rows[0];

  if (!managedOutlets.includes(request.outlet_id)) {
    throw new ValidationError('You can only approve requests from your outlet(s)');
  }

  if (request.status !== 'pending') {
    throw new ValidationError('Request is not pending');
  }

  // Create the schedule
  const schedResult = await pool.query(
    `INSERT INTO schedules
       (employee_id, outlet_id, company_id, schedule_date, shift_start, shift_end, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
     RETURNING id`,
    [request.employee_id, request.outlet_id, request.company_id, request.request_date, request.shift_start, request.shift_end, req.employee.id]
  );

  // Update request status
  await pool.query(
    `UPDATE extra_shift_requests
     SET status = 'approved', approved_by = $1, approved_at = NOW(), schedule_id = $2
     WHERE id = $3`,
    [req.employee.id, schedResult.rows[0].id, id]
  );

  res.json({ message: 'Extra shift request approved and schedule created' });
}));

// Reject extra shift request (supervisor/manager only)
router.post('/team-extra-shift-requests/:id/reject', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { id } = req.params;
  const { reason } = req.body;
  const managedOutlets = await getManagedOutlets(req.employee);

  // Check request exists and is in managed outlet
  const existing = await pool.query(
    `SELECT * FROM extra_shift_requests WHERE id = $1`,
    [id]
  );

  if (existing.rows.length === 0) {
    throw new ValidationError('Request not found');
  }

  const request = existing.rows[0];

  if (!managedOutlets.includes(request.outlet_id)) {
    throw new ValidationError('You can only reject requests from your outlet(s)');
  }

  if (request.status !== 'pending') {
    throw new ValidationError('Request is not pending');
  }

  await pool.query(
    `UPDATE extra_shift_requests
     SET status = 'rejected', rejection_reason = $1, approved_by = $2, approved_at = NOW()
     WHERE id = $3`,
    [reason || 'Rejected by supervisor/manager', req.employee.id, id]
  );

  res.json({ message: 'Extra shift request rejected' });
}));

// ============================================
// INDOOR SALES - My Weekly Schedule
// ============================================

// Get weekly roster view for Indoor Sales employee
router.get('/my-weekly-roster', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { start_date } = req.query;

  // Default to current week's Monday
  let startDate;
  if (start_date) {
    startDate = start_date;
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff)).toISOString().split('T')[0];
  }

  // Calculate end of week
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(startDateObj);
  endDateObj.setDate(startDateObj.getDate() + 6);
  const endDate = endDateObj.toISOString().split('T')[0];

  // Get schedules for the week
  const result = await pool.query(
    `SELECT s.*,
            st.code as shift_code,
            st.color as shift_color,
            st.is_off,
            o.name as outlet_name
     FROM schedules s
     LEFT JOIN shift_templates st ON s.shift_template_id = st.id
     LEFT JOIN outlets o ON s.outlet_id = o.id
     WHERE s.employee_id = $1
       AND s.schedule_date BETWEEN $2 AND $3
     ORDER BY s.schedule_date`,
    [employeeId, startDate, endDate]
  );

  // Build schedule map by date
  const scheduleMap = {};
  result.rows.forEach(s => {
    const dateKey = s.schedule_date.toISOString().split('T')[0];
    scheduleMap[dateKey] = {
      id: s.id,
      shift_code: s.shift_code,
      shift_color: s.shift_color,
      is_off: s.is_off,
      is_public_holiday: s.is_public_holiday,
      shift_start: formatTime(s.shift_start),
      shift_end: formatTime(s.shift_end),
      outlet_name: s.outlet_name
    };
  });

  // Generate date array
  const dates = [];
  const current = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const dateStr = current.toISOString().split('T')[0];
    dates.push({
      date: dateStr,
      day: current.toLocaleDateString('en-MY', { weekday: 'short' }),
      dayNum: current.getDate(),
      schedule: scheduleMap[dateStr] || null
    });
    current.setDate(current.getDate() + 1);
  }

  // Calculate summary
  let normalShifts = 0;
  let phShifts = 0;
  dates.forEach(d => {
    if (d.schedule && !d.schedule.is_off) {
      if (d.schedule.is_public_holiday) {
        phShifts++;
      } else {
        normalShifts++;
      }
    }
  });

  res.json({
    start_date: startDate,
    end_date: endDate,
    dates,
    summary: {
      normal_shifts: normalShifts,
      ph_shifts: phShifts,
      effective_shifts: normalShifts + (phShifts * 2)
    }
  });
}));

// ============================================
// INDOOR SALES - My Commission
// ============================================

// Get my commission payouts
router.get('/my-commission', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { year } = req.query;
  const selectedYear = year || new Date().getFullYear();

  // Get all commission payouts for this employee
  const result = await pool.query(
    `SELECT cp.*,
            os.period_month,
            os.period_year,
            os.total_sales,
            os.commission_rate,
            os.commission_pool,
            os.per_shift_value,
            os.status as sales_status,
            o.name as outlet_name
     FROM commission_payouts cp
     JOIN outlet_sales os ON cp.outlet_sales_id = os.id
     LEFT JOIN outlets o ON os.outlet_id = o.id
     WHERE cp.employee_id = $1
       AND os.period_year = $2
       AND os.status = 'finalized'
     ORDER BY os.period_year DESC, os.period_month DESC`,
    [employeeId, selectedYear]
  );

  // Calculate totals
  let totalCommission = 0;
  let totalShifts = 0;
  result.rows.forEach(r => {
    totalCommission += parseFloat(r.commission_amount) || 0;
    totalShifts += parseInt(r.effective_shifts) || 0;
  });

  res.json({
    year: parseInt(selectedYear),
    payouts: result.rows.map(r => ({
      period: `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
      outlet_name: r.outlet_name,
      normal_shifts: r.normal_shifts,
      ph_shifts: r.ph_shifts,
      effective_shifts: r.effective_shifts,
      per_shift_value: parseFloat(r.per_shift_value),
      commission_amount: parseFloat(r.commission_amount),
      total_sales: parseFloat(r.total_sales),
      commission_pool: parseFloat(r.commission_pool)
    })),
    summary: {
      total_commission: totalCommission,
      total_effective_shifts: totalShifts
    }
  });
}));

// Get commission payout detail for a specific month
router.get('/my-commission/:year/:month', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { year, month } = req.params;

  // Get outlet sales and payout for this period
  const result = await pool.query(
    `SELECT cp.*,
            os.period_month,
            os.period_year,
            os.total_sales,
            os.commission_rate,
            os.commission_pool,
            os.per_shift_value,
            os.total_effective_shifts as outlet_total_shifts,
            os.status as sales_status,
            o.name as outlet_name
     FROM commission_payouts cp
     JOIN outlet_sales os ON cp.outlet_sales_id = os.id
     LEFT JOIN outlets o ON os.outlet_id = o.id
     WHERE cp.employee_id = $1
       AND os.period_year = $2
       AND os.period_month = $3
       AND os.status = 'finalized'`,
    [employeeId, year, month]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'No commission data found for this period' });
  }

  const payout = result.rows[0];

  res.json({
    period: `${payout.period_year}-${String(payout.period_month).padStart(2, '0')}`,
    outlet_name: payout.outlet_name,
    my_shifts: {
      normal: payout.normal_shifts,
      public_holiday: payout.ph_shifts,
      effective: payout.effective_shifts
    },
    outlet_summary: {
      total_sales: parseFloat(payout.total_sales),
      commission_rate: parseFloat(payout.commission_rate),
      commission_pool: parseFloat(payout.commission_pool),
      total_effective_shifts: parseFloat(payout.outlet_total_shifts),
      per_shift_value: parseFloat(payout.per_shift_value)
    },
    my_commission: parseFloat(payout.commission_amount),
    calculation: `${payout.effective_shifts} shifts x RM${parseFloat(payout.per_shift_value).toFixed(2)} = RM${parseFloat(payout.commission_amount).toFixed(2)}`
  });
}));

module.exports = router;
