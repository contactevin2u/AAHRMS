/**
 * Attendance Deduction Utility
 * Calculates pay deductions for late arrivals and early departures
 *
 * Rules:
 * - Grace period: 10 minutes for late clock-in
 * - Late arrival: Deduct pay for minutes late (after grace period)
 * - Early departure: Deduct pay for minutes left early
 * - Deduction is based on hourly rate (basic salary / working days / hours per day)
 */

const pool = require('../db');

// Default configuration
const DEFAULT_CONFIG = {
  grace_period_minutes: 10,      // 10 minutes grace period for late clock-in
  working_days_per_month: 22,    // Standard working days
  working_hours_per_day: 7.5,    // 7.5 hours (excluding 1hr break)
  round_deduction_to: 'minute',  // 'minute', '15min', '30min'
  wrong_shift_tolerance_minutes: 120  // 2 hours tolerance for wrong shift detection
};

/**
 * Convert time string (HH:MM:SS or HH:MM) to minutes from midnight
 * @param {string} timeStr - Time string
 * @returns {number} Minutes from midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

/**
 * Get attendance deduction config for a company
 * @param {number} companyId - Company ID
 * @returns {Object} Configuration object
 */
async function getDeductionConfig(companyId) {
  const result = await pool.query(`
    SELECT grace_period_minutes, working_days_per_month, working_hours_per_day, round_deduction_to
    FROM attendance_deduction_config
    WHERE company_id = $1 AND is_active = TRUE
    LIMIT 1
  `, [companyId]);

  if (result.rows.length > 0) {
    return {
      ...DEFAULT_CONFIG,
      ...result.rows[0]
    };
  }

  return DEFAULT_CONFIG;
}

/**
 * Check if employee clocked in for the wrong shift
 *
 * Logic:
 * - If clock-in time is more than 2 hours away from scheduled shift start, it's wrong shift
 * - This catches cases like: scheduled for 9am shift but clocking in at 3pm (different shift)
 *
 * Example shifts:
 * - Shift 1: 9:00 AM - 5:30 PM
 * - Shift 2: 3:00 PM - 11:30 PM
 *
 * If scheduled for Shift 1 (9am) but clock in at 3pm → wrong shift (6 hours difference)
 * If scheduled for Shift 1 (9am) but clock in at 10am → correct shift, just late (1 hour difference)
 *
 * @param {string} scheduledStart - Scheduled shift start time (HH:MM:SS)
 * @param {string} actualClockIn - Actual clock-in time (HH:MM:SS)
 * @param {number} toleranceMinutes - Tolerance window in minutes (default 120 = 2 hours)
 * @returns {Object} { isWrongShift, timeDifferenceMinutes, scheduledShift, actualTime }
 */
function checkWrongShift(scheduledStart, actualClockIn, toleranceMinutes = 120) {
  if (!scheduledStart || !actualClockIn) {
    return {
      isWrongShift: false,
      timeDifferenceMinutes: 0,
      reason: 'No schedule or clock-in time'
    };
  }

  const scheduledMinutes = timeToMinutes(scheduledStart);
  const actualMinutes = timeToMinutes(actualClockIn);

  if (actualMinutes === null || scheduledMinutes === null) {
    return {
      isWrongShift: false,
      timeDifferenceMinutes: 0,
      reason: 'Invalid time format'
    };
  }

  // Calculate absolute difference (handles both early and late)
  const difference = Math.abs(actualMinutes - scheduledMinutes);

  // If difference is more than tolerance, it's wrong shift
  if (difference > toleranceMinutes) {
    return {
      isWrongShift: true,
      timeDifferenceMinutes: difference,
      scheduledShift: scheduledStart,
      actualTime: actualClockIn,
      reason: `Clock-in time ${actualClockIn} is ${Math.round(difference / 60 * 10) / 10} hours away from scheduled shift ${scheduledStart}`
    };
  }

  return {
    isWrongShift: false,
    timeDifferenceMinutes: difference,
    scheduledShift: scheduledStart,
    actualTime: actualClockIn,
    reason: 'Within acceptable shift window'
  };
}

/**
 * Calculate late arrival minutes
 * @param {string} scheduledStart - Scheduled shift start time (HH:MM:SS)
 * @param {string} actualClockIn - Actual clock-in time (HH:MM:SS)
 * @param {number} gracePeriodMinutes - Grace period in minutes (default 10)
 * @returns {Object} { isLate, lateMinutes, withinGrace }
 */
function calculateLateMinutes(scheduledStart, actualClockIn, gracePeriodMinutes = 10) {
  if (!scheduledStart || !actualClockIn) {
    return { isLate: false, lateMinutes: 0, withinGrace: false };
  }

  const scheduledMinutes = timeToMinutes(scheduledStart);
  const actualMinutes = timeToMinutes(actualClockIn);

  if (actualMinutes === null || scheduledMinutes === null) {
    return { isLate: false, lateMinutes: 0, withinGrace: false };
  }

  const difference = actualMinutes - scheduledMinutes;

  if (difference <= 0) {
    // On time or early
    return { isLate: false, lateMinutes: 0, withinGrace: false };
  }

  if (difference <= gracePeriodMinutes) {
    // Within grace period - no deduction
    return { isLate: false, lateMinutes: 0, withinGrace: true };
  }

  // Late beyond grace period - deduct ALL late minutes (not just after grace)
  return { isLate: true, lateMinutes: difference, withinGrace: false };
}

/**
 * Calculate early departure minutes
 * @param {string} scheduledEnd - Scheduled shift end time (HH:MM:SS)
 * @param {string} actualClockOut - Actual clock-out time (HH:MM:SS)
 * @returns {Object} { isEarly, earlyMinutes }
 */
function calculateEarlyMinutes(scheduledEnd, actualClockOut) {
  if (!scheduledEnd || !actualClockOut) {
    return { isEarly: false, earlyMinutes: 0 };
  }

  const scheduledMinutes = timeToMinutes(scheduledEnd);
  const actualMinutes = timeToMinutes(actualClockOut);

  if (actualMinutes === null || scheduledMinutes === null) {
    return { isEarly: false, earlyMinutes: 0 };
  }

  const difference = scheduledMinutes - actualMinutes;

  if (difference <= 0) {
    // On time or stayed late
    return { isEarly: false, earlyMinutes: 0 };
  }

  // Left early - deduct for early minutes
  return { isEarly: true, earlyMinutes: difference };
}

/**
 * Calculate deduction amount based on late/early minutes
 * @param {number} deductionMinutes - Total minutes to deduct
 * @param {number} basicSalary - Employee's basic monthly salary
 * @param {Object} config - Deduction configuration
 * @returns {number} Deduction amount in currency
 */
function calculateDeductionAmount(deductionMinutes, basicSalary, config = DEFAULT_CONFIG) {
  if (deductionMinutes <= 0) return 0;

  const dailyRate = basicSalary / config.working_days_per_month;
  const hourlyRate = dailyRate / config.working_hours_per_day;
  const minuteRate = hourlyRate / 60;

  return Math.round(deductionMinutes * minuteRate * 100) / 100;
}

/**
 * Calculate attendance deduction for a single clock-in record
 * @param {Object} clockRecord - Clock-in record with clock_in_1, clock_out_2
 * @param {Object} schedule - Schedule with shift_start, shift_end
 * @param {number} basicSalary - Employee's basic salary
 * @param {Object} config - Deduction configuration
 * @returns {Object} Deduction details
 */
function calculateRecordDeduction(clockRecord, schedule, basicSalary, config = DEFAULT_CONFIG) {
  const result = {
    // Late arrival
    late: {
      isLate: false,
      withinGrace: false,
      lateMinutes: 0,
      deductionAmount: 0
    },
    // Early departure
    early: {
      isEarly: false,
      earlyMinutes: 0,
      deductionAmount: 0
    },
    // Totals
    totalDeductionMinutes: 0,
    totalDeductionAmount: 0,
    // Reference
    scheduled: {
      start: schedule?.shift_start || null,
      end: schedule?.shift_end || null
    },
    actual: {
      clockIn: clockRecord?.clock_in_1 || null,
      clockOut: clockRecord?.clock_out_2 || null
    }
  };

  if (!schedule) {
    return result;
  }

  // Calculate late arrival
  const lateCalc = calculateLateMinutes(
    schedule.shift_start,
    clockRecord.clock_in_1,
    config.grace_period_minutes
  );
  result.late = {
    ...lateCalc,
    deductionAmount: calculateDeductionAmount(lateCalc.lateMinutes, basicSalary, config)
  };

  // Calculate early departure
  const earlyCalc = calculateEarlyMinutes(
    schedule.shift_end,
    clockRecord.clock_out_2
  );
  result.early = {
    ...earlyCalc,
    deductionAmount: calculateDeductionAmount(earlyCalc.earlyMinutes, basicSalary, config)
  };

  // Calculate totals
  result.totalDeductionMinutes = result.late.lateMinutes + result.early.earlyMinutes;
  result.totalDeductionAmount = Math.round((result.late.deductionAmount + result.early.deductionAmount) * 100) / 100;

  return result;
}

/**
 * Calculate attendance deductions for an employee over a period
 * @param {number} employeeId - Employee ID
 * @param {number} companyId - Company ID
 * @param {Date|string} periodStart - Period start date
 * @param {Date|string} periodEnd - Period end date
 * @param {number} basicSalary - Employee's basic salary
 * @returns {Object} Total deductions and breakdown
 */
async function calculatePeriodDeductions(employeeId, companyId, periodStart, periodEnd, basicSalary) {
  // Get deduction config
  const config = await getDeductionConfig(companyId);

  // Get clock-in records with their schedules for the period
  const result = await pool.query(`
    SELECT
      cir.id, cir.work_date, cir.clock_in_1, cir.clock_out_2,
      cir.schedule_id, cir.attendance_status,
      s.shift_start, s.shift_end
    FROM clock_in_records cir
    LEFT JOIN schedules s ON cir.schedule_id = s.id
    WHERE cir.employee_id = $1
      AND cir.work_date >= $2
      AND cir.work_date <= $3
      AND cir.status = 'completed'
    ORDER BY cir.work_date
  `, [employeeId, periodStart, periodEnd]);

  const breakdown = [];
  let totalLateMinutes = 0;
  let totalEarlyMinutes = 0;
  let totalLateDeduction = 0;
  let totalEarlyDeduction = 0;
  let lateDays = 0;
  let earlyDays = 0;

  for (const record of result.rows) {
    const schedule = record.schedule_id ? {
      shift_start: record.shift_start,
      shift_end: record.shift_end
    } : null;

    const deduction = calculateRecordDeduction(record, schedule, basicSalary, config);

    if (deduction.late.isLate) {
      totalLateMinutes += deduction.late.lateMinutes;
      totalLateDeduction += deduction.late.deductionAmount;
      lateDays++;
    }

    if (deduction.early.isEarly) {
      totalEarlyMinutes += deduction.early.earlyMinutes;
      totalEarlyDeduction += deduction.early.deductionAmount;
      earlyDays++;
    }

    if (deduction.totalDeductionMinutes > 0) {
      breakdown.push({
        date: record.work_date,
        record_id: record.id,
        ...deduction
      });
    }
  }

  return {
    // Summary
    total_late_minutes: totalLateMinutes,
    total_early_minutes: totalEarlyMinutes,
    total_late_deduction: Math.round(totalLateDeduction * 100) / 100,
    total_early_deduction: Math.round(totalEarlyDeduction * 100) / 100,
    total_deduction: Math.round((totalLateDeduction + totalEarlyDeduction) * 100) / 100,

    // Counts
    late_days: lateDays,
    early_days: earlyDays,
    total_records: result.rows.length,

    // Configuration used
    config: {
      grace_period_minutes: config.grace_period_minutes,
      working_hours_per_day: config.working_hours_per_day,
      working_days_per_month: config.working_days_per_month
    },

    // Period
    period: {
      start: periodStart,
      end: periodEnd
    },

    // Daily breakdown (only days with deductions)
    breakdown
  };
}

/**
 * Get schedule for an employee on a specific date
 * @param {number} employeeId - Employee ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Object|null} Schedule object or null
 */
async function getScheduleForDate(employeeId, date) {
  const result = await pool.query(`
    SELECT id, shift_start, shift_end, break_duration
    FROM schedules
    WHERE employee_id = $1 AND schedule_date = $2 AND status = 'scheduled'
    LIMIT 1
  `, [employeeId, date]);

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Validate clock-in against schedule and return attendance status
 * This is the main function to call when an employee clocks in
 *
 * @param {number} employeeId - Employee ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {string} clockInTime - Clock-in time (HH:MM:SS)
 * @param {number} toleranceMinutes - Tolerance for wrong shift detection (default 120)
 * @returns {Object} { isValid, attendanceStatus, schedule, wrongShiftInfo }
 */
async function validateClockIn(employeeId, date, clockInTime, toleranceMinutes = 120) {
  // Get schedule for the date
  const schedule = await getScheduleForDate(employeeId, date);

  // No schedule - clock-in allowed but marked as no_schedule
  if (!schedule) {
    return {
      isValid: true,
      attendanceStatus: 'no_schedule',
      schedule: null,
      wrongShiftInfo: null,
      message: 'No schedule found for this date. Clock-in recorded as unscheduled.'
    };
  }

  // Check for wrong shift
  const wrongShiftCheck = checkWrongShift(schedule.shift_start, clockInTime, toleranceMinutes);

  if (wrongShiftCheck.isWrongShift) {
    // Wrong shift - mark as absent
    return {
      isValid: false,
      attendanceStatus: 'wrong_shift',
      schedule: {
        id: schedule.id,
        shift_start: schedule.shift_start,
        shift_end: schedule.shift_end
      },
      wrongShiftInfo: wrongShiftCheck,
      message: `Clock-in rejected. You are scheduled for ${schedule.shift_start} - ${schedule.shift_end}. ` +
               `Clocking in at ${clockInTime} is outside your assigned shift window. ` +
               `This will be marked as absent.`
    };
  }

  // Valid clock-in for correct shift
  return {
    isValid: true,
    attendanceStatus: 'present',
    schedule: {
      id: schedule.id,
      shift_start: schedule.shift_start,
      shift_end: schedule.shift_end
    },
    wrongShiftInfo: wrongShiftCheck,
    message: 'Clock-in validated successfully.'
  };
}

/**
 * Update clock-in record with wrong shift status
 * Call this after detecting wrong shift to mark the record as absent
 *
 * @param {number} recordId - Clock-in record ID
 * @param {string} reason - Reason for marking as absent
 */
async function markAsWrongShift(recordId, reason) {
  await pool.query(`
    UPDATE clock_in_records
    SET attendance_status = 'wrong_shift',
        wrong_shift_reason = $2,
        status = 'absent'
    WHERE id = $1
  `, [recordId, reason]);
}

module.exports = {
  calculateLateMinutes,
  calculateEarlyMinutes,
  calculateDeductionAmount,
  calculateRecordDeduction,
  calculatePeriodDeductions,
  getScheduleForDate,
  getDeductionConfig,
  checkWrongShift,
  validateClockIn,
  markAsWrongShift,
  timeToMinutes,
  DEFAULT_CONFIG
};
