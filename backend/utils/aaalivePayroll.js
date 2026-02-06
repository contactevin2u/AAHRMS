/**
 * AA Alive Payroll Calculation Utility
 *
 * AA Alive (company_id=1) has different rules from Mimix:
 *
 * DRIVERS:
 * - Basic salary covers 22 standard working days/month
 * - Daily OT: Extra hours beyond 9hrs/day at basic/26/8 × 1.0 per hour
 * - Monthly OT (Extra Days): Days worked beyond 22 at basic/26 per extra day
 * - PH: 1.0x (no extra multiplier - same rate as normal OT)
 * - Upsell commission (synced from OrderOps + manual)
 * - Order commission (synced from OrderOps + manual)
 * - Trip allowance (RM100/day for outstation)
 * - Statutory base: Basic + Commission only
 *
 * OFFICE STAFF:
 * - Basic + Allowance + Commission (manual entry)
 * - Statutory base: Basic + Commission only
 */

const pool = require('../db');

const AA_ALIVE_COMPANY_ID = 1;
const STANDARD_WORK_DAYS = 22;
const OT_RATE_DIVISOR_DAYS = 26;
const OT_RATE_DIVISOR_HOURS = 8;
const WORK_HOURS_PER_DAY = 9; // 8 work + 1 break
const DEFAULT_TRIP_ALLOWANCE_PER_DAY = 100;

/**
 * Get AA Alive config from company payroll_config
 */
async function getAAAliveConfig(companyId = AA_ALIVE_COMPANY_ID) {
  const result = await pool.query(
    'SELECT payroll_config FROM companies WHERE id = $1',
    [companyId]
  );
  const config = result.rows[0]?.payroll_config || {};
  return {
    standardWorkDays: config.standard_work_days || STANDARD_WORK_DAYS,
    otRateDivisorDays: config.ot_rate_divisor_days || OT_RATE_DIVISOR_DAYS,
    otRateDivisorHours: config.ot_rate_divisor_hours || OT_RATE_DIVISOR_HOURS,
    workHoursPerDay: config.work_hours_per_day || WORK_HOURS_PER_DAY,
    tripAllowancePerDay: config.trip_allowance_per_day || DEFAULT_TRIP_ALLOWANCE_PER_DAY
  };
}

/**
 * Calculate driver daily OT from clock-in records.
 * Extra hours beyond 9hrs/day (includes 1hr break) at basic/26/8 per hour.
 *
 * @param {Array} clockRecords - Clock-in records with total_work_minutes or clock times
 * @param {number} basicSalary - Employee basic salary
 * @param {Object} config - AA Alive config overrides
 * @returns {Object} { totalOTHours, totalOTAmount, hourlyRate, breakdown }
 */
function calculateDriverDailyOT(clockRecords, basicSalary, config = {}) {
  const divisorDays = config.otRateDivisorDays || OT_RATE_DIVISOR_DAYS;
  const divisorHours = config.otRateDivisorHours || OT_RATE_DIVISOR_HOURS;
  const thresholdMinutes = (config.workHoursPerDay || WORK_HOURS_PER_DAY) * 60; // 9 hours = 540 minutes

  const hourlyRate = basicSalary / divisorDays / divisorHours;
  let totalOTHours = 0;
  const breakdown = [];

  for (const record of clockRecords) {
    const totalMinutes = parseFloat(record.total_work_minutes) || 0;
    if (totalMinutes <= thresholdMinutes) {
      breakdown.push({
        date: record.work_date,
        total_minutes: totalMinutes,
        ot_minutes: 0,
        ot_hours: 0,
        ot_amount: 0
      });
      continue;
    }

    const otMinutes = totalMinutes - thresholdMinutes;
    // Round down to nearest 0.5 hour
    const otHours = Math.floor((otMinutes / 60) * 2) / 2;

    totalOTHours += otHours;
    breakdown.push({
      date: record.work_date,
      total_minutes: totalMinutes,
      ot_minutes: otMinutes,
      ot_hours: otHours,
      ot_amount: Math.round(otHours * hourlyRate * 100) / 100
    });
  }

  return {
    totalOTHours: Math.round(totalOTHours * 100) / 100,
    totalOTAmount: Math.round(totalOTHours * hourlyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    breakdown
  };
}

/**
 * Calculate driver monthly OT (extra days beyond standard 22 days).
 * Rate = basic/26 per extra day.
 *
 * @param {number} totalWorkDays - Total days worked in the month
 * @param {number} basicSalary - Employee basic salary
 * @param {Object} config - AA Alive config overrides
 * @returns {Object} { extraDays, dailyRate, totalAmount }
 */
function calculateDriverMonthlyOT(totalWorkDays, basicSalary, config = {}) {
  const standardDays = config.standardWorkDays || STANDARD_WORK_DAYS;
  const divisorDays = config.otRateDivisorDays || OT_RATE_DIVISOR_DAYS;

  const extraDays = Math.max(0, totalWorkDays - standardDays);
  const dailyRate = basicSalary / divisorDays;
  const totalAmount = Math.round(extraDays * dailyRate * 100) / 100;

  return {
    extraDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    totalAmount
  };
}

/**
 * Get driver commissions from driver_commissions table.
 *
 * @param {number} employeeId - Employee ID
 * @param {number} month - Period month
 * @param {number} year - Period year
 * @returns {Object} { orderCommission, upsellCommission, orderCount }
 */
async function getDriverCommissions(employeeId, month, year) {
  const result = await pool.query(`
    SELECT commission_type, amount, order_count
    FROM driver_commissions
    WHERE employee_id = $1 AND period_month = $2 AND period_year = $3
  `, [employeeId, month, year]);

  let orderCommission = 0;
  let upsellCommission = 0;
  let orderCount = 0;

  for (const row of result.rows) {
    if (row.commission_type === 'order') {
      orderCommission = parseFloat(row.amount) || 0;
      orderCount = parseInt(row.order_count) || 0;
    } else if (row.commission_type === 'upsell') {
      upsellCommission = parseFloat(row.amount) || 0;
    }
  }

  return { orderCommission, upsellCommission, orderCount };
}

/**
 * Calculate trip allowance from outstation days in clock_in_records.
 *
 * @param {number} employeeId - Employee ID
 * @param {string} periodStart - Period start date (YYYY-MM-DD)
 * @param {string} periodEnd - Period end date (YYYY-MM-DD)
 * @param {number} ratePerDay - Allowance per outstation day (default RM100)
 * @returns {Object} { outstationDays, ratePerDay, totalAmount }
 */
async function calculateTripAllowance(employeeId, periodStart, periodEnd, ratePerDay = DEFAULT_TRIP_ALLOWANCE_PER_DAY) {
  const result = await pool.query(`
    SELECT COUNT(*) as outstation_days
    FROM clock_in_records
    WHERE employee_id = $1
      AND work_date >= $2::date
      AND work_date <= $3::date
      AND is_outstation = TRUE
  `, [employeeId, periodStart, periodEnd]);

  const outstationDays = parseInt(result.rows[0]?.outstation_days) || 0;

  return {
    outstationDays,
    ratePerDay,
    totalAmount: Math.round(outstationDays * ratePerDay * 100) / 100
  };
}

/**
 * Get clock-in records for an AA Alive employee.
 * Unlike Mimix, AA Alive does NOT require schedules - just clock records.
 *
 * @param {number} employeeId - Employee ID
 * @param {string} periodStart - Period start date
 * @param {string} periodEnd - Period end date
 * @returns {Array} Clock-in records with work minutes
 */
async function getAAAliveClockRecords(employeeId, periodStart, periodEnd) {
  const result = await pool.query(`
    SELECT
      work_date,
      clock_in_1, clock_out_1,
      COALESCE(total_work_minutes, 0) as total_work_minutes,
      COALESCE(ot_minutes, 0) as ot_minutes,
      is_outstation,
      status
    FROM clock_in_records
    WHERE employee_id = $1
      AND work_date >= $2::date
      AND work_date <= $3::date
      AND clock_in_1 IS NOT NULL
      AND clock_out_1 IS NOT NULL
    ORDER BY work_date
  `, [employeeId, periodStart, periodEnd]);

  return result.rows;
}

/**
 * Count total work days for an AA Alive employee from clock-in records.
 * AA Alive counts all days with completed clock records (no schedule required).
 */
async function countWorkDays(employeeId, periodStart, periodEnd) {
  const result = await pool.query(`
    SELECT COUNT(DISTINCT work_date) as days_worked
    FROM clock_in_records
    WHERE employee_id = $1
      AND work_date >= $2::date
      AND work_date <= $3::date
      AND clock_in_1 IS NOT NULL
      AND clock_out_1 IS NOT NULL
  `, [employeeId, periodStart, periodEnd]);

  return parseInt(result.rows[0]?.days_worked) || 0;
}

/**
 * Get employee role type (driver/office).
 * Checks employees.role_type first, then falls back to department name check.
 */
async function getEmployeeRoleType(employee) {
  if (employee.role_type) return employee.role_type;

  const deptName = (employee.department_name || '').toLowerCase();
  if (deptName.includes('driver')) return 'driver';

  const position = (employee.position || '').toLowerCase();
  if (position.includes('driver')) return 'driver';

  return 'office';
}

/**
 * Full driver payroll calculation for AA Alive.
 *
 * @param {Object} employee - Employee record
 * @param {number} basicSalary - Basic salary
 * @param {string} periodStart - Period start date
 * @param {string} periodEnd - Period end date
 * @param {number} month - Payroll month
 * @param {number} year - Payroll year
 * @param {Object} config - AA Alive config
 * @returns {Object} Full driver payroll breakdown
 */
async function calculateDriverPayroll(employee, basicSalary, periodStart, periodEnd, month, year, config) {
  // Get clock records
  const clockRecords = await getAAAliveClockRecords(employee.id, periodStart, periodEnd);

  // Count work days
  const totalWorkDays = clockRecords.length;

  // Daily OT: extra hours beyond 9hrs/day
  const dailyOT = calculateDriverDailyOT(clockRecords, basicSalary, config);

  // Monthly OT: extra days beyond 22
  const monthlyOT = calculateDriverMonthlyOT(totalWorkDays, basicSalary, config);

  // Commissions from driver_commissions table
  const commissions = await getDriverCommissions(employee.id, month, year);

  // Trip allowance from outstation days
  const tripAllowance = await calculateTripAllowance(
    employee.id, periodStart, periodEnd, config.tripAllowancePerDay
  );

  // Also include flexible commissions/allowances if any
  const totalOrderCommission = commissions.orderCommission;
  const totalUpsellCommission = commissions.upsellCommission;
  const totalTripAllowance = tripAllowance.totalAmount;

  // Gross = basic + daily_ot + monthly_ot + upsell_commission + order_commission + trip_allowance
  const grossSalary = basicSalary +
    dailyOT.totalOTAmount +
    monthlyOT.totalAmount +
    totalUpsellCommission +
    totalOrderCommission +
    totalTripAllowance;

  // Statutory base = basic + commission only (NOT OT, NOT trip allowance)
  const statutoryBase = basicSalary + totalOrderCommission + totalUpsellCommission;

  return {
    totalWorkDays,
    dailyOT,
    monthlyOT,
    commissions: {
      order: totalOrderCommission,
      upsell: totalUpsellCommission,
      orderCount: commissions.orderCount
    },
    tripAllowance: {
      days: tripAllowance.outstationDays,
      ratePerDay: tripAllowance.ratePerDay,
      total: totalTripAllowance
    },
    grossSalary: Math.round(grossSalary * 100) / 100,
    statutoryBase: Math.round(statutoryBase * 100) / 100
  };
}

/**
 * Full office staff payroll calculation for AA Alive.
 * Simple: basic + allowance + commission
 *
 * @param {Object} employee - Employee record
 * @param {number} basicSalary - Basic salary
 * @param {number} fixedAllowance - Fixed allowance
 * @param {number} commissionAmount - Commission from flexible commissions
 * @returns {Object} Office staff payroll breakdown
 */
function calculateOfficeStaffPayroll(employee, basicSalary, fixedAllowance, commissionAmount) {
  const grossSalary = basicSalary + fixedAllowance + commissionAmount;
  // Statutory base = basic + commission only (NOT allowance)
  const statutoryBase = basicSalary + commissionAmount;

  return {
    grossSalary: Math.round(grossSalary * 100) / 100,
    statutoryBase: Math.round(statutoryBase * 100) / 100
  };
}

module.exports = {
  AA_ALIVE_COMPANY_ID,
  STANDARD_WORK_DAYS,
  OT_RATE_DIVISOR_DAYS,
  OT_RATE_DIVISOR_HOURS,
  WORK_HOURS_PER_DAY,
  getAAAliveConfig,
  calculateDriverDailyOT,
  calculateDriverMonthlyOT,
  getDriverCommissions,
  calculateTripAllowance,
  getAAAliveClockRecords,
  countWorkDays,
  getEmployeeRoleType,
  calculateDriverPayroll,
  calculateOfficeStaffPayroll
};
