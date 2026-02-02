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
  getManagedDepartments,
  getTeamEmployeeIds,
  requireSupervisorOrManager,
  requireMimixCompany,
  isMimixCompany,
  isAAAliveIndoorSalesManager
} = require('../../middleware/essPermissions');

// Check if employee can manage schedules (supervisor/manager OR designated AA Alive schedule manager)
const canManageSchedules = async (employee) => {
  if (isSupervisorOrManager(employee)) return true;
  return await isAAAliveIndoorSalesManager(employee);
};

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
  const companyId = req.employee.company_id;

  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month are required' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT id, name, date, extra_pay
     FROM public_holidays
     WHERE date BETWEEN $1 AND $2
       AND (company_id = $3 OR company_id IS NULL)
     ORDER BY date`,
    [startDate, endDate, companyId]
  );

  // Format as a map for easy lookup (include extra_pay info)
  const holidays = {};
  result.rows.forEach(h => {
    const dateKey = h.date.toISOString().split('T')[0];
    holidays[dateKey] = {
      name: h.name,
      extra_pay: h.extra_pay
    };
  });

  res.json(holidays);
}));

// Get own schedule for a month
router.get('/my-schedule', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const companyId = req.employee.company_id;
  const { year, month } = req.query;

  if (!year || !month) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return res.redirect(`/api/ess/schedules/my-schedule?year=${currentYear}&month=${currentMonth}`);
  }

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Query schedules with shift template info for consistency with admin view
  // Use DISTINCT ON to avoid duplicate rows from clock_in_records join
  // For schedules without shift_template_id, try to match template by time
  const result = await pool.query(
    `SELECT DISTINCT ON (s.id)
            s.id,
            s.employee_id,
            s.schedule_date,
            s.shift_start,
            s.shift_end,
            s.break_duration,
            s.status,
            s.shift_template_id,
            s.outlet_id,
            s.department_id,
            s.is_public_holiday,
            o.name as outlet_name,
            COALESCE(st.code, st_time.code) as shift_code,
            COALESCE(st.name, st_time.name) as shift_name,
            COALESCE(st.color, st_time.color) as shift_color,
            COALESCE(st.is_off, st_time.is_off, false) as template_is_off,
            cr.clock_in_1, cr.clock_out_1, cr.clock_in_2, cr.clock_out_2,
            cr.status as attendance_status
     FROM schedules s
     LEFT JOIN outlets o ON s.outlet_id = o.id
     LEFT JOIN shift_templates st ON s.shift_template_id = st.id
     LEFT JOIN shift_templates st_time ON st_time.company_id = s.company_id
       AND st_time.start_time = s.shift_start
       AND st_time.end_time = s.shift_end
       AND st_time.is_active = true
       AND s.shift_template_id IS NULL
     LEFT JOIN clock_in_records cr ON s.employee_id = cr.employee_id
       AND s.schedule_date = cr.work_date
     WHERE s.employee_id = $1
       AND s.company_id = $2
       AND s.schedule_date BETWEEN $3 AND $4
     ORDER BY s.id, s.schedule_date ASC`,
    [employeeId, companyId, startDate, endDate]
  );

  // Group by date for calendar display
  const calendar = {};
  const processedDates = new Set();

  result.rows.forEach(schedule => {
    const dateKey = schedule.schedule_date.toISOString().split('T')[0];
    // Avoid duplicates if there are multiple schedules for same date
    if (!processedDates.has(dateKey)) {
      processedDates.add(dateKey);
      calendar[dateKey] = {
        id: schedule.id,
        shift_start: formatTime(schedule.shift_start),
        shift_end: formatTime(schedule.shift_end),
        break_duration: schedule.break_duration,
        status: schedule.status,
        outlet_name: schedule.outlet_name,
        shift_code: schedule.shift_code,
        shift_name: schedule.shift_name,
        shift_color: schedule.shift_color,
        is_public_holiday: schedule.is_public_holiday,
        is_off: schedule.template_is_off || schedule.status === 'off',
        attended: !!schedule.clock_in_1,
        clock_in_1: schedule.clock_in_1,
        clock_out_1: schedule.clock_out_1,
        clock_in_2: schedule.clock_in_2,
        clock_out_2: schedule.clock_out_2,
        attendance_status: schedule.attendance_status
      };
    }
  });

  // Calculate summary from unique dates
  const scheduleList = Object.values(calendar);
  const totalScheduled = scheduleList.length;
  const attended = scheduleList.filter(r => r.attended).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = scheduleList.filter(r => {
    const schedDate = new Date(Object.keys(calendar).find(k => calendar[k] === r));
    return schedDate >= today && !r.attended;
  }).length;

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
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const isMimix = isMimixCompany(req.employee.company_id);

  if (isMimix) {
    // Mimix: Outlet-based management
    const managedOutlets = await getManagedOutlets(req.employee);

    if (managedOutlets.length === 0) {
      return res.json({ employees: [], outlets: [], departments: [] });
    }

    // Get employees in managed outlets (plus the manager themselves via employee_outlets)
    const empResult = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.profile_picture, e.outlet_id, o.name as outlet_name
       FROM employees e
       LEFT JOIN outlets o ON e.outlet_id = o.id
       WHERE e.outlet_id = ANY($1)
         AND e.status = 'active'
         AND e.company_id = $2
       UNION
       SELECT e.id, e.employee_id, e.name, e.profile_picture, eo.outlet_id, o.name as outlet_name
       FROM employees e
       JOIN employee_outlets eo ON eo.employee_id = e.id
       LEFT JOIN outlets o ON eo.outlet_id = o.id
       WHERE eo.outlet_id = ANY($1)
         AND e.id = $3
         AND e.status = 'active'
         AND e.company_id = $2
       ORDER BY outlet_name, name`,
      [managedOutlets, req.employee.company_id, req.employee.id]
    );

    // Get outlet info
    const outletResult = await pool.query(
      `SELECT id, name FROM outlets WHERE id = ANY($1) ORDER BY name`,
      [managedOutlets]
    );

    res.json({
      employees: empResult.rows,
      outlets: outletResult.rows,
      departments: []
    });
  } else {
    // AA Alive: Department-based management
    const managedDepartments = await getManagedDepartments(req.employee);

    if (managedDepartments.length === 0) {
      return res.json({ employees: [], outlets: [], departments: [] });
    }

    // Get employees in managed departments
    const empResult = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.profile_picture, e.department_id, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.department_id = ANY($1)
         AND e.status = 'active'
         AND e.company_id = $2
       ORDER BY d.name, e.name`,
      [managedDepartments, req.employee.company_id]
    );

    // Get department info
    const deptResult = await pool.query(
      `SELECT id, name FROM departments WHERE id = ANY($1) ORDER BY name`,
      [managedDepartments]
    );

    res.json({
      employees: empResult.rows,
      outlets: [],
      departments: deptResult.rows
    });
  }
}));

// Get shift templates for the company (supervisor/manager only)
router.get('/shift-templates', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const companyId = req.employee.company_id;

  const result = await pool.query(
    `SELECT id, name, code, start_time, end_time, color, is_off
     FROM shift_templates
     WHERE company_id = $1 AND is_active = true
     ORDER BY
       CASE WHEN is_off THEN 1 ELSE 0 END,
       start_time`,
    [companyId]
  );

  res.json(result.rows.map(t => ({
    ...t,
    start_time: formatTime(t.start_time),
    end_time: formatTime(t.end_time)
  })));
}));

// Get weekly stats for scheduling (supervisor/manager only)
router.get('/weekly-stats', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { week_start, outlet_id, department_id } = req.query;
  const isMimix = isMimixCompany(req.employee.company_id);

  if (!week_start) {
    throw new ValidationError('week_start is required (YYYY-MM-DD)');
  }

  // Calculate week end (7 days)
  const startDate = new Date(week_start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const endDateStr = endDate.toISOString().split('T')[0];

  let employeeFilter = '';
  let params = [week_start, endDateStr];

  if (isMimix) {
    const managedOutlets = await getManagedOutlets(req.employee);
    const effectiveOutlet = outlet_id ? parseInt(outlet_id) : managedOutlets[0];
    if (!managedOutlets.includes(effectiveOutlet)) {
      return res.status(403).json({ error: 'Access denied to this outlet' });
    }
    employeeFilter = 'AND e.outlet_id = $3';
    params.push(effectiveOutlet);
  } else {
    const managedDepartments = await getManagedDepartments(req.employee);
    const effectiveDept = department_id ? parseInt(department_id) : managedDepartments[0];
    if (!managedDepartments.includes(effectiveDept)) {
      return res.status(403).json({ error: 'Access denied to this department' });
    }
    employeeFilter = 'AND e.department_id = $3';
    params.push(effectiveDept);
  }

  // Get employees with their schedule counts for the week
  const statsQuery = `
    SELECT
      e.id,
      e.name,
      e.employee_id as emp_code,
      COUNT(CASE WHEN s.status = 'scheduled' THEN 1 END) as work_days,
      COUNT(CASE WHEN s.status = 'off' THEN 1 END) as off_days,
      COUNT(s.id) as total_scheduled,
      array_agg(DISTINCT s.schedule_date ORDER BY s.schedule_date) FILTER (WHERE s.status = 'scheduled') as work_dates,
      array_agg(DISTINCT s.schedule_date ORDER BY s.schedule_date) FILTER (WHERE s.status = 'off') as off_dates
    FROM employees e
    LEFT JOIN schedules s ON e.id = s.employee_id
      AND s.schedule_date BETWEEN $1 AND $2
    WHERE e.status = 'active' ${employeeFilter}
    GROUP BY e.id, e.name, e.employee_id
    ORDER BY e.name
  `;

  const statsResult = await pool.query(statsQuery, params);

  // Calculate warnings
  const stats = statsResult.rows.map(emp => {
    const workDays = parseInt(emp.work_days) || 0;
    const offDays = parseInt(emp.off_days) || 0;
    const totalScheduled = parseInt(emp.total_scheduled) || 0;

    // Check for consecutive work days without rest
    let maxConsecutiveWork = 0;
    let currentStreak = 0;
    const workDatesSet = new Set((emp.work_dates || []).map(d => d.toISOString().split('T')[0]));

    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (workDatesSet.has(dateStr)) {
        currentStreak++;
        maxConsecutiveWork = Math.max(maxConsecutiveWork, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return {
      id: emp.id,
      name: emp.name,
      emp_code: emp.emp_code,
      work_days: workDays,
      off_days: offDays,
      total_scheduled: totalScheduled,
      unscheduled_days: 7 - totalScheduled,
      max_consecutive_work: maxConsecutiveWork,
      needs_rest: workDays >= 6 && offDays === 0,
      warning: maxConsecutiveWork >= 6 ? 'No rest day this week' : null
    };
  });

  // Get shift summary for the week
  const shiftSummaryQuery = `
    SELECT
      st.code as shift_code,
      st.name as shift_name,
      st.color,
      s.schedule_date,
      COUNT(*) as count
    FROM schedules s
    JOIN shift_templates st ON s.shift_template_id = st.id
    WHERE s.schedule_date BETWEEN $1 AND $2
      AND s.status = 'scheduled'
      ${isMimix ? 'AND s.outlet_id = $3' : 'AND s.department_id = $3'}
    GROUP BY st.code, st.name, st.color, s.schedule_date
    ORDER BY s.schedule_date, st.code
  `;

  const shiftSummary = await pool.query(shiftSummaryQuery, params);

  // Organize shift summary by date
  const shiftsByDate = {};
  shiftSummary.rows.forEach(row => {
    const dateKey = row.schedule_date.toISOString().split('T')[0];
    if (!shiftsByDate[dateKey]) {
      shiftsByDate[dateKey] = {};
    }
    shiftsByDate[dateKey][row.shift_code] = {
      name: row.shift_name,
      color: row.color,
      count: parseInt(row.count)
    };
  });

  res.json({
    week_start,
    week_end: endDateStr,
    employees: stats,
    shift_summary: shiftsByDate,
    warnings: stats.filter(s => s.warning).map(s => ({ name: s.name, warning: s.warning }))
  });
}));

// Get team schedules (supervisor/manager only)
router.get('/team-schedules', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { year, month, outlet_id, department_id } = req.query;
  const isMimix = isMimixCompany(req.employee.company_id);

  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || (new Date().getMonth() + 1);
  const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

  if (isMimix) {
    // Mimix: Outlet-based
    const managedOutlets = await getManagedOutlets(req.employee);

    if (managedOutlets.length === 0) {
      return res.json({ schedules: {}, employees: [], outlets: [], departments: [] });
    }

    let outletFilter = managedOutlets;
    if (outlet_id && managedOutlets.includes(parseInt(outlet_id))) {
      outletFilter = [parseInt(outlet_id)];
    }

    const schedResult = await pool.query(
      `SELECT s.*, e.name as employee_name, e.employee_id as emp_code, o.name as outlet_name,
              COALESCE(st.code, st_time.code) as shift_code,
              COALESCE(st.color, st_time.color) as shift_color,
              COALESCE(st.is_off, st_time.is_off, false) as template_is_off
       FROM schedules s
       JOIN employees e ON s.employee_id = e.id
       LEFT JOIN outlets o ON s.outlet_id = o.id
       LEFT JOIN shift_templates st ON s.shift_template_id = st.id
       LEFT JOIN shift_templates st_time ON st_time.company_id = s.company_id
         AND st_time.start_time = s.shift_start
         AND st_time.end_time = s.shift_end
         AND st_time.is_active = true
         AND s.shift_template_id IS NULL
       WHERE s.outlet_id = ANY($1)
         AND s.schedule_date BETWEEN $2 AND $3
       ORDER BY s.schedule_date, e.name`,
      [outletFilter, startDate, endDate]
    );

    const schedules = {};
    schedResult.rows.forEach(s => {
      const dateKey = s.schedule_date.toISOString().split('T')[0];
      if (!schedules[dateKey]) schedules[dateKey] = [];
      schedules[dateKey].push({
        ...s,
        shift_start: formatTime(s.shift_start),
        shift_end: formatTime(s.shift_end),
        shift_code: s.shift_code,
        shift_color: s.shift_color
      });
    });

    const empResult = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.outlet_id, o.name as outlet_name
       FROM employees e
       LEFT JOIN outlets o ON e.outlet_id = o.id
       WHERE e.outlet_id = ANY($1) AND e.status = 'active'
       ORDER BY e.name`,
      [outletFilter]
    );

    res.json({
      year: parseInt(currentYear),
      month: parseInt(currentMonth),
      schedules,
      employees: empResult.rows,
      outlets: outletFilter,
      departments: []
    });
  } else {
    // AA Alive: Department-based
    const managedDepartments = await getManagedDepartments(req.employee);

    if (managedDepartments.length === 0) {
      return res.json({ schedules: {}, employees: [], outlets: [], departments: [] });
    }

    let deptFilter = managedDepartments;
    if (department_id && managedDepartments.includes(parseInt(department_id))) {
      deptFilter = [parseInt(department_id)];
    }

    // Get employee IDs in managed departments
    const empIdsResult = await pool.query(
      `SELECT id FROM employees WHERE department_id = ANY($1) AND status = 'active' AND company_id = $2`,
      [deptFilter, req.employee.company_id]
    );
    const empIds = empIdsResult.rows.map(r => r.id);

    let schedules = {};
    if (empIds.length > 0) {
      const schedResult = await pool.query(
        `SELECT s.*, e.name as employee_name, e.employee_id as emp_code, d.name as department_name,
                COALESCE(st.code, st_time.code) as shift_code,
                COALESCE(st.color, st_time.color) as shift_color,
                COALESCE(st.is_off, st_time.is_off, false) as template_is_off
         FROM schedules s
         JOIN employees e ON s.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN shift_templates st ON s.shift_template_id = st.id
         LEFT JOIN shift_templates st_time ON st_time.company_id = s.company_id
           AND st_time.start_time = s.shift_start
           AND st_time.end_time = s.shift_end
           AND st_time.is_active = true
           AND s.shift_template_id IS NULL
         WHERE s.employee_id = ANY($1)
           AND s.schedule_date BETWEEN $2 AND $3
         ORDER BY s.schedule_date, e.name`,
        [empIds, startDate, endDate]
      );

      schedResult.rows.forEach(s => {
        const dateKey = s.schedule_date.toISOString().split('T')[0];
        if (!schedules[dateKey]) schedules[dateKey] = [];
        schedules[dateKey].push({
          ...s,
          shift_start: formatTime(s.shift_start),
          shift_end: formatTime(s.shift_end),
          shift_code: s.shift_code,
          shift_color: s.shift_color
        });
      });
    }

    const empResult = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.department_id, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.department_id = ANY($1) AND e.status = 'active' AND e.company_id = $2
       ORDER BY e.name`,
      [deptFilter, req.employee.company_id]
    );

    res.json({
      year: parseInt(currentYear),
      month: parseInt(currentMonth),
      schedules,
      employees: empResult.rows,
      outlets: [],
      departments: deptFilter
    });
  }
}));

// Create schedule for team member (supervisor/manager only)
// Uses shift_template_id to match admin page behavior
// T+2 rule: Can only create/edit schedules 2+ days in advance
router.post('/team-schedules', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { employee_id, schedule_date, shift_template_id } = req.body;

  if (!employee_id || !schedule_date || !shift_template_id) {
    throw new ValidationError('Employee, date, and shift template are required');
  }

  // T+2 rule: Check if the date is at least 2 days in the future
  // Only directors and admins are exempt; managers and supervisors must follow T+2
  const isExemptFromT2 = req.employee.employee_role === 'director' || req.employee.employee_role === 'admin';

  if (!isExemptFromT2) {
    const scheduleDate = new Date(schedule_date);
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    twoDaysFromNow.setHours(0, 0, 0, 0);

    if (scheduleDate < twoDaysFromNow) {
      throw new ValidationError('Cannot create/edit schedules within 2 days (T+2 rule)');
    }
  }

  const isMimix = isMimixCompany(req.employee.company_id);

  // Verify target employee
  const empResult = await pool.query(
    `SELECT id, outlet_id, department_id, company_id FROM employees
     WHERE id = $1 AND status = 'active'`,
    [employee_id]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const targetEmployee = empResult.rows[0];

  // Validate permission based on company type (managers can always schedule themselves)
  const isSelf = targetEmployee.id === req.employee.id;
  if (isMimix) {
    const managedOutlets = await getManagedOutlets(req.employee);
    if (!isSelf && !managedOutlets.includes(targetEmployee.outlet_id)) {
      throw new ValidationError('You can only create schedules for employees in your outlet(s)');
    }
  } else {
    const managedDepartments = await getManagedDepartments(req.employee);
    if (!isSelf && !managedDepartments.includes(targetEmployee.department_id)) {
      throw new ValidationError('You can only create schedules for employees in your department');
    }
  }

  // Get shift template details
  const templateResult = await pool.query(
    'SELECT * FROM shift_templates WHERE id = $1 AND is_active = true',
    [shift_template_id]
  );

  if (templateResult.rows.length === 0) {
    throw new ValidationError('Shift template not found');
  }

  const template = templateResult.rows[0];

  // Check for existing schedule on same date
  const existing = await pool.query(
    `SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2`,
    [employee_id, schedule_date]
  );

  if (existing.rows.length > 0) {
    // Update existing schedule
    const result = await pool.query(
      `UPDATE schedules SET
         shift_template_id = $1,
         shift_start = $2,
         shift_end = $3,
         status = $4,
         updated_at = NOW()
       WHERE employee_id = $5 AND schedule_date = $6
       RETURNING *`,
      [shift_template_id, template.start_time, template.end_time,
       template.is_off ? 'off' : 'scheduled', employee_id, schedule_date]
    );

    return res.json({
      message: 'Schedule updated successfully',
      schedule: {
        ...result.rows[0],
        shift_start: formatTime(result.rows[0].shift_start),
        shift_end: formatTime(result.rows[0].shift_end),
        shift_code: template.code,
        shift_color: template.color
      }
    });
  }

  // Create new schedule with shift_template_id
  const result = await pool.query(
    `INSERT INTO schedules
       (employee_id, outlet_id, department_id, company_id, schedule_date,
        shift_template_id, shift_start, shift_end, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [employee_id, targetEmployee.outlet_id, targetEmployee.department_id,
     targetEmployee.company_id, schedule_date, shift_template_id,
     template.start_time, template.end_time, template.is_off ? 'off' : 'scheduled']
  );

  res.status(201).json({
    message: 'Schedule created successfully',
    schedule: {
      ...result.rows[0],
      shift_start: formatTime(result.rows[0].shift_start),
      shift_end: formatTime(result.rows[0].shift_end),
      shift_code: template.code,
      shift_color: template.color
    }
  });
}));

// Bulk create schedules (supervisor/manager only)
// Uses shift_template_id to match admin page behavior
router.post('/team-schedules/bulk', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { schedules } = req.body;
  const isMimix = isMimixCompany(req.employee.company_id);

  if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
    throw new ValidationError('Schedules array is required');
  }

  const managedOutlets = isMimix ? await getManagedOutlets(req.employee) : [];
  const managedDepartments = !isMimix ? await getManagedDepartments(req.employee) : [];
  const created = [];
  const updated = [];
  const errors = [];

  // Pre-fetch all shift templates
  const templatesResult = await pool.query(
    'SELECT * FROM shift_templates WHERE company_id = $1 AND is_active = true',
    [req.employee.company_id]
  );
  const templatesMap = {};
  templatesResult.rows.forEach(t => { templatesMap[t.id] = t; });

  // T+2 cutoff date - only directors and admins are exempt
  const isManagerOrAbove = req.employee.employee_role === 'director' || req.employee.employee_role === 'admin';
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  twoDaysFromNow.setHours(0, 0, 0, 0);

  for (const sched of schedules) {
    try {
      const { employee_id, schedule_date, shift_template_id } = sched;

      if (!employee_id || !schedule_date || !shift_template_id) {
        errors.push({ employee_id, schedule_date, error: 'Missing required fields' });
        continue;
      }

      // T+2 rule check - skip for managers and directors
      if (!isManagerOrAbove) {
        const schedDate = new Date(schedule_date);
        if (schedDate < twoDaysFromNow) {
          errors.push({ employee_id, schedule_date, error: 'Cannot schedule within 2 days (T+2 rule)' });
          continue;
        }
      }

      const template = templatesMap[shift_template_id];
      if (!template) {
        errors.push({ employee_id, schedule_date, error: 'Invalid shift template' });
        continue;
      }

      // Verify employee
      const empResult = await pool.query(
        `SELECT id, outlet_id, department_id, company_id FROM employees WHERE id = $1 AND status = 'active'`,
        [employee_id]
      );

      if (empResult.rows.length === 0) {
        errors.push({ employee_id, schedule_date, error: 'Employee not found' });
        continue;
      }

      const targetEmployee = empResult.rows[0];

      // Check permission (managers can always schedule themselves)
      const isSelf = targetEmployee.id === req.employee.id;
      if (isMimix && !isSelf && !managedOutlets.includes(targetEmployee.outlet_id)) {
        errors.push({ employee_id, schedule_date, error: 'Employee not in your outlet' });
        continue;
      }
      if (!isMimix && !isSelf && !managedDepartments.includes(targetEmployee.department_id)) {
        errors.push({ employee_id, schedule_date, error: 'Employee not in your department' });
        continue;
      }

      // Check for existing
      const existing = await pool.query(
        `SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2`,
        [employee_id, schedule_date]
      );

      if (existing.rows.length > 0) {
        // Update existing
        await pool.query(
          `UPDATE schedules SET
             shift_template_id = $1, shift_start = $2, shift_end = $3, status = $4, updated_at = NOW()
           WHERE id = $5`,
          [shift_template_id, template.start_time, template.end_time,
           template.is_off ? 'off' : 'scheduled', existing.rows[0].id]
        );
        updated.push({ id: existing.rows[0].id, employee_id, schedule_date });
      } else {
        // Create new
        const result = await pool.query(
          `INSERT INTO schedules
             (employee_id, outlet_id, department_id, company_id, schedule_date,
              shift_template_id, shift_start, shift_end, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [employee_id, targetEmployee.outlet_id, targetEmployee.department_id,
           targetEmployee.company_id, schedule_date, shift_template_id,
           template.start_time, template.end_time, template.is_off ? 'off' : 'scheduled']
        );
        created.push({ id: result.rows[0].id, employee_id, schedule_date });
      }
    } catch (err) {
      errors.push({ employee_id: sched.employee_id, schedule_date: sched.schedule_date, error: err.message });
    }
  }

  res.json({
    message: `Created ${created.length}, updated ${updated.length} schedules`,
    created,
    updated,
    errors: errors.length > 0 ? errors : undefined
  });
}));

// Update schedule (supervisor/manager only)
router.put('/team-schedules/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
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
// T+2 rule: Can only delete schedules 2+ days in advance
router.delete('/team-schedules/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!(await canManageSchedules(req.employee))) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  const { id } = req.params;
  const isMimix = isMimixCompany(req.employee.company_id);
  const managedOutlets = isMimix ? await getManagedOutlets(req.employee) : [];
  const managedDepartments = !isMimix ? await getManagedDepartments(req.employee) : [];

  // Check schedule exists with employee info
  const existing = await pool.query(
    `SELECT s.*, e.outlet_id, e.department_id, c.id as attendance_id
     FROM schedules s
     JOIN employees e ON s.employee_id = e.id
     LEFT JOIN clock_in_records c ON s.employee_id = c.employee_id AND s.schedule_date = c.work_date
     WHERE s.id = $1`,
    [id]
  );

  if (existing.rows.length === 0) {
    throw new ValidationError('Schedule not found');
  }

  const schedule = existing.rows[0];

  // T+2 rule: Check if the date is at least 2 days in the future
  // Only directors and admins are exempt; managers and supervisors must follow T+2
  const isExemptFromT2 = req.employee.employee_role === 'director' || req.employee.employee_role === 'admin';

  if (!isExemptFromT2) {
    const scheduleDate = new Date(schedule.schedule_date);
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    twoDaysFromNow.setHours(0, 0, 0, 0);

    if (scheduleDate < twoDaysFromNow) {
      throw new ValidationError('Cannot delete schedules within 2 days (T+2 rule)');
    }
  }

  // Check permission based on company type
  if (isMimix) {
    if (!managedOutlets.includes(schedule.outlet_id)) {
      throw new ValidationError('You can only delete schedules in your outlet(s)');
    }
  } else {
    if (!managedDepartments.includes(schedule.department_id)) {
      throw new ValidationError('You can only delete schedules in your department(s)');
    }
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
  if (!(await canManageSchedules(req.employee))) {
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
  if (!(await canManageSchedules(req.employee))) {
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
  if (!(await canManageSchedules(req.employee))) {
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

  // Calculate period dates (15th to 14th)
  let startYear = payout.period_year;
  let startMonth = payout.period_month - 1;
  if (startMonth === 0) {
    startMonth = 12;
    startYear = payout.period_year - 1;
  }
  const periodStart = `${startYear}-${String(startMonth).padStart(2, '0')}-15`;
  const periodEnd = `${payout.period_year}-${String(payout.period_month).padStart(2, '0')}-14`;

  res.json({
    period: `${payout.period_year}-${String(payout.period_month).padStart(2, '0')}`,
    period_label: `${periodStart} to ${periodEnd}`,
    payout_month: `${payout.period_year}-${String(payout.period_month).padStart(2, '0')}`,
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
