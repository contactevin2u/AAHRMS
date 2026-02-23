const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter, isAdmin } = require('../middleware/tenant');

// Helper to format time for display
const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 5); // HH:MM
};

// Helper: sync has_schedule on clock_in_records when a schedule is created/updated
const syncClockInHasSchedule = async (employeeId, scheduleDate, scheduleId) => {
  try {
    await pool.query(
      `UPDATE clock_in_records
       SET has_schedule = true, schedule_id = $1
       WHERE employee_id = $2 AND work_date = $3 AND (has_schedule = false OR has_schedule IS NULL)`,
      [scheduleId, employeeId, scheduleDate]
    );
  } catch (err) {
    console.error('Error syncing has_schedule:', err.message);
  }
};

// Helper to check schedule edit permissions based on position role
// Returns { allowed: boolean, reason: string }
const checkScheduleEditPermission = async (adminId, scheduleDate) => {
  try {
    // Get admin user info with position role
    const adminResult = await pool.query(`
      SELECT au.role as admin_role, au.outlet_id, e.position_id, p.role as position_role
      FROM admin_users au
      LEFT JOIN employees e ON au.employee_id = e.id
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE au.id = $1
    `, [adminId]);

    if (adminResult.rows.length === 0) {
      return { allowed: false, reason: 'User not found' };
    }

    const user = adminResult.rows[0];
    const adminRole = user.admin_role;
    const positionRole = user.position_role;

    // Super admin, boss, admin, director have full access
    if (['super_admin', 'boss', 'admin', 'director'].includes(adminRole)) {
      return { allowed: true };
    }

    // Manager position has full access
    if (positionRole === 'manager') {
      return { allowed: true };
    }

    // Supervisor position - restricted access
    if (positionRole === 'supervisor') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const scheduleDateObj = new Date(scheduleDate);
      scheduleDateObj.setHours(0, 0, 0, 0);

      // Calculate T+2 (2 days from today)
      const tPlus2 = new Date(today);
      tPlus2.setDate(tPlus2.getDate() + 2);

      // Cannot edit past schedules
      if (scheduleDateObj < today) {
        return { allowed: false, reason: 'Supervisors cannot edit past schedules' };
      }

      // Cannot edit T+0, T+1, T+2 (today, tomorrow, day after tomorrow)
      if (scheduleDateObj <= tPlus2) {
        return { allowed: false, reason: 'Supervisors can only edit schedules 3 or more days in advance' };
      }

      return { allowed: true };
    }

    // Crew or unknown position - no edit access
    return { allowed: false, reason: 'You do not have permission to edit schedules' };
  } catch (error) {
    console.error('Error checking schedule permission:', error);
    return { allowed: false, reason: 'Permission check failed' };
  }
};

// Get all schedules with filters
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { outlet_id, employee_id, start_date, end_date, status } = req.query;

    let query = `
      SELECT s.*,
        e.name as employee_name,
        e.employee_id as employee_code,
        o.name as outlet_name,
        au.name as created_by_name
      FROM schedules s
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN outlets o ON s.outlet_id = o.id
      LEFT JOIN admin_users au ON s.created_by = au.id
      WHERE 1=1
    `;
    let params = [];
    let paramIndex = 1;

    if (companyId !== null) {
      query += ` AND s.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }

    if (outlet_id) {
      query += ` AND s.outlet_id = $${paramIndex}`;
      params.push(outlet_id);
      paramIndex++;
    }

    if (employee_id) {
      query += ` AND s.employee_id = $${paramIndex}`;
      params.push(employee_id);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND s.schedule_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND s.schedule_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY s.schedule_date ASC, e.employee_id ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Get calendar view data for a month
router.get('/calendar', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { year, month, outlet_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    // Get first and last day of month
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    let query = `
      SELECT s.*,
        e.name as employee_name,
        e.employee_id as employee_code,
        o.name as outlet_name,
        cr.clock_in_1 IS NOT NULL as has_clock_in
      FROM schedules s
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN outlets o ON s.outlet_id = o.id
      LEFT JOIN clock_in_records cr ON s.employee_id = cr.employee_id
        AND s.schedule_date = cr.work_date
      WHERE s.schedule_date BETWEEN $1 AND $2
    `;
    let params = [startDate, endDate];
    let paramIndex = 3;

    if (companyId !== null) {
      query += ` AND s.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }

    if (outlet_id) {
      query += ` AND s.outlet_id = $${paramIndex}`;
      params.push(outlet_id);
      paramIndex++;
    }

    query += ' ORDER BY s.schedule_date ASC, e.employee_id ASC';

    const result = await pool.query(query, params);

    // Group by date for calendar display
    const calendar = {};
    result.rows.forEach(schedule => {
      const dateKey = schedule.schedule_date.toISOString().split('T')[0];
      if (!calendar[dateKey]) {
        calendar[dateKey] = [];
      }
      calendar[dateKey].push({
        ...schedule,
        shift_start: formatTime(schedule.shift_start),
        shift_end: formatTime(schedule.shift_end)
      });
    });

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      schedules: calendar
    });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar data',
      details: error.message,
      code: error.code
    });
  }
});

// Get schedules for a specific employee for a month
router.get('/employees/:employeeId/month/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId, year, month } = req.params;
    const companyId = getCompanyFilter(req);

    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    let query = `
      SELECT s.*,
        o.name as outlet_name,
        cr.clock_in_1, cr.clock_out_1, cr.clock_in_2, cr.clock_out_2
      FROM schedules s
      LEFT JOIN outlets o ON s.outlet_id = o.id
      LEFT JOIN clock_in_records cr ON s.employee_id = cr.employee_id
        AND s.schedule_date = cr.work_date
      WHERE s.employee_id = $1 AND s.schedule_date BETWEEN $2 AND $3
    `;
    let params = [employeeId, startDate, endDate];

    if (companyId !== null) {
      query += ' AND s.company_id = $4';
      params.push(companyId);
    }

    query += ' ORDER BY s.schedule_date ASC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(s => ({
      ...s,
      shift_start: formatTime(s.shift_start),
      shift_end: formatTime(s.shift_end)
    })));
  } catch (error) {
    console.error('Error fetching employee schedule:', error);
    res.status(500).json({ error: 'Failed to fetch employee schedule' });
  }
});

// Create single schedule
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, schedule_date, shift_start, shift_end, break_duration, outlet_id } = req.body;
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    console.log('Creating schedule:', { employee_id, schedule_date, shift_start, shift_end, companyId, adminId });

    if (!employee_id || !schedule_date || !shift_start || !shift_end) {
      return res.status(400).json({
        error: 'Employee, date, shift start and end times are required'
      });
    }

    // Check if schedule date is in the past (admin can bypass this restriction)
    const scheduleDate = new Date(schedule_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scheduleDate < today && !isAdmin(req)) {
      return res.status(400).json({
        error: 'Cannot create schedules for past dates'
      });
    }

    // Check if employee is resigned - cannot schedule resigned employees
    const empCheck = await pool.query(
      'SELECT status, resign_date FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empCheck.rows.length > 0) {
      const emp = empCheck.rows[0];
      if (emp.status === 'resigned') {
        return res.status(400).json({
          error: 'Cannot create schedules for resigned employees'
        });
      }
      // Also check if schedule_date is after employee's resign_date (for pending resignations)
      if (emp.resign_date) {
        const resignDate = new Date(emp.resign_date);
        if (scheduleDate > resignDate) {
          return res.status(400).json({
            error: `Cannot create schedules after employee's last working day (${emp.resign_date.toISOString().split('T')[0]})`
          });
        }
      }
    }

    // Check if schedule already exists for this date
    const existing = await pool.query(
      'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [employee_id, schedule_date]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'Schedule already exists for this employee on this date'
      });
    }

    // Get employee's outlet if not specified
    let effectiveOutletId = outlet_id;
    if (!effectiveOutletId) {
      const emp = await pool.query('SELECT outlet_id FROM employees WHERE id = $1', [employee_id]);
      effectiveOutletId = emp.rows[0]?.outlet_id;
    }

    const result = await pool.query(
      `INSERT INTO schedules
        (employee_id, company_id, outlet_id, schedule_date, shift_start, shift_end, break_duration, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [employee_id, companyId, effectiveOutletId, schedule_date, shift_start, shift_end, break_duration || 60, adminId]
    );

    // Sync has_schedule on clock_in_records
    await syncClockInHasSchedule(employee_id, schedule_date, result.rows[0].id);

    // Log audit (optional - don't fail if audit table doesn't exist)
    try {
      await pool.query(
        `INSERT INTO schedule_audit_logs (schedule_id, employee_id, action, new_value, performed_by)
         VALUES ($1, $2, 'created', $3, $4)`,
        [result.rows[0].id, employee_id, JSON.stringify(result.rows[0]), adminId]
      );
    } catch (auditError) {
      console.warn('Audit log failed (non-critical):', auditError.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating schedule:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Schedule already exists for this date' });
    }
    // Return detailed error in development
    res.status(500).json({
      error: 'Failed to create schedule',
      details: error.message,
      code: error.code
    });
  }
});

// Bulk create schedules (weekly pattern)
router.post('/bulk', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, outlet_id, start_date, end_date, shift_start, shift_end, break_duration, days_of_week } = req.body;
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    if (!employee_id || !start_date || !end_date || !shift_start || !shift_end || !days_of_week) {
      return res.status(400).json({
        error: 'Employee, date range, shift times, and days of week are required'
      });
    }

    // Check if start_date is in the past (admin can bypass this restriction)
    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDateObj < today && !isAdmin(req)) {
      return res.status(400).json({
        error: 'Cannot create schedules for past dates. Start date must be today or later.'
      });
    }

    // Check if employee is resigned - cannot schedule resigned employees
    const empCheck = await pool.query(
      'SELECT status, resign_date, outlet_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const empData = empCheck.rows[0];
    if (empData.status === 'resigned') {
      return res.status(400).json({
        error: 'Cannot create schedules for resigned employees'
      });
    }

    // Check if any dates fall after employee's resign_date (for pending resignations)
    if (empData.resign_date) {
      const resignDate = new Date(empData.resign_date);
      if (endDateObj > resignDate) {
        return res.status(400).json({
          error: `Cannot create schedules after employee's last working day (${empData.resign_date.toISOString().split('T')[0]}). Please adjust the end date.`
        });
      }
    }

    // Get employee's outlet if not specified
    let effectiveOutletId = outlet_id;
    if (!effectiveOutletId) {
      effectiveOutletId = empData.outlet_id;
    }

    // Generate all dates in range that match days_of_week
    const dates = [];
    const current = new Date(start_date);
    const end = new Date(end_date);

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sunday, 1 = Monday, etc.
      if (days_of_week.includes(dayOfWeek)) {
        dates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) {
      return res.status(400).json({ error: 'No matching dates found in the specified range' });
    }

    // Check for existing schedules
    const existingResult = await pool.query(
      `SELECT schedule_date FROM schedules
       WHERE employee_id = $1 AND schedule_date = ANY($2)`,
      [employee_id, dates]
    );
    const existingDates = new Set(existingResult.rows.map(r => r.schedule_date.toISOString().split('T')[0]));
    const newDates = dates.filter(d => !existingDates.has(d));

    if (newDates.length === 0) {
      return res.status(400).json({
        error: 'All dates in this range already have schedules',
        existing_count: dates.length
      });
    }

    // Insert all schedules
    const values = newDates.map((_, i) =>
      `($1, $2, $3, $${i + 7}, $4, $5, $6, $1)`
    ).join(', ');

    const params = [
      companyId,
      effectiveOutletId,
      employee_id,
      shift_start,
      shift_end,
      break_duration || 60,
      ...newDates
    ];

    const insertQuery = `
      INSERT INTO schedules
        (company_id, outlet_id, employee_id, schedule_date, shift_start, shift_end, break_duration, created_by)
      VALUES ${newDates.map((_, i) =>
        `($1, $2, $3, $${i + 7}, $4, $5, $6, ${adminId})`
      ).join(', ')}
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      companyId, effectiveOutletId, employee_id, shift_start, shift_end, break_duration || 60, ...newDates
    ]);

    res.status(201).json({
      message: `Created ${result.rows.length} schedules`,
      created: result.rows.length,
      skipped: existingDates.size,
      schedules: result.rows
    });
  } catch (error) {
    console.error('Error bulk creating schedules:', error);
    res.status(500).json({ error: 'Failed to create schedules' });
  }
});

// Update schedule
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_start, shift_end, break_duration, status } = req.body;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    // Get existing schedule
    let checkQuery = 'SELECT * FROM schedules WHERE id = $1';
    let checkParams = [id];
    if (companyId !== null) {
      checkQuery += ' AND company_id = $2';
      checkParams.push(companyId);
    }

    const existing = await pool.query(checkQuery, checkParams);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const oldValue = existing.rows[0];

    // Check if schedule date is in the past (admin can bypass this restriction)
    if (new Date(oldValue.schedule_date) < new Date().setHours(0, 0, 0, 0) && !isAdmin(req)) {
      return res.status(400).json({ error: 'Cannot edit past schedules' });
    }

    const result = await pool.query(
      `UPDATE schedules
       SET shift_start = COALESCE($1, shift_start),
           shift_end = COALESCE($2, shift_end),
           break_duration = COALESCE($3, break_duration),
           status = COALESCE($4, status),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [shift_start, shift_end, break_duration, status, id]
    );

    // Log audit
    await pool.query(
      `INSERT INTO schedule_audit_logs (schedule_id, employee_id, action, old_value, new_value, performed_by)
       VALUES ($1, $2, 'updated', $3, $4, $5)`,
      [id, oldValue.employee_id, JSON.stringify(oldValue), JSON.stringify(result.rows[0]), adminId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    console.log('Deleting schedule:', { id, companyId, adminId });

    // Get existing schedule - first without company filter to see if it exists at all
    const allCheck = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    console.log('Schedule lookup result:', allCheck.rows.length ? allCheck.rows[0] : 'not found');

    // Get existing schedule with company filter
    let checkQuery = 'SELECT * FROM schedules WHERE id = $1';
    let checkParams = [id];
    if (companyId !== null) {
      checkQuery += ' AND company_id = $2';
      checkParams.push(companyId);
    }

    const existing = await pool.query(checkQuery, checkParams);
    if (existing.rows.length === 0) {
      // Return more details about why not found
      if (allCheck.rows.length > 0) {
        return res.status(404).json({
          error: 'Schedule not found',
          details: `Schedule exists (company_id: ${allCheck.rows[0].company_id}) but your company filter is: ${companyId}`
        });
      }
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const schedule = existing.rows[0];

    // Check if schedule date is in the past (admin can bypass this restriction)
    if (new Date(schedule.schedule_date) < new Date().setHours(0, 0, 0, 0) && !isAdmin(req)) {
      return res.status(400).json({ error: 'Cannot delete past schedules' });
    }

    // Check if attendance record is linked to this schedule (admin restriction)
    const attendanceCheck = await pool.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [schedule.employee_id, schedule.schedule_date]
    );

    if (attendanceCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete schedule with linked attendance records',
        message: 'This schedule has attendance records. Delete or clear the attendance first.'
      });
    }

    await pool.query('DELETE FROM schedules WHERE id = $1', [id]);

    // Log audit (optional)
    try {
      await pool.query(
        `INSERT INTO schedule_audit_logs (schedule_id, employee_id, action, old_value, reason, performed_by)
         VALUES ($1, $2, 'deleted', $3, 'Manual deletion', $4)`,
        [id, schedule.employee_id, JSON.stringify(schedule), adminId]
      );
    } catch (auditErr) {
      console.warn('Audit log failed:', auditErr.message);
    }

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// =====================================================
// SHIFT TEMPLATES (for Indoor Sales / Outlet scheduling)
// =====================================================

// Get shift templates
router.get('/templates', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = 'SELECT * FROM shift_templates WHERE is_active = true';
    let params = [];

    if (companyId !== null) {
      query += ' AND company_id = $1';
      params.push(companyId);
    }

    query += ' ORDER BY is_off ASC, start_time ASC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(t => ({
      ...t,
      start_time: formatTime(t.start_time),
      end_time: formatTime(t.end_time)
    })));
  } catch (error) {
    console.error('Error fetching shift templates:', error);
    res.status(500).json({ error: 'Failed to fetch shift templates' });
  }
});

// Create shift template
router.post('/templates', authenticateAdmin, async (req, res) => {
  try {
    const { name, code, start_time, end_time, color, is_off } = req.body;
    const companyId = req.companyId || req.admin?.company_id;

    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const result = await pool.query(
      `INSERT INTO shift_templates (company_id, name, code, start_time, end_time, color, is_off)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [companyId, name, code, start_time, end_time, color || '#3B82F6', is_off || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating shift template:', error);
    res.status(500).json({ error: 'Failed to create shift template' });
  }
});

// Update shift template
router.put('/templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, start_time, end_time, color, is_off, is_active } = req.body;
    const companyId = getCompanyFilter(req);

    let checkQuery = 'SELECT * FROM shift_templates WHERE id = $1';
    let checkParams = [id];
    if (companyId !== null) {
      checkQuery += ' AND company_id = $2';
      checkParams.push(companyId);
    }

    const existing = await pool.query(checkQuery, checkParams);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Shift template not found' });
    }

    const result = await pool.query(
      `UPDATE shift_templates
       SET name = COALESCE($1, name),
           code = COALESCE($2, code),
           start_time = COALESCE($3, start_time),
           end_time = COALESCE($4, end_time),
           color = COALESCE($5, color),
           is_off = COALESCE($6, is_off),
           is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING *`,
      [name, code, start_time, end_time, color, is_off, is_active, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating shift template:', error);
    res.status(500).json({ error: 'Failed to update shift template' });
  }
});

// Delete shift template (soft delete)
router.delete('/templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = 'UPDATE shift_templates SET is_active = false WHERE id = $1';
    let params = [id];
    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    await pool.query(query, params);
    res.json({ message: 'Shift template deleted successfully' });
  } catch (error) {
    console.error('Error deleting shift template:', error);
    res.status(500).json({ error: 'Failed to delete shift template' });
  }
});

// =====================================================
// WEEKLY ROSTER VIEW (for Indoor Sales scheduling)
// =====================================================

// Get weekly roster for an outlet
router.get('/roster/weekly', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { outlet_id, start_date } = req.query;

    if (!outlet_id || !start_date) {
      return res.status(400).json({ error: 'Outlet ID and start_date are required' });
    }

    // Calculate end of week (7 days from start)
    const startDateObj = new Date(start_date);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(startDateObj.getDate() + 6);
    const endDate = endDateObj.toISOString().split('T')[0];

    // Get all employees for this outlet (exclude managers who operate at company level)
    let empQuery = `
      SELECT e.id, e.employee_id, e.name, e.employee_role
      FROM employees e
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE e.outlet_id = $1 AND e.status = 'active'
        AND (p.role IS NULL OR p.role NOT IN ('manager', 'admin', 'director', 'boss', 'super_admin'))
        AND (e.employee_role IS NULL OR e.employee_role NOT IN ('manager', 'director', 'admin', 'boss', 'super_admin'))
    `;
    let empParams = [outlet_id];

    if (companyId !== null) {
      empQuery += ' AND e.company_id = $2';
      empParams.push(companyId);
    }

    empQuery += ' ORDER BY e.employee_id';

    const employees = await pool.query(empQuery, empParams);

    // Get all schedules for these employees in the date range
    let schedQuery = `
      SELECT s.*, st.code as shift_code, st.color as shift_color, st.is_off
      FROM schedules s
      LEFT JOIN shift_templates st ON s.shift_template_id = st.id
      WHERE s.outlet_id = $1
        AND s.schedule_date BETWEEN $2 AND $3
    `;
    let schedParams = [outlet_id, start_date, endDate];

    if (companyId !== null) {
      schedQuery += ' AND s.company_id = $4';
      schedParams.push(companyId);
    }

    const schedules = await pool.query(schedQuery, schedParams);

    // Get shift templates for the company
    let templatesQuery = 'SELECT * FROM shift_templates WHERE is_active = true';
    let templatesParams = [];
    if (companyId !== null) {
      templatesQuery += ' AND company_id = $1';
      templatesParams.push(companyId);
    }
    const templates = await pool.query(templatesQuery, templatesParams);

    // Build schedule map by employee_id and date
    const scheduleMap = {};
    schedules.rows.forEach(s => {
      const dateKey = s.schedule_date.toISOString().split('T')[0];
      const key = `${s.employee_id}_${dateKey}`;
      scheduleMap[key] = {
        id: s.id,
        shift_template_id: s.shift_template_id,
        shift_code: s.shift_code,
        shift_color: s.shift_color,
        is_off: s.is_off,
        is_public_holiday: s.is_public_holiday,
        shift_start: formatTime(s.shift_start),
        shift_end: formatTime(s.shift_end)
      };
    });

    // Generate date headers
    const dates = [];
    const current = new Date(start_date);
    for (let i = 0; i < 7; i++) {
      dates.push({
        date: current.toISOString().split('T')[0],
        day: current.toLocaleDateString('en-MY', { weekday: 'short' }),
        dayNum: current.getDate()
      });
      current.setDate(current.getDate() + 1);
    }

    // Build roster grid
    const roster = employees.rows.map(emp => ({
      employee_id: emp.id,
      employee_code: emp.employee_id,
      name: emp.name,
      role: emp.employee_role,
      shifts: dates.map(d => {
        const key = `${emp.id}_${d.date}`;
        return {
          date: d.date,
          ...scheduleMap[key] || { id: null, shift_code: null, shift_color: null }
        };
      })
    }));

    res.json({
      outlet_id: parseInt(outlet_id),
      start_date,
      end_date: endDate,
      dates,
      templates: templates.rows.map(t => ({
        ...t,
        start_time: formatTime(t.start_time),
        end_time: formatTime(t.end_time)
      })),
      roster
    });
  } catch (error) {
    console.error('Error fetching weekly roster:', error);
    res.status(500).json({ error: 'Failed to fetch weekly roster' });
  }
});

// Assign shift to employee using template
router.post('/roster/assign', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, schedule_date, shift_template_id, outlet_id, is_public_holiday } = req.body;
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    if (!employee_id || !schedule_date || !shift_template_id) {
      return res.status(400).json({ error: 'Employee, date, and shift template are required' });
    }

    // Check if employee is resigned - cannot schedule resigned employees
    const empCheck = await pool.query(
      'SELECT status, resign_date, outlet_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const empData = empCheck.rows[0];
    if (empData.status === 'resigned') {
      return res.status(400).json({
        error: 'Cannot assign shifts to resigned employees'
      });
    }

    // Check if schedule_date is after employee's resign_date
    if (empData.resign_date) {
      const scheduleDate = new Date(schedule_date);
      const resignDate = new Date(empData.resign_date);
      if (scheduleDate > resignDate) {
        return res.status(400).json({
          error: `Cannot assign shifts after employee's last working day (${empData.resign_date.toISOString().split('T')[0]})`
        });
      }
    }

    // Check position-based edit permissions (supervisor restrictions)
    const permission = await checkScheduleEditPermission(adminId, schedule_date);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    // Get shift template details
    const template = await pool.query('SELECT * FROM shift_templates WHERE id = $1', [shift_template_id]);
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Shift template not found' });
    }

    const t = template.rows[0];

    // Get employee's outlet if not specified
    let effectiveOutletId = outlet_id;
    if (!effectiveOutletId) {
      effectiveOutletId = empData.outlet_id;
    }

    // Check for existing schedule on this date
    const existing = await pool.query(
      'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [employee_id, schedule_date]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing schedule
      result = await pool.query(
        `UPDATE schedules
         SET shift_template_id = $1,
             shift_start = $2,
             shift_end = $3,
             is_public_holiday = $4,
             status = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [shift_template_id, t.start_time, t.end_time, is_public_holiday || false,
         t.is_off ? 'off' : 'scheduled', existing.rows[0].id]
      );
    } else {
      // Create new schedule
      result = await pool.query(
        `INSERT INTO schedules
          (employee_id, company_id, outlet_id, schedule_date, shift_template_id,
           shift_start, shift_end, is_public_holiday, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [employee_id, companyId, effectiveOutletId, schedule_date, shift_template_id,
         t.start_time, t.end_time, is_public_holiday || false,
         t.is_off ? 'off' : 'scheduled', adminId]
      );
    }

    // Sync has_schedule on clock_in_records
    const schedule = result.rows[0];
    if (!t.is_off) {
      await syncClockInHasSchedule(employee_id, schedule_date, schedule.id);
    }

    res.json({
      ...schedule,
      shift_code: t.code,
      shift_color: t.color,
      is_off: t.is_off
    });
  } catch (error) {
    console.error('Error assigning shift:', error);
    res.status(500).json({ error: 'Failed to assign shift' });
  }
});

// Bulk assign shifts for a week (copy pattern)
router.post('/roster/bulk-assign', authenticateAdmin, async (req, res) => {
  try {
    const { outlet_id, assignments } = req.body;
    // assignments = [{ employee_id, schedule_date, shift_template_id, is_public_holiday }]
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    if (!outlet_id || !assignments || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'Outlet ID and assignments array are required' });
    }

    const results = { created: 0, updated: 0, errors: [], skipped: 0 };

    for (const a of assignments) {
      try {
        // Check position-based edit permissions for this date
        const permission = await checkScheduleEditPermission(adminId, a.schedule_date);
        if (!permission.allowed) {
          results.errors.push({ employee_id: a.employee_id, date: a.schedule_date, error: permission.reason });
          results.skipped++;
          continue;
        }

        // Get shift template
        const template = await pool.query('SELECT * FROM shift_templates WHERE id = $1', [a.shift_template_id]);
        if (template.rows.length === 0) {
          results.errors.push({ employee_id: a.employee_id, date: a.schedule_date, error: 'Invalid shift template' });
          continue;
        }

        const t = template.rows[0];

        // Check for existing
        const existing = await pool.query(
          'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
          [a.employee_id, a.schedule_date]
        );

        let scheduleId;
        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE schedules
             SET shift_template_id = $1, shift_start = $2, shift_end = $3,
                 is_public_holiday = $4, status = $5, updated_at = NOW()
             WHERE id = $6`,
            [a.shift_template_id, t.start_time, t.end_time,
             a.is_public_holiday || false, t.is_off ? 'off' : 'scheduled', existing.rows[0].id]
          );
          scheduleId = existing.rows[0].id;
          results.updated++;
        } else {
          const insertResult = await pool.query(
            `INSERT INTO schedules
              (employee_id, company_id, outlet_id, schedule_date, shift_template_id,
               shift_start, shift_end, is_public_holiday, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [a.employee_id, companyId, outlet_id, a.schedule_date, a.shift_template_id,
             t.start_time, t.end_time, a.is_public_holiday || false,
             t.is_off ? 'off' : 'scheduled', adminId]
          );
          scheduleId = insertResult.rows[0].id;
          results.created++;
        }

        // Sync has_schedule on clock_in_records
        if (!t.is_off) {
          await syncClockInHasSchedule(a.employee_id, a.schedule_date, scheduleId);
        }
      } catch (err) {
        results.errors.push({ employee_id: a.employee_id, date: a.schedule_date, error: err.message });
      }
    }

    res.json({
      message: `Processed ${results.created + results.updated} assignments`,
      ...results
    });
  } catch (error) {
    console.error('Error bulk assigning shifts:', error);
    res.status(500).json({ error: 'Failed to bulk assign shifts' });
  }
});

// Clear a schedule cell (remove assignment)
router.delete('/roster/clear', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, schedule_date } = req.body;
    const companyId = getCompanyFilter(req);

    if (!employee_id || !schedule_date) {
      return res.status(400).json({ error: 'Employee ID and date are required' });
    }

    let query = 'DELETE FROM schedules WHERE employee_id = $1 AND schedule_date = $2';
    let params = [employee_id, schedule_date];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    await pool.query(query, params);
    res.json({ message: 'Schedule cleared successfully' });
  } catch (error) {
    console.error('Error clearing schedule:', error);
    res.status(500).json({ error: 'Failed to clear schedule' });
  }
});

// =====================================================
// DEPARTMENT-BASED ROSTER (for Indoor Sales)
// =====================================================

// Get weekly roster for a department (Indoor Sales)
router.get('/roster/department/weekly', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { department_id, start_date } = req.query;

    if (!department_id || !start_date) {
      return res.status(400).json({ error: 'Department ID and start_date are required' });
    }

    // Calculate end of week (7 days from start)
    const startDateObj = new Date(start_date);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(startDateObj.getDate() + 6);
    const endDate = endDateObj.toISOString().split('T')[0];

    // Get all employees in this department
    let empQuery = `
      SELECT e.id, e.employee_id, e.name, e.employee_role
      FROM employees e
      WHERE e.department_id = $1 AND e.status = 'active'
    `;
    let empParams = [department_id];

    if (companyId !== null) {
      empQuery += ' AND e.company_id = $2';
      empParams.push(companyId);
    }

    empQuery += ' ORDER BY e.employee_id';

    const employees = await pool.query(empQuery, empParams);

    // Get all schedules for these employees in the date range
    let schedQuery = `
      SELECT s.*, st.code as shift_code, st.color as shift_color, st.is_off
      FROM schedules s
      LEFT JOIN shift_templates st ON s.shift_template_id = st.id
      WHERE s.department_id = $1
        AND s.schedule_date BETWEEN $2 AND $3
    `;
    let schedParams = [department_id, start_date, endDate];

    if (companyId !== null) {
      schedQuery += ' AND s.company_id = $4';
      schedParams.push(companyId);
    }

    const schedules = await pool.query(schedQuery, schedParams);

    // Get shift templates for the company
    let templatesQuery = 'SELECT * FROM shift_templates WHERE is_active = true';
    let templatesParams = [];
    if (companyId !== null) {
      templatesQuery += ' AND company_id = $1';
      templatesParams.push(companyId);
    }
    const templates = await pool.query(templatesQuery, templatesParams);

    // Build schedule map by employee_id and date
    const scheduleMap = {};
    schedules.rows.forEach(s => {
      const dateKey = s.schedule_date.toISOString().split('T')[0];
      const key = `${s.employee_id}_${dateKey}`;
      scheduleMap[key] = {
        id: s.id,
        shift_template_id: s.shift_template_id,
        shift_code: s.shift_code,
        shift_color: s.shift_color,
        is_off: s.is_off,
        is_public_holiday: s.is_public_holiday,
        shift_start: formatTime(s.shift_start),
        shift_end: formatTime(s.shift_end)
      };
    });

    // Generate date headers
    const dates = [];
    const current = new Date(start_date);
    for (let i = 0; i < 7; i++) {
      dates.push({
        date: current.toISOString().split('T')[0],
        day: current.toLocaleDateString('en-MY', { weekday: 'short' }),
        dayNum: current.getDate()
      });
      current.setDate(current.getDate() + 1);
    }

    // Build roster grid
    const roster = employees.rows.map(emp => ({
      employee_id: emp.id,
      employee_code: emp.employee_id,
      name: emp.name,
      role: emp.employee_role,
      shifts: dates.map(d => {
        const key = `${emp.id}_${d.date}`;
        return {
          date: d.date,
          ...scheduleMap[key] || { id: null, shift_code: null, shift_color: null }
        };
      })
    }));

    res.json({
      department_id: parseInt(department_id),
      start_date,
      end_date: endDate,
      dates,
      templates: templates.rows.map(t => ({
        ...t,
        start_time: formatTime(t.start_time),
        end_time: formatTime(t.end_time)
      })),
      roster
    });
  } catch (error) {
    console.error('Error fetching department weekly roster:', error);
    res.status(500).json({ error: 'Failed to fetch weekly roster' });
  }
});

// Get monthly roster for a department (Indoor Sales - Calendar View)
router.get('/roster/department/monthly', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { department_id, month } = req.query;

    if (!department_id || !month) {
      return res.status(400).json({ error: 'Department ID and month (YYYY-MM) are required' });
    }

    // Parse month and calculate date range
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // Last day of month
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get all employees in this department
    let empQuery = `
      SELECT e.id, e.employee_id, e.name, e.employee_role
      FROM employees e
      WHERE e.department_id = $1 AND e.status = 'active'
    `;
    let empParams = [department_id];

    if (companyId !== null) {
      empQuery += ' AND e.company_id = $2';
      empParams.push(companyId);
    }

    empQuery += ' ORDER BY e.employee_id';

    const employees = await pool.query(empQuery, empParams);

    // Get all schedules for these employees in the month
    let schedQuery = `
      SELECT s.*, st.code as shift_code, st.color as shift_color, st.is_off
      FROM schedules s
      LEFT JOIN shift_templates st ON s.shift_template_id = st.id
      WHERE s.department_id = $1
        AND s.schedule_date BETWEEN $2 AND $3
    `;
    let schedParams = [department_id, startDateStr, endDateStr];

    if (companyId !== null) {
      schedQuery += ' AND s.company_id = $4';
      schedParams.push(companyId);
    }

    const schedules = await pool.query(schedQuery, schedParams);

    // Get shift templates for the company
    let templatesQuery = 'SELECT * FROM shift_templates WHERE is_active = true';
    let templatesParams = [];
    if (companyId !== null) {
      templatesQuery += ' AND company_id = $1';
      templatesParams.push(companyId);
    }
    const templates = await pool.query(templatesQuery, templatesParams);

    // Build schedule map by employee_id and date
    const scheduleMap = {};
    schedules.rows.forEach(s => {
      const dateKey = s.schedule_date.toISOString().split('T')[0];
      const key = `${s.employee_id}_${dateKey}`;
      scheduleMap[key] = {
        id: s.id,
        date: dateKey,
        shift_template_id: s.shift_template_id,
        shift_code: s.shift_code,
        shift_color: s.shift_color,
        is_off: s.is_off,
        is_public_holiday: s.is_public_holiday
      };
    });

    // Build roster with all shifts for each employee
    const roster = employees.rows.map(emp => {
      const empShifts = [];
      Object.keys(scheduleMap).forEach(key => {
        if (key.startsWith(`${emp.id}_`)) {
          empShifts.push(scheduleMap[key]);
        }
      });
      return {
        employee_id: emp.id,
        employee_code: emp.employee_id,
        name: emp.name,
        role: emp.employee_role,
        shifts: empShifts
      };
    });

    res.json({
      department_id: parseInt(department_id),
      month,
      start_date: startDateStr,
      end_date: endDateStr,
      templates: templates.rows.map(t => ({
        ...t,
        start_time: formatTime(t.start_time),
        end_time: formatTime(t.end_time)
      })),
      roster
    });
  } catch (error) {
    console.error('Error fetching department monthly roster:', error);
    res.status(500).json({ error: 'Failed to fetch monthly roster' });
  }
});

// Copy schedule from one month to another for a department
router.post('/roster/department/copy-month', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, from_month, to_month } = req.body;
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    if (!department_id || !from_month || !to_month) {
      return res.status(400).json({ error: 'Department ID, from_month, and to_month are required' });
    }

    // Parse months
    const [fromYear, fromMonthNum] = from_month.split('-').map(Number);
    const [toYear, toMonthNum] = to_month.split('-').map(Number);

    const fromStartDate = new Date(fromYear, fromMonthNum - 1, 1);
    const fromEndDate = new Date(fromYear, fromMonthNum, 0);
    const toStartDate = new Date(toYear, toMonthNum - 1, 1);

    // Get schedules from source month
    let schedQuery = `
      SELECT employee_id, schedule_date, shift_template_id
      FROM schedules
      WHERE department_id = $1
        AND schedule_date BETWEEN $2 AND $3
        AND shift_template_id IS NOT NULL
    `;
    let schedParams = [department_id, fromStartDate.toISOString().split('T')[0], fromEndDate.toISOString().split('T')[0]];

    if (companyId) {
      schedQuery += ' AND company_id = $4';
      schedParams.push(companyId);
    }

    const sourceSchedules = await pool.query(schedQuery, schedParams);

    if (sourceSchedules.rows.length === 0) {
      return res.status(400).json({ error: 'No schedules found in source month to copy' });
    }

    // Calculate day offset
    const dayOffset = Math.round((toStartDate - fromStartDate) / (1000 * 60 * 60 * 24));

    // Clear existing schedules in target month
    const toEndDate = new Date(toYear, toMonthNum, 0);
    await pool.query(
      `DELETE FROM schedules WHERE department_id = $1 AND schedule_date BETWEEN $2 AND $3 AND company_id = $4`,
      [department_id, toStartDate.toISOString().split('T')[0], toEndDate.toISOString().split('T')[0], companyId]
    );

    // Copy schedules to new month
    let copiedCount = 0;
    for (const schedule of sourceSchedules.rows) {
      const sourceDate = new Date(schedule.schedule_date);
      const targetDate = new Date(sourceDate);
      targetDate.setDate(targetDate.getDate() + dayOffset);

      // Only copy if target date is within target month
      if (targetDate.getMonth() === toMonthNum - 1) {
        await pool.query(
          `INSERT INTO schedules (employee_id, schedule_date, shift_template_id, department_id, company_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (employee_id, schedule_date) DO UPDATE SET shift_template_id = $3`,
          [schedule.employee_id, targetDate.toISOString().split('T')[0], schedule.shift_template_id, department_id, companyId, adminId]
        );
        copiedCount++;
      }
    }

    res.json({ message: `Copied ${copiedCount} schedules from ${from_month} to ${to_month}` });
  } catch (error) {
    console.error('Error copying month schedule:', error);
    res.status(500).json({ error: 'Failed to copy schedule' });
  }
});

// Assign shift to employee in department
router.post('/roster/department/assign', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, schedule_date, shift_template_id, department_id, is_public_holiday } = req.body;
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    if (!employee_id || !schedule_date || !shift_template_id || !department_id) {
      return res.status(400).json({ error: 'Employee, date, shift template, and department are required' });
    }

    // Check if employee is resigned - cannot schedule resigned employees
    const empCheck = await pool.query(
      'SELECT status, resign_date FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const empData = empCheck.rows[0];
    if (empData.status === 'resigned') {
      return res.status(400).json({
        error: 'Cannot assign shifts to resigned employees'
      });
    }

    // Check if schedule_date is after employee's resign_date
    if (empData.resign_date) {
      const scheduleDateObj = new Date(schedule_date);
      const resignDate = new Date(empData.resign_date);
      if (scheduleDateObj > resignDate) {
        return res.status(400).json({
          error: `Cannot assign shifts after employee's last working day (${empData.resign_date.toISOString().split('T')[0]})`
        });
      }
    }

    // Check position-based edit permissions (supervisor restrictions)
    const permission = await checkScheduleEditPermission(adminId, schedule_date);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    // Get shift template details
    const template = await pool.query('SELECT * FROM shift_templates WHERE id = $1', [shift_template_id]);
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Shift template not found' });
    }

    const t = template.rows[0];

    // Check for existing schedule on this date
    const existing = await pool.query(
      'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [employee_id, schedule_date]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing schedule
      result = await pool.query(
        `UPDATE schedules
         SET shift_template_id = $1,
             shift_start = $2,
             shift_end = $3,
             is_public_holiday = $4,
             status = $5,
             department_id = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [shift_template_id, t.start_time, t.end_time, is_public_holiday || false,
         t.is_off ? 'off' : 'scheduled', department_id, existing.rows[0].id]
      );
    } else {
      // Create new schedule
      result = await pool.query(
        `INSERT INTO schedules
          (employee_id, company_id, department_id, schedule_date, shift_template_id,
           shift_start, shift_end, is_public_holiday, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [employee_id, companyId, department_id, schedule_date, shift_template_id,
         t.start_time, t.end_time, is_public_holiday || false,
         t.is_off ? 'off' : 'scheduled', adminId]
      );
    }

    // Sync has_schedule on clock_in_records
    const deptSchedule = result.rows[0];
    if (!t.is_off) {
      await syncClockInHasSchedule(employee_id, schedule_date, deptSchedule.id);
    }

    res.json({
      ...deptSchedule,
      shift_code: t.code,
      shift_color: t.color,
      is_off: t.is_off
    });
  } catch (error) {
    console.error('Error assigning department shift:', error);
    res.status(500).json({ error: 'Failed to assign shift' });
  }
});

// Bulk assign shifts for department
router.post('/roster/department/bulk-assign', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, assignments } = req.body;
    const companyId = req.companyId || req.admin?.company_id;
    const adminId = req.admin?.id;

    if (!department_id || !assignments || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'Department ID and assignments array are required' });
    }

    const results = { created: 0, updated: 0, errors: [] };

    for (const a of assignments) {
      try {
        const template = await pool.query('SELECT * FROM shift_templates WHERE id = $1', [a.shift_template_id]);
        if (template.rows.length === 0) {
          results.errors.push({ employee_id: a.employee_id, date: a.schedule_date, error: 'Invalid shift template' });
          continue;
        }

        const t = template.rows[0];

        const existing = await pool.query(
          'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
          [a.employee_id, a.schedule_date]
        );

        let scheduleId;
        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE schedules
             SET shift_template_id = $1, shift_start = $2, shift_end = $3,
                 is_public_holiday = $4, status = $5, department_id = $6, updated_at = NOW()
             WHERE id = $7`,
            [a.shift_template_id, t.start_time, t.end_time,
             a.is_public_holiday || false, t.is_off ? 'off' : 'scheduled', department_id, existing.rows[0].id]
          );
          scheduleId = existing.rows[0].id;
          results.updated++;
        } else {
          const insertResult = await pool.query(
            `INSERT INTO schedules
              (employee_id, company_id, department_id, schedule_date, shift_template_id,
               shift_start, shift_end, is_public_holiday, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [a.employee_id, companyId, department_id, a.schedule_date, a.shift_template_id,
             t.start_time, t.end_time, a.is_public_holiday || false,
             t.is_off ? 'off' : 'scheduled', adminId]
          );
          scheduleId = insertResult.rows[0].id;
          results.created++;
        }

        // Sync has_schedule on clock_in_records
        if (!t.is_off) {
          await syncClockInHasSchedule(a.employee_id, a.schedule_date, scheduleId);
        }
      } catch (err) {
        results.errors.push({ employee_id: a.employee_id, date: a.schedule_date, error: err.message });
      }
    }

    res.json({
      message: `Processed ${results.created + results.updated} assignments`,
      ...results
    });
  } catch (error) {
    console.error('Error bulk assigning department shifts:', error);
    res.status(500).json({ error: 'Failed to bulk assign shifts' });
  }
});

// =====================================================
// EXTRA SHIFT REQUESTS
// =====================================================

// Get all extra shift requests
router.get('/extra-shift-requests', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { status, outlet_id } = req.query;

    let query = `
      SELECT esr.*,
        e.name as employee_name,
        e.employee_id as employee_code,
        o.name as outlet_name,
        au.name as approved_by_name
      FROM extra_shift_requests esr
      LEFT JOIN employees e ON esr.employee_id = e.id
      LEFT JOIN outlets o ON esr.outlet_id = o.id
      LEFT JOIN admin_users au ON esr.approved_by = au.id
      WHERE 1=1
    `;
    let params = [];
    let paramIndex = 1;

    if (companyId !== null) {
      query += ` AND esr.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }

    if (status) {
      query += ` AND esr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (outlet_id) {
      query += ` AND esr.outlet_id = $${paramIndex}`;
      params.push(outlet_id);
      paramIndex++;
    }

    query += ' ORDER BY esr.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({
      ...r,
      shift_start: formatTime(r.shift_start),
      shift_end: formatTime(r.shift_end)
    })));
  } catch (error) {
    console.error('Error fetching extra shift requests:', error);
    res.status(500).json({ error: 'Failed to fetch extra shift requests' });
  }
});

// Approve extra shift request
router.post('/extra-shift-requests/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    // Get the request
    let checkQuery = 'SELECT * FROM extra_shift_requests WHERE id = $1';
    let checkParams = [id];
    if (companyId !== null) {
      checkQuery += ' AND company_id = $2';
      checkParams.push(companyId);
    }

    const request = await pool.query(checkQuery, checkParams);
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const req_data = request.rows[0];

    if (req_data.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Check if schedule already exists for this date
    const existingSchedule = await pool.query(
      'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [req_data.employee_id, req_data.request_date]
    );

    if (existingSchedule.rows.length > 0) {
      return res.status(400).json({
        error: 'Schedule already exists for this employee on this date'
      });
    }

    // Create the schedule
    const scheduleResult = await pool.query(
      `INSERT INTO schedules
        (employee_id, company_id, outlet_id, schedule_date, shift_start, shift_end, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req_data.employee_id, req_data.company_id, req_data.outlet_id,
       req_data.request_date, req_data.shift_start, req_data.shift_end, adminId]
    );

    // Update the request
    await pool.query(
      `UPDATE extra_shift_requests
       SET status = 'approved', approved_by = $1, approved_at = NOW(), schedule_id = $2
       WHERE id = $3`,
      [adminId, scheduleResult.rows[0].id, id]
    );

    // Log audit
    await pool.query(
      `INSERT INTO schedule_audit_logs (schedule_id, employee_id, action, reason, performed_by)
       VALUES ($1, $2, 'approved', 'Extra shift request approved', $3)`,
      [scheduleResult.rows[0].id, req_data.employee_id, adminId]
    );

    res.json({
      message: 'Extra shift request approved',
      schedule_id: scheduleResult.rows[0].id
    });
  } catch (error) {
    console.error('Error approving extra shift request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Reject extra shift request
router.post('/extra-shift-requests/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    // Get the request
    let checkQuery = 'SELECT * FROM extra_shift_requests WHERE id = $1';
    let checkParams = [id];
    if (companyId !== null) {
      checkQuery += ' AND company_id = $2';
      checkParams.push(companyId);
    }

    const request = await pool.query(checkQuery, checkParams);
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Update the request
    await pool.query(
      `UPDATE extra_shift_requests
       SET status = 'rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2
       WHERE id = $3`,
      [adminId, rejection_reason || 'Request rejected', id]
    );

    // Log audit
    await pool.query(
      `INSERT INTO schedule_audit_logs (employee_id, action, reason, performed_by)
       VALUES ($1, 'rejected', $2, $3)`,
      [request.rows[0].employee_id, rejection_reason || 'Extra shift request rejected', adminId]
    );

    res.json({ message: 'Extra shift request rejected' });
  } catch (error) {
    console.error('Error rejecting extra shift request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// Get user's schedule edit permissions
// Returns what dates can be edited based on user's position role
router.get('/permissions', authenticateAdmin, async (req, res) => {
  try {
    const adminId = req.admin?.id;

    // Get admin user info with position role
    const adminResult = await pool.query(`
      SELECT au.role as admin_role, au.outlet_id, e.position_id, p.role as position_role, p.name as position_name
      FROM admin_users au
      LEFT JOIN employees e ON au.employee_id = e.id
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE au.id = $1
    `, [adminId]);

    if (adminResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = adminResult.rows[0];
    const adminRole = user.admin_role;
    const positionRole = user.position_role;

    // Calculate restriction dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tPlus2 = new Date(today);
    tPlus2.setDate(tPlus2.getDate() + 2);

    const tPlus3 = new Date(today);
    tPlus3.setDate(tPlus3.getDate() + 3);

    let permissions = {
      admin_role: adminRole,
      position_role: positionRole,
      position_name: user.position_name,
      can_edit_all: false,
      can_edit_future_only: false,
      min_edit_date: null,
      restriction_message: null
    };

    // Super admin, boss, admin, director have full access
    if (['super_admin', 'boss', 'admin', 'director'].includes(adminRole)) {
      permissions.can_edit_all = true;
    }
    // Manager position has full access
    else if (positionRole === 'manager') {
      permissions.can_edit_all = true;
    }
    // Supervisor position - restricted access
    else if (positionRole === 'supervisor') {
      permissions.can_edit_future_only = true;
      permissions.min_edit_date = tPlus3.toISOString().split('T')[0];
      permissions.restriction_message = 'You can only edit schedules 3 or more days in advance (T+3 onwards)';
    }
    // Others - no edit access
    else {
      permissions.restriction_message = 'You do not have permission to edit schedules';
    }

    res.json(permissions);
  } catch (error) {
    console.error('Error fetching schedule permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

module.exports = router;
