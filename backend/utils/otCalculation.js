/**
 * OT Calculation Utility
 * Calculates overtime from clock-in records based on company/department OT rules
 *
 * Supports:
 * - AA Alive: 8 hrs work (+ 1hr break), no OT for part-time
 * - Mimix: 7.5 hrs work (+ 1hr break), OT 1.5x, PH 2.0x, OT on PH 3.0x
 *   - Minimum 1 hour OT required, rounded down to 0.5 hour increments
 *   - Part-time employees: No OT
 */

const pool = require('../db');

/**
 * Check if company requires OT approval
 * Reads from companies.payroll_settings.features.ot_requires_approval
 * @param {number} companyId - Company ID
 * @returns {Promise<boolean>} Whether OT requires approval
 */
async function getOTApprovalSetting(companyId) {
  try {
    const result = await pool.query(
      'SELECT payroll_settings FROM companies WHERE id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      return false; // Default: no approval required
    }

    const payrollSettings = result.rows[0].payroll_settings || {};
    const features = payrollSettings.features || {};

    // Return the setting, default to false if not set
    return features.ot_requires_approval === true;
  } catch (error) {
    console.error('Error getting OT approval setting:', error);
    return false; // Default to no approval on error
  }
}

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
  // 7.5 working hours + 1 hour break = 8.5 hour shift
  // OT starts after 7.5 working hours (break excluded)
  return {
    normal_hours_per_day: 7.50,
    ot_threshold_hours: 7.50,
    ot_normal_multiplier: 1.50,
    ot_weekend_multiplier: 1.50,
    ot_ph_multiplier: 3.00,
    ot_ph_after_hours_multiplier: null,
    rounding_method: '30min',
    rounding_direction: 'down',
    min_ot_hours: 1.0,  // Minimum 1 hour OT required
    includes_break: false,
    break_duration_minutes: 60  // 1 hour break
  };
}

/**
 * Get public holidays for a company in a specific month (only those with extra_pay enabled)
 */
async function getPublicHolidays(companyId, month, year) {
  const result = await pool.query(`
    SELECT date FROM public_holidays
    WHERE company_id = $1
      AND EXTRACT(MONTH FROM date) = $2
      AND EXTRACT(YEAR FROM date) = $3
      AND extra_pay = true
  `, [companyId, month, year]);

  return result.rows.map(r => r.date.toISOString().split('T')[0]);
}

/**
 * Get clock-in records for an employee in a specific period
 * IMPORTANT: Only returns records for days with a schedule
 * No schedule = no OT calculation (considered absent)
 * @param {boolean} onlyApprovedOT - If true, only count OT from records where ot_approved = true
 */
async function getClockRecords(employeeId, startDate, endDate, onlyApprovedOT = true) {
  // The table uses work_date + clock_in_1/clock_out_1 format
  // OT is pre-calculated and stored in ot_minutes column
  // Only include records where employee has a schedule (no schedule = no pay/OT)
  const result = await pool.query(`
    SELECT cr.*,
      (cr.work_date + cr.clock_in_1) as clock_in_time,
      (cr.work_date + cr.clock_out_1) as clock_out_time,
      COALESCE(cr.ot_minutes, 0) / 60.0 as pre_calculated_ot_hours,
      CASE WHEN cr.ot_approved = true THEN true ELSE false END as is_ot_approved
    FROM clock_in_records cr
    INNER JOIN schedules s ON cr.employee_id = s.employee_id
      AND cr.work_date = s.schedule_date
      AND s.status IN ('scheduled', 'completed', 'confirmed')
    WHERE cr.employee_id = $1
      AND cr.work_date >= $2::date
      AND cr.work_date <= $3::date
      AND cr.clock_in_1 IS NOT NULL
      AND cr.clock_out_1 IS NOT NULL
    ORDER BY cr.work_date
  `, [employeeId, startDate, endDate]);

  // If onlyApprovedOT is true, mark records so OT won't be counted for unapproved
  if (onlyApprovedOT) {
    return result.rows.map(r => ({
      ...r,
      count_ot: r.ot_approved === true
    }));
  }

  return result.rows.map(r => ({ ...r, count_ot: true }));
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
 * Round OT hours with minimum threshold
 * - Rounds to 0.5 hour increments
 * - Rounds down (1hr 15min = 1hr, 1hr 45min = 1.5hr)
 * - Minimum 1 hour required (less than 1 hour = 0)
 * @param {number} otHours - Raw OT hours
 * @param {number} minOtHours - Minimum OT hours required (default 1.0)
 */
function roundOTHours(otHours, minOtHours = 1.0) {
  // If less than minimum OT threshold, return 0
  if (otHours < minOtHours) {
    return 0;
  }

  // Round down to nearest 0.5 hour
  // e.g., 1.25 hours -> 1.0 hours, 1.75 hours -> 1.5 hours
  return Math.floor(otHours * 2) / 2;
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

  // OT approval requirement is now configurable per company
  // Reads from companies.payroll_settings.features.ot_requires_approval
  const otRequiresApproval = await getOTApprovalSetting(companyId);
  const clockRecords = await getClockRecords(employeeId, startDate, endDate, otRequiresApproval);

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

    // Subtract break time (default 60 minutes = 1 hour)
    const breakMinutes = rules.break_duration_minutes || 60;
    const netWorkedMinutes = Math.max(0, workedMinutes - breakMinutes);
    let workedHours = netWorkedMinutes / 60;

    // Apply rounding to worked hours
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
      ot_multiplier: 0,
      ot_approved: record.ot_approved === true,
      ot_counted: false  // Whether OT was counted for payroll
    };

    // Use pre-calculated OT from ot_minutes field if available
    // Otherwise calculate from worked hours vs threshold
    let otHours = 0;
    if (record.pre_calculated_ot_hours && record.pre_calculated_ot_hours > 0) {
      // Use pre-calculated OT from database (ot_minutes / 60)
      otHours = parseFloat(record.pre_calculated_ot_hours) || 0;
      dailyBreakdown.ot_hours = otHours;
      dailyBreakdown.raw_ot_hours = otHours;
      dailyBreakdown.ot_source = 'pre_calculated';
    } else if (workedHours > rules.ot_threshold_hours) {
      // Calculate OT from worked hours
      const rawOtHours = workedHours - rules.ot_threshold_hours;

      // Apply OT rounding: 0.5hr increments, min 1hr, round down
      const minOtHours = rules.min_ot_hours || 1.0;
      otHours = roundOTHours(rawOtHours, minOtHours);

      dailyBreakdown.ot_hours = otHours;
      dailyBreakdown.raw_ot_hours = Math.round(rawOtHours * 100) / 100;
      dailyBreakdown.ot_source = 'calculated';
    }

    // Only count OT for payroll if approved (record.count_ot flag) AND has valid OT hours
    const shouldCountOT = record.count_ot === true && otHours > 0;
    dailyBreakdown.ot_counted = shouldCountOT;

    // Assign OT type if there are valid OT hours
    if (otHours > 0) {
      if (isPublicHoliday) {
        if (rules.ot_ph_after_hours_multiplier) {
          if (shouldCountOT) otPhAfterHours += otHours;
          dailyBreakdown.ot_type = 'ph_after_hours';
          dailyBreakdown.ot_multiplier = parseFloat(rules.ot_ph_after_hours_multiplier);
        } else {
          if (shouldCountOT) otPhHours += otHours;
          dailyBreakdown.ot_type = 'ph';
          dailyBreakdown.ot_multiplier = parseFloat(rules.ot_ph_multiplier);
        }
      } else if (isWeekend) {
        if (shouldCountOT) otWeekendHours += otHours;
        dailyBreakdown.ot_type = 'weekend';
        dailyBreakdown.ot_multiplier = parseFloat(rules.ot_weekend_multiplier || rules.ot_normal_multiplier);
      } else {
        if (shouldCountOT) otNormalHours += otHours;
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
  getOTApprovalSetting,
  getPublicHolidays,
  calculateOTFromClockIn,
  calculateMonthlyOT,
  calculatePHDaysWorked,
  roundTime,
  roundOTHours
};
