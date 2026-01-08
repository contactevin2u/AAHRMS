/**
 * Auto Clock-Out Scheduled Job
 *
 * Runs at 12:00 AM daily to process incomplete clock-in records.
 *
 * Logic:
 * 1. Find all clock-ins without clock-out for yesterday
 * 2. Check schedule end time:
 *    - If schedule ends before 12am → set clock_out = 12:00 AM (00:00:00)
 *    - If schedule ends after 12am (night shift) → set clock_out = shift_end + 1 hour
 * 3. Hours calculation on auto clock-out:
 *    - Full Time: Cap at 8.5 hours (510 minutes), no OT
 *    - Part Time: Count scheduled hours only, no OT
 * 4. Flag auto clock-out records for admin review
 */

const pool = require('../db');

// Standard work time: 8.5 hours = 510 minutes
const STANDARD_WORK_MINUTES = 510;

/**
 * Convert time string (HH:MM:SS or HH:MM) to minutes since midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.toString().split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string (HH:MM:SS)
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
}

/**
 * Calculate work minutes between clock_in and clock_out times
 * Handles break time if both clock_out_1 and clock_in_2 exist
 */
function calculateWorkMinutes(record) {
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;

  if (!clock_in_1 || !clock_out_2) return 0;

  const startMinutes = timeToMinutes(clock_in_1);
  const endMinutes = timeToMinutes(clock_out_2);

  // Handle overnight shifts
  let totalMinutes = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : (24 * 60 - startMinutes) + endMinutes;

  // Subtract break time if recorded
  if (clock_out_1 && clock_in_2) {
    const breakStart = timeToMinutes(clock_out_1);
    const breakEnd = timeToMinutes(clock_in_2);
    const breakMinutes = breakEnd >= breakStart
      ? breakEnd - breakStart
      : (24 * 60 - breakStart) + breakEnd;
    totalMinutes -= breakMinutes;
  }

  return Math.max(0, totalMinutes);
}

/**
 * Calculate scheduled work minutes from schedule
 */
function calculateScheduledMinutes(schedule) {
  if (!schedule) return STANDARD_WORK_MINUTES;

  const startMinutes = timeToMinutes(schedule.shift_start);
  const endMinutes = timeToMinutes(schedule.shift_end);
  const breakDuration = schedule.break_duration || 60;

  // Handle overnight shifts
  let shiftMinutes = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : (24 * 60 - startMinutes) + endMinutes;

  return Math.max(0, shiftMinutes - breakDuration);
}

/**
 * Determine if shift is a night shift (ends after midnight)
 */
function isNightShift(shiftEndTime) {
  const endMinutes = timeToMinutes(shiftEndTime);
  // Night shift if end time is between 00:00 and 06:00
  return endMinutes >= 0 && endMinutes <= 360;
}

/**
 * Process auto clock-out for a single record
 */
async function processAutoClockOut(record, schedule, employee) {
  const workDate = record.work_date;
  let clockOutTime;
  let autoClockOutReason = 'forgot';

  // Determine clock-out time based on schedule
  if (schedule) {
    const shiftEndMinutes = timeToMinutes(schedule.shift_end);

    if (isNightShift(schedule.shift_end)) {
      // Night shift: clock_out = shift_end + 1 hour
      const adjustedMinutes = (shiftEndMinutes + 60) % (24 * 60);
      clockOutTime = minutesToTime(adjustedMinutes);
    } else {
      // Normal shift: clock_out at midnight (00:00:00)
      clockOutTime = '00:00:00';
    }
  } else {
    // No schedule: clock_out at midnight
    clockOutTime = '00:00:00';
  }

  // Calculate work minutes with auto clock-out
  const tempRecord = {
    ...record,
    clock_out_2: clockOutTime
  };

  let totalWorkMinutes = calculateWorkMinutes(tempRecord);
  let otMinutes = 0;

  // Apply work type rules
  const workType = employee.work_type || 'full_time';

  if (workType === 'full_time') {
    // Full Time: Cap at 8.5 hours (510 minutes), no OT on auto clock-out
    totalWorkMinutes = Math.min(totalWorkMinutes, STANDARD_WORK_MINUTES);
    otMinutes = 0; // No OT for auto clock-out
  } else {
    // Part Time: Count scheduled hours only, no OT
    const scheduledMinutes = calculateScheduledMinutes(schedule);
    totalWorkMinutes = Math.min(totalWorkMinutes, scheduledMinutes);
    otMinutes = 0; // No OT for auto clock-out
  }

  // Update the clock-in record
  await pool.query(
    `UPDATE clock_in_records SET
       clock_out_2 = $1,
       total_work_minutes = $2,
       ot_minutes = $3,
       ot_flagged = FALSE,
       status = 'completed',
       is_auto_clock_out = TRUE,
       auto_clock_out_reason = $4,
       needs_admin_review = TRUE,
       updated_at = NOW()
     WHERE id = $5`,
    [clockOutTime, totalWorkMinutes, otMinutes, autoClockOutReason, record.id]
  );

  // Create notification for admin
  try {
    // Find admin users for this company
    const adminResult = await pool.query(
      `SELECT id FROM admin_users
       WHERE (company_id = $1 OR company_id IS NULL)
       AND role IN ('super_admin', 'hr', 'admin')
       AND status = 'active'
       LIMIT 1`,
      [record.company_id]
    );

    if (adminResult.rows.length > 0) {
      const totalHours = (totalWorkMinutes / 60).toFixed(2);
      await pool.query(
        `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
         VALUES ($1, 'auto_clock_out', 'Auto Clock-Out Review Required', $2, 'clock_in_record', $3)`,
        [
          adminResult.rows[0].id,
          `${employee.name} was auto clocked-out on ${workDate}. Recorded hours: ${totalHours}. Please review.`,
          record.id
        ]
      );
    }
  } catch (notifError) {
    console.error('Error creating notification:', notifError);
  }

  return {
    recordId: record.id,
    employeeName: employee.name,
    workDate,
    clockOutTime,
    totalWorkMinutes,
    workType
  };
}

/**
 * Main function to run auto clock-out job
 */
async function runAutoClockOut() {
  console.log('[AutoClockOut] Starting auto clock-out job at', new Date().toISOString());

  const client = await pool.connect();

  try {
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Process all unclosed records from before today (not just yesterday)
    console.log('[AutoClockOut] Processing all unclosed records before:', todayStr);

    // Find all incomplete clock-in records from before today (Mimix companies only)
    // where clock_in_1 exists but clock_out_2 is NULL
    // Also handle NULL is_auto_clock_out (for older records)
    const incompleteRecords = await client.query(
      `SELECT cir.*, e.name as employee_name, e.work_type, e.id as emp_id,
              c.grouping_type
       FROM clock_in_records cir
       JOIN employees e ON cir.employee_id = e.id
       JOIN companies c ON cir.company_id = c.id
       WHERE cir.work_date < $1
         AND cir.clock_in_1 IS NOT NULL
         AND cir.clock_out_2 IS NULL
         AND (cir.is_auto_clock_out = FALSE OR cir.is_auto_clock_out IS NULL)
         AND c.grouping_type = 'outlet'`,
      [todayStr]
    );

    console.log('[AutoClockOut] Found', incompleteRecords.rows.length, 'incomplete records from before', todayStr);

    const results = [];

    for (const record of incompleteRecords.rows) {
      try {
        // Get the employee's schedule for this date
        let schedule = null;
        if (record.schedule_id) {
          const scheduleResult = await client.query(
            'SELECT * FROM schedules WHERE id = $1',
            [record.schedule_id]
          );
          schedule = scheduleResult.rows[0];
        } else {
          // Try to find schedule by employee and date
          const scheduleResult = await client.query(
            `SELECT * FROM schedules
             WHERE employee_id = $1 AND schedule_date = $2 AND status = 'scheduled'`,
            [record.employee_id, yesterdayStr]
          );
          schedule = scheduleResult.rows[0];
        }

        const employee = {
          id: record.emp_id,
          name: record.employee_name,
          work_type: record.work_type || 'full_time'
        };

        const result = await processAutoClockOut(record, schedule, employee);
        results.push(result);

        console.log('[AutoClockOut] Processed:', result);
      } catch (recordError) {
        console.error('[AutoClockOut] Error processing record', record.id, ':', recordError);
      }
    }

    console.log('[AutoClockOut] Completed. Processed', results.length, 'records');
    return results;

  } catch (error) {
    console.error('[AutoClockOut] Job failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get records needing admin review
 */
async function getRecordsNeedingReview(companyId = null) {
  let query = `
    SELECT cir.*, e.name as employee_name, e.employee_id as emp_code,
           o.name as outlet_name
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    LEFT JOIN outlets o ON cir.outlet_id = o.id
    WHERE cir.needs_admin_review = TRUE
      AND cir.is_auto_clock_out = TRUE
  `;

  const params = [];
  if (companyId) {
    query += ' AND cir.company_id = $1';
    params.push(companyId);
  }

  query += ' ORDER BY cir.work_date DESC, e.name ASC';

  const result = await pool.query(query, params);

  return result.rows.map(r => ({
    ...r,
    total_hours: r.total_work_minutes ? (r.total_work_minutes / 60).toFixed(2) : '0.00'
  }));
}

/**
 * Mark record as reviewed by admin
 */
async function markAsReviewed(recordId, adminId, adjustedMinutes = null) {
  const updates = ['needs_admin_review = FALSE', 'approved_by = $2', 'approved_at = NOW()'];
  const params = [recordId, adminId];

  if (adjustedMinutes !== null) {
    updates.push('total_work_minutes = $3');
    params.push(adjustedMinutes);
  }

  await pool.query(
    `UPDATE clock_in_records SET ${updates.join(', ')} WHERE id = $1`,
    params
  );
}

module.exports = {
  runAutoClockOut,
  getRecordsNeedingReview,
  markAsReviewed,
  processAutoClockOut,
  timeToMinutes,
  minutesToTime,
  calculateWorkMinutes,
  calculateScheduledMinutes,
  STANDARD_WORK_MINUTES
};
