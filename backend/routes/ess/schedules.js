/**
 * ESS Schedule Routes
 * Employee schedule viewing and extra shift requests
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const jwt = require('jsonwebtoken');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

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

// Get today's schedule (for clock-in check)
router.get('/today', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const today = new Date().toISOString().split('T')[0];

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
    return res.json({
      has_schedule: false,
      schedule: null,
      message: 'No shift scheduled for today'
    });
  }

  const schedule = result.rows[0];
  const now = new Date();
  const shiftStart = new Date(`${today}T${schedule.shift_start}`);
  const shiftEnd = new Date(`${today}T${schedule.shift_end}`);

  // Calculate if within clock-in window (15 minutes before shift start)
  const earlyWindow = new Date(shiftStart.getTime() - 15 * 60 * 1000);
  const canClockIn = now >= earlyWindow && now <= shiftEnd;

  res.json({
    has_schedule: true,
    can_clock_in: canClockIn,
    schedule: {
      ...schedule,
      shift_start: formatTime(schedule.shift_start),
      shift_end: formatTime(schedule.shift_end)
    },
    message: canClockIn
      ? 'You can clock in now'
      : now < earlyWindow
        ? `Your shift starts at ${formatTime(schedule.shift_start)}. You can clock in 15 minutes before.`
        : 'Your shift has ended'
  });
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

module.exports = router;
