/**
 * =============================================================================
 * REST DAY MANAGEMENT (Mimix/Outlet Companies Only)
 * =============================================================================
 *
 * Flexible weekly rest day assignment for calendar-based salary calculation.
 * Supervisors assign 1 rest day per week per employee.
 * Working Days = Calendar Days - Rest Days (per employee, per month)
 * Daily Rate = Basic Salary / Working Days
 *
 * =============================================================================
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { syncScheduleFromRestDay, removeScheduleFromRestDay } = require('../utils/restDayScheduleSync');

/**
 * Generate Mon-Sun week ranges for a given month
 */
function getWeekRanges(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // Find the Monday on or before the 1st
  let weekStart = new Date(firstDay);
  const dow = weekStart.getDay(); // 0=Sun, 1=Mon, ...
  if (dow === 0) weekStart.setDate(weekStart.getDate() - 6); // Sunday -> prev Monday
  else weekStart.setDate(weekStart.getDate() - (dow - 1)); // Move back to Monday

  let weekNum = 1;
  while (weekStart <= lastDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    // Only include weeks that overlap with the month
    const overlapStart = new Date(Math.max(weekStart.getTime(), firstDay.getTime()));
    const overlapEnd = new Date(Math.min(weekEnd.getTime(), lastDay.getTime()));

    // Generate all days in this week that fall within the month
    const days = [];
    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      if (d >= firstDay && d <= lastDay) {
        days.push(formatDate(new Date(d)));
      }
    }

    if (days.length > 0) {
      weeks.push({
        week_number: weekNum,
        week_start: formatDate(new Date(weekStart)),
        week_end: formatDate(new Date(weekEnd)),
        days,
        label: `Week ${weekNum} (${formatShort(overlapStart)} - ${formatShort(overlapEnd)})`
      });
      weekNum++;
    }

    weekStart.setDate(weekStart.getDate() + 7);
  }

  return weeks;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function formatShort(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Determine which payroll month a rest date belongs to
 * Rule: 1st of month = belongs to previous month, otherwise current month
 */
function getPayrollMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDate() === 1) {
    // 1st belongs to previous month
    const prev = new Date(d);
    prev.setMonth(prev.getMonth() - 1);
    return { month: prev.getMonth() + 1, year: prev.getFullYear() };
  }
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

// ==========================================
// GET /api/rest-days/weeks - Week ranges for a month
// ==========================================
router.get('/weeks', authenticateAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'month and year are required' });
    }
    const weeks = getWeekRanges(parseInt(year), parseInt(month));
    res.json(weeks);
  } catch (err) {
    console.error('Error generating weeks:', err);
    res.status(500).json({ error: 'Failed to generate week ranges' });
  }
});

// ==========================================
// GET /api/rest-days - Get assignments for a month/outlet
// ==========================================
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, outlet_id } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'month and year are required' });
    }

    const companyId = req.companyId;

    let query = `
      SELECT r.*, e.emp_no, e.name as employee_name, e.outlet_id,
             au.name as assigned_by_name
      FROM rest_day_assignments r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN admin_users au ON r.assigned_by = au.id
      WHERE r.company_id = $1 AND r.month = $2 AND r.year = $3
    `;
    const params = [companyId, parseInt(month), parseInt(year)];

    if (outlet_id) {
      query += ` AND e.outlet_id = $4`;
      params.push(parseInt(outlet_id));
    }

    query += ` ORDER BY e.name, r.rest_date`;

    const result = await pool.query(query, params);

    // Group by employee
    const byEmployee = {};
    for (const row of result.rows) {
      if (!byEmployee[row.employee_id]) {
        byEmployee[row.employee_id] = {
          employee_id: row.employee_id,
          emp_no: row.emp_no,
          name: row.employee_name,
          outlet_id: row.outlet_id,
          rest_days: []
        };
      }
      byEmployee[row.employee_id].rest_days.push({
        id: row.id,
        rest_date: formatDate(new Date(row.rest_date)),
        week_start: formatDate(new Date(row.week_start)),
        week_end: formatDate(new Date(row.week_end)),
        assigned_by: row.assigned_by_name,
        created_at: row.created_at
      });
    }

    res.json(Object.values(byEmployee));
  } catch (err) {
    console.error('Error fetching rest days:', err);
    res.status(500).json({ error: 'Failed to fetch rest day assignments' });
  }
});

// ==========================================
// POST /api/rest-days/assign - Assign single rest day
// ==========================================
router.post('/assign', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, rest_date, month, year } = req.body;
    if (!employee_id || !rest_date) {
      return res.status(400).json({ error: 'employee_id and rest_date are required' });
    }

    const companyId = req.companyId;
    const adminId = req.admin?.id;

    // Verify employee exists and is in an outlet company
    const empResult = await pool.query(
      'SELECT id, name, employment_type, work_type FROM employees WHERE id = $1 AND company_id = $2',
      [employee_id, companyId]
    );
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];
    if (emp.work_type === 'part_time' || emp.employment_type === 'part_time') {
      return res.status(400).json({ error: 'Part-time employees do not need rest day assignments' });
    }

    // Calculate week range (Mon-Sun) for this date
    const restDateObj = new Date(rest_date + 'T00:00:00');
    const dow = restDateObj.getDay();
    const weekStartObj = new Date(restDateObj);
    if (dow === 0) weekStartObj.setDate(weekStartObj.getDate() - 6);
    else weekStartObj.setDate(weekStartObj.getDate() - (dow - 1));
    const weekEndObj = new Date(weekStartObj);
    weekEndObj.setDate(weekEndObj.getDate() + 6);

    const weekStart = formatDate(weekStartObj);
    const weekEnd = formatDate(weekEndObj);

    // Determine payroll month
    const payrollMonth = month ? parseInt(month) : getPayrollMonth(rest_date).month;
    const payrollYear = year ? parseInt(year) : getPayrollMonth(rest_date).year;

    // Check if employee already has a rest day in this week for this payroll month
    const existingResult = await pool.query(
      `SELECT id, rest_date FROM rest_day_assignments
       WHERE employee_id = $1 AND week_start = $2 AND month = $3 AND year = $4`,
      [employee_id, weekStart, payrollMonth, payrollYear]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let result;
      if (existingResult.rows.length > 0) {
        // Update existing - replace rest day in this week
        const oldDate = existingResult.rows[0].rest_date;
        result = await client.query(
          `UPDATE rest_day_assignments
           SET rest_date = $1, week_end = $2, updated_at = NOW(), assigned_by = $3
           WHERE id = $4
           RETURNING *`,
          [rest_date, weekEnd, adminId, existingResult.rows[0].id]
        );

        // Audit log
        await client.query(
          `INSERT INTO schedule_audit_logs (employee_id, action, old_value, new_value, reason, performed_by)
           VALUES ($1, 'rest_day_updated', $2, $3, $4, $5)`,
          [employee_id, JSON.stringify({ rest_date: formatDate(new Date(oldDate)) }),
           JSON.stringify({ rest_date }), 'Rest day changed', adminId]
        );
      } else {
        // Insert new
        result = await client.query(
          `INSERT INTO rest_day_assignments (employee_id, company_id, rest_date, week_start, week_end, month, year, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [employee_id, companyId, rest_date, weekStart, weekEnd, payrollMonth, payrollYear, adminId]
        );

        // Audit log
        await client.query(
          `INSERT INTO schedule_audit_logs (employee_id, action, new_value, reason, performed_by)
           VALUES ($1, 'rest_day_assigned', $2, $3, $4)`,
          [employee_id, JSON.stringify({ rest_date, week_start: weekStart, week_end: weekEnd }),
           'Rest day assigned', adminId]
        );
      }

      // Sync schedule: if old rest day was replaced, remove old schedule first
      if (existingResult.rows.length > 0) {
        const oldDate = formatDate(new Date(existingResult.rows[0].rest_date));
        if (oldDate !== rest_date) {
          await removeScheduleFromRestDay(employee_id, oldDate, client);
        }
      }

      // Create/update "Off" schedule for the new rest date
      await syncScheduleFromRestDay(employee_id, companyId, rest_date, client);

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error assigning rest day:', err);
    res.status(500).json({ error: 'Failed to assign rest day' });
  }
});

// ==========================================
// POST /api/rest-days/bulk-assign - Bulk assign rest days
// ==========================================
router.post('/bulk-assign', authenticateAdmin, async (req, res) => {
  try {
    const { outlet_id, month, year, assignments } = req.body;
    // assignments: [{ employee_id, rest_dates: ['2026-03-02', ...] }]
    if (!month || !year || !assignments || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'month, year, and assignments array are required' });
    }

    const companyId = req.companyId;
    const adminId = req.admin?.id;
    const weeks = getWeekRanges(parseInt(year), parseInt(month));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let totalAssigned = 0;

      for (const assignment of assignments) {
        const { employee_id, rest_dates } = assignment;
        if (!employee_id || !rest_dates) continue;

        // Validate: max 1 rest day per week
        const weekDates = {};
        for (const dateStr of rest_dates) {
          const d = new Date(dateStr + 'T00:00:00');
          const dow = d.getDay();
          const ws = new Date(d);
          if (dow === 0) ws.setDate(ws.getDate() - 6);
          else ws.setDate(ws.getDate() - (dow - 1));
          const wsKey = formatDate(ws);

          if (weekDates[wsKey]) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: `Employee ${employee_id} has multiple rest days in week starting ${wsKey}`
            });
          }
          weekDates[wsKey] = dateStr;
        }

        // Get existing rest days before deleting (to clean up old schedules)
        const oldRestDays = await client.query(
          'SELECT rest_date FROM rest_day_assignments WHERE employee_id = $1 AND month = $2 AND year = $3',
          [employee_id, parseInt(month), parseInt(year)]
        );

        // Remove old "Off" schedules for dates that are no longer rest days
        const newDatesSet = new Set(rest_dates);
        for (const row of oldRestDays.rows) {
          const oldDate = formatDate(new Date(row.rest_date));
          if (!newDatesSet.has(oldDate)) {
            await removeScheduleFromRestDay(employee_id, oldDate, client);
          }
        }

        // Delete existing rest days for this employee/month
        await client.query(
          'DELETE FROM rest_day_assignments WHERE employee_id = $1 AND month = $2 AND year = $3',
          [employee_id, parseInt(month), parseInt(year)]
        );

        // Insert new rest days
        for (const dateStr of rest_dates) {
          const d = new Date(dateStr + 'T00:00:00');
          const dow = d.getDay();
          const ws = new Date(d);
          if (dow === 0) ws.setDate(ws.getDate() - 6);
          else ws.setDate(ws.getDate() - (dow - 1));
          const we = new Date(ws);
          we.setDate(we.getDate() + 6);

          await client.query(
            `INSERT INTO rest_day_assignments (employee_id, company_id, rest_date, week_start, week_end, month, year, assigned_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [employee_id, companyId, dateStr, formatDate(ws), formatDate(we),
             parseInt(month), parseInt(year), adminId]
          );
          totalAssigned++;

          // Sync: create/update "Off" schedule for this rest date
          await syncScheduleFromRestDay(employee_id, companyId, dateStr, client);
        }

        // Audit log
        await client.query(
          `INSERT INTO schedule_audit_logs (employee_id, action, new_value, reason, performed_by)
           VALUES ($1, 'rest_days_bulk_assigned', $2, $3, $4)`,
          [employee_id, JSON.stringify({ month, year, rest_dates }), 'Bulk rest day assignment', adminId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, total_assigned: totalAssigned });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error bulk assigning rest days:', err);
    res.status(500).json({ error: 'Failed to bulk assign rest days' });
  }
});

// ==========================================
// DELETE /api/rest-days/:id - Remove a rest day
// ==========================================
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id;

    const existing = await pool.query('SELECT * FROM rest_day_assignments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Rest day assignment not found' });
    }

    const old = existing.rows[0];
    await pool.query('DELETE FROM rest_day_assignments WHERE id = $1', [id]);

    // Sync: remove "Off" schedule for this rest date
    await removeScheduleFromRestDay(old.employee_id, formatDate(new Date(old.rest_date)));

    // Audit log
    await pool.query(
      `INSERT INTO schedule_audit_logs (employee_id, action, old_value, reason, performed_by)
       VALUES ($1, 'rest_day_removed', $2, $3, $4)`,
      [old.employee_id, JSON.stringify({ rest_date: formatDate(new Date(old.rest_date)) }),
       'Rest day removed', adminId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing rest day:', err);
    res.status(500).json({ error: 'Failed to remove rest day' });
  }
});

// ==========================================
// GET /api/rest-days/summary - Monthly summary
// ==========================================
router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, outlet_id, employee_id } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'month and year are required' });
    }

    const companyId = req.companyId;
    const m = parseInt(month);
    const y = parseInt(year);
    const calendarDays = new Date(y, m, 0).getDate();

    // Get period dates
    const periodStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const periodEnd = `${y}-${String(m).padStart(2, '0')}-${String(calendarDays).padStart(2, '0')}`;

    // Build employee filter
    let empFilter = 'AND e.company_id = $1';
    const params = [companyId];
    let paramIdx = 2;

    if (employee_id) {
      empFilter += ` AND e.id = $${paramIdx}`;
      params.push(parseInt(employee_id));
      paramIdx++;
    }
    if (outlet_id) {
      empFilter += ` AND e.outlet_id = $${paramIdx}`;
      params.push(parseInt(outlet_id));
      paramIdx++;
    }

    // Get full-time employees (not part-time)
    const empResult = await pool.query(`
      SELECT e.id, e.emp_no, e.name, e.outlet_id, e.default_basic_salary,
             o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.status = 'active'
        AND e.work_type != 'part_time'
        AND COALESCE(e.employment_type, '') != 'part_time'
        ${empFilter}
      ORDER BY e.name
    `, params);

    const summaries = [];

    for (const emp of empResult.rows) {
      // Count rest days for this employee
      const restResult = await pool.query(
        'SELECT COUNT(*) as count FROM rest_day_assignments WHERE employee_id = $1 AND month = $2 AND year = $3',
        [emp.id, m, y]
      );
      let restDays = parseInt(restResult.rows[0].count) || 0;
      let fromSchedule = false;

      // If no rest days assigned, count actual scheduled working days
      // Days without a schedule are treated as off days automatically
      if (restDays === 0) {
        const schedResult = await pool.query(
          `SELECT COUNT(*) as count FROM schedules s
           LEFT JOIN shift_templates st ON s.shift_template_id = st.id
           WHERE s.employee_id = $1 AND s.schedule_date BETWEEN $2 AND $3
             AND (st.is_off IS NULL OR st.is_off = false)`,
          [emp.id, periodStart, periodEnd]
        );
        const scheduledDays = parseInt(schedResult.rows[0].count) || 0;
        if (scheduledDays > 0) {
          restDays = calendarDays - scheduledDays;
          fromSchedule = true;
        }
      }

      // Count public holidays
      const phResult = await pool.query(
        `SELECT COUNT(*) as count FROM public_holidays
         WHERE company_id = $1 AND date >= $2 AND date <= $3`,
        [companyId, periodStart, periodEnd]
      );
      const publicHolidays = parseInt(phResult.rows[0].count) || 0;

      // Count paid leave days
      const paidLeaveResult = await pool.query(`
        SELECT COALESCE(SUM(GREATEST(0,
          (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
        )), 0) as days
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.employee_id = $3 AND lt.is_paid = TRUE AND lr.status = 'approved'
          AND lr.start_date <= $1 AND lr.end_date >= $2
      `, [periodEnd, periodStart, emp.id]);
      const paidLeaveDays = parseFloat(paidLeaveResult.rows[0]?.days) || 0;

      // Count unpaid leave days
      const unpaidLeaveResult = await pool.query(`
        SELECT COALESCE(SUM(GREATEST(0,
          (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
        )), 0) as days
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.employee_id = $3 AND lt.is_paid = FALSE AND lr.status = 'approved'
          AND lr.start_date <= $1 AND lr.end_date >= $2
      `, [periodEnd, periodStart, emp.id]);
      const unpaidLeaveDays = parseFloat(unpaidLeaveResult.rows[0]?.days) || 0;

      // Count days worked (clock-in)
      const clockInResult = await pool.query(`
        SELECT COUNT(DISTINCT work_date) as count
        FROM clock_in_records
        WHERE employee_id = $1 AND work_date >= $2 AND work_date <= $3
          AND status IN ('completed', 'approved')
      `, [emp.id, periodStart, periodEnd]);
      const daysWorked = parseInt(clockInResult.rows[0]?.count) || 0;

      const workingDays = calendarDays - restDays;
      const basicSalary = parseFloat(emp.default_basic_salary) || 0;
      const dailyRate = workingDays > 0 ? Math.round(basicSalary / workingDays * 100) / 100 : 0;
      const absentDays = Math.max(0, workingDays - daysWorked - paidLeaveDays - unpaidLeaveDays);
      const unpaidDeduction = Math.round(dailyRate * unpaidLeaveDays * 100) / 100;
      const absentDeduction = Math.round(dailyRate * absentDays * 100) / 100;
      const estimatedPay = Math.max(0, basicSalary - unpaidDeduction - absentDeduction);

      summaries.push({
        employee_id: emp.id,
        emp_no: emp.emp_no,
        name: emp.name,
        outlet_name: emp.outlet_name,
        basic_salary: basicSalary,
        calendar_days: calendarDays,
        rest_days: restDays,
        public_holidays: publicHolidays,
        working_days: workingDays,
        days_worked: daysWorked,
        paid_leave_days: paidLeaveDays,
        unpaid_leave_days: unpaidLeaveDays,
        absent_days: absentDays,
        daily_rate: dailyRate,
        unpaid_deduction: unpaidDeduction,
        absent_deduction: absentDeduction,
        estimated_pay: estimatedPay,
        rest_days_assigned: restDays > 0,
        from_schedule: fromSchedule
      });
    }

    res.json({
      month: m,
      year: y,
      calendar_days: calendarDays,
      employees: summaries
    });
  } catch (err) {
    console.error('Error generating summary:', err);
    res.status(500).json({ error: 'Failed to generate monthly summary' });
  }
});

// ==========================================
// GET /api/rest-days/employees - Get outlet employees for assignment
// ==========================================
router.get('/employees', authenticateAdmin, async (req, res) => {
  try {
    const { outlet_id } = req.query;
    const companyId = req.companyId;

    let query = `
      SELECT e.id, e.emp_no, e.name, e.outlet_id, e.default_basic_salary,
             e.work_type, e.employment_type, o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.company_id = $1 AND e.status = 'active'
        AND COALESCE(e.work_type, '') != 'part_time'
        AND COALESCE(e.employment_type, '') != 'part_time'
    `;
    const params = [companyId];

    if (outlet_id) {
      query += ` AND e.outlet_id = $2`;
      params.push(parseInt(outlet_id));
    }

    query += ` ORDER BY e.name`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Export getWeekRanges for use in payroll calculation
router.getWeekRanges = getWeekRanges;

module.exports = router;
