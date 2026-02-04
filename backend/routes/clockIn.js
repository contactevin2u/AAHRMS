const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter, getOutletFilter, isSupervisor, isAdmin } = require('../middleware/tenant');
const { isAAAliveCompany } = require('../middleware/essPermissions');

/**
 * Clock In/Out Routes - 4 Actions Per Day
 *
 * Structure (one record per employee per day):
 * - clock_in_1: Start work (morning check-in)
 * - clock_out_1: Break start
 * - clock_in_2: After break (return)
 * - clock_out_2: End work (check-out)
 *
 * Standard work hours: 7.5 hours (450 minutes) excluding 1 hour break
 * Total shift = 8.5 hours (7.5 work + 1 hour break)
 * OT = Working hours - 7.5 hours
 */

const STANDARD_WORK_MINUTES_MIMIX = 510; // 8.5 hours (including break)
const STANDARD_WORK_MINUTES_AA_ALIVE = 540; // 9 hours (break included)

/**
 * Calculate total work time and OT
 * @param {Object} record - Clock record with all 4 time slots
 * @returns {Object} - { totalMinutes, breakMinutes, workMinutes, otMinutes }
 */
function calculateWorkTime(record, companyId) {
  const isAAAlive = isAAAliveCompany(companyId);
  const standardMinutes = isAAAlive ? STANDARD_WORK_MINUTES_AA_ALIVE : STANDARD_WORK_MINUTES_MIMIX;
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;

  let totalMinutes = 0;
  let breakMinutes = 0;

  // Parse times (format: HH:MM:SS or HH:MM)
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.toString().split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  };

  let t1_in = parseTime(clock_in_1);
  const t1_out = parseTime(clock_out_1);
  const t2_in = parseTime(clock_in_2);
  const t2_out = parseTime(clock_out_2);

  // For Mimix: don't count time before shift_start
  // If employee clocks in early, use shift_start as effective start time
  if (!isAAAlive && record.shift_start && t1_in !== null) {
    const shiftStart = parseTime(record.shift_start);
    if (shiftStart !== null && t1_in < shiftStart) {
      t1_in = shiftStart;
    }
  }

  // Handle overnight: if out time < in time, add 24h (1440 min)
  const diff = (start, end) => end >= start ? end - start : end + 1440 - start;

  if (isAAAlive) {
    // AA Alive: sum work sessions only (break excluded from count)
    if (t1_in !== null && t1_out !== null) {
      totalMinutes += diff(t1_in, t1_out);
    }
    if (t1_out !== null && t2_in !== null) {
      breakMinutes = diff(t1_out, t2_in);
    }
    if (t2_in !== null && t2_out !== null) {
      totalMinutes += diff(t2_in, t2_out);
    }
    if (t1_in !== null && t2_out !== null && t1_out === null && t2_in === null) {
      totalMinutes = diff(t1_in, t2_out);
    }

    const otMinutes = Math.max(0, totalMinutes - standardMinutes);
    return {
      totalMinutes,
      breakMinutes,
      workMinutes: totalMinutes,
      otMinutes,
      totalHours: Math.round(totalMinutes / 60 * 100) / 100,
      otHours: Math.round(otMinutes / 60 * 100) / 100
    };
  }

  // Mimix: calculate gross time (clock_in_1 to last clock_out)
  // Standard = 8.5 hours INCLUDING break
  // Break <= 1hr: don't deduct. Break > 1hr: deduct excess only.
  const lastOut = t2_out !== null ? t2_out : t1_out;

  if (t1_in !== null && lastOut !== null) {
    totalMinutes = diff(t1_in, lastOut);
  }

  // Calculate break time
  if (t1_out !== null && t2_in !== null) {
    breakMinutes = diff(t1_out, t2_in);
  }

  // Only deduct break time exceeding 1 hour
  let workMinutes = totalMinutes;
  if (breakMinutes > 60) {
    workMinutes = totalMinutes - (breakMinutes - 60);
  }

  // OT must be at least 1 hour, otherwise no OT
  // Round down to 0.5h increments (1.0, 1.5, 2.0, 2.5, ...)
  const rawOtMinutes = Math.max(0, workMinutes - standardMinutes);
  const rawOtHours = rawOtMinutes / 60;
  const otHours = rawOtMinutes >= 60 ? Math.floor(rawOtHours * 2) / 2 : 0;
  const otMinutes = otHours * 60;

  return {
    totalMinutes: workMinutes,
    breakMinutes,
    workMinutes,
    otMinutes,
    totalHours: Math.round(workMinutes / 60 * 100) / 100,
    otHours
  };
}

// =====================================================
// ADMIN ROUTES
// =====================================================

// Get all attendance records (filtered by company/outlet)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, outlet_id, month, year, status, start_date, end_date, region } = req.query;
    const companyId = getCompanyFilter(req);
    const supervisorOutletId = getOutletFilter(req);

    let query = `
      SELECT cr.*,
             COALESCE(cr.total_work_hours, ROUND(cr.total_work_minutes / 60.0, 1)) as total_hours,
             COALESCE(cr.ot_hours, ROUND(cr.ot_minutes / 60.0, 1)) as ot_hours,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.region as employee_region,
             d.name as department_name,
             o.name as outlet_name,
             approver.name as approved_by_name
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON cr.outlet_id = o.id
      LEFT JOIN admin_users approver ON cr.approved_by = approver.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (companyId !== null) {
      paramCount++;
      query += ` AND cr.company_id = $${paramCount}`;
      params.push(companyId);
    }

    // Supervisor can ONLY see their outlet's records
    if (supervisorOutletId !== null) {
      paramCount++;
      query += ` AND cr.outlet_id = $${paramCount}`;
      params.push(supervisorOutletId);
    } else if (outlet_id) {
      // Allow admins to filter by specific outlet
      paramCount++;
      query += ` AND cr.outlet_id = $${paramCount}`;
      params.push(outlet_id);
    }

    if (employee_id) {
      paramCount++;
      query += ` AND cr.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (month && year) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM cr.work_date) = $${paramCount}`;
      params.push(month);
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM cr.work_date) = $${paramCount}`;
      params.push(year);
    }

    if (status) {
      paramCount++;
      query += ` AND cr.status = $${paramCount}`;
      params.push(status);
    }

    if (start_date) {
      paramCount++;
      query += ` AND cr.work_date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND cr.work_date <= $${paramCount}`;
      params.push(end_date);
    }

    if (region) {
      paramCount++;
      query += ` AND e.region = $${paramCount}`;
      params.push(region);
    }

    query += ' ORDER BY cr.work_date DESC, e.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// Get single day attendance for an employee
router.get('/employee/:employeeId/date/:date', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId, date } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT cr.*, e.name as employee_name, e.employee_id as emp_code
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      WHERE cr.employee_id = $1 AND cr.work_date = $2
    `;
    const params = [employeeId, date];

    if (companyId !== null) {
      query += ` AND cr.company_id = $3`;
      params.push(companyId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.json({
        employee_id: employeeId,
        work_date: date,
        clock_in_1: null,
        clock_out_1: null,
        clock_in_2: null,
        clock_out_2: null,
        status: 'no_record'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance record' });
  }
});

// Get monthly summary for an employee
router.get('/employee/:employeeId/monthly/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId, year, month } = req.params;
    const companyId = getCompanyFilter(req);

    // Verify employee
    let empQuery = 'SELECT id, name, employee_id, default_basic_salary FROM employees WHERE id = $1';
    let empParams = [employeeId];

    if (companyId !== null) {
      empQuery += ' AND company_id = $2';
      empParams.push(companyId);
    }

    const employee = await pool.query(empQuery, empParams);
    if (employee.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get all records for the month
    const records = await pool.query(`
      SELECT * FROM clock_in_records
      WHERE employee_id = $1
        AND EXTRACT(MONTH FROM work_date) = $2
        AND EXTRACT(YEAR FROM work_date) = $3
      ORDER BY work_date
    `, [employeeId, month, year]);

    // Calculate summary
    const summary = {
      total_days: records.rows.length,
      approved_days: 0,
      pending_days: 0,
      rejected_days: 0,
      total_work_hours: 0,
      total_ot_hours: 0,
      total_break_hours: 0
    };

    records.rows.forEach(r => {
      if (r.status === 'approved') {
        summary.approved_days++;
        summary.total_work_hours += parseFloat(r.total_hours || 0);
        summary.total_ot_hours += parseFloat(r.ot_hours || 0);
      } else if (r.status === 'pending') {
        summary.pending_days++;
      } else if (r.status === 'rejected') {
        summary.rejected_days++;
      }
      summary.total_break_hours += parseFloat(r.total_break_minutes || 0) / 60;
    });

    // Round values
    summary.total_work_hours = Math.round(summary.total_work_hours * 100) / 100;
    summary.total_ot_hours = Math.round(summary.total_ot_hours * 100) / 100;
    summary.total_break_hours = Math.round(summary.total_break_hours * 100) / 100;

    res.json({
      employee: employee.rows[0],
      month: parseInt(month),
      year: parseInt(year),
      summary,
      records: records.rows
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ error: 'Failed to fetch monthly summary' });
  }
});

// Create or update attendance record (admin)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      employee_id,
      work_date,
      clock_in_1,
      clock_out_1,
      clock_in_2,
      clock_out_2,
      outlet_id,
      notes
    } = req.body;

    const companyId = req.companyId || req.admin?.company_id || 1;

    if (!employee_id || !work_date) {
      return res.status(400).json({ error: 'Employee ID and work date are required' });
    }

    // Check if record exists for this employee/date
    const existing = await pool.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee_id, work_date]
    );

    let result;

    if (existing.rows.length > 0) {
      // Update existing record
      result = await pool.query(`
        UPDATE clock_in_records SET
          clock_in_1 = COALESCE($1, clock_in_1),
          clock_out_1 = COALESCE($2, clock_out_1),
          clock_in_2 = COALESCE($3, clock_in_2),
          clock_out_2 = COALESCE($4, clock_out_2),
          outlet_id = COALESCE($5, outlet_id),
          notes = COALESCE($6, notes),
          updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `, [clock_in_1, clock_out_1, clock_in_2, clock_out_2, outlet_id, notes, existing.rows[0].id]);
    } else {
      // Create new record
      result = await pool.query(`
        INSERT INTO clock_in_records
        (employee_id, company_id, outlet_id, work_date, clock_in_1, clock_out_1, clock_in_2, clock_out_2, notes, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING *
      `, [employee_id, companyId, outlet_id, work_date, clock_in_1, clock_out_1, clock_in_2, clock_out_2, notes]);
    }

    const record = result.rows[0];

    // Calculate and update work time
    const calc = calculateWorkTime(record, record.company_id);
    await pool.query(`
      UPDATE clock_in_records SET
        total_work_minutes = $1,
        total_break_minutes = $2,
        ot_minutes = $3,
        total_hours = $4,
        ot_hours = $5
      WHERE id = $6
    `, [calc.workMinutes, calc.breakMinutes, calc.otMinutes, calc.totalHours, calc.otHours, record.id]);

    // Return updated record
    const updated = await pool.query('SELECT * FROM clock_in_records WHERE id = $1', [record.id]);
    res.status(existing.rows.length > 0 ? 200 : 201).json(updated.rows[0]);
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: 'Failed to save attendance record' });
  }
});

// Update specific clock action (admin)
router.put('/:id/action/:action', authenticateAdmin, async (req, res) => {
  try {
    const { id, action } = req.params;
    const { time, location, photo } = req.body;
    const companyId = getCompanyFilter(req);

    const validActions = ['clock_in_1', 'clock_out_1', 'clock_in_2', 'clock_out_2'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use: clock_in_1, clock_out_1, clock_in_2, clock_out_2' });
    }

    const locationField = action.replace('clock', 'location');
    const photoField = action.replace('clock', 'photo');

    let query = `
      UPDATE clock_in_records SET
        ${action} = $1,
        ${locationField} = COALESCE($2, ${locationField}),
        ${photoField} = COALESCE($3, ${photoField}),
        updated_at = NOW()
      WHERE id = $4
    `;
    let params = [time, location, photo, id];

    if (companyId !== null) {
      query += ' AND company_id = $5';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Recalculate work time
    const record = result.rows[0];
    const calc = calculateWorkTime(record, record.company_id);
    await pool.query(`
      UPDATE clock_in_records SET
        total_work_minutes = $1,
        total_break_minutes = $2,
        ot_minutes = $3,
        total_hours = $4,
        ot_hours = $5
      WHERE id = $6
    `, [calc.workMinutes, calc.breakMinutes, calc.otMinutes, calc.totalHours, calc.otHours, record.id]);

    const updated = await pool.query('SELECT * FROM clock_in_records WHERE id = $1', [record.id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error updating clock action:', error);
    res.status(500).json({ error: 'Failed to update clock action' });
  }
});

// Approve attendance record
router.post('/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    let query = `
      UPDATE clock_in_records
      SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND status = 'pending'
    `;
    let params = [adminId, id];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found or already processed' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving attendance:', error);
    res.status(500).json({ error: 'Failed to approve attendance' });
  }
});

// Reject attendance record
router.post('/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    let query = `
      UPDATE clock_in_records
      SET status = 'rejected',
          approved_by = $1,
          rejection_reason = $2,
          updated_at = NOW()
      WHERE id = $3 AND status = 'pending'
    `;
    let params = [adminId, rejection_reason, id];

    if (companyId !== null) {
      query += ' AND company_id = $4';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found or already processed' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error rejecting attendance:', error);
    res.status(500).json({ error: 'Failed to reject attendance' });
  }
});

// Bulk approve attendance records
router.post('/bulk-approve', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { record_ids } = req.body;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
      return res.status(400).json({ error: 'Record IDs array is required' });
    }

    await client.query('BEGIN');

    let query = `
      UPDATE clock_in_records
      SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = ANY($2) AND status = 'pending'
    `;
    let params = [adminId, record_ids];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await client.query(query, params);
    await client.query('COMMIT');

    res.json({
      message: `Approved ${result.rowCount} attendance records`,
      approved_count: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk approving:', error);
    res.status(500).json({ error: 'Failed to bulk approve records' });
  } finally {
    client.release();
  }
});

// Create manual attendance record (admin creates for employees who didn't clock in)
router.post('/manual', authenticateAdmin, async (req, res) => {
  try {
    const {
      employee_id,
      work_date,
      total_work_hours,
      ot_hours,
      notes
    } = req.body;

    const companyId = req.companyId || req.admin?.company_id || 1;
    const adminId = req.admin?.id;

    if (!employee_id || !work_date) {
      return res.status(400).json({ error: 'Employee ID and work date are required' });
    }

    // Verify employee exists
    const empCheck = await pool.query(
      'SELECT id, name, outlet_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empCheck.rows[0];

    // Check if record already exists
    const existing = await pool.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee_id, work_date]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Attendance record already exists for this date. Use edit instead.' });
    }

    // Calculate minutes from hours
    const totalMinutes = Math.round((parseFloat(total_work_hours) || 0) * 60);
    const otMinutes = Math.round((parseFloat(ot_hours) || 0) * 60);

    // Create manual record (no clock times, just hours)
    const result = await pool.query(`
      INSERT INTO clock_in_records
      (employee_id, company_id, outlet_id, work_date, total_work_minutes, ot_minutes,
       total_work_hours, ot_hours, notes, status, has_schedule, approved_by, approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', false, $10, NOW())
      RETURNING *
    `, [
      employee_id, companyId, employee.outlet_id, work_date,
      totalMinutes, otMinutes,
      total_work_hours || 0, ot_hours || 0,
      notes || 'Manual entry by admin',
      adminId
    ]);

    res.status(201).json({
      message: 'Manual attendance record created and approved',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating manual attendance:', error);
    res.status(500).json({ error: 'Failed to create manual attendance record' });
  }
});

// Edit attendance hours (admin can edit total_work_hours and ot_hours)
// For AA Alive: can also edit clock_in_1, clock_out_1 and recalculate
router.patch('/:id/hours', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { total_work_hours, ot_hours, notes, clock_in_1, clock_out_1 } = req.body;
    const companyId = getCompanyFilter(req);

    // Check if editing clock times (AA Alive only feature)
    const editingClockTimes = clock_in_1 !== undefined || clock_out_1 !== undefined;

    if (editingClockTimes) {
      // Verify this is AA Alive company
      const recordCheck = await pool.query('SELECT company_id FROM clock_in_records WHERE id = $1', [id]);
      if (recordCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }
      if (!isAAAliveCompany(recordCheck.rows[0].company_id)) {
        return res.status(403).json({ error: 'Clock time editing is only available for AA Alive company' });
      }

      // Update clock times and recalculate
      const updates = [];
      const values = [];
      let paramCount = 0;

      if (clock_in_1 !== undefined) {
        paramCount++;
        // Format time to HH:MM:SS
        const formattedIn = clock_in_1.length === 5 ? `${clock_in_1}:00` : clock_in_1;
        updates.push(`clock_in_1 = $${paramCount}`);
        values.push(formattedIn);
      }

      if (clock_out_1 !== undefined) {
        paramCount++;
        // Format time to HH:MM:SS
        const formattedOut = clock_out_1.length === 5 ? `${clock_out_1}:00` : clock_out_1;
        updates.push(`clock_out_1 = $${paramCount}`);
        values.push(formattedOut);
      }

      if (notes !== undefined) {
        paramCount++;
        updates.push(`notes = $${paramCount}`);
        values.push(notes);
      }

      updates.push('updated_at = NOW()');
      paramCount++;
      values.push(id);

      let query = `UPDATE clock_in_records SET ${updates.join(', ')} WHERE id = $${paramCount}`;
      if (companyId !== null) {
        paramCount++;
        query += ` AND company_id = $${paramCount}`;
        values.push(companyId);
      }
      query += ' RETURNING *';

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      // Recalculate work minutes based on new clock times
      const record = result.rows[0];
      const calc = calculateWorkTime(record, record.company_id);

      await pool.query(`
        UPDATE clock_in_records SET
          total_work_minutes = $1,
          total_break_minutes = $2,
          ot_minutes = $3,
          total_work_hours = $4,
          ot_hours = $5
        WHERE id = $6
      `, [calc.workMinutes, calc.breakMinutes, calc.otMinutes, calc.totalHours, calc.otHours, record.id]);

      // Return updated record
      const updated = await pool.query('SELECT * FROM clock_in_records WHERE id = $1', [record.id]);
      return res.json(updated.rows[0]);
    }

    // Original logic for editing hours directly
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (total_work_hours !== undefined) {
      paramCount++;
      updates.push(`total_work_hours = $${paramCount}`);
      values.push(parseFloat(total_work_hours) || 0);

      paramCount++;
      updates.push(`total_work_minutes = $${paramCount}`);
      values.push(Math.round((parseFloat(total_work_hours) || 0) * 60));
    }

    if (ot_hours !== undefined) {
      paramCount++;
      updates.push(`ot_hours = $${paramCount}`);
      values.push(parseFloat(ot_hours) || 0);

      paramCount++;
      updates.push(`ot_minutes = $${paramCount}`);
      values.push(Math.round((parseFloat(ot_hours) || 0) * 60));
    }

    if (notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = NOW()');

    paramCount++;
    values.push(id);

    let query = `UPDATE clock_in_records SET ${updates.join(', ')} WHERE id = $${paramCount}`;

    if (companyId !== null) {
      paramCount++;
      query += ` AND company_id = $${paramCount}`;
      values.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating attendance hours:', error);
    res.status(500).json({ error: 'Failed to update attendance hours' });
  }
});

// Approve attendance without schedule (for AA Alive employees)
router.post('/:id/approve-without-schedule', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { total_work_hours, ot_hours, notes } = req.body;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    // Calculate minutes
    const totalMinutes = Math.round((parseFloat(total_work_hours) || 0) * 60);
    const otMinutes = Math.round((parseFloat(ot_hours) || 0) * 60);

    let query = `
      UPDATE clock_in_records
      SET status = 'approved',
          approved_by = $1,
          approved_at = NOW(),
          has_schedule = false,
          total_work_hours = COALESCE($2, total_work_hours),
          ot_hours = COALESCE($3, ot_hours),
          total_work_minutes = COALESCE($4, total_work_minutes),
          ot_minutes = COALESCE($5, ot_minutes),
          notes = COALESCE($6, notes),
          updated_at = NOW()
      WHERE id = $7
    `;
    let params = [adminId, total_work_hours, ot_hours, totalMinutes, otMinutes, notes, id];

    if (companyId !== null) {
      query += ' AND company_id = $8';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({
      message: 'Attendance approved (without schedule)',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error approving attendance without schedule:', error);
    res.status(500).json({ error: 'Failed to approve attendance' });
  }
});

// Approve attendance and assign schedule (for Mimix - records without schedule)
router.post('/:id/approve-with-schedule', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_template_id, notes } = req.body;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    if (!shift_template_id) {
      return res.status(400).json({ error: 'Shift template is required' });
    }

    // Get the clock-in record
    let recordQuery = 'SELECT * FROM clock_in_records WHERE id = $1';
    const recordParams = [id];
    if (companyId !== null) {
      recordQuery += ' AND company_id = $2';
      recordParams.push(companyId);
    }

    const recordResult = await pool.query(recordQuery, recordParams);
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const record = recordResult.rows[0];

    // Get the shift template
    const templateResult = await pool.query(
      'SELECT * FROM shift_templates WHERE id = $1',
      [shift_template_id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift template not found' });
    }

    const template = templateResult.rows[0];

    // Create or update schedule for this employee/date
    const scheduleResult = await pool.query(
      `INSERT INTO schedules (employee_id, company_id, schedule_date, shift_template_id, shift_start, shift_end, outlet_id, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)
       ON CONFLICT (employee_id, schedule_date)
       DO UPDATE SET shift_template_id = $4, shift_start = $5, shift_end = $6, status = 'scheduled', updated_at = NOW()
       RETURNING id`,
      [record.employee_id, record.company_id, record.work_date, shift_template_id, template.start_time, template.end_time, record.outlet_id, adminId]
    );

    const scheduleId = scheduleResult.rows[0].id;

    // Calculate work hours based on template
    const parseTime = (timeStr) => {
      if (!timeStr) return null;
      const parts = timeStr.toString().split(':');
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    };

    // Recalculate work hours using actual clock times
    const t1_in = parseTime(record.clock_in_1);
    const t1_out = parseTime(record.clock_out_1);
    const t2_in = parseTime(record.clock_in_2);
    const t2_out = parseTime(record.clock_out_2);

    let totalMinutes = 0;
    // Handle overnight: if out time < in time, add 24h
    const timeDiff = (s, e) => e >= s ? e - s : e + 1440 - s;

    if (t1_in !== null && t1_out !== null) {
      totalMinutes += timeDiff(t1_in, t1_out);
    }
    if (t2_in !== null && t2_out !== null) {
      totalMinutes += timeDiff(t2_in, t2_out);
    }
    if (t1_in !== null && t2_out !== null && t1_out === null && t2_in === null) {
      totalMinutes = timeDiff(t1_in, t2_out);
    }

    // Calculate OT based on company standard hours
    const standardMins = isAAAliveCompany(record.company_id) ? STANDARD_WORK_MINUTES_AA_ALIVE : STANDARD_WORK_MINUTES_MIMIX;
    const otMinutes = Math.max(0, totalMinutes - standardMins);
    const totalHours = Math.round(totalMinutes / 60 * 100) / 100;
    const otHours = Math.round(otMinutes / 60 * 100) / 100;

    // Update the clock-in record
    const updateResult = await pool.query(
      `UPDATE clock_in_records
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           has_schedule = true,
           schedule_id = $2,
           total_work_minutes = $3,
           ot_minutes = $4,
           total_work_hours = $5,
           ot_hours = $6,
           notes = COALESCE($7, notes),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [adminId, scheduleId, totalMinutes, otMinutes, totalHours, otHours, notes, id]
    );

    res.json({
      message: 'Attendance approved with schedule assigned',
      record: updateResult.rows[0],
      schedule: {
        id: scheduleId,
        shift_code: template.code,
        shift_name: template.name
      }
    });
  } catch (error) {
    console.error('Error approving attendance with schedule:', error);
    res.status(500).json({ error: 'Failed to approve attendance' });
  }
});

// Recalculate work hours for all records in a given month (fixes overnight shift calculations)
router.post('/recalculate', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    let query = `SELECT cir.*, s.shift_start
      FROM clock_in_records cir
      LEFT JOIN schedules s ON cir.employee_id = s.employee_id AND cir.work_date = s.schedule_date
      WHERE EXTRACT(MONTH FROM cir.work_date) = $1 AND EXTRACT(YEAR FROM cir.work_date) = $2`;
    const params = [month, year];
    if (companyId !== null) {
      query += ` AND cir.company_id = $3`;
      params.push(companyId);
    }
    const records = await pool.query(query, params);
    let updated = 0;
    for (const record of records.rows) {
      const calc = calculateWorkTime(record, record.company_id);
      if (calc.totalHours !== parseFloat(record.total_work_hours || 0) || calc.otHours !== parseFloat(record.ot_hours || 0)) {
        await pool.query(`
          UPDATE clock_in_records SET
            total_work_minutes = $1, total_break_minutes = $2, ot_minutes = $3,
            total_work_hours = $4, ot_hours = $5
          WHERE id = $6
        `, [calc.workMinutes, calc.breakMinutes, calc.otMinutes, calc.totalHours, calc.otHours, record.id]);
        updated++;
      }
    }
    res.json({ message: `Recalculated ${updated} of ${records.rows.length} records`, updated, total: records.rows.length });
  } catch (error) {
    console.error('Error recalculating:', error);
    res.status(500).json({ error: 'Failed to recalculate' });
  }
});

// Delete attendance record - ENABLED for testing mode
// TODO: Disable this after real data starts - change back to 403
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = 'DELETE FROM clock_in_records WHERE id = $1';
    const params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance record deleted' });
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    res.status(500).json({ error: 'Failed to delete attendance record' });
  }
});

// =====================================================
// AUTO CLOCK-OUT MANAGEMENT ENDPOINTS
// =====================================================

const { getRecordsNeedingReview, markAsReviewed, triggerAutoClockOut: runAutoClockOutJob } = require('../jobs/autoClockOut');
const { triggerAutoClockOut } = require('../jobs/scheduler');

// Get records needing admin review (auto clock-out records)
router.get('/needs-review', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const records = await getRecordsNeedingReview(companyId);
    res.json(records);
  } catch (error) {
    console.error('Error fetching records needing review:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// Mark auto clock-out record as reviewed
router.post('/:id/mark-reviewed', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adjusted_minutes } = req.body;
    const adminId = req.admin?.id;

    await markAsReviewed(id, adminId, adjusted_minutes || null);

    res.json({ message: 'Record marked as reviewed' });
  } catch (error) {
    console.error('Error marking record as reviewed:', error);
    res.status(500).json({ error: 'Failed to mark record as reviewed' });
  }
});

// Manually trigger auto clock-out job (admin only)
router.post('/trigger-auto-clockout', authenticateAdmin, async (req, res) => {
  try {
    // Any admin role can trigger this
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Only admin users can trigger auto clock-out job' });
    }

    const result = await triggerAutoClockOut();

    if (result.success) {
      res.json({
        message: `Auto clock-out job completed. Processed ${result.processed} records.`,
        ...result
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error triggering auto clock-out:', error);
    res.status(500).json({ error: 'Failed to trigger auto clock-out job' });
  }
});

// Get auto clock-out statistics
router.get('/auto-clockout-stats', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { month, year } = req.query;

    let query = `
      SELECT
        COUNT(*) FILTER (WHERE is_auto_clock_out = TRUE) as auto_clockout_count,
        COUNT(*) FILTER (WHERE is_auto_clock_out = TRUE AND needs_admin_review = TRUE) as pending_review_count,
        COUNT(*) FILTER (WHERE is_auto_clock_out = TRUE AND needs_admin_review = FALSE) as reviewed_count
      FROM clock_in_records
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (companyId !== null) {
      paramCount++;
      query += ` AND company_id = $${paramCount}`;
      params.push(companyId);
    }

    if (month && year) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM work_date) = $${paramCount}`;
      params.push(month);
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM work_date) = $${paramCount}`;
      params.push(year);
    }

    const result = await pool.query(query, params);
    res.json(result.rows[0] || { auto_clockout_count: 0, pending_review_count: 0, reviewed_count: 0 });
  } catch (error) {
    console.error('Error fetching auto clock-out stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get attendance summary grouped by outlet > position > employee (for Mimix)
router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;
    const companyId = getCompanyFilter(req);

    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();

    let query = `
      SELECT
        o.id as outlet_id,
        o.name as outlet_name,
        p.id as position_id,
        p.name as position_name,
        e.id as employee_id,
        e.employee_id as emp_code,
        e.name as employee_name,
        COUNT(cr.id) as total_records,
        COUNT(cr.id) FILTER (WHERE cr.status = 'approved') as approved_records,
        COUNT(cr.id) FILTER (WHERE cr.status = 'pending') as pending_records,
        COUNT(cr.id) FILTER (WHERE cr.has_schedule = false OR cr.has_schedule IS NULL) as no_schedule_records,
        COALESCE(SUM(cr.total_hours) FILTER (WHERE cr.status = 'approved'), 0) as total_approved_hours,
        COALESCE(SUM(cr.ot_hours) FILTER (WHERE cr.status = 'approved'), 0) as total_approved_ot,
        COALESCE(SUM(cr.total_hours), 0) as total_all_hours,
        COALESCE(SUM(cr.ot_hours), 0) as total_all_ot,
        COALESCE(SUM(cr.ot_hours) FILTER (WHERE cr.ot_approved = true), 0) as approved_ot_hours,
        COALESCE(SUM(cr.ot_hours) FILTER (WHERE cr.ot_approved IS NULL AND cr.ot_hours > 0), 0) as pending_ot_hours
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN clock_in_records cr ON cr.employee_id = e.id
        AND EXTRACT(MONTH FROM cr.work_date) = $1
        AND EXTRACT(YEAR FROM cr.work_date) = $2
      WHERE e.status = 'active'
    `;
    let params = [m, y];

    if (companyId !== null) {
      query += ' AND e.company_id = $3';
      params.push(companyId);
    }

    query += `
      GROUP BY o.id, o.name, p.id, p.name, e.id, e.employee_id, e.name
      ORDER BY o.name NULLS LAST, p.name NULLS LAST, e.name
    `;

    const result = await pool.query(query, params);

    // Group the results by outlet > position > employee
    const grouped = {};
    let grandTotals = {
      total_records: 0,
      approved_records: 0,
      pending_records: 0,
      no_schedule_records: 0,
      total_approved_hours: 0,
      total_approved_ot: 0,
      approved_ot_hours: 0,
      pending_ot_hours: 0
    };

    result.rows.forEach(row => {
      const outletKey = row.outlet_id || 'no_outlet';
      const outletName = row.outlet_name || 'No Outlet';
      const positionKey = row.position_id || 'no_position';
      const positionName = row.position_name || 'No Position';

      if (!grouped[outletKey]) {
        grouped[outletKey] = {
          outlet_id: row.outlet_id,
          outlet_name: outletName,
          positions: {},
          totals: {
            total_records: 0,
            approved_records: 0,
            pending_records: 0,
            no_schedule_records: 0,
            total_approved_hours: 0,
            total_approved_ot: 0,
            approved_ot_hours: 0,
            pending_ot_hours: 0
          }
        };
      }

      if (!grouped[outletKey].positions[positionKey]) {
        grouped[outletKey].positions[positionKey] = {
          position_id: row.position_id,
          position_name: positionName,
          employees: [],
          totals: {
            total_records: 0,
            approved_records: 0,
            pending_records: 0,
            no_schedule_records: 0,
            total_approved_hours: 0,
            total_approved_ot: 0,
            approved_ot_hours: 0,
            pending_ot_hours: 0
          }
        };
      }

      // Add employee
      grouped[outletKey].positions[positionKey].employees.push({
        employee_id: row.employee_id,
        emp_code: row.emp_code,
        employee_name: row.employee_name,
        total_records: parseInt(row.total_records) || 0,
        approved_records: parseInt(row.approved_records) || 0,
        pending_records: parseInt(row.pending_records) || 0,
        no_schedule_records: parseInt(row.no_schedule_records) || 0,
        total_approved_hours: parseFloat(row.total_approved_hours) || 0,
        total_approved_ot: parseFloat(row.total_approved_ot) || 0,
        approved_ot_hours: parseFloat(row.approved_ot_hours) || 0,
        pending_ot_hours: parseFloat(row.pending_ot_hours) || 0
      });

      // Update position totals
      const posTotals = grouped[outletKey].positions[positionKey].totals;
      posTotals.total_records += parseInt(row.total_records) || 0;
      posTotals.approved_records += parseInt(row.approved_records) || 0;
      posTotals.pending_records += parseInt(row.pending_records) || 0;
      posTotals.no_schedule_records += parseInt(row.no_schedule_records) || 0;
      posTotals.total_approved_hours += parseFloat(row.total_approved_hours) || 0;
      posTotals.total_approved_ot += parseFloat(row.total_approved_ot) || 0;
      posTotals.approved_ot_hours += parseFloat(row.approved_ot_hours) || 0;
      posTotals.pending_ot_hours += parseFloat(row.pending_ot_hours) || 0;

      // Update outlet totals
      const outletTotals = grouped[outletKey].totals;
      outletTotals.total_records += parseInt(row.total_records) || 0;
      outletTotals.approved_records += parseInt(row.approved_records) || 0;
      outletTotals.pending_records += parseInt(row.pending_records) || 0;
      outletTotals.no_schedule_records += parseInt(row.no_schedule_records) || 0;
      outletTotals.total_approved_hours += parseFloat(row.total_approved_hours) || 0;
      outletTotals.total_approved_ot += parseFloat(row.total_approved_ot) || 0;
      outletTotals.approved_ot_hours += parseFloat(row.approved_ot_hours) || 0;
      outletTotals.pending_ot_hours += parseFloat(row.pending_ot_hours) || 0;

      // Update grand totals
      grandTotals.total_records += parseInt(row.total_records) || 0;
      grandTotals.approved_records += parseInt(row.approved_records) || 0;
      grandTotals.pending_records += parseInt(row.pending_records) || 0;
      grandTotals.no_schedule_records += parseInt(row.no_schedule_records) || 0;
      grandTotals.total_approved_hours += parseFloat(row.total_approved_hours) || 0;
      grandTotals.total_approved_ot += parseFloat(row.total_approved_ot) || 0;
      grandTotals.approved_ot_hours += parseFloat(row.approved_ot_hours) || 0;
      grandTotals.pending_ot_hours += parseFloat(row.pending_ot_hours) || 0;
    });

    res.json({
      month: parseInt(m),
      year: parseInt(y),
      outlets: Object.values(grouped),
      grand_totals: grandTotals
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
});

// Approve OT for a record
router.post('/:id/approve-ot', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    let query = `
      UPDATE clock_in_records
      SET ot_approved = true,
          ot_approved_by = $1,
          ot_approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $2 AND ot_hours > 0
    `;
    let params = [adminId, id];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found or no OT to approve' });
    }

    res.json({
      message: 'OT approved successfully',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error approving OT:', error);
    res.status(500).json({ error: 'Failed to approve OT' });
  }
});

// Bulk approve OT
router.post('/bulk-approve-ot', authenticateAdmin, async (req, res) => {
  try {
    const { record_ids } = req.body;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
      return res.status(400).json({ error: 'Record IDs array is required' });
    }

    let query = `
      UPDATE clock_in_records
      SET ot_approved = true,
          ot_approved_by = $1,
          ot_approved_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($2) AND ot_hours > 0 AND (ot_approved IS NULL OR ot_approved = false)
    `;
    let params = [adminId, record_ids];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    res.json({
      message: `Approved OT for ${result.rowCount} records`,
      approved_count: result.rowCount
    });
  } catch (error) {
    console.error('Error bulk approving OT:', error);
    res.status(500).json({ error: 'Failed to bulk approve OT' });
  }
});

// Reject OT for a record
router.post('/:id/reject-ot', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.admin?.id;
    const companyId = getCompanyFilter(req);

    let query = `
      UPDATE clock_in_records
      SET ot_approved = false,
          ot_approved_by = $1,
          ot_approved_at = NOW(),
          ot_rejection_reason = $2,
          updated_at = NOW()
      WHERE id = $3 AND ot_hours > 0
    `;
    let params = [adminId, reason || null, id];

    if (companyId !== null) {
      query += ' AND company_id = $4';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found or no OT to reject' });
    }

    res.json({
      message: 'OT rejected successfully',
      record: result.rows[0]
    });
  } catch (error) {
    console.error('Error rejecting OT:', error);
    res.status(500).json({ error: 'Failed to reject OT' });
  }
});

// Get OT summary for payroll
router.get('/ot-for-payroll/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT
        cr.employee_id,
        e.name as employee_name,
        e.employee_id as emp_code,
        e.default_basic_salary as basic_salary,
        e.ot_rate as employee_ot_rate,
        d.name as department_name,
        COUNT(*) as work_days,
        SUM(cr.total_hours) as total_work_hours,
        SUM(cr.ot_hours) as total_ot_hours,
        SUM(cr.total_break_minutes) / 60.0 as total_break_hours
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE cr.status = 'approved'
        AND EXTRACT(MONTH FROM cr.work_date) = $1
        AND EXTRACT(YEAR FROM cr.work_date) = $2
    `;
    let params = [month, year];

    if (companyId !== null) {
      query += ' AND cr.company_id = $3';
      params.push(companyId);
    }

    query += ' GROUP BY cr.employee_id, e.name, e.employee_id, e.default_basic_salary, e.ot_rate, d.name';
    query += ' ORDER BY e.name';

    const result = await pool.query(query, params);

    // Calculate OT pay for each employee
    const withOTCalc = result.rows.map(r => {
      const basicSalary = parseFloat(r.basic_salary) || 0;
      const otHours = parseFloat(r.total_ot_hours) || 0;
      const otRate = parseFloat(r.employee_ot_rate) || 1.0;

      // OT pay = (basic salary / 26 days / 8 hours) * OT hours * OT rate
      const hourlyRate = basicSalary / 26 / 8;
      const otPay = Math.round(hourlyRate * otHours * otRate * 100) / 100;

      return {
        ...r,
        hourly_rate: Math.round(hourlyRate * 100) / 100,
        ot_rate: otRate,
        ot_pay: otPay
      };
    });

    res.json(withOTCalc);
  } catch (error) {
    console.error('Error fetching OT for payroll:', error);
    res.status(500).json({ error: 'Failed to fetch OT data' });
  }
});

// =====================================================
// EMPLOYEE CLOCK-IN (Using Employee ID + IC)
// =====================================================

// Employee clock action (no password required, uses Employee ID + IC)
router.post('/employee/clock', async (req, res) => {
  try {
    const {
      employee_id,  // Employee ID (e.g., "EMP001")
      ic_number,    // IC number for verification
      action,       // 'clock_in_1', 'clock_out_1', 'clock_in_2', 'clock_out_2'
      latitude,
      longitude,
      photo,        // Base64 photo
      outlet_id
    } = req.body;

    if (!employee_id || !ic_number) {
      return res.status(400).json({ error: 'Employee ID and IC number are required' });
    }

    const validActions = ['clock_in_1', 'clock_out_1', 'clock_in_2', 'clock_out_2'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        valid_actions: validActions,
        action_meanings: {
          clock_in_1: 'Start work (morning)',
          clock_out_1: 'Break start',
          clock_in_2: 'After break',
          clock_out_2: 'End work'
        }
      });
    }

    // Verify employee by Employee ID + IC
    const empResult = await pool.query(
      `SELECT id, name, employee_id, company_id, outlet_id
       FROM employees
       WHERE employee_id = $1 AND ic_number = $2 AND status = 'active'`,
      [employee_id, ic_number.replace(/[-\s]/g, '')]
    );

    if (empResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Employee ID or IC number' });
    }

    const employee = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

    // Build location string
    const location = (latitude && longitude) ? `${latitude},${longitude}` : null;
    const locationField = action.replace('clock', 'location');
    const photoField = action.replace('clock', 'photo');

    // Check if record exists for today
    const existing = await pool.query(
      'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee.id, today]
    );

    let result;

    if (existing.rows.length > 0) {
      // Update existing record
      const record = existing.rows[0];

      // Check if this action already done
      if (record[action]) {
        return res.status(400).json({
          error: `${action} already recorded for today`,
          time: record[action]
        });
      }

      result = await pool.query(`
        UPDATE clock_in_records SET
          ${action} = $1,
          ${locationField} = $2,
          ${photoField} = $3,
          updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [currentTime, location, photo, record.id]);
    } else {
      // Only allow clock_in_1 for new record
      if (action !== 'clock_in_1') {
        return res.status(400).json({
          error: 'Must clock in first (clock_in_1) before other actions'
        });
      }

      result = await pool.query(`
        INSERT INTO clock_in_records
        (employee_id, company_id, outlet_id, work_date, ${action}, ${locationField}, ${photoField}, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
      `, [employee.id, employee.company_id, outlet_id || employee.outlet_id, today, currentTime, location, photo]);
    }

    const record = result.rows[0];

    // Recalculate work time
    const calc = calculateWorkTime(record, record.company_id);
    await pool.query(`
      UPDATE clock_in_records SET
        total_work_minutes = $1,
        total_break_minutes = $2,
        ot_minutes = $3,
        total_hours = $4,
        ot_hours = $5
      WHERE id = $6
    `, [calc.workMinutes, calc.breakMinutes, calc.otMinutes, calc.totalHours, calc.otHours, record.id]);

    // Get updated record
    const updated = await pool.query('SELECT * FROM clock_in_records WHERE id = $1', [record.id]);

    res.json({
      success: true,
      action,
      action_meaning: {
        clock_in_1: 'Start work',
        clock_out_1: 'Break start',
        clock_in_2: 'After break',
        clock_out_2: 'End work'
      }[action],
      time: currentTime,
      employee_name: employee.name,
      record: updated.rows[0]
    });
  } catch (error) {
    console.error('Error processing clock action:', error);
    res.status(500).json({ error: 'Failed to process clock action' });
  }
});

// Get employee's today attendance (using Employee ID + IC)
router.post('/employee/today', async (req, res) => {
  try {
    const { employee_id, ic_number } = req.body;

    if (!employee_id || !ic_number) {
      return res.status(400).json({ error: 'Employee ID and IC number are required' });
    }

    // Verify employee
    const empResult = await pool.query(
      `SELECT id, name, employee_id FROM employees
       WHERE employee_id = $1 AND ic_number = $2 AND status = 'active'`,
      [employee_id, ic_number.replace(/[-\s]/g, '')]
    );

    if (empResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Employee ID or IC number' });
    }

    const employee = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee.id, today]
    );

    if (result.rows.length === 0) {
      return res.json({
        employee_name: employee.name,
        employee_id: employee.employee_id,
        work_date: today,
        status: 'no_record',
        next_action: 'clock_in_1',
        message: 'No attendance record for today. Please clock in.'
      });
    }

    const record = result.rows[0];

    // Determine next action
    let nextAction = null;
    if (!record.clock_in_1) nextAction = 'clock_in_1';
    else if (!record.clock_out_1) nextAction = 'clock_out_1';
    else if (!record.clock_in_2) nextAction = 'clock_in_2';
    else if (!record.clock_out_2) nextAction = 'clock_out_2';

    res.json({
      employee_name: employee.name,
      employee_id: employee.employee_id,
      record,
      next_action: nextAction,
      actions_completed: {
        clock_in_1: !!record.clock_in_1,
        clock_out_1: !!record.clock_out_1,
        clock_in_2: !!record.clock_in_2,
        clock_out_2: !!record.clock_out_2
      }
    });
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get employee's attendance history (using Employee ID + IC)
router.post('/employee/history', async (req, res) => {
  try {
    const { employee_id, ic_number, month, year } = req.body;

    if (!employee_id || !ic_number) {
      return res.status(400).json({ error: 'Employee ID and IC number are required' });
    }

    // Verify employee
    const empResult = await pool.query(
      `SELECT id, name, employee_id FROM employees
       WHERE employee_id = $1 AND ic_number = $2 AND status = 'active'`,
      [employee_id, ic_number.replace(/[-\s]/g, '')]
    );

    if (empResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Employee ID or IC number' });
    }

    const employee = empResult.rows[0];
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();

    const result = await pool.query(`
      SELECT * FROM clock_in_records
      WHERE employee_id = $1
        AND EXTRACT(MONTH FROM work_date) = $2
        AND EXTRACT(YEAR FROM work_date) = $3
      ORDER BY work_date DESC
    `, [employee.id, m, y]);

    // Calculate summary
    let totalHours = 0;
    let totalOT = 0;
    let approvedDays = 0;

    result.rows.forEach(r => {
      if (r.status === 'approved') {
        approvedDays++;
        totalHours += parseFloat(r.total_hours || 0);
        totalOT += parseFloat(r.ot_hours || 0);
      }
    });

    res.json({
      employee_name: employee.name,
      employee_id: employee.employee_id,
      month: m,
      year: y,
      summary: {
        total_days: result.rows.length,
        approved_days: approvedDays,
        total_work_hours: Math.round(totalHours * 100) / 100,
        total_ot_hours: Math.round(totalOT * 100) / 100
      },
      records: result.rows
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

module.exports = router;
