const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// Helper to format time for display
const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 5); // HH:MM
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

    query += ' ORDER BY s.schedule_date ASC, e.name ASC';

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
        AND s.schedule_date = cr.clock_date
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

    query += ' ORDER BY s.schedule_date ASC, e.name ASC';

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
    res.status(500).json({ error: 'Failed to fetch calendar data' });
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
        AND s.schedule_date = cr.clock_date
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

    if (!employee_id || !schedule_date || !shift_start || !shift_end) {
      return res.status(400).json({
        error: 'Employee, date, shift start and end times are required'
      });
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

    // Log audit
    await pool.query(
      `INSERT INTO schedule_audit_logs (schedule_id, employee_id, action, new_value, performed_by)
       VALUES ($1, $2, 'created', $3, $4)`,
      [result.rows[0].id, employee_id, JSON.stringify(result.rows[0]), adminId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating schedule:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Schedule already exists for this date' });
    }
    res.status(500).json({ error: 'Failed to create schedule' });
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

    // Get employee's outlet if not specified
    let effectiveOutletId = outlet_id;
    if (!effectiveOutletId) {
      const emp = await pool.query('SELECT outlet_id FROM employees WHERE id = $1', [employee_id]);
      effectiveOutletId = emp.rows[0]?.outlet_id;
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

    const schedule = existing.rows[0];

    // Check if schedule date is in the past
    if (new Date(schedule.schedule_date) < new Date().setHours(0, 0, 0, 0)) {
      return res.status(400).json({ error: 'Cannot delete past schedules' });
    }

    await pool.query('DELETE FROM schedules WHERE id = $1', [id]);

    // Log audit
    await pool.query(
      `INSERT INTO schedule_audit_logs (schedule_id, employee_id, action, old_value, reason, performed_by)
       VALUES ($1, $2, 'deleted', $3, 'Manual deletion', $4)`,
      [id, schedule.employee_id, JSON.stringify(schedule), adminId]
    );

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
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

module.exports = router;
