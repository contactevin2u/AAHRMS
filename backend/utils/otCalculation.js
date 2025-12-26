/**
 * OT Calculation Utility
 * Calculates overtime from clock-in records based on company/department OT rules
 *
 * Supports:
 * - AA Alive Driver: 9 hrs (incl 1hr break), OT 1.0x, PH 2.0x
 * - Mimix: 8 hrs, OT 1.5x, PH 2.0x, PH after hours 3.0x
 */

const pool = require('../db');

/**
 * Get OT rules for a company/department
 * Falls back to company default if no department-specific rule exists
 */
async function getOTRules(companyId, departmentId = null) {
  // Try department-specific first, then company default
  const result = await pool.query(`
    SELECT * FROM ot_rules
    WHERE company_id = $1
      AND (department_id = $2 OR department_id IS NULL)
      AND is_active = TRUE
    ORDER BY department_id NULLS LAST
    LIMIT 1
  `, [companyId, departmentId]);

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Default rules if none configured
  return {
    normal_hours_per_day: 8.00,
    ot_threshold_hours: 8.00,
    ot_normal_multiplier: 1.50,
    ot_weekend_multiplier: 1.50,
    ot_ph_multiplier: 2.00,
    ot_ph_after_hours_multiplier: null,
    rounding_method: 'minute',
    rounding_direction: 'nearest',
    includes_break: false,
    break_duration_minutes: 0
  };
}

/**
 * Get public holidays for a company in a specific month
 */
async function getPublicHolidays(companyId, month, year) {
  const result = await pool.query(`
    SELECT date FROM public_holidays
    WHERE company_id = $1
      AND EXTRACT(MONTH FROM date) = $2
      AND EXTRACT(YEAR FROM date) = $3
  `, [companyId, month, year]);

  return result.rows.map(r => r.date.toISOString().split('T')[0]);
}

/**
 * Get clock-in records for an employee in a specific period
 */
async function getClockRecords(employeeId, startDate, endDate) {
  const result = await pool.query(`
    SELECT * FROM clock_in_records
    WHERE employee_id = $1
      AND clock_in_time >= $2
      AND clock_in_time <= $3
      AND status IN ('clocked_out', 'approved')
    ORDER BY clock_in_time
  `, [employeeId, startDate, endDate]);

  return result.rows;
}

/**
 * Round time based on rounding method
 * @param {number} hours - Hours to round
 * @param {string} method - 'minute', '15min', '30min', 'hour'
 * @param {string} direction - 'up', 'down', 'nearest'
 */
function roundTime(hours, method = 'minute', direction = 'nearest') {
  let multiplier;
  switch (method) {
    case 'minute': multiplier = 60; break;
    case '15min': multiplier = 4; break;
    case '30min': multiplier = 2; break;
    case 'hour': multiplier = 1; break;
    default: multiplier = 60;
  }

  const value = hours * multiplier;
  let rounded;

  switch (direction) {
    case 'up': rounded = Math.ceil(value); break;
    case 'down': rounded = Math.floor(value); break;
    case 'nearest':
    default: rounded = Math.round(value);
  }

  return rounded / multiplier;
}

/**
 * Calculate OT from clock-in records for a specific period
 *
 * @param {number} employeeId - Employee ID
 * @param {number} companyId - Company ID
 * @param {number} departmentId - Department ID (optional)
 * @param {Date|string} periodStart - Period start date
 * @param {Date|string} periodEnd - Period end date
 * @param {number} basicSalary - Employee's basic salary (for amount calculation)
 * @returns {Object} OT calculation result
 */
async function calculateOTFromClockIn(employeeId, companyId, departmentId, periodStart, periodEnd, basicSalary) {
  // Get OT rules
  const rules = await getOTRules(companyId, departmentId);

  // Get clock-in records for the period
  const startDate = new Date(periodStart);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(periodEnd);
  endDate.setHours(23, 59, 59, 999);

  const clockRecords = await getClockRecords(employeeId, startDate, endDate);

  // Get public holidays
  const phDates = new Set();

  // Get all months in the period
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const monthHolidays = await getPublicHolidays(
      companyId,
      currentDate.getMonth() + 1,
      currentDate.getFullYear()
    );
    monthHolidays.forEach(h => phDates.add(h));
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  // Calculate OT for each day
  let otNormalHours = 0;
  let otWeekendHours = 0;
  let otPhHours = 0;
  let otPhAfterHours = 0;
  let totalWorkedHours = 0;
  let totalWorkDays = 0;
  const breakdown = [];

  for (const record of clockRecords) {
    if (!record.clock_out_time) continue;

    const clockIn = new Date(record.clock_in_time);
    const clockOut = new Date(record.clock_out_time);

    // Calculate worked hours in minutes for precision
    const workedMinutes = (clockOut - clockIn) / (1000 * 60);
    let workedHours = workedMinutes / 60;

    // Apply rounding
    workedHours = roundTime(workedHours, rules.rounding_method, rules.rounding_direction);

    totalWorkedHours += workedHours;
    totalWorkDays++;

    const dateStr = clockIn.toISOString().split('T')[0];
    const dayOfWeek = clockIn.getDay(); // 0 = Sunday, 6 = Saturday
    const isPublicHoliday = phDates.has(dateStr);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const dailyBreakdown = {
      date: dateStr,
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
      clock_in: clockIn.toISOString(),
      clock_out: clockOut.toISOString(),
      worked_hours: workedHours,
      is_ph: isPublicHoliday,
      is_weekend: isWeekend,
      ot_hours: 0,
      ot_type: null,
      ot_multiplier: 0
    };

    // Calculate OT if worked more than threshold
    if (workedHours > rules.ot_threshold_hours) {
      const otHours = roundTime(
        workedHours - rules.ot_threshold_hours,
        rules.rounding_method,
        rules.rounding_direction
      );

      dailyBreakdown.ot_hours = otHours;

      if (isPublicHoliday) {
        if (rules.ot_ph_after_hours_multiplier) {
          // Mimix logic: PH work within normal hours = 2.0x, after hours = 3.0x
          // For simplicity, we consider all OT hours as "after normal hours"
          otPhAfterHours += otHours;
          dailyBreakdown.ot_type = 'ph_after_hours';
          dailyBreakdown.ot_multiplier = parseFloat(rules.ot_ph_after_hours_multiplier);
        } else {
          // AA Alive logic: all PH OT at 2.0x
          otPhHours += otHours;
          dailyBreakdown.ot_type = 'ph';
          dailyBreakdown.ot_multiplier = parseFloat(rules.ot_ph_multiplier);
        }
      } else if (isWeekend) {
        otWeekendHours += otHours;
        dailyBreakdown.ot_type = 'weekend';
        dailyBreakdown.ot_multiplier = parseFloat(rules.ot_weekend_multiplier || rules.ot_normal_multiplier);
      } else {
        otNormalHours += otHours;
        dailyBreakdown.ot_type = 'normal';
        dailyBreakdown.ot_multiplier = parseFloat(rules.ot_normal_multiplier);
      }
    }

    // For PH: also count normal hours worked as PH pay (separate from OT)
    if (isPublicHoliday && workedHours > 0) {
      dailyBreakdown.ph_normal_hours = Math.min(workedHours, rules.ot_threshold_hours);
    }

    breakdown.push(dailyBreakdown);
  }

  // Calculate OT amount
  const workingDaysPerMonth = 22;
  const dailyRate = basicSalary / workingDaysPerMonth;
  const hourlyRate = dailyRate / rules.normal_hours_per_day;

  const otNormalAmount = otNormalHours * hourlyRate * parseFloat(rules.ot_normal_multiplier);
  const otWeekendAmount = otWeekendHours * hourlyRate * parseFloat(rules.ot_weekend_multiplier || rules.ot_normal_multiplier);
  const otPhAmount = otPhHours * hourlyRate * parseFloat(rules.ot_ph_multiplier);
  const otPhAfterAmount = otPhAfterHours * hourlyRate * parseFloat(rules.ot_ph_after_hours_multiplier || rules.ot_ph_multiplier);

  const totalOtHours = otNormalHours + otWeekendHours + otPhHours + otPhAfterHours;
  const totalOtAmount = otNormalAmount + otWeekendAmount + otPhAmount + otPhAfterAmount;

  return {
    // Summary
    total_ot_hours: Math.round(totalOtHours * 100) / 100,
    total_ot_amount: Math.round(totalOtAmount * 100) / 100,

    // Breakdown by type
    ot_normal: {
      hours: Math.round(otNormalHours * 100) / 100,
      multiplier: parseFloat(rules.ot_normal_multiplier),
      amount: Math.round(otNormalAmount * 100) / 100
    },
    ot_weekend: {
      hours: Math.round(otWeekendHours * 100) / 100,
      multiplier: parseFloat(rules.ot_weekend_multiplier || rules.ot_normal_multiplier),
      amount: Math.round(otWeekendAmount * 100) / 100
    },
    ot_ph: {
      hours: Math.round(otPhHours * 100) / 100,
      multiplier: parseFloat(rules.ot_ph_multiplier),
      amount: Math.round(otPhAmount * 100) / 100
    },
    ot_ph_after_hours: {
      hours: Math.round(otPhAfterHours * 100) / 100,
      multiplier: parseFloat(rules.ot_ph_after_hours_multiplier || 0),
      amount: Math.round(otPhAfterAmount * 100) / 100
    },

    // Work summary
    total_worked_hours: Math.round(totalWorkedHours * 100) / 100,
    total_work_days: totalWorkDays,

    // Calculation basis
    hourly_rate: Math.round(hourlyRate * 100) / 100,
    daily_rate: Math.round(dailyRate * 100) / 100,
    basic_salary: basicSalary,

    // Rules used
    rules: {
      normal_hours_per_day: parseFloat(rules.normal_hours_per_day),
      ot_threshold_hours: parseFloat(rules.ot_threshold_hours),
      rounding_method: rules.rounding_method
    },

    // Period
    period: {
      start: periodStart,
      end: periodEnd
    },

    // Daily breakdown
    breakdown
  };
}

/**
 * Calculate OT for a specific month (convenience wrapper)
 */
async function calculateMonthlyOT(employeeId, companyId, departmentId, month, year, basicSalary) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  return calculateOTFromClockIn(
    employeeId,
    companyId,
    departmentId,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0],
    basicSalary
  );
}

/**
 * Calculate PH days worked (for extra PH pay calculation)
 */
async function calculatePHDaysWorked(employeeId, companyId, periodStart, periodEnd) {
  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);

  // Get public holidays
  const phDates = new Set();
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const monthHolidays = await getPublicHolidays(
      companyId,
      currentDate.getMonth() + 1,
      currentDate.getFullYear()
    );
    monthHolidays.forEach(h => phDates.add(h));
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  // Get clock-in records
  const clockRecords = await getClockRecords(employeeId, startDate, endDate);

  let phDaysWorked = 0;
  for (const record of clockRecords) {
    if (!record.clock_in_time) continue;
    const dateStr = new Date(record.clock_in_time).toISOString().split('T')[0];
    if (phDates.has(dateStr)) {
      phDaysWorked++;
    }
  }

  return phDaysWorked;
}

module.exports = {
  getOTRules,
  getPublicHolidays,
  calculateOTFromClockIn,
  calculateMonthlyOT,
  calculatePHDaysWorked,
  roundTime
};
