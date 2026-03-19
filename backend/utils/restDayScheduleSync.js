/**
 * =============================================================================
 * REST DAY ↔ SCHEDULE SYNC
 * =============================================================================
 *
 * Links rest day assignments with schedule entries so that:
 * - Assigning a rest day auto-creates an "Off" schedule
 * - Removing a rest day auto-removes the "Off" schedule
 * - Assigning an "Off" shift auto-creates a rest day
 * - Clearing an "Off" schedule auto-removes the rest day
 *
 * =============================================================================
 */

const pool = require('../db');

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Determine which payroll month a rest date belongs to
 * Rule: 1st of month = belongs to previous month, otherwise current month
 */
function getPayrollMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDate() === 1) {
    const prev = new Date(d);
    prev.setMonth(prev.getMonth() - 1);
    return { month: prev.getMonth() + 1, year: prev.getFullYear() };
  }
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/**
 * Calculate Mon-Sun week range for a given date
 */
function getWeekRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const weekStart = new Date(d);
  if (dow === 0) weekStart.setDate(weekStart.getDate() - 6);
  else weekStart.setDate(weekStart.getDate() - (dow - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return { weekStart: formatDate(weekStart), weekEnd: formatDate(weekEnd) };
}

/**
 * Get or create an "Off" shift template for a company
 */
async function getOrCreateOffTemplate(companyId, client) {
  const db = client || pool;

  // Look for existing Off template
  const existing = await db.query(
    `SELECT id FROM shift_templates
     WHERE company_id = $1 AND is_off = true AND is_active = true
     LIMIT 1`,
    [companyId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create one
  const result = await db.query(
    `INSERT INTO shift_templates (company_id, name, code, start_time, end_time, color, is_off, is_active)
     VALUES ($1, 'Off', 'OFF', '00:00', '00:00', '#EF4444', true, true)
     RETURNING id`,
    [companyId]
  );
  return result.rows[0].id;
}

// ============================================================
// REST DAY → SCHEDULE SYNC
// ============================================================

/**
 * When a rest day is assigned, create/update an "Off" schedule entry
 */
async function syncScheduleFromRestDay(employeeId, companyId, restDate, client) {
  const db = client || pool;
  try {
    const offTemplateId = await getOrCreateOffTemplate(companyId, db);

    // Get employee's outlet
    const emp = await db.query('SELECT outlet_id FROM employees WHERE id = $1', [employeeId]);
    const outletId = emp.rows[0]?.outlet_id;

    // Check for existing schedule on this date
    const existing = await db.query(
      'SELECT id, status FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [employeeId, restDate]
    );

    if (existing.rows.length > 0) {
      // Update to "off"
      await db.query(
        `UPDATE schedules SET shift_template_id = $1, shift_start = '00:00', shift_end = '00:00',
         status = 'off', updated_at = NOW()
         WHERE id = $2`,
        [offTemplateId, existing.rows[0].id]
      );
    } else {
      // Create new "off" schedule
      await db.query(
        `INSERT INTO schedules (employee_id, company_id, outlet_id, schedule_date,
         shift_template_id, shift_start, shift_end, status)
         VALUES ($1, $2, $3, $4, $5, '00:00', '00:00', 'off')`,
        [employeeId, companyId, outletId, restDate, offTemplateId]
      );
    }
  } catch (err) {
    console.error('Error syncing schedule from rest day:', err.message);
    // Don't throw - sync is best-effort, rest day is the primary record
  }
}

/**
 * When a rest day is removed, remove the "Off" schedule entry (if it's still "off")
 */
async function removeScheduleFromRestDay(employeeId, restDate, client) {
  const db = client || pool;
  try {
    await db.query(
      `DELETE FROM schedules WHERE employee_id = $1 AND schedule_date = $2 AND status = 'off'`,
      [employeeId, restDate]
    );
  } catch (err) {
    console.error('Error removing schedule from rest day:', err.message);
  }
}

// ============================================================
// SCHEDULE → REST DAY SYNC
// ============================================================

/**
 * When an "Off" shift is assigned, create a rest day assignment
 * Only for full-time employees
 */
async function syncRestDayFromSchedule(employeeId, companyId, scheduleDate, adminId, client) {
  const db = client || pool;
  try {
    // Check if employee is full-time (part-time doesn't need rest days)
    const emp = await db.query(
      'SELECT work_type, employment_type FROM employees WHERE id = $1',
      [employeeId]
    );
    if (!emp.rows[0]) return;
    if (emp.rows[0].work_type === 'part_time' || emp.rows[0].employment_type === 'part_time') return;

    const { weekStart, weekEnd } = getWeekRange(scheduleDate);
    const payroll = getPayrollMonth(scheduleDate);

    // Check if already has a rest day in this week
    const existing = await db.query(
      `SELECT id, rest_date FROM rest_day_assignments
       WHERE employee_id = $1 AND week_start = $2 AND month = $3 AND year = $4`,
      [employeeId, weekStart, payroll.month, payroll.year]
    );

    if (existing.rows.length > 0) {
      // Update existing rest day to this date
      if (formatDate(new Date(existing.rows[0].rest_date)) !== scheduleDate) {
        await db.query(
          `UPDATE rest_day_assignments SET rest_date = $1, week_end = $2, updated_at = NOW(), assigned_by = $3
           WHERE id = $4`,
          [scheduleDate, weekEnd, adminId, existing.rows[0].id]
        );
      }
    } else {
      // Insert new rest day
      await db.query(
        `INSERT INTO rest_day_assignments (employee_id, company_id, rest_date, week_start, week_end, month, year, assigned_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (employee_id, rest_date) DO NOTHING`,
        [employeeId, companyId, scheduleDate, weekStart, weekEnd, payroll.month, payroll.year, adminId]
      );
    }
  } catch (err) {
    console.error('Error syncing rest day from schedule:', err.message);
  }
}

/**
 * When an "Off" schedule is cleared, remove the rest day assignment for that date
 */
async function removeRestDayFromSchedule(employeeId, scheduleDate, client) {
  const db = client || pool;
  try {
    await db.query(
      'DELETE FROM rest_day_assignments WHERE employee_id = $1 AND rest_date = $2',
      [employeeId, scheduleDate]
    );
  } catch (err) {
    console.error('Error removing rest day from schedule:', err.message);
  }
}

module.exports = {
  syncScheduleFromRestDay,
  removeScheduleFromRestDay,
  syncRestDayFromSchedule,
  removeRestDayFromSchedule,
  getOrCreateOffTemplate,
  getWeekRange,
  getPayrollMonth,
  formatDate
};
