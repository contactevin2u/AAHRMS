/**
 * =============================================================================
 * UNIFIED PAYROLL ENGINE
 * =============================================================================
 *
 * Single payroll system combining V1 + V2 features with company configuration.
 *
 * ARCHITECTURE:
 * - payroll_runs: Batch container for a payroll period
 * - payroll_items: Individual employee payroll records within a run
 *
 * CONFIGURABLE FEATURES (per company via payroll_settings):
 * - Auto OT calculation from clock-in records
 * - Auto PH pay calculation
 * - Auto claims linking on finalization
 * - Unpaid leave deduction
 * - Salary carry-forward from previous month
 * - Flexible commissions/allowances from employee settings
 * - Indoor Sales logic (basic vs commission comparison)
 * - YTD PCB calculation (LHDN computerized method)
 * - Approval workflow
 *
 * WORKFLOW:
 * 1. Create payroll run (draft)
 * 2. Auto-generate items for all/selected employees
 * 3. Manual adjustments if needed
 * 4. Review variances
 * 5. Finalize (locks the run)
 *
 * =============================================================================
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { calculateAllStatutory, getPublicHolidaysInMonth } = require('../utils/statutory');
const { calculateOTFromClockIn, calculatePHDaysWorked } = require('../utils/otCalculation');

// =============================================================================
// DEFAULT SETTINGS (used if company has no payroll_settings)
// =============================================================================
const DEFAULT_PAYROLL_SETTINGS = {
  features: {
    auto_ot_from_clockin: true,
    auto_ph_pay: true,
    auto_claims_linking: true,
    unpaid_leave_deduction: true,
    salary_carry_forward: true,
    flexible_commissions: true,
    flexible_allowances: true,
    indoor_sales_logic: false,
    ytd_pcb_calculation: true,
    require_approval: false,
    variance_threshold: 5,      // Default 5% variance threshold for warnings
    ot_requires_approval: false // Whether OT needs supervisor approval (Mimix = true)
  },
  rates: {
    ot_multiplier: 1.0,
    ph_multiplier: 1.0,
    indoor_sales_basic: 4000,
    indoor_sales_commission_rate: 6,
    standard_work_hours: 8,
    standard_work_days: 22
  },
  period: {
    type: 'calendar_month',
    start_day: 1,
    end_day: 0,
    payment_day: 5,
    payment_month_offset: 1
  },
  statutory: {
    epf_enabled: true,
    socso_enabled: true,
    eis_enabled: true,
    pcb_enabled: true,
    statutory_on_ot: false,
    statutory_on_ph_pay: false,
    statutory_on_allowance: false,
    statutory_on_incentive: false
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get company payroll settings with defaults
 */
async function getCompanySettings(companyId) {
  const result = await pool.query(
    'SELECT payroll_settings, settings, grouping_type, payroll_config FROM companies WHERE id = $1',
    [companyId]
  );

  if (result.rows.length === 0) {
    return DEFAULT_PAYROLL_SETTINGS;
  }

  const payrollSettings = result.rows[0].payroll_settings || {};
  const legacySettings = result.rows[0].settings || {};
  const groupingType = result.rows[0].grouping_type;
  const payrollConfig = result.rows[0].payroll_config || {};

  // Merge with defaults — payroll_config takes highest priority
  return {
    features: { ...DEFAULT_PAYROLL_SETTINGS.features, ...payrollSettings.features,
      ot_requires_approval: payrollConfig.ot_requires_approval ?? payrollSettings.features?.ot_requires_approval ?? false
    },
    rates: {
      ...DEFAULT_PAYROLL_SETTINGS.rates,
      ...payrollSettings.rates,
      // Legacy settings override, then payroll_config overrides everything
      indoor_sales_basic: payrollConfig.indoor_sales_basic ?? legacySettings.indoor_sales_basic ?? payrollSettings.rates?.indoor_sales_basic ?? 4000,
      indoor_sales_commission_rate: payrollConfig.indoor_sales_commission_rate ?? legacySettings.indoor_sales_commission_rate ?? payrollSettings.rates?.indoor_sales_commission_rate ?? 6,
      standard_work_hours: payrollConfig.work_hours_per_day ?? payrollSettings.rates?.standard_work_hours ?? 8,
      standard_work_days: payrollConfig.work_days_per_month ?? payrollSettings.rates?.standard_work_days ?? 22,
      part_time_hourly_rate: payrollConfig.part_time_hourly_rate ?? 8.72,
      part_time_ph_multiplier: payrollConfig.part_time_ph_multiplier ?? 2.0,
      outstation_per_day: payrollConfig.outstation_per_day ?? 100,
      outstation_min_distance_km: payrollConfig.outstation_min_distance_km ?? 180
    },
    period: { ...DEFAULT_PAYROLL_SETTINGS.period, ...payrollSettings.period },
    statutory: { ...DEFAULT_PAYROLL_SETTINGS.statutory, ...payrollSettings.statutory,
      statutory_on_allowance: payrollConfig.statutory_on_allowance ?? payrollSettings.statutory?.statutory_on_allowance ?? false,
      statutory_on_ot: payrollConfig.statutory_on_ot ?? payrollSettings.statutory?.statutory_on_ot ?? false,
      statutory_on_ph_pay: payrollConfig.statutory_on_ph_pay ?? payrollSettings.statutory?.statutory_on_ph_pay ?? false,
      statutory_on_incentive: payrollConfig.statutory_on_incentive ?? payrollSettings.statutory?.statutory_on_incentive ?? false,
      statutory_on_commission: payrollConfig.statutory_on_commission ?? true
    },
    groupingType // 'department' or 'outlet'
  };
}

/**
 * Part-time hourly rate defaults (RM) - overridden by payroll_config
 */
const PART_TIME_HOURLY_RATE = 8.72;
const PART_TIME_PH_MULTIPLIER = 2.0; // Public holiday rate is 2x

/**
 * Get total work hours for part-time employee from clock-in records
 * Separates normal hours and PH hours for different rates
 * IMPORTANT: Only counts hours from days where employee has a schedule
 * No schedule = no pay (even if they clocked in)
 * Returns: { totalMinutes, totalHours, normalHours, phHours, grossSalary, normalPay, phPay }
 * @param {object} ratesOverride - optional { part_time_hourly_rate, part_time_ph_multiplier } from company config
 */
async function calculatePartTimeHours(employeeId, periodStart, periodEnd, companyId, ratesOverride = {}) {
  // Get clock-in records ONLY for days with a schedule
  // No schedule = no pay (considered absent even if clocked in)
  const result = await pool.query(`
    SELECT cr.work_date, COALESCE(cr.total_work_minutes, 0) as total_minutes
    FROM clock_in_records cr
    INNER JOIN schedules s ON cr.employee_id = s.employee_id
      AND cr.work_date = s.schedule_date
      AND s.status IN ('scheduled', 'completed', 'confirmed')
    WHERE cr.employee_id = $1
      AND cr.work_date BETWEEN $2 AND $3
      AND cr.status = 'completed'
  `, [employeeId, periodStart, periodEnd]);

  // Get public holidays for the period (only those with extra_pay enabled)
  const phResult = await pool.query(`
    SELECT date FROM public_holidays
    WHERE company_id = $1
      AND date BETWEEN $2 AND $3
      AND extra_pay = true
  `, [companyId, periodStart, periodEnd]);

  const phDates = new Set(phResult.rows.map(r => r.date.toISOString().split('T')[0]));

  let normalMinutes = 0;
  let phMinutes = 0;

  for (const record of result.rows) {
    const dateStr = record.work_date.toISOString().split('T')[0];
    const minutes = parseFloat(record.total_minutes) || 0;

    if (phDates.has(dateStr)) {
      phMinutes += minutes;
    } else {
      normalMinutes += minutes;
    }
  }

  const totalMinutes = normalMinutes + phMinutes;

  // Round down to nearest 0.5 hours (same as OT rounding)
  const normalHours = Math.floor((normalMinutes / 60) * 2) / 2;
  const phHours = Math.floor((phMinutes / 60) * 2) / 2;
  const totalHours = normalHours + phHours;

  // Calculate pay: normal rate for normal days, 2x rate for PH
  const hourlyRate = ratesOverride.part_time_hourly_rate ?? PART_TIME_HOURLY_RATE;
  const phMultiplier = ratesOverride.part_time_ph_multiplier ?? PART_TIME_PH_MULTIPLIER;
  const normalPay = Math.round(normalHours * hourlyRate * 100) / 100;
  const phPay = Math.round(phHours * hourlyRate * phMultiplier * 100) / 100;
  const grossSalary = Math.round((normalPay + phPay) * 100) / 100;

  return {
    totalMinutes,
    totalHours,
    normalHours,
    phHours,
    normalPay,
    phPay,
    grossSalary
  };
}

/**
 * Calculate schedule-based payable days for outlet companies (Mimix)
 * Returns: { scheduledDays, attendedDays, payableDays, absentDays, lateDays }
 * Late = clock_in_1 > shift_start (comparing time only)
 */
async function calculateScheduleBasedPay(employeeId, periodStart, periodEnd) {
  // Get all schedules for the period with attendance data
  const result = await pool.query(`
    SELECT
      s.schedule_date,
      s.status as schedule_status,
      s.shift_start,
      cr.clock_in_1,
      cr.clock_out_1,
      cr.clock_in_2,
      cr.clock_out_2,
      cr.total_work_hours,
      CASE
        WHEN cr.clock_out_2 IS NOT NULL OR cr.clock_out_1 IS NOT NULL THEN true
        ELSE false
      END as attended
    FROM schedules s
    LEFT JOIN clock_in_records cr
      ON s.employee_id = cr.employee_id
      AND s.schedule_date = cr.work_date
    WHERE s.employee_id = $1
      AND s.schedule_date BETWEEN $2 AND $3
      AND s.status IN ('scheduled', 'completed', 'confirmed')
    ORDER BY s.schedule_date
  `, [employeeId, periodStart, periodEnd]);

  const scheduledDays = result.rows.length;
  const attendedDays = result.rows.filter(r => r.attended).length;

  // Count late days: attended but clock_in_1 > shift_start
  let lateDays = 0;
  // Calculate short hours: attended but worked less than 8 hours
  let shortHours = 0;
  const expectedHoursPerDay = 8;

  for (const row of result.rows) {
    if (row.attended) {
      // Check for late
      if (row.clock_in_1 && row.shift_start) {
        // Both clock_in_1 and shift_start are TIME types (strings like "HH:MM:SS")
        const clockInParts = row.clock_in_1.split(':');
        const clockInMinutes = parseInt(clockInParts[0]) * 60 + parseInt(clockInParts[1]);

        const shiftParts = row.shift_start.split(':');
        const shiftMinutes = parseInt(shiftParts[0]) * 60 + parseInt(shiftParts[1]);

        if (clockInMinutes > shiftMinutes) {
          lateDays++;
        }
      }

      // Check for short hours (worked less than expected)
      if (row.total_work_hours !== null && row.total_work_hours !== undefined) {
        const hoursWorked = parseFloat(row.total_work_hours) || 0;
        // Only count base hours (cap at expected hours, OT doesn't count)
        const baseHours = Math.min(hoursWorked, expectedHoursPerDay);
        const deficit = expectedHoursPerDay - baseHours;
        if (deficit > 0) {
          shortHours += deficit;
        }
      }
    }
  }

  // Round short hours to 2 decimal places
  shortHours = Math.round(shortHours * 100) / 100;

  // Payable days = scheduled AND attended
  // Or if schedule marked as 'completed' (for approved absences)
  const payableDays = result.rows.filter(r =>
    r.attended || r.schedule_status === 'completed'
  ).length;

  return {
    scheduledDays,
    attendedDays,
    payableDays,
    absentDays: scheduledDays - payableDays,
    lateDays,
    shortHours
  };
}

/**
 * Calculate Mimix attendance bonus based on late/absent days
 * Rules:
 * - RM 400: Full month (26 days work, no late, no absent/MC)
 * - RM 300: 1 day late OR absent/MC
 * - RM 200: 2 days late OR absent/MC
 * - RM 100: 3 days late OR absent/MC
 * - RM 0: 4+ days late OR absent/MC
 *
 * "Late OR absent/MC" means total count of (lateDays + absentDays)
 */
function calculateMimixAttendanceBonus(lateDays, absentDays) {
  const totalPenaltyDays = lateDays + absentDays;

  if (totalPenaltyDays === 0) return 400;
  if (totalPenaltyDays === 1) return 300;
  if (totalPenaltyDays === 2) return 200;
  if (totalPenaltyDays === 3) return 100;
  return 0; // 4 or more days
}

/**
 * Get working days in a month (excluding weekends)
 */
function getWorkingDaysInMonth(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  let workingDays = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      workingDays++;
    }
  }

  return workingDays;
}

/**
 * Get payroll period dates based on configuration
 */
function getPayrollPeriod(month, year, periodConfig) {
  let periodStart, periodEnd, periodLabel;

  switch (periodConfig.type) {
    case 'mid_month':
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      periodStart = new Date(prevYear, prevMonth - 1, periodConfig.start_day);
      periodEnd = new Date(year, month - 1, periodConfig.end_day || 14);
      periodLabel = `${getMonthName(prevMonth)} ${periodConfig.start_day} - ${getMonthName(month)} ${periodConfig.end_day || 14}, ${year}`;
      break;

    case 'calendar_month':
    default:
      periodStart = new Date(year, month - 1, 1);
      periodEnd = new Date(year, month, 0);
      periodLabel = `${getMonthName(month)} ${year}`;
      break;
  }

  // Payment date
  let payMonth = month + (periodConfig.payment_month_offset || 0);
  let payYear = year;
  if (payMonth > 12) {
    payMonth -= 12;
    payYear += 1;
  }
  const paymentDate = new Date(payYear, payMonth - 1, periodConfig.payment_day);

  return { start: periodStart, end: periodEnd, label: periodLabel, paymentDate };
}

function getMonthName(month) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || '';
}

/**
 * Get YTD data for an employee (for accurate PCB calculation)
 */
async function getYTDData(employeeId, year, beforeMonth) {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(pi.gross_salary), 0) as ytd_gross,
      COALESCE(SUM(pi.epf_employee), 0) as ytd_epf,
      COALESCE(SUM(pi.pcb), 0) as ytd_pcb,
      COALESCE(SUM(pi.statutory_base), 0) as ytd_taxable
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pi.employee_id = $1
      AND pr.year = $2
      AND pr.month < $3
      AND pr.status = 'finalized'
  `, [employeeId, year, beforeMonth]);

  return {
    ytdGross: parseFloat(result.rows[0]?.ytd_gross || 0),
    ytdEPF: parseFloat(result.rows[0]?.ytd_epf || 0),
    ytdPCB: parseFloat(result.rows[0]?.ytd_pcb || 0),
    ytdTaxable: parseFloat(result.rows[0]?.ytd_taxable || 0),
    ytdZakat: 0
  };
}

/**
 * Update payroll run totals
 */
async function updateRunTotals(runId) {
  await pool.query(`
    UPDATE payroll_runs SET
      total_gross = (SELECT COALESCE(SUM(gross_salary), 0) FROM payroll_items WHERE payroll_run_id = $1),
      total_deductions = (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_items WHERE payroll_run_id = $1),
      total_net = (SELECT COALESCE(SUM(net_pay), 0) FROM payroll_items WHERE payroll_run_id = $1),
      total_employer_cost = (SELECT COALESCE(SUM(employer_total_cost), 0) FROM payroll_items WHERE payroll_run_id = $1),
      employee_count = (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = $1),
      updated_at = NOW()
    WHERE id = $1
  `, [runId]);
}

// =============================================================================
// CORE PAYROLL GENERATION FUNCTION
// =============================================================================

/**
 * Generate a single payroll run for an outlet or department
 * This is the core function used by both POST /runs and POST /runs/all-outlets
 * to ensure consistent calculation logic across all payroll generation.
 *
 * @param {Object} params
 * @param {number} params.companyId - Company ID
 * @param {number} params.month - Payroll month (1-12)
 * @param {number} params.year - Payroll year
 * @param {number} [params.outletId] - Outlet ID (for outlet-based companies)
 * @param {number} [params.departmentId] - Department ID (for dept-based companies)
 * @param {string} [params.notes] - Notes for the payroll run
 * @param {Array} [params.employeeIds] - Specific employee IDs (optional filter)
 * @returns {Promise<{run: Object, stats: Object, warnings: Array}>}
 */
async function generatePayrollRunInternal({ companyId, month, year, outletId, departmentId, notes, employeeIds }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get company settings
    const settings = await getCompanySettings(companyId);
    const { features, rates, period: periodConfig, statutory } = settings;
    const isOutletBased = settings.groupingType === 'outlet';

    // Determine the grouping ID
    const groupingId = isOutletBased ? outletId : departmentId;
    const groupingColumn = isOutletBased ? 'outlet_id' : 'department_id';

    // Check if run already exists
    let existingQuery = 'SELECT id FROM payroll_runs WHERE month = $1 AND year = $2 AND company_id = $3';
    let existingParams = [month, year, companyId];

    if (groupingId) {
      existingQuery += ` AND ${groupingColumn} = $4`;
      existingParams.push(groupingId);
    } else {
      existingQuery += ` AND ${groupingColumn} IS NULL`;
    }

    const existing = await client.query(existingQuery, existingParams);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      throw new Error('Payroll run already exists for this period');
    }

    // Get period dates
    const period = getPayrollPeriod(month, year, periodConfig);
    const workingDays = rates.standard_work_days || getWorkingDaysInMonth(year, month);

    // Create payroll run
    const runResult = await client.query(`
      INSERT INTO payroll_runs (
        month, year, status, notes, department_id, outlet_id, company_id,
        period_start_date, period_end_date, payment_due_date, period_label
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      month, year, notes,
      isOutletBased ? null : (departmentId || null),
      isOutletBased ? (outletId || null) : null,
      companyId,
      period.start.toISOString().split('T')[0],
      period.end.toISOString().split('T')[0],
      period.paymentDate.toISOString().split('T')[0],
      period.label
    ]);

    const runId = runResult.rows[0].id;

    // Get employees
    let employeeQuery = `
      SELECT e.*,
             e.default_basic_salary as basic_salary,
             e.default_allowance as fixed_allowance,
             d.name as department_name,
             d.payroll_structure_code
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
        AND (e.status = 'active' OR (e.status = 'resigned' AND e.resign_date BETWEEN $2 AND $3))
    `;
    let empParams = [companyId, period.start.toISOString().split('T')[0], period.end.toISOString().split('T')[0]];
    let paramIdx = 3;

    if (groupingId) {
      paramIdx++;
      if (isOutletBased) {
        // For outlets: include employees with outlet_id OR linked via employee_outlets (managers)
        employeeQuery += ` AND (e.outlet_id = $${paramIdx} OR e.id IN (SELECT employee_id FROM employee_outlets WHERE outlet_id = $${paramIdx}))`;
      } else {
        employeeQuery += ` AND e.${groupingColumn} = $${paramIdx}`;
      }
      empParams.push(groupingId);
    }

    if (employeeIds && employeeIds.length > 0) {
      paramIdx++;
      employeeQuery += ` AND e.id = ANY($${paramIdx})`;
      empParams.push(employeeIds);
    }

    // First get ALL potential employees (before exclusion filter)
    const allPotentialEmployees = await client.query(employeeQuery, empParams);

    // Exclude employees with NO schedule AND NO clock-in for the entire period (considered inactive)
    // They must have at least one schedule OR one clock-in record to be included
    employeeQuery += `
      AND (
        EXISTS (SELECT 1 FROM schedules s WHERE s.employee_id = e.id AND s.schedule_date BETWEEN $2 AND $3)
        OR EXISTS (SELECT 1 FROM clock_in_records cr WHERE cr.employee_id = e.id AND cr.work_date BETWEEN $2 AND $3)
      )
    `;

    const employees = await client.query(employeeQuery, empParams);

    // Find excluded employees (no schedule AND no clock-in)
    const includedIds = new Set(employees.rows.map(e => e.id));
    const excludedEmployees = allPotentialEmployees.rows
      .filter(e => !includedIds.has(e.id))
      .map(e => ({ id: e.id, name: e.name, employee_id: e.employee_id }));

    if (employees.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('No active employees found for this period' +
        (excludedEmployees.length > 0 ? `. ${excludedEmployees.length} employee(s) excluded due to no schedule/attendance.` : ''));
    }

    // Get previous month data for carry-forward
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    let prevPayrollMap = {};

    if (features.salary_carry_forward) {
      const prevResult = await client.query(`
        SELECT pi.employee_id, pi.basic_salary, pi.fixed_allowance, pi.net_pay
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        WHERE pr.month = $1 AND pr.year = $2 AND pr.company_id = $3
      `, [prevMonth, prevYear, companyId]);

      prevResult.rows.forEach(row => {
        prevPayrollMap[row.employee_id] = row;
      });
    }

    // Get sales data (for Indoor Sales)
    let salesMap = {};
    if (features.indoor_sales_logic) {
      const salesResult = await client.query(`
        SELECT employee_id, SUM(total_sales) as total_sales
        FROM sales_records WHERE month = $1 AND year = $2 AND company_id = $3
        GROUP BY employee_id
      `, [month, year, companyId]);
      salesResult.rows.forEach(r => { salesMap[r.employee_id] = parseFloat(r.total_sales) || 0; });
    }

    // Get flexible commissions
    let commissionsMap = {};
    if (features.flexible_commissions) {
      const commResult = await client.query(`
        SELECT ec.employee_id, SUM(ec.amount) as total
        FROM employee_commissions ec
        JOIN commission_types ct ON ec.commission_type_id = ct.id
        WHERE ec.is_active = TRUE AND ct.is_active = TRUE
        GROUP BY ec.employee_id
      `);
      commResult.rows.forEach(r => { commissionsMap[r.employee_id] = parseFloat(r.total) || 0; });
    }

    // Get flexible allowances
    let allowancesMap = {};
    if (features.flexible_allowances) {
      const allowResult = await client.query(`
        SELECT ea.employee_id,
          SUM(ea.amount) as total,
          SUM(CASE WHEN at.is_taxable THEN ea.amount ELSE 0 END) as taxable,
          SUM(CASE WHEN NOT at.is_taxable THEN ea.amount ELSE 0 END) as exempt
        FROM employee_allowances ea
        JOIN allowance_types at ON ea.allowance_type_id = at.id
        WHERE ea.is_active = TRUE AND at.is_active = TRUE
        GROUP BY ea.employee_id
      `);
      allowResult.rows.forEach(r => {
        allowancesMap[r.employee_id] = {
          total: parseFloat(r.total) || 0,
          taxable: parseFloat(r.taxable) || 0,
          exempt: parseFloat(r.exempt) || 0
        };
      });
    }

    // Get unpaid leave
    let unpaidLeaveMap = {};
    if (features.unpaid_leave_deduction) {
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

      const unpaidResult = await client.query(`
        SELECT lr.employee_id,
          SUM(GREATEST(0,
            (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
            - (SELECT COUNT(*) FROM generate_series(
                GREATEST(lr.start_date, $2::date), LEAST(lr.end_date, $1::date), '1 day'::interval
              ) d WHERE EXTRACT(DOW FROM d) IN (0, 6))
          )) as unpaid_days
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lt.is_paid = FALSE AND lr.status = 'approved'
          AND lr.start_date <= $1 AND lr.end_date >= $2
        GROUP BY lr.employee_id
      `, [endOfMonth, startOfMonth]);
      unpaidResult.rows.forEach(r => { unpaidLeaveMap[r.employee_id] = parseFloat(r.unpaid_days) || 0; });
    }

    // Get claims
    let claimsMap = {};
    if (features.auto_claims_linking) {
      const claimsResult = await client.query(`
        SELECT employee_id, SUM(amount) as total_claims
        FROM claims WHERE status = 'approved' AND linked_payroll_item_id IS NULL
        GROUP BY employee_id
      `);
      claimsResult.rows.forEach(r => { claimsMap[r.employee_id] = parseFloat(r.total_claims) || 0; });
    }

    // Get advances
    let advancesMap = {};
    try {
      const advancesResult = await client.query(`
        SELECT employee_id, SUM(
          CASE WHEN deduction_method = 'full' THEN remaining_balance
               WHEN deduction_method = 'installment' THEN LEAST(installment_amount, remaining_balance)
               ELSE remaining_balance END
        ) as total_advance_deduction
        FROM salary_advances
        WHERE company_id = $1 AND status = 'active' AND remaining_balance > 0
          AND ((expected_deduction_year < $2) OR (expected_deduction_year = $2 AND expected_deduction_month <= $3))
        GROUP BY employee_id
      `, [companyId, year, month]);
      advancesResult.rows.forEach(r => { advancesMap[r.employee_id] = parseFloat(r.total_advance_deduction) || 0; });
    } catch (e) { /* table might not exist */ }

    // Process each employee
    let stats = { created: 0, totalGross: 0, totalNet: 0, totalDeductions: 0, totalEmployerCost: 0 };
    let warnings = [];

    for (const emp of employees.rows) {
      const prevPayroll = prevPayrollMap[emp.id];
      let basicSalary = prevPayroll?.basic_salary || parseFloat(emp.basic_salary) || 0;
      let fixedAllowance = prevPayroll?.fixed_allowance || parseFloat(emp.fixed_allowance) || 0;

      const isPartTime = emp.work_type === 'part_time' || emp.employment_type === 'part_time';
      let partTimeData = null;
      let wages = 0, partTimeHoursWorked = 0, partTimePhPay = 0;

      if (isPartTime) {
        partTimeData = await calculatePartTimeHours(
          emp.id, period.start.toISOString().split('T')[0],
          period.end.toISOString().split('T')[0], companyId, rates
        );
        wages = partTimeData.normalPay || 0; // Normal hours × rate only
        partTimeHoursWorked = partTimeData.normalHours || 0;
        partTimePhPay = partTimeData.phPay || 0; // PH hours × rate × 2
        basicSalary = 0; // Part-time uses wages, not basic_salary
        fixedAllowance = 0;
      }

      let commissionAmount = isPartTime ? 0 : (commissionsMap[emp.id] || 0);
      let flexAllowData = isPartTime ? { total: 0, taxable: 0, exempt: 0 } : (allowancesMap[emp.id] || { total: 0, taxable: 0, exempt: 0 });
      let flexAllowance = flexAllowData.total;

      // Indoor Sales logic
      let salesAmount = 0, salaryCalculationMethod = null;
      if (features.indoor_sales_logic && emp.payroll_structure_code === 'indoor_sales') {
        salesAmount = salesMap[emp.id] || 0;
        const calculatedCommission = salesAmount * (rates.indoor_sales_commission_rate / 100);
        if (calculatedCommission >= rates.indoor_sales_basic) {
          basicSalary = calculatedCommission;
          commissionAmount = 0;
          salaryCalculationMethod = 'commission';
        } else {
          basicSalary = rates.indoor_sales_basic;
          commissionAmount = 0;
          salaryCalculationMethod = 'basic';
        }
      }

      // OT calculation
      let otHours = 0, otAmount = 0, phDaysWorked = 0, phPay = 0;
      const fixedOT = parseFloat(emp.fixed_ot_amount) || 0;

      // Auto-calculate OT from clock-in records (works for both full-time and part-time)
      if (features.auto_ot_from_clockin) {
        try {
          const otResult = await calculateOTFromClockIn(
            emp.id, companyId, emp.department_id,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0], basicSalary
          );
          otHours = otResult.total_ot_hours || 0;
          otAmount = otResult.total_ot_amount || 0;
        } catch (e) { console.warn(`OT calculation failed for ${emp.name}:`, e.message); }
      }

      if (otHours > 0 && otHours < 1) { otHours = 0; otAmount = 0; }
      else if (otHours >= 1) {
        otHours = Math.floor(otHours * 2) / 2;
        if (isPartTime) {
          // Part-time: OT at 1.5x hourly rate
          const partTimeHourlyRate = rates.part_time_hourly_rate || 8.72;
          otAmount = Math.round(partTimeHourlyRate * 1.5 * otHours * 100) / 100;
        } else if (basicSalary > 0 && otHours > 0) {
          // Full-time: OT at 1.5x calculated hourly rate
          const hourlyRate = basicSalary / workingDays / (rates.standard_work_hours || 8);
          otAmount = Math.round(hourlyRate * 1.5 * otHours * 100) / 100;
        }
      }

      if (otAmount === 0 && fixedOT > 0) otAmount = fixedOT;

      // PH pay calculation
      if (isPartTime) {
        // Part-time: PH pay already calculated in calculatePartTimeHours
        phPay = partTimePhPay;
      } else if (features.auto_ph_pay && basicSalary > 0) {
        try {
          phDaysWorked = await calculatePHDaysWorked(
            emp.id, companyId,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0]
          );
          if (phDaysWorked > 0) {
            phPay = Math.round(phDaysWorked * (basicSalary / workingDays) * rates.ph_multiplier * 100) / 100;
          }
        } catch (e) { console.warn(`PH calculation failed for ${emp.name}:`, e.message); }
      }

      // Deductions
      const dailyRate = basicSalary > 0 ? basicSalary / workingDays : 0;
      let unpaidDays = unpaidLeaveMap[emp.id] || 0;
      let unpaidDeduction = Math.round(dailyRate * unpaidDays * 100) / 100;
      let absentDays = 0, absentDayDeduction = 0;
      let shortHours = 0, shortHoursDeduction = 0;
      let lateDays = 0, attendanceBonus = 0;

      // Short hours calculation for ALL companies (full-time only)
      if (!isPartTime && basicSalary > 0) {
        try {
          const periodStart = period.start.toISOString().split('T')[0];
          const periodEnd = period.end.toISOString().split('T')[0];
          const expectedHoursPerDay = rates.standard_work_hours || 8;

          if (settings.groupingType === 'outlet') {
            // Outlet companies: Use schedule-based calculation
            const scheduleBasedPay = await calculateScheduleBasedPay(
              emp.id, periodStart, periodEnd
            );
            shortHours = scheduleBasedPay.shortHours || 0;
            lateDays = scheduleBasedPay.lateDays || 0;
          } else {
            // Non-outlet companies: Calculate from clock-in records directly
            const clockInResult = await client.query(`
              SELECT work_date, total_work_hours
              FROM clock_in_records
              WHERE employee_id = $1 AND company_id = $2
                AND work_date >= $3::date AND work_date <= $4::date
                AND clock_in_1 IS NOT NULL AND clock_out_1 IS NOT NULL
            `, [emp.id, companyId, periodStart, periodEnd]);

            for (const rec of clockInResult.rows) {
              const hoursWorked = parseFloat(rec.total_work_hours) || 0;
              // Only count base hours (cap at expected, OT doesn't count)
              const baseHours = Math.min(hoursWorked, expectedHoursPerDay);
              const deficit = expectedHoursPerDay - baseHours;
              if (deficit > 0) {
                shortHours += deficit;
              }
            }
            shortHours = Math.round(shortHours * 100) / 100;
          }

          // Calculate deduction if short hours exist
          if (shortHours > 0) {
            const hourlyRate = basicSalary / workingDays / expectedHoursPerDay;
            shortHoursDeduction = Math.round(hourlyRate * shortHours * 100) / 100;
          }
        } catch (e) { console.warn(`Short hours calc failed for ${emp.name}:`, e.message); }
      }

      // Calculate absent days from clock-in records (ALL companies including outlet)
      if (!isPartTime) {
        // Non-outlet: calculate absent days from clock-in records
        try {
          const periodStart = period.start.toISOString().split('T')[0];
          const periodEnd = period.end.toISOString().split('T')[0];
          const clockInResult = await client.query(`
            SELECT COUNT(DISTINCT work_date) as days_worked
            FROM clock_in_records WHERE employee_id = $1 AND company_id = $2
            AND work_date >= $3::date AND work_date <= $4::date AND status = 'completed'
          `, [emp.id, companyId, periodStart, periodEnd]);
          const daysWorked = parseInt(clockInResult.rows[0]?.days_worked) || 0;

          if (daysWorked < workingDays) {
            const paidLeaveResult = await client.query(`
              SELECT COALESCE(SUM(GREATEST(0,
                (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
                - (SELECT COUNT(*) FROM generate_series(GREATEST(lr.start_date, $2::date),
                    LEAST(lr.end_date, $1::date), '1 day'::interval) d WHERE EXTRACT(DOW FROM d) IN (0, 6))
              )), 0) as paid_leave_days
              FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
              WHERE lr.employee_id = $3 AND lt.is_paid = TRUE AND lr.status = 'approved'
                AND lr.start_date <= $1 AND lr.end_date >= $2
            `, [periodEnd, periodStart, emp.id]);
            const paidLeaveDays = parseFloat(paidLeaveResult.rows[0]?.paid_leave_days) || 0;
            absentDays = Math.max(0, workingDays - daysWorked - paidLeaveDays - unpaidDays);
            absentDayDeduction = Math.round(dailyRate * absentDays * 100) / 100;
          }
        } catch (e) { console.warn(`Absent calc failed for ${emp.name}:`, e.message); }
      }

      // Mimix attendance bonus (outlet-based companies only)
      if (!isPartTime && settings.groupingType === 'outlet') {
        const totalPenalty = lateDays + absentDays;
        if (totalPenalty === 0) attendanceBonus = 400;
        else if (totalPenalty === 1) attendanceBonus = 300;
        else if (totalPenalty === 2) attendanceBonus = 200;
        else if (totalPenalty === 3) attendanceBonus = 100;
        else attendanceBonus = 0;
      }

      const claimsAmount = claimsMap[emp.id] || 0;
      const advanceDeduction = advancesMap[emp.id] || 0;

      const totalAllowances = fixedAllowance + flexAllowance;
      const grossBeforeDeductions = basicSalary + wages + totalAllowances + otAmount + phPay + commissionAmount + claimsAmount + attendanceBonus;
      const grossSalary = Math.max(0, grossBeforeDeductions - unpaidDeduction - shortHoursDeduction - absentDayDeduction);

      // Statutory base - EPF/SOCSO/EIS based on actual pay received
      const actualBasicPay = Math.max(0, (basicSalary + wages) - unpaidDeduction - shortHoursDeduction - absentDayDeduction);
      let statutoryBase = actualBasicPay + commissionAmount;
      if (statutory.statutory_on_ot) statutoryBase += otAmount;
      if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
      if (statutory.statutory_on_allowance) statutoryBase += totalAllowances;

      // Get YTD data for PCB
      let ytdData = null;
      if (features.ytd_pcb_calculation) {
        ytdData = await getYTDData(emp.id, year, month);
      }

      const allowancePcb = emp.allowance_pcb || 'excluded';
      const fixedAllowanceTaxable = allowancePcb === 'excluded' ? 0 : fixedAllowance;
      const salaryBreakdown = {
        basic: basicSalary, allowance: totalAllowances,
        taxableAllowance: flexAllowData.taxable + fixedAllowanceTaxable,
        commission: commissionAmount, bonus: 0, ot: otAmount, pcbGross: grossSalary
      };
      const statutoryResult = calculateAllStatutory(statutoryBase, emp, month, ytdData, salaryBreakdown);

      const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
      const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
      const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
      const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
      const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
      const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;
      const pcb = statutory.pcb_enabled ? statutoryResult.pcb : 0;

      const totalDeductions = unpaidDeduction + absentDayDeduction + shortHoursDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + advanceDeduction;
      const netPay = grossSalary - totalDeductions + unpaidDeduction + absentDayDeduction + shortHoursDeduction;
      const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

      // Insert payroll item
      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id,
          basic_salary, wages, part_time_hours, fixed_allowance, commission_amount, claims_amount,
          ot_hours, ot_amount, ph_days_worked, ph_pay,
          unpaid_leave_days, unpaid_leave_deduction, advance_deduction,
          short_hours, short_hours_deduction, absent_days, absent_day_deduction,
          attendance_bonus, late_days,
          gross_salary, statutory_base,
          epf_employee, epf_employer, socso_employee, socso_employer,
          eis_employee, eis_employer, pcb,
          total_deductions, net_pay, employer_total_cost,
          sales_amount, salary_calculation_method
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
      `, [
        runId, emp.id, basicSalary, wages, partTimeHoursWorked, totalAllowances, commissionAmount, claimsAmount,
        otHours, otAmount, phDaysWorked, phPay,
        unpaidDays, unpaidDeduction, advanceDeduction,
        shortHours, shortHoursDeduction, absentDays, absentDayDeduction,
        attendanceBonus, lateDays,
        grossSalary, statutoryBase,
        epfEmployee, epfEmployer, socsoEmployee, socsoEmployer,
        eisEmployee, eisEmployer, pcb,
        totalDeductions, netPay, employerCost,
        salesAmount, salaryCalculationMethod
      ]);

      stats.created++;
      stats.totalGross += grossSalary;
      stats.totalNet += netPay;
      stats.totalDeductions += totalDeductions;
      stats.totalEmployerCost += employerCost;

      // Only warn for full-time employees without basic salary
      if (!isPartTime && basicSalary === 0) warnings.push(`${emp.name} has no basic salary set`);
    }

    // Update run totals and save excluded employees
    await client.query(`
      UPDATE payroll_runs SET
        total_gross = $1, total_deductions = $2, total_net = $3,
        total_employer_cost = $4, employee_count = $5, has_variance_warning = $6,
        excluded_employees = $8
      WHERE id = $7
    `, [stats.totalGross, stats.totalDeductions, stats.totalNet, stats.totalEmployerCost, stats.created, warnings.length > 0, runId,
        excludedEmployees.length > 0 ? JSON.stringify(excludedEmployees) : null]);

    await client.query('COMMIT');

    return { run: runResult.rows[0], stats, warnings, excludedEmployees };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// UTILITY ENDPOINTS
// =============================================================================

/**
 * POST /api/payroll/calculate-statutory
 * Calculate statutory deductions preview for an employee
 */
router.post('/calculate-statutory', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, gross_salary } = req.body;

    // Get employee data
    const empResult = await pool.query(
      `SELECT date_of_birth, ic_number, epf_contribution_type, marital_status, spouse_working, children_count
       FROM employees WHERE id = $1`,
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empResult.rows[0];
    const statutory = calculateAllStatutory(parseFloat(gross_salary || 0), employee);

    res.json(statutory);
  } catch (error) {
    console.error('Error calculating statutory:', error);
    res.status(500).json({ error: 'Failed to calculate statutory deductions', details: error.message });
  }
});

// =============================================================================
// PAYROLL SETTINGS ENDPOINTS
// =============================================================================

/**
 * GET /api/payroll/settings
 * Get company payroll settings
 */
router.get('/settings', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    // CRITICAL: Require company context - never default to company 1
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }
    const settings = await getCompanySettings(companyId);
    res.json(settings);
  } catch (error) {
    console.error('Error fetching payroll settings:', error);
    res.status(500).json({ error: 'Failed to fetch payroll settings' });
  }
});

/**
 * PUT /api/payroll/settings
 * Update company payroll settings
 */
router.put('/settings', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }
    const { features, rates, period, statutory } = req.body;

    const currentSettings = await getCompanySettings(companyId);

    const newSettings = {
      features: { ...currentSettings.features, ...features },
      rates: { ...currentSettings.rates, ...rates },
      period: { ...currentSettings.period, ...period },
      statutory: { ...currentSettings.statutory, ...statutory }
    };

    await pool.query(
      'UPDATE companies SET payroll_settings = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newSettings), companyId]
    );

    res.json({ message: 'Payroll settings updated', settings: newSettings });
  } catch (error) {
    console.error('Error updating payroll settings:', error);
    res.status(500).json({ error: 'Failed to update payroll settings' });
  }
});

// =============================================================================
// PAYROLL RUNS ENDPOINTS
// =============================================================================

/**
 * GET /api/payroll/runs
 * List all payroll runs
 */
router.get('/runs', authenticateAdmin, async (req, res) => {
  try {
    const { year, status, department_id } = req.query;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    let query = `
      SELECT pr.*,
             d.name as department_name,
             o.name as outlet_name,
             (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = pr.id) as item_count,
             au.name as approved_by_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      LEFT JOIN outlets o ON pr.outlet_id = o.id
      LEFT JOIN admin_users au ON pr.approved_by = au.id
      WHERE pr.company_id = $1
    `;
    const params = [companyId];
    let paramCount = 1;

    if (year) {
      paramCount++;
      query += ` AND pr.year = $${paramCount}`;
      params.push(year);
    }

    if (status) {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      params.push(status);
    }

    if (department_id) {
      paramCount++;
      query += ` AND pr.department_id = $${paramCount}`;
      params.push(department_id);
    }

    query += ' ORDER BY pr.year DESC, pr.month DESC, COALESCE(d.name, o.name) NULLS FIRST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ error: 'Failed to fetch payroll runs' });
  }
});

// =============================================================================
// GENERATE ALL OUTLETS (MIMIX)
// =============================================================================

/**
 * POST /api/payroll/runs/all-outlets
 * Create separate payroll runs for each outlet at once
 * This is only for outlet-based companies (Mimix)
 *
 * IMPORTANT: This endpoint reuses the same logic as POST /runs by calling
 * generatePayrollRunInternal for each outlet. This ensures consistency
 * between single-outlet and all-outlets generation.
 *
 * IMPORTANT: This route must be defined BEFORE /runs/:id routes
 */
router.post('/runs/all-outlets', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, notes } = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Get company settings to verify it's outlet-based
    const settings = await getCompanySettings(companyId);
    if (settings.groupingType !== 'outlet') {
      return res.status(400).json({
        error: 'This endpoint is only for outlet-based companies (Mimix)'
      });
    }

    // Get all active outlets for this company
    const outletsResult = await pool.query(`
      SELECT id, name FROM outlets
      WHERE company_id = $1
      ORDER BY name
    `, [companyId]);

    const outlets = outletsResult.rows;
    if (outlets.length === 0) {
      return res.status(400).json({ error: 'No active outlets found for this company' });
    }

    // Check which outlets already have payroll runs
    const existingResult = await pool.query(`
      SELECT outlet_id FROM payroll_runs
      WHERE month = $1 AND year = $2 AND company_id = $3 AND outlet_id IS NOT NULL
    `, [month, year, companyId]);

    const existingOutletIds = new Set(existingResult.rows.map(r => r.outlet_id));
    const outletsToCreate = outlets.filter(o => !existingOutletIds.has(o.id));

    if (outletsToCreate.length === 0) {
      return res.status(400).json({
        error: 'Payroll runs already exist for all outlets',
        existing_outlets: outlets.map(o => o.name)
      });
    }

    const createdRuns = [];
    const skippedOutlets = [];

    // Process each outlet using the same logic as POST /runs
    for (const outlet of outletsToCreate) {
      try {
        // Call the internal payroll generation function (same as POST /runs uses)
        const result = await generatePayrollRunInternal({
          companyId,
          month,
          year,
          outletId: outlet.id,
          notes: notes ? `${outlet.name} - ${notes}` : outlet.name
        });

        createdRuns.push({
          run_id: result.run.id,
          outlet_id: outlet.id,
          outlet_name: outlet.name,
          employee_count: result.stats.created,
          total_net: result.stats.totalNet,
          excludedEmployees: result.excludedEmployees || []
        });
      } catch (outletError) {
        console.error(`Error creating payroll for outlet ${outlet.name}:`, outletError.message);
        skippedOutlets.push({ outlet_name: outlet.name, reason: outletError.message });
      }
    }

    // Calculate totals across all runs
    const grandTotalNet = createdRuns.reduce((sum, r) => sum + r.total_net, 0);
    const grandTotalEmployees = createdRuns.reduce((sum, r) => sum + r.employee_count, 0);

    res.status(201).json({
      message: `Created ${createdRuns.length} payroll runs for ${grandTotalEmployees} employees`,
      created_runs: createdRuns,
      skipped_outlets: skippedOutlets,
      totals: {
        runs_created: createdRuns.length,
        total_employees: grandTotalEmployees,
        grand_total_net: grandTotalNet
      }
    });
  } catch (error) {
    console.error('Error creating all-outlets payroll:', error);
    res.status(500).json({
      error: 'Failed to create payroll runs for all outlets',
      details: error.message
    });
  }
});

/**
 * POST /api/payroll/runs/all-departments
 * Create separate payroll runs for each department (department-based companies)
 */
router.post('/runs/all-departments', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { month, year, notes } = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const settings = await getCompanySettings(companyId);
    const { features, rates, period: periodConfig } = settings;

    // Get all active departments for this company
    const deptsResult = await pool.query(`
      SELECT id, name FROM departments
      WHERE company_id = $1
      ORDER BY name
    `, [companyId]);

    const depts = deptsResult.rows;
    if (depts.length === 0) {
      return res.status(400).json({ error: 'No departments found for this company' });
    }

    // Check which departments already have payroll runs
    const existingResult = await pool.query(`
      SELECT department_id FROM payroll_runs
      WHERE month = $1 AND year = $2 AND company_id = $3 AND department_id IS NOT NULL
    `, [month, year, companyId]);

    const existingDeptIds = new Set(existingResult.rows.map(r => r.department_id));
    const deptsToCreate = depts.filter(d => !existingDeptIds.has(d.id));

    if (deptsToCreate.length === 0) {
      return res.status(400).json({
        error: 'Payroll runs already exist for all departments',
        existing_departments: depts.map(d => d.name)
      });
    }

    await client.query('BEGIN');

    const period = getPayrollPeriod(month, year, periodConfig);
    const workingDays = rates.standard_work_days || 22;

    // Shared lookups
    let commissionsMap = {};
    if (features.flexible_commissions) {
      const commResult = await client.query(`
        SELECT ec.employee_id, SUM(ec.amount) as total
        FROM employee_commissions ec
        JOIN commission_types ct ON ec.commission_type_id = ct.id
        WHERE ec.is_active = TRUE AND ct.is_active = TRUE
        GROUP BY ec.employee_id
      `);
      commResult.rows.forEach(r => { commissionsMap[r.employee_id] = parseFloat(r.total) || 0; });
    }

    let allowancesMap = {};
    if (features.flexible_allowances) {
      const allowResult = await client.query(`
        SELECT ea.employee_id,
          SUM(ea.amount) as total,
          SUM(CASE WHEN at.is_taxable THEN ea.amount ELSE 0 END) as taxable,
          SUM(CASE WHEN NOT at.is_taxable THEN ea.amount ELSE 0 END) as exempt
        FROM employee_allowances ea
        JOIN allowance_types at ON ea.allowance_type_id = at.id
        WHERE ea.is_active = TRUE AND at.is_active = TRUE
        GROUP BY ea.employee_id
      `);
      allowResult.rows.forEach(r => {
        allowancesMap[r.employee_id] = {
          total: parseFloat(r.total) || 0,
          taxable: parseFloat(r.taxable) || 0,
          exempt: parseFloat(r.exempt) || 0
        };
      });
    }

    let claimsMap = {};
    if (features.auto_claims_linking) {
      const claimsResult = await client.query(`
        SELECT employee_id, SUM(amount) as total_claims
        FROM claims WHERE status = 'approved' AND linked_payroll_item_id IS NULL
        GROUP BY employee_id
      `);
      claimsResult.rows.forEach(r => { claimsMap[r.employee_id] = parseFloat(r.total_claims) || 0; });
    }

    let prevPayrollMap = {};
    if (features.salary_carry_forward) {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevResult = await client.query(`
        SELECT pi.employee_id, pi.basic_salary, pi.fixed_allowance, pi.net_pay
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        WHERE pr.month = $1 AND pr.year = $2 AND pr.company_id = $3
      `, [prevMonth, prevYear, companyId]);
      prevResult.rows.forEach(row => { prevPayrollMap[row.employee_id] = row; });
    }

    let advancesMap = {};
    try {
      const advancesResult = await client.query(`
        SELECT employee_id, SUM(amount) as total_advance_deduction
        FROM salary_advances
        WHERE company_id = $1 AND status = 'approved'
          AND ((expected_deduction_year < $2) OR (expected_deduction_year = $2 AND expected_deduction_month <= $3))
        GROUP BY employee_id
      `, [companyId, year, month]);
      advancesResult.rows.forEach(r => { advancesMap[r.employee_id] = parseFloat(r.total_advance_deduction) || 0; });
    } catch (e) { /* table might not exist */ }

    const createdRuns = [];
    const skippedDepts = [];

    for (const dept of deptsToCreate) {
      try {
        await client.query(`SAVEPOINT dept_${dept.id}`);
        const runResult = await client.query(`
          INSERT INTO payroll_runs (
            month, year, status, notes, department_id, outlet_id, company_id,
            period_start_date, period_end_date, payment_due_date, period_label
          ) VALUES ($1, $2, 'draft', $3, $4, NULL, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          month, year,
          notes ? `${dept.name} - ${notes}` : dept.name,
          dept.id, companyId,
          period.start.toISOString().split('T')[0],
          period.end.toISOString().split('T')[0],
          period.paymentDate.toISOString().split('T')[0],
          period.label
        ]);

        const runId = runResult.rows[0].id;

        // For department-based companies: no exclusion filter (they don't use schedule/clock-in)
        const employees = await client.query(`
          SELECT e.*,
                 e.default_basic_salary as basic_salary,
                 e.default_allowance as fixed_allowance,
                 d.name as department_name,
                 d.payroll_structure_code
          FROM employees e
          LEFT JOIN departments d ON e.department_id = d.id
          WHERE e.company_id = $1
            AND e.department_id = $2
            AND (e.status = 'active' OR (e.status = 'resigned' AND e.resign_date BETWEEN $3 AND $4))
        `, [companyId, dept.id, period.start.toISOString().split('T')[0], period.end.toISOString().split('T')[0]]);

        if (employees.rows.length === 0) {
          skippedDepts.push({ department_name: dept.name, reason: 'No employees' });
          continue;
        }

        let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerCost = 0, employeeCount = 0;

        for (const emp of employees.rows) {
          const isPartTime = emp.work_type === 'part_time' || emp.employment_type === 'part_time';
          let basicSalary, fixedAllowance;

          if (isPartTime) {
            const partTimeData = await calculatePartTimeHours(
              emp.id, period.start.toISOString().split('T')[0],
              period.end.toISOString().split('T')[0], companyId, rates
            );
            basicSalary = partTimeData.grossSalary;
            fixedAllowance = 0;
          } else {
            const prevSalary = prevPayrollMap[emp.id];
            basicSalary = prevSalary ? parseFloat(prevSalary.basic_salary) : (parseFloat(emp.basic_salary) || 0);
            fixedAllowance = prevSalary ? parseFloat(prevSalary.fixed_allowance) : (parseFloat(emp.fixed_allowance) || 0);
          }

          const flexCommissions = commissionsMap[emp.id] || 0;
          const flexAllowData = allowancesMap[emp.id] || { total: 0, taxable: 0, exempt: 0 };
          const flexAllowances = flexAllowData.total;
          const claimsAmount = claimsMap[emp.id] || 0;

          let otHours = 0, otAmount = 0, phDaysWorked = 0, phPay = 0;
          const fixedOT = parseFloat(emp.fixed_ot_amount) || 0;

          if (!isPartTime && features.auto_ot_from_clockin) {
            try {
              const otResult = await calculateOTFromClockIn(
                emp.id, companyId, emp.department_id,
                period.start.toISOString().split('T')[0],
                period.end.toISOString().split('T')[0], basicSalary
              );
              otHours = otResult.total_ot_hours || 0;
              otAmount = otResult.total_ot_amount || 0;
            } catch (e) { console.error(`OT calc error for ${emp.name}:`, e.message); }
          }
          if (otAmount === 0 && fixedOT > 0) otAmount = fixedOT;

          if (!isPartTime && features.auto_ph_pay) {
            try {
              phDaysWorked = await calculatePHDaysWorked(
                emp.id, companyId,
                period.start.toISOString().split('T')[0],
                period.end.toISOString().split('T')[0]
              );
              if (phDaysWorked > 0 && basicSalary > 0) {
                phPay = phDaysWorked * (basicSalary / workingDays) * rates.ph_multiplier;
              }
            } catch (e) { console.error(`PH calc error for ${emp.name}:`, e.message); }
          }

          const totalAllowances = fixedAllowance + flexAllowances;
          const grossSalary = basicSalary + totalAllowances + otAmount + phPay + flexCommissions + claimsAmount;

          const statutoryBase = basicSalary + flexCommissions;
          const allowancePcb = emp.allowance_pcb || 'excluded';
          const fixedAllowanceTaxable = allowancePcb === 'excluded' ? 0 : fixedAllowance;
          const salaryBreakdown = {
            basic: basicSalary, allowance: totalAllowances,
            taxableAllowance: flexAllowData.taxable + fixedAllowanceTaxable,
            commission: flexCommissions, bonus: 0, ot: otAmount, pcbGross: grossSalary
          };
          const statutory = calculateAllStatutory(statutoryBase, emp, month, null, salaryBreakdown);

          const totalDeductionsForEmp = statutory.epf.employee + statutory.socso.employee + statutory.eis.employee + statutory.pcb;
          const advanceDeduction = advancesMap[emp.id] || 0;
          const netPay = grossSalary - totalDeductionsForEmp - advanceDeduction;
          const employerCost = grossSalary + statutory.epf.employer + statutory.socso.employer + statutory.eis.employer;

          await client.query(`
            INSERT INTO payroll_items (
              payroll_run_id, employee_id,
              basic_salary, fixed_allowance, commission_amount, claims_amount,
              ot_hours, ot_amount, ph_days_worked, ph_pay,
              gross_salary,
              epf_employee, epf_employer, socso_employee, socso_employer,
              eis_employee, eis_employer, pcb,
              total_deductions, net_pay, employer_total_cost
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          `, [
            runId, emp.id, basicSalary, totalAllowances, flexCommissions, claimsAmount,
            otHours, otAmount, phDaysWorked, phPay, grossSalary,
            statutory.epf.employee, statutory.epf.employer,
            statutory.socso.employee, statutory.socso.employer,
            statutory.eis.employee, statutory.eis.employer, statutory.pcb,
            totalDeductionsForEmp, netPay, employerCost
          ]);

          totalGross += grossSalary;
          totalDeductions += totalDeductionsForEmp;
          totalNet += netPay;
          totalEmployerCost += employerCost;
          employeeCount++;
        }

        await client.query(`
          UPDATE payroll_runs SET
            total_gross = $1, total_deductions = $2, total_net = $3,
            total_employer_cost = $4, employee_count = $5
          WHERE id = $6
        `, [totalGross, totalDeductions, totalNet, totalEmployerCost, employeeCount, runId]);

        createdRuns.push({
          run_id: runId, department_id: dept.id, department_name: dept.name,
          employee_count: employeeCount, total_net: totalNet
        });
      } catch (deptError) {
        await client.query(`ROLLBACK TO SAVEPOINT dept_${dept.id}`);
        console.error(`Error creating payroll for dept ${dept.name}:`, deptError.message);
        skippedDepts.push({ department_name: dept.name, reason: deptError.message });
      }
    }

    await client.query('COMMIT');

    const grandTotalNet = createdRuns.reduce((sum, r) => sum + r.total_net, 0);
    const grandTotalEmployees = createdRuns.reduce((sum, r) => sum + r.employee_count, 0);

    res.status(201).json({
      message: `Created ${createdRuns.length} payroll runs for ${grandTotalEmployees} employees`,
      created_runs: createdRuns,
      skipped_departments: skippedDepts,
      totals: {
        runs_created: createdRuns.length,
        total_employees: grandTotalEmployees,
        grand_total_net: grandTotalNet
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating all-departments payroll:', error);
    res.status(500).json({ error: 'Failed to create payroll runs for all departments', details: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/payroll/runs/:id
 * Get single payroll run with all items
 */
router.get('/runs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const runResult = await pool.query(`
      SELECT pr.*, d.name as department_name, o.name as outlet_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      LEFT JOIN outlets o ON pr.outlet_id = o.id
      WHERE pr.id = $1
    `, [id]);

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    // CRITICAL: Verify run belongs to this company
    if (runResult.rows[0].company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied: payroll run belongs to another company' });
    }

    const run = runResult.rows[0];
    const settings = await getCompanySettings(run.company_id);
    const isOutletBased = settings.groupingType === 'outlet';

    const itemsResult = await pool.query(`
      SELECT pi.*,
             e.employee_id as emp_code,
             e.name as employee_name,
             e.bank_name,
             e.bank_account_no,
             e.work_type,
             e.employment_type,
             e.hourly_rate,
             d.name as department_name,
             eo.name as outlet_name,
             -- Days worked: for outlet-based (Mimix), only count days WITH schedule
             -- For other companies, count all clock-in days
             (SELECT COUNT(DISTINCT cr.work_date)
              FROM clock_in_records cr
              WHERE cr.employee_id = pi.employee_id
                AND cr.work_date BETWEEN $2 AND $3
                AND cr.status = 'completed'
                AND (
                  NOT $4  -- If not outlet-based, count all days
                  OR EXISTS (
                    SELECT 1 FROM schedules s
                    WHERE s.employee_id = cr.employee_id
                      AND s.schedule_date = cr.work_date
                      AND s.status IN ('scheduled', 'completed', 'confirmed')
                  )
                )
             ) as days_worked,
             -- Total work hours: for outlet-based, only count hours from days WITH schedule
             (SELECT COALESCE(SUM(cr.total_work_hours), 0)
              FROM clock_in_records cr
              WHERE cr.employee_id = pi.employee_id
                AND cr.work_date BETWEEN $2 AND $3
                AND cr.status = 'completed'
                AND (
                  NOT $4
                  OR EXISTS (
                    SELECT 1 FROM schedules s
                    WHERE s.employee_id = cr.employee_id
                      AND s.schedule_date = cr.work_date
                      AND s.status IN ('scheduled', 'completed', 'confirmed')
                  )
                )
             ) as total_work_hours,
             -- No schedule days: clock-in days WITHOUT schedule (unpaid, for Mimix only)
             (SELECT COUNT(DISTINCT cr.work_date)
              FROM clock_in_records cr
              WHERE cr.employee_id = pi.employee_id
                AND cr.work_date BETWEEN $2 AND $3
                AND cr.status = 'completed'
                AND NOT EXISTS (
                  SELECT 1 FROM schedules s
                  WHERE s.employee_id = cr.employee_id
                    AND s.schedule_date = cr.work_date
                    AND s.status IN ('scheduled', 'completed', 'confirmed')
                )
             ) as no_schedule_days
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets eo ON e.outlet_id = eo.id
      WHERE pi.payroll_run_id = $1
      ORDER BY eo.name NULLS FIRST, e.name
    `, [id, run.period_start_date, run.period_end_date, isOutletBased]);

    const workDaysPerMonth = settings.rates.standard_work_days || 22;

    res.json({
      run: { ...run, work_days_per_month: workDaysPerMonth },
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching payroll run:', error);
    res.status(500).json({ error: 'Failed to fetch payroll run' });
  }
});

/**
 * POST /api/payroll/runs
 * Create new payroll run and generate items for employees
 */
router.post('/runs', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { month, year, department_id, outlet_id, notes, employee_ids } = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    await client.query('BEGIN');

    // Get company settings first to determine grouping type
    const settings = await getCompanySettings(companyId);
    const { features, rates, period: periodConfig, statutory } = settings;
    const isOutletBased = settings.groupingType === 'outlet';

    // Determine the grouping ID (department_id or outlet_id based on company type)
    const groupingId = isOutletBased ? outlet_id : department_id;
    const groupingColumn = isOutletBased ? 'outlet_id' : 'department_id';

    // CRITICAL: Use SELECT FOR UPDATE to prevent race conditions
    // Lock existing runs for this period to prevent duplicates
    const lockQuery = `
      SELECT id FROM payroll_runs
      WHERE month = $1 AND year = $2 AND company_id = $3
      ${groupingId ? `AND ${groupingColumn} = $4` : `AND ${groupingColumn} IS NULL`}
      FOR UPDATE NOWAIT
    `;
    const lockParams = groupingId
      ? [month, year, companyId, groupingId]
      : [month, year, companyId];

    try {
      await client.query(lockQuery, lockParams);
    } catch (lockErr) {
      if (lockErr.code === '55P03') {
        // Lock not available - another transaction is creating a run
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Another payroll run is being created for this period. Please wait and try again.'
        });
      }
      // Re-throw other errors
      throw lockErr;
    }

    // Check if run already exists
    let existingQuery = 'SELECT id FROM payroll_runs WHERE month = $1 AND year = $2 AND company_id = $3';
    let existingParams = [month, year, companyId];

    if (groupingId) {
      existingQuery += ` AND ${groupingColumn} = $4`;
      existingParams.push(groupingId);
    } else {
      existingQuery += ` AND ${groupingColumn} IS NULL`;
    }

    const existing = await client.query(existingQuery, existingParams);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Payroll run already exists for this period',
        existing_id: existing.rows[0].id
      });
    }

    // Get period dates
    const period = getPayrollPeriod(month, year, periodConfig);
    const workingDays = rates.standard_work_days || getWorkingDaysInMonth(year, month);

    // Create payroll run with appropriate grouping column
    const runResult = await client.query(`
      INSERT INTO payroll_runs (
        month, year, status, notes, department_id, outlet_id, company_id,
        period_start_date, period_end_date, payment_due_date, period_label
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      month, year, notes,
      isOutletBased ? null : (department_id || null),
      isOutletBased ? (outlet_id || null) : null,
      companyId,
      period.start.toISOString().split('T')[0],
      period.end.toISOString().split('T')[0],
      period.paymentDate.toISOString().split('T')[0],
      period.label
    ]);

    const runId = runResult.rows[0].id;

    // Get employees: active OR resigned in their final month (for final settlement)
    let employeeQuery = `
      SELECT e.*,
             e.default_basic_salary as basic_salary,
             e.default_allowance as fixed_allowance,
             d.name as department_name,
             d.payroll_structure_code
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
        AND (
          e.status = 'active'
          OR (e.status = 'resigned' AND e.resign_date BETWEEN $2 AND $3)
        )
    `;
    let employeeParams = [companyId, period.start.toISOString().split('T')[0], period.end.toISOString().split('T')[0]];

    // Filter by grouping (department or outlet)
    if (isOutletBased && outlet_id) {
      // Include employees with outlet_id OR linked via employee_outlets (managers)
      employeeQuery += ` AND (e.outlet_id = $${employeeParams.length + 1} OR e.id IN (SELECT employee_id FROM employee_outlets WHERE outlet_id = $${employeeParams.length + 1}))`;
      employeeParams.push(outlet_id);
    } else if (!isOutletBased && department_id) {
      employeeQuery += ` AND e.department_id = $${employeeParams.length + 1}`;
      employeeParams.push(department_id);
    }

    if (employee_ids && employee_ids.length > 0) {
      employeeQuery += ` AND e.id = ANY($${employeeParams.length + 1})`;
      employeeParams.push(employee_ids);
    }

    // For outlet-based companies (Mimix): exclude employees with NO schedule AND NO clock-in
    // Other companies don't use schedule/clock-in so no exclusion needed
    let excludedEmployees = [];
    let employees;

    if (isOutletBased) {
      // First get ALL potential employees (before exclusion filter)
      const allPotentialEmployees = await client.query(employeeQuery, employeeParams);

      // Exclude employees with NO schedule AND NO clock-in for the entire period (considered inactive)
      employeeQuery += `
        AND (
          EXISTS (SELECT 1 FROM schedules s WHERE s.employee_id = e.id AND s.schedule_date BETWEEN $2 AND $3)
          OR EXISTS (SELECT 1 FROM clock_in_records cr WHERE cr.employee_id = e.id AND cr.work_date BETWEEN $2 AND $3)
        )
      `;

      employees = await client.query(employeeQuery, employeeParams);

      // Find excluded employees (no schedule AND no clock-in)
      const includedIds = new Set(employees.rows.map(e => e.id));
      excludedEmployees = allPotentialEmployees.rows
        .filter(e => !includedIds.has(e.id))
        .map(e => ({ id: e.id, name: e.name, employee_id: e.employee_id }));
    } else {
      // Non-outlet companies: no exclusion filter
      employees = await client.query(employeeQuery, employeeParams);
    }

    // Get previous month data for carry-forward and variance
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    let prevPayrollMap = {};
    if (features.salary_carry_forward) {
      const prevResult = await client.query(`
        SELECT pi.employee_id, pi.basic_salary, pi.fixed_allowance, pi.net_pay
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        WHERE pr.month = $1 AND pr.year = $2 AND pr.company_id = $3
      `, [prevMonth, prevYear, companyId]);

      prevResult.rows.forEach(row => {
        prevPayrollMap[row.employee_id] = row;
      });
    }

    // Get sales data (for Indoor Sales)
    let salesMap = {};
    if (features.indoor_sales_logic) {
      const salesResult = await client.query(`
        SELECT employee_id, SUM(total_sales) as total_sales
        FROM sales_records
        WHERE month = $1 AND year = $2 AND company_id = $3
        GROUP BY employee_id
      `, [month, year, companyId]);

      salesResult.rows.forEach(r => {
        salesMap[r.employee_id] = parseFloat(r.total_sales) || 0;
      });
    }

    // Get flexible commissions
    let commissionsMap = {};
    if (features.flexible_commissions) {
      const commResult = await client.query(`
        SELECT ec.employee_id, SUM(ec.amount) as total
        FROM employee_commissions ec
        JOIN commission_types ct ON ec.commission_type_id = ct.id
        WHERE ec.is_active = TRUE AND ct.is_active = TRUE
        GROUP BY ec.employee_id
      `);
      commResult.rows.forEach(r => {
        commissionsMap[r.employee_id] = parseFloat(r.total) || 0;
      });
    }

    // Get flexible allowances
    let allowancesMap = {};
    if (features.flexible_allowances) {
      const allowResult = await client.query(`
        SELECT ea.employee_id,
          SUM(ea.amount) as total,
          SUM(CASE WHEN at.is_taxable THEN ea.amount ELSE 0 END) as taxable,
          SUM(CASE WHEN NOT at.is_taxable THEN ea.amount ELSE 0 END) as exempt
        FROM employee_allowances ea
        JOIN allowance_types at ON ea.allowance_type_id = at.id
        WHERE ea.is_active = TRUE AND at.is_active = TRUE
        GROUP BY ea.employee_id
      `);
      allowResult.rows.forEach(r => {
        allowancesMap[r.employee_id] = {
          total: parseFloat(r.total) || 0,
          taxable: parseFloat(r.taxable) || 0,
          exempt: parseFloat(r.exempt) || 0
        };
      });
    }

    // Get unpaid leave - FIXED: Calculate actual overlap days for cross-month leave
    let unpaidLeaveMap = {};
    if (features.unpaid_leave_deduction) {
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

      // Calculate overlap days: only count days that fall within this payroll month
      // This fixes the cross-month leave double-deduction bug
      // Example: Leave Dec 28 - Jan 5 (8 days total)
      //   - December payroll: GREATEST(Dec28, Dec1)=Dec28 to LEAST(Jan5, Dec31)=Dec31 = 4 days
      //   - January payroll: GREATEST(Dec28, Jan1)=Jan1 to LEAST(Jan5, Jan31)=Jan5 = 5 days
      const unpaidResult = await client.query(`
        SELECT
          lr.employee_id,
          SUM(
            -- Calculate working days in the overlap period
            -- Overlap start = MAX(leave_start, month_start)
            -- Overlap end = MIN(leave_end, month_end)
            GREATEST(0,
              (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
              -- Subtract weekends in the overlap period (approximate)
              - (
                SELECT COUNT(*) FROM generate_series(
                  GREATEST(lr.start_date, $2::date),
                  LEAST(lr.end_date, $1::date),
                  '1 day'::interval
                ) d
                WHERE EXTRACT(DOW FROM d) IN (0, 6)
              )
            )
          ) as unpaid_days
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lt.is_paid = FALSE
          AND lr.status = 'approved'
          AND lr.start_date <= $1
          AND lr.end_date >= $2
        GROUP BY lr.employee_id
      `, [endOfMonth, startOfMonth]);

      unpaidResult.rows.forEach(r => {
        unpaidLeaveMap[r.employee_id] = parseFloat(r.unpaid_days) || 0;
      });
    }

    // Get all approved claims not yet linked to any payroll
    let claimsMap = {};
    if (features.auto_claims_linking) {
      const claimsResult = await client.query(`
        SELECT employee_id, SUM(amount) as total_claims
        FROM claims
        WHERE status = 'approved'
          AND linked_payroll_item_id IS NULL
        GROUP BY employee_id
      `);

      claimsResult.rows.forEach(r => {
        claimsMap[r.employee_id] = parseFloat(r.total_claims) || 0;
      });
    }

    // Get pending salary advances for deduction
    let advancesMap = {};
    try {
      const advancesResult = await client.query(`
        SELECT
          employee_id,
          SUM(
            CASE
              WHEN deduction_method = 'full' THEN remaining_balance
              WHEN deduction_method = 'installment' THEN LEAST(installment_amount, remaining_balance)
              ELSE remaining_balance
            END
          ) as total_advance_deduction
        FROM salary_advances
        WHERE company_id = $1
          AND status = 'active'
          AND remaining_balance > 0
          AND (
            (expected_deduction_year < $2) OR
            (expected_deduction_year = $2 AND expected_deduction_month <= $3)
          )
        GROUP BY employee_id
      `, [companyId, year, month]);

      advancesResult.rows.forEach(r => {
        advancesMap[r.employee_id] = parseFloat(r.total_advance_deduction) || 0;
      });
    } catch (e) {
      // Table might not exist yet, continue without advances
      console.warn('Salary advances table not found, skipping advance deductions');
    }

    // Process each employee
    let stats = { created: 0, totalGross: 0, totalNet: 0, totalDeductions: 0, totalEmployerCost: 0 };
    let warnings = [];

    for (const emp of employees.rows) {
      // Salary carry-forward
      const prevPayroll = prevPayrollMap[emp.id];
      let basicSalary = prevPayroll?.basic_salary || parseFloat(emp.basic_salary) || 0;
      let fixedAllowance = prevPayroll?.fixed_allowance || parseFloat(emp.fixed_allowance) || 0;

      // Part-time employee: salary = total work hours × hourly rate (configurable, default RM 8.72)
      // Part-time employees don't get fixed salary, allowances, or leave
      // Check both work_type and employment_type for part-time status
      let partTimeData = null;
      const isPartTime = emp.work_type === 'part_time' || emp.employment_type === 'part_time';
      if (isPartTime) {
        partTimeData = await calculatePartTimeHours(
          emp.id,
          period.start.toISOString().split('T')[0],
          period.end.toISOString().split('T')[0],
          companyId,
          rates
        );
        basicSalary = partTimeData.grossSalary;
        fixedAllowance = 0; // Part-time no fixed allowance
      }

      // Flexible earnings
      let commissionAmount = commissionsMap[emp.id] || 0;
      let flexAllowData = allowancesMap[emp.id] || { total: 0, taxable: 0, exempt: 0 };
      let flexAllowance = flexAllowData.total;

      // Part-time employees don't get flexible allowances
      if (isPartTime) {
        flexAllowance = 0;
        flexAllowData = { total: 0, taxable: 0, exempt: 0 };
      }

      // Indoor Sales logic
      let salesAmount = 0;
      let salaryCalculationMethod = null;

      if (features.indoor_sales_logic && emp.payroll_structure_code === 'indoor_sales') {
        salesAmount = salesMap[emp.id] || 0;
        const calculatedCommission = salesAmount * (rates.indoor_sales_commission_rate / 100);

        if (calculatedCommission >= rates.indoor_sales_basic) {
          basicSalary = calculatedCommission;
          commissionAmount = 0;
          salaryCalculationMethod = 'commission';
        } else {
          basicSalary = rates.indoor_sales_basic;
          commissionAmount = 0;
          salaryCalculationMethod = 'basic';
        }
      }

      // OT calculation (works for both full-time and part-time)
      let otHours = 0, otAmount = 0, phDaysWorked = 0, phPay = 0;

      if (features.auto_ot_from_clockin) {
        try {
          const otResult = await calculateOTFromClockIn(
            emp.id, companyId, emp.department_id,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0],
            basicSalary
          );
          otHours = otResult.total_ot_hours || 0;
          otAmount = otResult.total_ot_amount || 0;
        } catch (e) {
          console.warn(`OT calculation failed for ${emp.name}:`, e.message);
        }
      }

      // OT rounding: min 1 hour, round down to nearest 0.5h
      if (otHours > 0 && otHours < 1) {
        otHours = 0;
        otAmount = 0;
      } else if (otHours >= 1) {
        otHours = Math.floor(otHours * 2) / 2;
        // Recalculate OT amount with rounded hours
        if (isPartTime) {
          // Part-time: OT at 1.5x hourly rate
          const partTimeHourlyRate = rates.part_time_hourly_rate || 8.72;
          otAmount = Math.round(partTimeHourlyRate * 1.5 * otHours * 100) / 100;
        } else if (basicSalary > 0 && otHours > 0) {
          // Full-time: OT at 1.5x rate
          const hourlyRate = basicSalary / workingDays / (rates.standard_work_hours || 8);
          otAmount = Math.round(hourlyRate * 1.5 * otHours * 100) / 100;
        }
      }

      // Short hours calculation for ALL companies (full-time only)
      let shortHours = 0;
      let shortHoursDeduction = 0;
      if (!isPartTime && basicSalary > 0) {
        try {
          const expectedHoursPerDay = rates.standard_work_hours || 8;
          const periodStart = period.start.toISOString().split('T')[0];
          const periodEnd = period.end.toISOString().split('T')[0];

          // Get clock-in records with actual hours worked
          const clockInRecords = await client.query(`
            SELECT work_date, total_work_hours
            FROM clock_in_records
            WHERE employee_id = $1 AND company_id = $2
              AND work_date >= $3::date AND work_date <= $4::date
              AND clock_in_1 IS NOT NULL AND clock_out_1 IS NOT NULL
          `, [emp.id, companyId, periodStart, periodEnd]);

          if (settings.groupingType === 'outlet') {
            // Outlet companies: Use schedules to determine expected work days
            // Build a map of date -> hours worked
            const hoursMap = {};
            for (const rec of clockInRecords.rows) {
              const dateStr = rec.work_date.toISOString().split('T')[0];
              hoursMap[dateStr] = parseFloat(rec.total_work_hours) || 0;
            }

            // Get approved leave dates to exclude
            const leaveResult = await client.query(`
              SELECT generate_series(
                GREATEST(lr.start_date, $2::date),
                LEAST(lr.end_date, $3::date),
                '1 day'::interval
              )::date as leave_date
              FROM leave_requests lr
              WHERE lr.employee_id = $1
                AND lr.status = 'approved'
                AND lr.start_date <= $3::date
                AND lr.end_date >= $2::date
            `, [emp.id, periodStart, periodEnd]);
            const leaveDates = new Set(leaveResult.rows.map(r => r.leave_date.toISOString().split('T')[0]));

            // Get scheduled working days from schedules table
            const schedResult = await client.query(`
              SELECT schedule_date FROM schedules
              WHERE employee_id = $1 AND schedule_date >= $2::date AND schedule_date <= $3::date
                AND status IN ('scheduled', 'completed', 'confirmed')
            `, [emp.id, periodStart, periodEnd]);
            const scheduledDates = schedResult.rows.map(r => r.schedule_date.toISOString().split('T')[0]);

            // For each scheduled working day, check if short hours
            for (const dateStr of scheduledDates) {
              if (leaveDates.has(dateStr)) continue; // Skip leave days
              if (hoursMap[dateStr] !== undefined) {
                const hoursWorked = hoursMap[dateStr];
                const baseHours = Math.min(hoursWorked, expectedHoursPerDay);
                const deficit = Math.max(0, expectedHoursPerDay - baseHours);
                shortHours += deficit;
              }
            }
          } else {
            // Non-outlet companies: Calculate directly from clock-in records
            for (const rec of clockInRecords.rows) {
              const hoursWorked = parseFloat(rec.total_work_hours) || 0;
              const baseHours = Math.min(hoursWorked, expectedHoursPerDay);
              const deficit = expectedHoursPerDay - baseHours;
              if (deficit > 0) {
                shortHours += deficit;
              }
            }
          }

          shortHours = Math.round(shortHours * 100) / 100;
          if (shortHours > 0) {
            const hourlyRate = basicSalary / workingDays / expectedHoursPerDay;
            shortHoursDeduction = Math.round(hourlyRate * shortHours * 100) / 100;
          }
        } catch (e) {
          console.warn(`Short hours calculation failed for ${emp.name}:`, e.message);
        }
      }

      // PH pay for full-time (skip for part-time - they get 2x hourly rate on PH already)
      if (features.auto_ph_pay && !isPartTime) {
        try {
          phDaysWorked = await calculatePHDaysWorked(
            emp.id, companyId,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0]
          );
          if (phDaysWorked > 0 && basicSalary > 0) {
            const dailyRate = basicSalary / workingDays;
            phPay = phDaysWorked * dailyRate * rates.ph_multiplier;
          }
        } catch (e) {
          console.warn(`PH calculation failed for ${emp.name}:`, e.message);
        }
      }

      // Unpaid leave / Schedule-based deductions
      // Skip for part-time - they're already paid by actual hours worked
      const dailyRate = basicSalary > 0 ? basicSalary / workingDays : 0;
      let unpaidDeduction = 0;
      let unpaidDays = 0;
      let scheduleBasedPay = null;

      if (!isPartTime) {
        // For outlet-based companies (Mimix), use schedule-based pay calculation
        if (settings.groupingType === 'outlet') {
          try {
            scheduleBasedPay = await calculateScheduleBasedPay(
              emp.id,
              period.start.toISOString().split('T')[0],
              period.end.toISOString().split('T')[0]
            );

            // Calculate pay based on payable days only
            // If they have schedules, pay = (payableDays / scheduledDays) * basicSalary
            if (scheduleBasedPay.scheduledDays > 0) {
              const scheduledDailyRate = basicSalary / scheduleBasedPay.scheduledDays;
              const scheduledPay = scheduleBasedPay.payableDays * scheduledDailyRate;
              unpaidDeduction = basicSalary - scheduledPay; // Deduct unattended days
              unpaidDays = scheduleBasedPay.absentDays;
            }
          } catch (e) {
            console.warn(`Schedule-based pay calculation failed for ${emp.name}:`, e.message);
            // Fallback to standard unpaid leave calculation
            unpaidDays = unpaidLeaveMap[emp.id] || 0;
            unpaidDeduction = dailyRate * unpaidDays;
          }
        } else {
          // Standard unpaid leave calculation for non-outlet companies
          unpaidDays = unpaidLeaveMap[emp.id] || 0;
          unpaidDeduction = dailyRate * unpaidDays;
        }
      }

      // Auto-calculate absent days and short hours
      // Absent = standard working days (26) - days actually worked
      // Days worked = must have BOTH schedule AND clock-in record
      let absentDays = 0;
      let absentDayDeduction = 0;

      // For outlet-based companies: absent days = 26 - total clock-in days
      // (The "schedule requirement" affects short hours deduction and "No Schedule" display, not absent days)
      // We still use scheduleBasedPay for late days, short hours, attendance bonus calculation

      // For non-outlet companies (or any company without schedule-based absent days),
      // calculate absent days from clock-in records
      if (!isPartTime) {
        try {
          const periodStart = period.start.toISOString().split('T')[0];
          const periodEnd = period.end.toISOString().split('T')[0];
          const expectedHoursPerDay = rates.standard_work_hours || 8;

          // Count distinct days worked and total hours from clock-in records
          const clockInResult = await client.query(`
            SELECT COUNT(DISTINCT work_date) as days_worked,
                   COALESCE(SUM(total_work_hours), 0) as total_hours
            FROM clock_in_records
            WHERE employee_id = $1
              AND work_date BETWEEN $2 AND $3
              AND status = 'completed'
          `, [emp.id, periodStart, periodEnd]);
          const daysWorked = parseInt(clockInResult.rows[0]?.days_worked) || 0;
          const totalHoursWorked = parseFloat(clockInResult.rows[0]?.total_hours) || 0;

          // Calculate absent days from clock-in records (all companies)
          if (daysWorked < workingDays) {
            // Count approved paid leave days in the period (these count as "attended")
            const paidLeaveResult = await client.query(`
              SELECT COALESCE(SUM(
                GREATEST(0,
                  (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
                  - (SELECT COUNT(*) FROM generate_series(
                      GREATEST(lr.start_date, $2::date),
                      LEAST(lr.end_date, $1::date),
                      '1 day'::interval
                    ) d WHERE EXTRACT(DOW FROM d) IN (0, 6))
                )
              ), 0) as paid_leave_days
              FROM leave_requests lr
              JOIN leave_types lt ON lr.leave_type_id = lt.id
              WHERE lr.employee_id = $3
                AND lt.is_paid = TRUE
                AND lr.status = 'approved'
                AND lr.start_date <= $1
                AND lr.end_date >= $2
            `, [periodEnd, periodStart, emp.id]);
            const paidLeaveDays = parseFloat(paidLeaveResult.rows[0]?.paid_leave_days) || 0;

            // Absent = standard working days - days worked - paid leave - unpaid leave (already deducted)
            absentDays = Math.max(0, workingDays - daysWorked - paidLeaveDays - unpaidDays);
            absentDayDeduction = Math.round(dailyRate * absentDays * 100) / 100;
          }

          // Short hours calculation for non-outlet companies only
          if (settings.groupingType !== 'outlet') {
            // Short hours = expected hours - actual base hours (excluding OT)
            // Expected hours = days worked × standard hours per day
            // Actual base hours = total hours worked - OT hours
            const expectedHours = daysWorked * expectedHoursPerDay;
            const actualBaseHours = totalHoursWorked - otHours;
            const calculatedShortHours = Math.max(0, expectedHours - actualBaseHours);
            if (calculatedShortHours > 0) {
              shortHours = Math.round(calculatedShortHours * 100) / 100;
              const hourlyRate = basicSalary / workingDays / expectedHoursPerDay;
              shortHoursDeduction = Math.round(hourlyRate * shortHours * 100) / 100;
            }
          }
        } catch (e) {
          console.warn(`Absent days/short hours calculation failed for ${emp.name}:`, e.message);
        }
      }

      // Claims (reimbursements - added to pay)
      const claimsAmount = claimsMap[emp.id] || 0;

      // Salary advance deductions
      const advanceDeduction = advancesMap[emp.id] || 0;

      // Mimix attendance bonus calculation (outlet-based companies only)
      // Based on late days and absent days (from clock-in records) in the period
      let attendanceBonus = 0;
      let lateDays = 0;
      if (settings.groupingType === 'outlet' && !isPartTime) {
        lateDays = scheduleBasedPay?.lateDays || 0;
        // Use absentDays calculated from clock-in records (not schedule-based)
        attendanceBonus = calculateMimixAttendanceBonus(lateDays, absentDays);
      }

      // Calculate totals
      const totalAllowances = fixedAllowance + flexAllowance;
      const grossBeforeDeductions = basicSalary + totalAllowances + otAmount + phPay + commissionAmount + claimsAmount + attendanceBonus;
      const grossSalary = Math.max(0, grossBeforeDeductions - unpaidDeduction - shortHoursDeduction - absentDayDeduction);

      // Statutory base calculation
      // EPF/SOCSO/EIS should be based on actual pay received (after absent/unpaid/short hours deductions)
      // This ensures statutory contributions are proportional to actual work done
      const actualBasicPay = Math.max(0, basicSalary - unpaidDeduction - shortHoursDeduction - absentDayDeduction);
      let statutoryBase = actualBasicPay + commissionAmount;
      if (statutory.statutory_on_ot) statutoryBase += otAmount;
      if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
      if (statutory.statutory_on_allowance) statutoryBase += totalAllowances;

      // Get YTD data for PCB
      let ytdData = null;
      if (features.ytd_pcb_calculation) {
        ytdData = await getYTDData(emp.id, year, month);
      }

      // Calculate statutory deductions with breakdown for proper PCB calculation
      // EPF/SOCSO/EIS are on statutoryBase (basic + commission, optionally OT/allowance)
      // PCB is on FULL gross (including allowance) per LHDN formula
      // taxableAllowance: typed flex allowances use per-type is_taxable flag
      // default_allowance (fixedAllowance) uses employee-level allowance_pcb setting
      const allowancePcb = emp.allowance_pcb || 'excluded';
      const fixedAllowanceTaxable = allowancePcb === 'excluded' ? 0 : fixedAllowance;
      const salaryBreakdown = {
        basic: basicSalary,
        allowance: totalAllowances,
        taxableAllowance: flexAllowData.taxable + fixedAllowanceTaxable,
        commission: commissionAmount,
        bonus: 0,  // No bonus at payroll creation - added via edits
        ot: otAmount,
        pcbGross: grossSalary  // Full gross for PCB calculation
      };
      const statutoryResult = calculateAllStatutory(statutoryBase, emp, month, ytdData, salaryBreakdown);

      // Apply statutory toggles
      const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
      const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
      const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
      const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
      const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
      const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;
      const pcb = statutory.pcb_enabled ? statutoryResult.pcb : 0;

      // EPF breakdown for MyTax entry (Saraan Biasa vs Saraan Tambahan)
      // EPF rate is 11% - split between normal salary and additional remuneration
      // Saraan Biasa: basic salary + fixed allowance (regular monthly pay)
      // Saraan Tambahan: commission + OT + bonus + incentive (variable/additional pay)
      const normalSalary = basicSalary + totalAllowances;  // Regular monthly salary
      const additionalSalary = commissionAmount + otAmount;  // Additional remuneration
      const epfOnNormal = Math.round(normalSalary * 0.11);
      const epfOnAdditional = Math.round(additionalSalary * 0.11);

      // PCB breakdown from statutory calculation
      const pcbNormal = statutoryResult.pcbBreakdown?.normalSTD || 0;
      const pcbAdditional = statutoryResult.pcbBreakdown?.additionalSTD || 0;

      const totalDeductions = unpaidDeduction + absentDayDeduction + shortHoursDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + advanceDeduction;
      const netPay = grossSalary - totalDeductions + unpaidDeduction + absentDayDeduction + shortHoursDeduction; // these already subtracted from gross
      const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

      // Variance calculation
      const prevMonthNet = prevPayroll?.net_pay || null;
      let varianceAmount = null, variancePercent = null;
      if (prevMonthNet !== null && prevMonthNet > 0) {
        varianceAmount = netPay - prevMonthNet;
        variancePercent = (varianceAmount / prevMonthNet) * 100;
      }

      // Insert payroll item
      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id,
          basic_salary, fixed_allowance, commission_amount, claims_amount,
          ot_hours, ot_amount, ph_days_worked, ph_pay,
          unpaid_leave_days, unpaid_leave_deduction, advance_deduction,
          short_hours, short_hours_deduction,
          absent_days, absent_day_deduction,
          attendance_bonus, late_days,
          gross_salary, statutory_base,
          epf_employee, epf_employer,
          epf_on_normal, epf_on_additional,
          socso_employee, socso_employer,
          eis_employee, eis_employer,
          pcb, pcb_normal, pcb_additional,
          total_deductions, net_pay, employer_total_cost,
          sales_amount, salary_calculation_method,
          ytd_gross, ytd_epf, ytd_pcb,
          prev_month_net, variance_amount, variance_percent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43)
      `, [
        runId, emp.id,
        basicSalary, totalAllowances, commissionAmount, claimsAmount,
        otHours, otAmount, phDaysWorked, phPay,
        unpaidDays, unpaidDeduction, advanceDeduction,
        shortHours, shortHoursDeduction,
        absentDays, absentDayDeduction,
        attendanceBonus, lateDays,
        grossSalary, statutoryBase,
        epfEmployee, epfEmployer,
        epfOnNormal, epfOnAdditional,
        socsoEmployee, socsoEmployer,
        eisEmployee, eisEmployer,
        pcb, pcbNormal, pcbAdditional,
        totalDeductions, netPay, employerCost,
        salesAmount, salaryCalculationMethod,
        ytdData?.ytdGross || 0, ytdData?.ytdEPF || 0, ytdData?.ytdPCB || 0,
        prevMonthNet, varianceAmount, variancePercent
      ]);

      stats.created++;
      stats.totalGross += grossSalary;
      stats.totalNet += netPay;
      stats.totalDeductions += totalDeductions;
      stats.totalEmployerCost += employerCost;

      // Warning for no salary
      if (basicSalary === 0) {
        warnings.push(`${emp.name} has no basic salary set`);
      }

      // Warning for large variance (configurable threshold, default 5%)
      const varianceThreshold = features.variance_threshold ?? 5;
      if (variancePercent !== null && Math.abs(variancePercent) > varianceThreshold) {
        warnings.push(`${emp.name} has ${variancePercent > 0 ? '+' : ''}${variancePercent.toFixed(1)}% variance from last month (threshold: ${varianceThreshold}%)`);
      }
    }

    // Update run totals and store excluded employees
    await client.query(`
      UPDATE payroll_runs SET
        total_gross = $1, total_deductions = $2, total_net = $3,
        total_employer_cost = $4, employee_count = $5,
        has_variance_warning = $6, excluded_employees = $8
      WHERE id = $7
    `, [stats.totalGross, stats.totalDeductions, stats.totalNet, stats.totalEmployerCost, stats.created, warnings.length > 0, runId,
        excludedEmployees.length > 0 ? JSON.stringify(excludedEmployees) : null]);

    await client.query('COMMIT');

    res.status(201).json({
      message: `Payroll run created with ${stats.created} employees`,
      run: runResult.rows[0],
      stats,
      warnings: warnings.length > 0 ? warnings : undefined,
      excludedEmployees: excludedEmployees.length > 0 ? excludedEmployees : undefined,
      employee_count: stats.created,
      carried_forward_count: 0
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating payroll run:', error);
    res.status(500).json({ error: 'Failed to create payroll run: ' + error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/payroll/preview
 * Preview/simulate payroll calculation without creating a run
 *
 * Supports "what-if" scenarios:
 * - ?salary_change[employee_id]=new_salary - Preview with salary changes
 *
 * Returns calculated values without any database writes.
 */
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, department_id, outlet_id, employee_ids, salary_changes } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Get company settings
    const settings = await getCompanySettings(companyId);
    const { features, rates, period: periodConfig, statutory } = settings;
    const isOutletBased = settings.groupingType === 'outlet';

    // Get period dates
    const period = getPayrollPeriod(month, year, periodConfig);
    const workingDays = rates.standard_work_days || getWorkingDaysInMonth(year, month);

    // Build employee query
    const periodStart = period.start.toISOString().split('T')[0];
    const periodEnd = period.end.toISOString().split('T')[0];

    let employeeQuery = `
      SELECT e.*,
             e.default_basic_salary as basic_salary,
             e.default_allowance as fixed_allowance,
             d.name as department_name,
             d.payroll_structure_code
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
        AND e.status = 'active'
    `;
    let employeeParams = [companyId];

    if (isOutletBased && outlet_id) {
      // Include employees with outlet_id OR linked via employee_outlets (managers)
      employeeQuery += ` AND (e.outlet_id = $${employeeParams.length + 1} OR e.id IN (SELECT employee_id FROM employee_outlets WHERE outlet_id = $${employeeParams.length + 1}))`;
      employeeParams.push(outlet_id);
    } else if (!isOutletBased && department_id) {
      employeeQuery += ` AND e.department_id = $${employeeParams.length + 1}`;
      employeeParams.push(department_id);
    }

    if (employee_ids && employee_ids.length > 0) {
      employeeQuery += ` AND e.id = ANY($${employeeParams.length + 1})`;
      employeeParams.push(employee_ids);
    }

    // Exclude employees with NO schedule AND NO clock-in for the entire period (considered inactive)
    employeeQuery += ` AND (
      EXISTS (SELECT 1 FROM schedules s WHERE s.employee_id = e.id AND s.schedule_date BETWEEN $${employeeParams.length + 1} AND $${employeeParams.length + 2})
      OR EXISTS (SELECT 1 FROM clock_in_records cr WHERE cr.employee_id = e.id AND cr.work_date BETWEEN $${employeeParams.length + 1} AND $${employeeParams.length + 2})
    )`;
    employeeParams.push(periodStart, periodEnd);

    const employees = await pool.query(employeeQuery, employeeParams);

    // Get previous month data for variance
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    let prevPayrollMap = {};
    const prevResult = await pool.query(`
      SELECT pi.employee_id, pi.net_pay
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.month = $1 AND pr.year = $2 AND pr.company_id = $3
    `, [prevMonth, prevYear, companyId]);

    prevResult.rows.forEach(row => {
      prevPayrollMap[row.employee_id] = row;
    });

    // Calculate preview for each employee
    const previewItems = [];
    let totalGross = 0, totalNet = 0, totalDeductions = 0;

    for (const emp of employees.rows) {
      // Apply salary changes if provided (for what-if scenarios)
      let basicSalary = parseFloat(emp.basic_salary) || 0;
      let fixedAllowance = parseFloat(emp.fixed_allowance) || 0;

      if (salary_changes && salary_changes[emp.id]) {
        const changes = salary_changes[emp.id];
        if (changes.basic_salary !== undefined) {
          basicSalary = parseFloat(changes.basic_salary) || 0;
        }
        if (changes.fixed_allowance !== undefined) {
          fixedAllowance = parseFloat(changes.fixed_allowance) || 0;
        }
      }

      const totalAllowances = fixedAllowance;
      const isPartTime = emp.work_type === 'part_time' || emp.employment_type === 'part_time';

      // Calculate OT if enabled (works for both full-time and part-time)
      let otHours = 0, otAmount = 0;
      const fixedOT = parseFloat(emp.fixed_ot_amount) || 0;
      if (features.auto_ot_from_clockin && basicSalary > 0) {
        try {
          const otResult = await calculateOTFromClockIn(
            emp.id, companyId, emp.department_id,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0],
            basicSalary
          );
          otHours = otResult.total_ot_hours || 0;
          otAmount = otResult.total_ot_amount || 0;
        } catch (e) {
          console.warn(`OT calculation failed for employee ${emp.id}:`, e.message);
        }
      }
      // Use fixed OT amount if no auto OT calculated
      if (otAmount === 0 && fixedOT > 0) {
        otAmount = fixedOT;
      }

      // Calculate PH pay if enabled
      let phDaysWorked = 0, phPay = 0;
      if (features.auto_ph_pay && basicSalary > 0) {
        try {
          phDaysWorked = await calculatePHDaysWorked(
            emp.id, companyId,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0]
          );
          const dailyRate = basicSalary / workingDays;
          phPay = Math.round(phDaysWorked * dailyRate * 100) / 100;
        } catch (e) {
          console.warn(`PH calculation failed for employee ${emp.id}:`, e.message);
        }
      }

      // Calculate statutory base
      let statutoryBase = basicSalary + otAmount;
      if (statutory.statutory_on_allowance) {
        statutoryBase += totalAllowances;
      }

      // Gross salary
      const grossSalary = basicSalary + totalAllowances + otAmount + phPay;

      // Calculate statutory deductions
      const statutoryResult = calculateAllStatutory(statutoryBase, emp, month);

      const epfEmployee = statutory.epf_enabled ? (statutoryResult.epf?.employee || 0) : 0;
      const epfEmployer = statutory.epf_enabled ? (statutoryResult.epf?.employer || 0) : 0;
      const socsoEmployee = statutory.socso_enabled ? (statutoryResult.socso?.employee || 0) : 0;
      const socsoEmployer = statutory.socso_enabled ? (statutoryResult.socso?.employer || 0) : 0;
      const eisEmployee = statutory.eis_enabled ? (statutoryResult.eis?.employee || 0) : 0;
      const eisEmployer = statutory.eis_enabled ? (statutoryResult.eis?.employer || 0) : 0;
      const pcb = statutory.pcb_enabled ? (statutoryResult.pcb || 0) : 0;

      const totalDeductionsEmp = epfEmployee + socsoEmployee + eisEmployee + pcb;
      const netPay = grossSalary - totalDeductionsEmp;
      const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

      // Variance calculation
      const prevMonthNet = prevPayrollMap[emp.id]?.net_pay || null;
      let varianceAmount = null, variancePercent = null;
      if (prevMonthNet !== null && prevMonthNet > 0) {
        varianceAmount = netPay - prevMonthNet;
        variancePercent = (varianceAmount / prevMonthNet) * 100;
      }

      previewItems.push({
        employee_id: emp.id,
        employee_name: emp.name,
        employee_code: emp.employee_id,
        department_name: emp.department_name,
        basic_salary: basicSalary,
        fixed_allowance: fixedAllowance,
        ot_hours: otHours,
        ot_amount: otAmount,
        ph_days_worked: phDaysWorked,
        ph_pay: phPay,
        gross_salary: grossSalary,
        epf_employee: epfEmployee,
        epf_employer: epfEmployer,
        socso_employee: socsoEmployee,
        socso_employer: socsoEmployer,
        eis_employee: eisEmployee,
        eis_employer: eisEmployer,
        pcb: pcb,
        total_deductions: totalDeductionsEmp,
        net_pay: netPay,
        employer_total_cost: employerCost,
        prev_month_net: prevMonthNet,
        variance_amount: varianceAmount,
        variance_percent: variancePercent,
        salary_changed: salary_changes && salary_changes[emp.id] ? true : false
      });

      totalGross += grossSalary;
      totalNet += netPay;
      totalDeductions += totalDeductionsEmp;
    }

    res.json({
      preview: true,
      period: {
        month,
        year,
        start: period.start.toISOString().split('T')[0],
        end: period.end.toISOString().split('T')[0],
        label: period.label
      },
      items: previewItems,
      summary: {
        employee_count: previewItems.length,
        total_gross: Math.round(totalGross * 100) / 100,
        total_net: Math.round(totalNet * 100) / 100,
        total_deductions: Math.round(totalDeductions * 100) / 100
      },
      note: 'This is a preview only. No data has been saved to the database.'
    });

  } catch (error) {
    console.error('Error generating payroll preview:', error);
    res.status(500).json({ error: 'Failed to generate payroll preview: ' + error.message });
  }
});

/**
 * PUT /api/payroll/items/:id
 * Update a payroll item (manual adjustments)
 */
router.put('/items/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get current item and settings
    const itemResult = await pool.query(`
      SELECT pi.*, pr.month, pr.year, pr.status as run_status, pr.company_id,
             e.ic_number, e.date_of_birth, e.marital_status, e.spouse_working, e.children_count,
             e.residency_status, e.allowance_pcb
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = $1
    `, [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = itemResult.rows[0];

    // CRITICAL: Verify item belongs to this company
    if (item.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied: payroll item belongs to another company' });
    }

    if (item.run_status === 'finalized') {
      return res.status(400).json({ error: 'Cannot edit finalized payroll' });
    }

    const settings = await getCompanySettings(item.company_id);
    const { rates, statutory } = settings;

    // Calculate new values
    const basicSalary = parseFloat(updates.basic_salary ?? item.basic_salary) || 0;
    const wages = parseFloat(updates.wages ?? item.wages) || 0; // Part-time wages
    const partTimeHours = parseFloat(updates.part_time_hours ?? item.part_time_hours) || 0;
    const fixedAllowance = parseFloat(updates.fixed_allowance ?? item.fixed_allowance) || 0;
    const otHours = parseFloat(updates.ot_hours ?? item.ot_hours) || 0;
    // OT amount: Allow manual override similar to EPF/PCB
    // ot_override can be provided to set exact OT amount (even 0)
    const otAmount = updates.ot_override !== undefined && updates.ot_override !== null && updates.ot_override !== ''
      ? parseFloat(updates.ot_override) || 0
      : parseFloat(updates.ot_amount ?? item.ot_amount) || 0;
    const phDaysWorked = parseFloat(updates.ph_days_worked ?? item.ph_days_worked) || 0;
    const phPay = parseFloat(updates.ph_pay ?? item.ph_pay) || 0;
    const incentiveAmount = parseFloat(updates.incentive_amount ?? item.incentive_amount) || 0;
    const commissionAmount = parseFloat(updates.commission_amount ?? item.commission_amount) || 0;
    const tradeCommission = parseFloat(updates.trade_commission_amount ?? item.trade_commission_amount) || 0;
    const outstationAmount = parseFloat(updates.outstation_amount ?? item.outstation_amount) || 0;
    const bonus = parseFloat(updates.bonus ?? item.bonus) || 0;
    const otherDeductions = parseFloat(updates.other_deductions ?? item.other_deductions) || 0;
    const shortHours = parseFloat(updates.short_hours ?? item.short_hours) || 0;
    // Short hours deduction: Allow manual override
    const shortHoursDeduction = updates.short_override !== undefined && updates.short_override !== null && updates.short_override !== ''
      ? parseFloat(updates.short_override) || 0
      : parseFloat(updates.short_hours_deduction ?? item.short_hours_deduction) || 0;

    // Combined days not worked (unpaid leave + absent) - simplified approach
    // If days_not_worked is provided, use it; otherwise combine from database
    const currentUnpaidDays = parseFloat(item.unpaid_leave_days) || 0;
    const currentAbsentDays = parseFloat(item.absent_days) || 0;
    const daysNotWorked = updates.days_not_worked !== undefined
      ? parseFloat(updates.days_not_worked) || 0
      : currentUnpaidDays + currentAbsentDays;

    // Combined deduction for days not worked (unpaid + absent)
    // deduction_override can be provided to set exact deduction amount (even 0)
    const workingDays = rates.standard_work_days || 26;
    const dailyRate = basicSalary > 0 ? basicSalary / workingDays : 0;
    const calculatedDeduction = Math.round(dailyRate * daysNotWorked * 100) / 100;
    const combinedDeduction = updates.deduction_override !== undefined && updates.deduction_override !== null && updates.deduction_override !== ''
      ? parseFloat(updates.deduction_override) || 0
      : (updates.total_unpaid_deduction !== undefined ? parseFloat(updates.total_unpaid_deduction) || 0 : calculatedDeduction);

    // Store in absent_day_deduction, set unpaid to 0 (combined approach)
    const absentDays = daysNotWorked;
    const absentDayDeduction = combinedDeduction;
    const unpaidDeduction = 0; // Combined into absentDayDeduction

    const attendanceBonus = parseFloat(updates.attendance_bonus ?? item.attendance_bonus) || 0;
    const lateDays = parseFloat(updates.late_days ?? item.late_days) || 0;

    // Claims: Allow manual override similar to EPF/PCB
    const claimsAmount = updates.claims_override !== undefined && updates.claims_override !== null && updates.claims_override !== ''
      ? parseFloat(updates.claims_override) || 0
      : parseFloat(item.claims_amount) || 0;

    // Gross salary (includes wages for part-time and attendance bonus for Mimix)
    const grossSalary = basicSalary + wages + fixedAllowance + otAmount + phPay + incentiveAmount +
                        commissionAmount + tradeCommission + outstationAmount + bonus + attendanceBonus + claimsAmount - unpaidDeduction - shortHoursDeduction - absentDayDeduction;

    // Statutory base - EPF/SOCSO/EIS based on actual pay received (after deductions)
    const actualBasicPay = Math.max(0, (basicSalary + wages) - unpaidDeduction - shortHoursDeduction - absentDayDeduction);
    let statutoryBase = actualBasicPay + commissionAmount + tradeCommission + bonus;
    if (statutory.statutory_on_ot) statutoryBase += otAmount;
    if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
    if (statutory.statutory_on_allowance) statutoryBase += fixedAllowance;
    if (statutory.statutory_on_incentive) statutoryBase += incentiveAmount;

    // Get YTD data
    let ytdData = null;
    if (settings.features.ytd_pcb_calculation) {
      ytdData = await getYTDData(item.employee_id, item.year, item.month);
    }

    // Recalculate statutory with breakdown for proper PCB calculation
    // EPF/SOCSO/EIS on statutoryBase, PCB on full gross
    const salaryBreakdown = {
      basic: basicSalary + wages,  // Include wages for part-time
      allowance: fixedAllowance + outstationAmount + incentiveAmount,  // All allowance-type items
      commission: commissionAmount + tradeCommission,
      bonus: bonus,
      ot: otAmount + phPay,  // OT and PH pay as additional
      pcbGross: grossSalary
    };
    const statutoryResult = calculateAllStatutory(statutoryBase, item, item.month, ytdData, salaryBreakdown);

    // EPF: Allow manual override (for matching KWSP table), otherwise use calculated value
    // epf_override can be provided to set exact EPF amount from KWSP contribution table
    const epfEmployee = updates.epf_override !== undefined && updates.epf_override !== null && updates.epf_override !== ''
      ? parseFloat(updates.epf_override) || 0
      : (statutory.epf_enabled ? statutoryResult.epf.employee : 0);
    // EPF employer is auto-calculated based on employee override or standard rate
    const epfEmployerRate = statutoryBase <= 5000 ? 0.13 : 0.12;
    const epfEmployer = updates.epf_override !== undefined && updates.epf_override !== null && updates.epf_override !== ''
      ? Math.round((parseFloat(updates.epf_override) / 0.11) * epfEmployerRate) // Calculate employer based on same wage bracket
      : (statutory.epf_enabled ? statutoryResult.epf.employer : 0);

    const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
    const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
    const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
    const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;

    // PCB: Allow manual override (for matching MyTax), otherwise use calculated value
    // pcb_override can be provided to set exact PCB amount from MyTax
    const pcb = updates.pcb_override !== undefined && updates.pcb_override !== null && updates.pcb_override !== ''
      ? parseFloat(updates.pcb_override) || 0
      : (statutory.pcb_enabled ? statutoryResult.pcb : 0);

    const totalDeductions = unpaidDeduction + absentDayDeduction + shortHoursDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + otherDeductions;
    const netPay = grossSalary + unpaidDeduction + absentDayDeduction + shortHoursDeduction - totalDeductions;
    const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

    // Update item - combined approach clears unpaid_leave fields
    const result = await pool.query(`
      UPDATE payroll_items SET
        basic_salary = $1, wages = $35, part_time_hours = $36, fixed_allowance = $2,
        ot_hours = $3, ot_amount = $4,
        ph_days_worked = $5, ph_pay = $6,
        incentive_amount = $7, commission_amount = $8,
        trade_commission_amount = $9, outstation_amount = $10, bonus = $11,
        other_deductions = $12, deduction_remarks = $13,
        gross_salary = $14, statutory_base = $15,
        epf_employee = $16, epf_employer = $17,
        socso_employee = $18, socso_employer = $19,
        eis_employee = $20, eis_employer = $21,
        pcb = $22,
        total_deductions = $23, net_pay = $24, employer_total_cost = $25,
        notes = $26, claims_amount = $27,
        short_hours = $29, short_hours_deduction = $30,
        absent_days = $31, absent_day_deduction = $32,
        unpaid_leave_days = 0, unpaid_leave_deduction = 0,
        attendance_bonus = $33, late_days = $34,
        updated_at = NOW()
      WHERE id = $28
      RETURNING *
    `, [
      basicSalary, fixedAllowance,
      otHours, otAmount,
      phDaysWorked, phPay,
      incentiveAmount, commissionAmount,
      tradeCommission, outstationAmount, bonus,
      otherDeductions, updates.deduction_remarks,
      grossSalary, statutoryBase,
      epfEmployee, epfEmployer,
      socsoEmployee, socsoEmployer,
      eisEmployee, eisEmployer,
      pcb,
      totalDeductions, netPay, employerCost,
      updates.notes, claimsAmount, id,
      shortHours, shortHoursDeduction,
      absentDays, absentDayDeduction,
      attendanceBonus, lateDays,
      wages, partTimeHours
    ]);

    // Update run totals
    await updateRunTotals(item.payroll_run_id);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payroll item:', error);
    res.status(500).json({ error: 'Failed to update payroll item' });
  }
});

/**
 * DELETE /api/payroll/items/:id
 * Remove an employee from a draft payroll run
 * Employee will be available for selection in other payroll runs
 */
router.delete('/items/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get item and verify ownership
    const itemResult = await pool.query(`
      SELECT pi.*, pr.status as run_status, pr.company_id, pr.id as run_id,
             e.name as employee_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = $1
    `, [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = itemResult.rows[0];

    // Verify company ownership
    if (item.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied: payroll item belongs to another company' });
    }

    // Only allow deletion from draft payroll
    if (item.run_status === 'finalized') {
      return res.status(400).json({ error: 'Cannot remove employee from finalized payroll' });
    }

    // Delete the payroll item
    await pool.query('DELETE FROM payroll_items WHERE id = $1', [id]);

    // Update run totals
    await updateRunTotals(item.run_id);

    // Check if run is now empty
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = $1',
      [item.run_id]
    );

    res.json({
      message: `${item.employee_name} removed from payroll`,
      employee_id: item.employee_id,
      run_id: item.run_id,
      remaining_employees: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error deleting payroll item:', error);
    res.status(500).json({ error: 'Failed to remove employee from payroll' });
  }
});

/**
 * POST /api/payroll/items/:id/recalculate
 * Recalculate OT and statutory for a payroll item from clock-in records
 */
router.post('/items/:id/recalculate', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get current item with employee and run info
    const itemResult = await pool.query(`
      SELECT pi.*, pr.month, pr.year, pr.status as run_status, pr.company_id,
             pr.period_start_date, pr.period_end_date,
             e.id as emp_id, e.department_id, e.default_basic_salary, e.fixed_ot_amount,
             e.ic_number, e.date_of_birth, e.marital_status, e.spouse_working, e.children_count,
             e.residency_status, e.allowance_pcb, e.work_type, e.employment_type, e.hourly_rate
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = $1
    `, [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = itemResult.rows[0];

    if (item.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (item.run_status === 'finalized') {
      return res.status(400).json({ error: 'Cannot recalculate finalized payroll' });
    }

    const settings = await getCompanySettings(companyId);
    const { rates, statutory, features } = settings;

    // PRESERVE OT values - don't recalculate
    // Users can manually edit OT in the edit form
    // The recalculate endpoint should only recalculate statutory deductions
    let otHours = parseFloat(item.ot_hours) || 0;
    let otAmount = parseFloat(item.ot_amount) || 0;
    const isPartTime = item.work_type === 'part_time' || item.employment_type === 'part_time';

    // Calculate wages for part-time employees
    let wages = 0, partTimeHoursWorked = 0, phPay = parseFloat(item.ph_pay) || 0;
    if (isPartTime) {
      try {
        const partTimeData = await calculatePartTimeHours(
          item.emp_id,
          item.period_start_date,
          item.period_end_date,
          companyId, rates
        );
        wages = partTimeData.normalPay || 0;
        partTimeHoursWorked = partTimeData.normalHours || 0;
        phPay = partTimeData.phPay || 0; // Part-time PH pay from calculation
      } catch (e) {
        console.warn('Part-time hours calculation failed:', e.message);
      }
    }

    // Get current values
    const basicSalary = isPartTime ? 0 : (parseFloat(item.basic_salary) || 0);
    const fixedAllowance = parseFloat(item.fixed_allowance) || 0;
    const incentiveAmount = parseFloat(item.incentive_amount) || 0;
    const commissionAmount = parseFloat(item.commission_amount) || 0;
    const tradeCommission = parseFloat(item.trade_commission_amount) || 0;
    const outstationAmount = parseFloat(item.outstation_amount) || 0;
    const bonus = parseFloat(item.bonus) || 0;
    const claimsAmount = parseFloat(item.claims_amount) || 0;
    const advanceDeduction = parseFloat(item.advance_deduction) || 0;
    const unpaidDeduction = parseFloat(item.unpaid_leave_deduction) || 0;
    const otherDeductions = parseFloat(item.other_deductions) || 0;
    let shortHoursDeduction = parseFloat(item.short_hours_deduction) || 0;
    let shortHours = parseFloat(item.short_hours) || 0;

    // PRESERVE absent days values - don't recalculate
    // Users can manually edit absent days/deduction in the edit form
    // The recalculate endpoint should only recalculate OT and statutory
    const workingDays = rates.standard_work_days || 26;
    let absentDays = parseFloat(item.absent_days) || 0;
    let absentDayDeduction = parseFloat(item.absent_day_deduction) || 0;

    // Calculate gross (include wages for part-time)
    const grossSalary = basicSalary + wages + fixedAllowance + otAmount + phPay + incentiveAmount +
                        commissionAmount + tradeCommission + outstationAmount + bonus + claimsAmount - unpaidDeduction - shortHoursDeduction - absentDayDeduction;

    // Statutory base - EPF/SOCSO/EIS based on actual pay received (after deductions)
    const actualBasicPay = Math.max(0, (basicSalary + wages) - unpaidDeduction - shortHoursDeduction - absentDayDeduction);
    let statutoryBase = actualBasicPay + commissionAmount + tradeCommission + bonus;
    if (statutory.statutory_on_ot) statutoryBase += otAmount;
    if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
    if (statutory.statutory_on_allowance) statutoryBase += fixedAllowance;
    if (statutory.statutory_on_incentive) statutoryBase += incentiveAmount;

    // Get YTD data
    let ytdData = null;
    if (features.ytd_pcb_calculation) {
      ytdData = await getYTDData(item.emp_id, item.year, item.month);
    }

    // Recalculate statutory with breakdown for proper PCB calculation
    // EPF/SOCSO/EIS on statutoryBase, PCB on full gross
    const salaryBreakdown = {
      basic: basicSalary + wages, // Include wages for part-time
      allowance: fixedAllowance + outstationAmount + incentiveAmount,
      commission: commissionAmount + tradeCommission,
      bonus: bonus,
      ot: otAmount + phPay,
      pcbGross: grossSalary
    };
    const statutoryResult = calculateAllStatutory(statutoryBase, item, item.month, ytdData, salaryBreakdown);

    const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
    const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
    const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
    const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
    const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
    const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;
    const pcb = statutory.pcb_enabled ? statutoryResult.pcb : 0;

    const totalDeductions = unpaidDeduction + absentDayDeduction + shortHoursDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + advanceDeduction + otherDeductions;
    const netPay = grossSalary + unpaidDeduction + absentDayDeduction + shortHoursDeduction - totalDeductions;
    const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

    // Update item
    const result = await pool.query(`
      UPDATE payroll_items SET
        ot_hours = $1, ot_amount = $2,
        gross_salary = $3, statutory_base = $4,
        epf_employee = $5, epf_employer = $6,
        socso_employee = $7, socso_employer = $8,
        eis_employee = $9, eis_employer = $10,
        pcb = $11,
        total_deductions = $12, net_pay = $13, employer_total_cost = $14,
        absent_days = $16, absent_day_deduction = $17,
        short_hours = $18, short_hours_deduction = $19,
        wages = $20, part_time_hours = $21, ph_pay = $22,
        basic_salary = $23,
        updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `, [
      otHours, otAmount,
      grossSalary, statutoryBase,
      epfEmployee, epfEmployer,
      socsoEmployee, socsoEmployer,
      eisEmployee, eisEmployer,
      pcb,
      totalDeductions, netPay, employerCost,
      id,
      absentDays, absentDayDeduction,
      shortHours, shortHoursDeduction,
      wages, partTimeHoursWorked, phPay,
      basicSalary
    ]);

    // Update run totals
    await updateRunTotals(item.payroll_run_id);

    res.json({
      item: result.rows[0],
      recalculated: {
        ot_hours: otHours,
        ot_amount: otAmount,
        absent_days: absentDays,
        absent_day_deduction: absentDayDeduction,
        short_hours: shortHours,
        short_hours_deduction: shortHoursDeduction,
        wages: wages,
        part_time_hours: partTimeHoursWorked,
        ph_pay: phPay,
        statutory_base: statutoryBase,
        epf_employee: epfEmployee,
        socso_employee: socsoEmployee,
        eis_employee: eisEmployee,
        pcb: pcb,
        gross_salary: grossSalary,
        net_pay: netPay
      }
    });
  } catch (error) {
    console.error('Error recalculating payroll item:', error);
    res.status(500).json({ error: 'Failed to recalculate: ' + error.message });
  }
});

/**
 * POST /api/payroll/runs/:id/recalculate-all
 * Recalculate all items in a payroll run
 */
router.post('/runs/:id/recalculate-all', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get run
    const runResult = await pool.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];
    if (run.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (run.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot recalculate finalized payroll' });
    }

    // Get all items
    const itemsResult = await pool.query(
      'SELECT id FROM payroll_items WHERE payroll_run_id = $1',
      [id]
    );

    let recalculatedCount = 0;
    let errors = [];

    // Recalculate each item
    for (const item of itemsResult.rows) {
      try {
        // Call the recalculate logic inline (simplified)
        const itemData = await pool.query(`
          SELECT pi.*, pr.month, pr.year, pr.period_start_date, pr.period_end_date,
                 e.id as emp_id, e.department_id, e.fixed_ot_amount,
                 e.ic_number, e.date_of_birth, e.marital_status, e.spouse_working, e.children_count,
                 e.residency_status, e.allowance_pcb, e.work_type, e.employment_type, e.hourly_rate
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN employees e ON pi.employee_id = e.id
          WHERE pi.id = $1
        `, [item.id]);

        const i = itemData.rows[0];
        const settings = await getCompanySettings(companyId);
        const { rates, statutory, features } = settings;

        // PRESERVE OT values - don't recalculate
        // Users can manually edit OT in the edit form
        let otHours = parseFloat(i.ot_hours) || 0;
        let otAmount = parseFloat(i.ot_amount) || 0;
        const isPartTime = i.work_type === 'part_time' || i.employment_type === 'part_time';

        // Calculate wages for part-time employees
        let wages = parseFloat(i.wages) || 0;
        let partTimeHoursWorked = parseFloat(i.part_time_hours) || 0;
        let phPay = parseFloat(i.ph_pay) || 0;

        if (isPartTime) {
          try {
            const partTimeData = await calculatePartTimeHours(
              i.emp_id,
              i.period_start_date,
              i.period_end_date,
              companyId, rates
            );
            wages = partTimeData.normalPay || 0;
            partTimeHoursWorked = partTimeData.normalHours || 0;
            phPay = partTimeData.phPay || 0;
          } catch (e) {
            console.warn('Part-time hours calculation failed:', e.message);
          }
        }

        // Calculate values
        const basicSalary = isPartTime ? 0 : (parseFloat(i.basic_salary) || 0);
        const fixedAllowance = parseFloat(i.fixed_allowance) || 0;
        const incentiveAmount = parseFloat(i.incentive_amount) || 0;
        const commissionAmount = parseFloat(i.commission_amount) || 0;
        const tradeCommission = parseFloat(i.trade_commission_amount) || 0;
        const outstationAmount = parseFloat(i.outstation_amount) || 0;
        const bonus = parseFloat(i.bonus) || 0;
        const claimsAmount = parseFloat(i.claims_amount) || 0;
        const advanceDeduction = parseFloat(i.advance_deduction) || 0;
        const unpaidDeduction = parseFloat(i.unpaid_leave_deduction) || 0;
        const otherDeductions = parseFloat(i.other_deductions) || 0;
        const shortHoursDeduction = parseFloat(i.short_hours_deduction) || 0;
        const absentDayDeduction = parseFloat(i.absent_day_deduction) || 0;

        const grossSalary = basicSalary + wages + fixedAllowance + otAmount + phPay + incentiveAmount +
                          commissionAmount + tradeCommission + outstationAmount + bonus + claimsAmount - unpaidDeduction - shortHoursDeduction - absentDayDeduction;

        // Statutory base - EPF/SOCSO/EIS based on actual pay received (after deductions)
        const actualBasicPay = Math.max(0, (basicSalary + wages) - unpaidDeduction - shortHoursDeduction - absentDayDeduction);
        let statutoryBase = actualBasicPay + commissionAmount + tradeCommission + bonus;
        if (statutory.statutory_on_ot) statutoryBase += otAmount;
        if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
        if (statutory.statutory_on_allowance) statutoryBase += fixedAllowance;
        if (statutory.statutory_on_incentive) statutoryBase += incentiveAmount;

        let ytdData = null;
        if (features.ytd_pcb_calculation) {
          ytdData = await getYTDData(i.emp_id, i.year, i.month);
        }

        // Calculate statutory with breakdown for proper PCB calculation
        // EPF/SOCSO/EIS on statutoryBase, PCB on full gross
        const salaryBreakdown = {
          basic: basicSalary + wages,  // Include wages for part-time
          allowance: fixedAllowance + outstationAmount + incentiveAmount,
          commission: commissionAmount + tradeCommission,
          bonus: bonus,
          ot: otAmount + phPay,
          pcbGross: grossSalary
        };
        const statutoryResult = calculateAllStatutory(statutoryBase, i, i.month, ytdData, salaryBreakdown);

        const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
        const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
        const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
        const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
        const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
        const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;
        const pcb = statutory.pcb_enabled ? statutoryResult.pcb : 0;

        const totalDeductions = unpaidDeduction + shortHoursDeduction + absentDayDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + advanceDeduction + otherDeductions;
        const netPay = grossSalary + unpaidDeduction + shortHoursDeduction + absentDayDeduction - totalDeductions;
        const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

        await pool.query(`
          UPDATE payroll_items SET
            basic_salary = $1, wages = $16, part_time_hours = $17, ph_pay = $18,
            ot_hours = $2, ot_amount = $3,
            gross_salary = $4, statutory_base = $5,
            epf_employee = $6, epf_employer = $7,
            socso_employee = $8, socso_employer = $9,
            eis_employee = $10, eis_employer = $11,
            pcb = $12,
            total_deductions = $13, net_pay = $14, employer_total_cost = $15,
            updated_at = NOW()
          WHERE id = $19
        `, [
          basicSalary, otHours, otAmount, grossSalary, statutoryBase,
          epfEmployee, epfEmployer, socsoEmployee, socsoEmployer,
          eisEmployee, eisEmployer, pcb,
          totalDeductions, netPay, employerCost,
          wages, partTimeHoursWorked, phPay, item.id
        ]);

        recalculatedCount++;
      } catch (e) {
        errors.push(`Item ${item.id}: ${e.message}`);
      }
    }

    // Update run totals
    await updateRunTotals(id);

    res.json({
      message: `Recalculated ${recalculatedCount} of ${itemsResult.rows.length} items`,
      recalculated: recalculatedCount,
      total: itemsResult.rows.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error recalculating all items:', error);
    res.status(500).json({ error: 'Failed to recalculate: ' + error.message });
  }
});

/**
 * POST /api/payroll/runs/:id/add-employees
 * Add missing employees to an existing payroll run
 */
router.post('/runs/:id/add-employees', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { employee_ids } = req.body; // Array of employee IDs to add
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ error: 'employee_ids array required' });
    }

    // Get run
    const runResult = await pool.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];
    if (run.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (run.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot add to finalized payroll' });
    }

    // Check which employees are already in the run
    const existingResult = await pool.query(
      'SELECT employee_id FROM payroll_items WHERE payroll_run_id = $1',
      [id]
    );
    const existingIds = new Set(existingResult.rows.map(r => r.employee_id));
    const newEmployeeIds = employee_ids.filter(eid => !existingIds.has(eid));

    if (newEmployeeIds.length === 0) {
      return res.json({ message: 'All employees already in payroll', added: 0 });
    }

    // Get company settings
    const settings = await getCompanySettings(companyId);
    const { features, rates, statutory } = settings;
    const period = {
      start: new Date(run.period_start_date),
      end: new Date(run.period_end_date)
    };
    const workingDays = rates.standard_work_days || 26;

    await client.query('BEGIN');

    let addedCount = 0;
    const addedEmployees = [];

    // Get employees to add
    const empResult = await client.query(`
      SELECT e.*, e.default_basic_salary as basic_salary, e.default_allowance as fixed_allowance
      FROM employees e
      WHERE e.id = ANY($1) AND e.company_id = $2
    `, [newEmployeeIds, companyId]);

    for (const emp of empResult.rows) {
      const isPartTime = emp.work_type === 'part_time' || emp.employment_type === 'part_time';
      let basicSalary = parseFloat(emp.basic_salary) || 0;
      let fixedAllowance = parseFloat(emp.fixed_allowance) || 0;

      // Part-time: calculate from hours worked
      if (isPartTime) {
        const partTimeData = await calculatePartTimeHours(
          emp.id, period.start.toISOString().split('T')[0],
          period.end.toISOString().split('T')[0], companyId, rates
        );
        basicSalary = partTimeData.grossSalary;
        fixedAllowance = 0;
      }

      // OT calculation
      let otHours = 0, otAmount = 0;
      if (features.auto_ot_from_clockin) {
        try {
          const otResult = await calculateOTFromClockIn(
            emp.id, companyId, emp.department_id,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0], basicSalary
          );
          otHours = otResult.total_ot_hours || 0;
          otAmount = otResult.total_ot_amount || 0;
        } catch (e) { console.warn(`OT calc failed for ${emp.name}:`, e.message); }
      }

      // Round OT
      if (otHours > 0 && otHours < 1) { otHours = 0; otAmount = 0; }
      else if (otHours >= 1) {
        otHours = Math.floor(otHours * 2) / 2;
        if (isPartTime) {
          const partTimeHourlyRate = rates.part_time_hourly_rate || 8.72;
          otAmount = Math.round(partTimeHourlyRate * 1.5 * otHours * 100) / 100;
        } else if (basicSalary > 0) {
          const hourlyRate = basicSalary / workingDays / (rates.standard_work_hours || 8);
          otAmount = Math.round(hourlyRate * 1.5 * otHours * 100) / 100;
        }
      }

      // PH pay calculation
      let phDaysWorked = 0, phPay = 0;
      if (!isPartTime && features.auto_ph_pay && basicSalary > 0) {
        try {
          phDaysWorked = await calculatePHDaysWorked(
            emp.id, companyId,
            period.start.toISOString().split('T')[0],
            period.end.toISOString().split('T')[0]
          );
          if (phDaysWorked > 0) {
            phPay = Math.round(phDaysWorked * (basicSalary / workingDays) * (rates.ph_multiplier || 2) * 100) / 100;
          }
        } catch (e) { console.warn(`PH calc failed for ${emp.name}:`, e.message); }
      }

      // Calculate absent days from clock-in records
      let absentDays = 0, absentDayDeduction = 0;
      const dailyRate = basicSalary > 0 ? basicSalary / workingDays : 0;
      if (!isPartTime && basicSalary > 0) {
        try {
          const periodStart = period.start.toISOString().split('T')[0];
          const periodEnd = period.end.toISOString().split('T')[0];

          // Count days worked
          const clockInResult = await client.query(`
            SELECT COUNT(DISTINCT work_date) as days_worked
            FROM clock_in_records
            WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3 AND status = 'completed'
          `, [emp.id, periodStart, periodEnd]);
          const daysWorked = parseInt(clockInResult.rows[0]?.days_worked) || 0;

          // Count paid leave days
          const paidLeaveResult = await client.query(`
            SELECT COALESCE(SUM(
              GREATEST(0, (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
              - (SELECT COUNT(*) FROM generate_series(GREATEST(lr.start_date, $2::date),
                  LEAST(lr.end_date, $1::date), '1 day'::interval) d WHERE EXTRACT(DOW FROM d) IN (0, 6)))
            ), 0) as paid_leave_days
            FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
            WHERE lr.employee_id = $3 AND lt.is_paid = TRUE AND lr.status = 'approved'
              AND lr.start_date <= $1 AND lr.end_date >= $2
          `, [periodEnd, periodStart, emp.id]);
          const paidLeaveDays = parseFloat(paidLeaveResult.rows[0]?.paid_leave_days) || 0;

          // Count unpaid leave days
          const unpaidLeaveResult = await client.query(`
            SELECT COALESCE(SUM(
              GREATEST(0, (LEAST(lr.end_date, $1::date) - GREATEST(lr.start_date, $2::date) + 1)
              - (SELECT COUNT(*) FROM generate_series(GREATEST(lr.start_date, $2::date),
                  LEAST(lr.end_date, $1::date), '1 day'::interval) d WHERE EXTRACT(DOW FROM d) IN (0, 6)))
            ), 0) as unpaid_leave_days
            FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
            WHERE lr.employee_id = $3 AND lt.is_paid = FALSE AND lr.status = 'approved'
              AND lr.start_date <= $1 AND lr.end_date >= $2
          `, [periodEnd, periodStart, emp.id]);
          const unpaidDays = parseFloat(unpaidLeaveResult.rows[0]?.unpaid_leave_days) || 0;

          absentDays = Math.max(0, workingDays - daysWorked - paidLeaveDays - unpaidDays);
          absentDayDeduction = Math.round(dailyRate * absentDays * 100) / 100;
        } catch (e) { console.warn(`Absent calc failed for ${emp.name}:`, e.message); }
      }

      // Calculate gross and statutory (with absent deduction)
      const grossSalary = basicSalary + fixedAllowance + otAmount + phPay - absentDayDeduction;
      let statutoryBase = Math.max(0, basicSalary - absentDayDeduction);
      if (statutory.statutory_on_ot) statutoryBase += otAmount;
      if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
      if (statutory.statutory_on_allowance) statutoryBase += fixedAllowance;

      // Build salary breakdown for PCB calculation
      const salaryBreakdown = {
        basic: basicSalary,
        allowance: fixedAllowance,
        taxableAllowance: 0,
        commission: 0,
        bonus: 0,
        ot: otAmount + phPay,
        pcbGross: grossSalary
      };

      // Calculate statutory deductions (correct function signature)
      const statutoryResult = calculateAllStatutory(statutoryBase, emp, run.month, null, salaryBreakdown);

      const epfEmployee = statutory.epf_enabled ? (statutoryResult.epf?.employee || 0) : 0;
      const epfEmployer = statutory.epf_enabled ? (statutoryResult.epf?.employer || 0) : 0;
      const socsoEmployee = statutory.socso_enabled ? (statutoryResult.socso?.employee || 0) : 0;
      const socsoEmployer = statutory.socso_enabled ? (statutoryResult.socso?.employer || 0) : 0;
      const eisEmployee = statutory.eis_enabled ? (statutoryResult.eis?.employee || 0) : 0;
      const eisEmployer = statutory.eis_enabled ? (statutoryResult.eis?.employer || 0) : 0;
      const pcb = statutory.pcb_enabled ? (statutoryResult.pcb || 0) : 0;

      const totalDeductions = absentDayDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb;
      const netPay = grossSalary + absentDayDeduction - totalDeductions;
      const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

      // Insert payroll item
      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id,
          basic_salary, fixed_allowance, ot_hours, ot_amount,
          ph_days_worked, ph_pay,
          absent_days, absent_day_deduction,
          gross_salary, statutory_base,
          epf_employee, epf_employer, socso_employee, socso_employer,
          eis_employee, eis_employer, pcb,
          total_deductions, net_pay, employer_total_cost
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      `, [
        id, emp.id, basicSalary, fixedAllowance, otHours, otAmount,
        phDaysWorked, phPay,
        absentDays, absentDayDeduction,
        grossSalary, statutoryBase,
        epfEmployee, epfEmployer, socsoEmployee, socsoEmployer,
        eisEmployee, eisEmployer, pcb,
        totalDeductions, netPay, employerCost
      ]);

      addedCount++;
      addedEmployees.push({ id: emp.id, name: emp.name, net_pay: netPay });
    }

    // Update run totals
    const totalsResult = await client.query(`
      SELECT COUNT(*) as count,
             COALESCE(SUM(gross_salary), 0) as total_gross,
             COALESCE(SUM(total_deductions), 0) as total_deductions,
             COALESCE(SUM(net_pay), 0) as total_net,
             COALESCE(SUM(employer_total_cost), 0) as total_employer_cost
      FROM payroll_items WHERE payroll_run_id = $1
    `, [id]);
    const totals = totalsResult.rows[0];

    // Remove added employees from excluded_employees list
    const addedIds = addedEmployees.map(e => e.id);
    let updatedExcluded = null;
    if (run.excluded_employees) {
      const currentExcluded = typeof run.excluded_employees === 'string'
        ? JSON.parse(run.excluded_employees)
        : run.excluded_employees;
      updatedExcluded = currentExcluded.filter(e => !addedIds.includes(e.id));
    }

    await client.query(`
      UPDATE payroll_runs SET
        employee_count = $1, total_gross = $2, total_deductions = $3,
        total_net = $4, total_employer_cost = $5,
        excluded_employees = $7
      WHERE id = $6
    `, [
      totals.count, totals.total_gross, totals.total_deductions,
      totals.total_net, totals.total_employer_cost, id,
      updatedExcluded && updatedExcluded.length > 0 ? JSON.stringify(updatedExcluded) : null
    ]);

    await client.query('COMMIT');

    res.json({
      message: `Added ${addedCount} employee(s) to payroll`,
      added: addedCount,
      employees: addedEmployees
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding employees to payroll:', error);
    res.status(500).json({ error: 'Failed to add employees: ' + error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/payroll/runs/:id/finalize
 * Finalize a payroll run
 */
router.post('/runs/:id/finalize', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    await client.query('BEGIN');

    const run = await client.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);

    if (run.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    // CRITICAL: Verify run belongs to this company
    if (run.rows[0].company_id !== companyId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: payroll run belongs to another company' });
    }

    if (run.rows[0].status === 'finalized') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payroll run is already finalized' });
    }

    const settings = await getCompanySettings(run.rows[0].company_id);

    // Check approval requirement
    if (settings.features.require_approval && !run.rows[0].approved_by) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payroll run requires approval before finalization' });
    }

    // Link claims if enabled
    if (settings.features.auto_claims_linking) {
      const items = await client.query(
        'SELECT id, employee_id FROM payroll_items WHERE payroll_run_id = $1',
        [id]
      );

      const startOfMonth = `${run.rows[0].year}-${String(run.rows[0].month).padStart(2, '0')}-01`;
      const endOfMonth = new Date(run.rows[0].year, run.rows[0].month, 0).toISOString().split('T')[0];

      for (const item of items.rows) {
        await client.query(`
          UPDATE claims SET linked_payroll_item_id = $1, updated_at = NOW()
          WHERE employee_id = $2
            AND status = 'approved'
            AND linked_payroll_item_id IS NULL
        `, [item.id, item.employee_id]);
      }
    }

    // Update employee base salary for future payrolls
    // Only update if basic_salary in payroll differs from employee's current salary
    const payrollItems = await client.query(`
      SELECT pi.employee_id, pi.basic_salary as payroll_salary, pi.fixed_allowance as payroll_allowance,
             e.default_basic_salary as current_salary, e.default_allowance as current_allowance
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1
    `, [id]);

    let salaryUpdates = 0;
    for (const item of payrollItems.rows) {
      const payrollSalary = parseFloat(item.payroll_salary) || 0;
      const currentSalary = parseFloat(item.current_salary) || 0;
      const payrollAllowance = parseFloat(item.payroll_allowance) || 0;
      const currentAllowance = parseFloat(item.current_allowance) || 0;

      // Update if salary or allowance changed
      if (payrollSalary !== currentSalary || payrollAllowance !== currentAllowance) {
        await client.query(`
          UPDATE employees SET
            default_basic_salary = $1,
            default_allowance = $2,
            updated_at = NOW()
          WHERE id = $3
        `, [payrollSalary, payrollAllowance, item.employee_id]);
        salaryUpdates++;
      }
    }

    // Finalize
    await client.query(`
      UPDATE payroll_runs SET
        status = 'finalized',
        finalized_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [id]);

    await client.query('COMMIT');

    res.json({
      message: 'Payroll run finalized successfully',
      salary_updates: salaryUpdates,
      note: salaryUpdates > 0 ? `${salaryUpdates} employee salary(s) updated for future payrolls` : null
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error finalizing payroll run:', error);
    res.status(500).json({ error: 'Failed to finalize payroll run', details: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/payroll/runs/:id/approve
 * Approve a payroll run (if require_approval is enabled)
 */
router.post('/runs/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // CRITICAL: Only approve runs belonging to this company
    const result = await pool.query(`
      UPDATE payroll_runs SET
        approved_by = $1,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $2 AND status = 'draft' AND company_id = $3
      RETURNING *
    `, [req.admin.id, id, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found, already finalized, or belongs to another company' });
    }

    res.json({ message: 'Payroll run approved', run: result.rows[0] });
  } catch (error) {
    console.error('Error approving payroll run:', error);
    res.status(500).json({ error: 'Failed to approve payroll run' });
  }
});

/**
 * DELETE /api/payroll/runs/drafts/:year/:month
 * Delete ALL draft payroll runs for a specific month/year
 */
router.delete('/runs/drafts/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Delete all draft runs for this company, month, year
    const result = await pool.query(
      "DELETE FROM payroll_runs WHERE status = 'draft' AND company_id = $1 AND month = $2 AND year = $3 RETURNING id",
      [companyId, parseInt(month), parseInt(year)]
    );

    res.json({
      message: `Deleted ${result.rowCount} draft payroll runs`,
      deleted: result.rowCount
    });
  } catch (error) {
    console.error('Error deleting all draft payroll runs:', error);
    res.status(500).json({ error: 'Failed to delete draft payroll runs' });
  }
});

/**
 * DELETE /api/payroll/runs/:id
 * Delete a draft payroll run
 */
router.delete('/runs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // CRITICAL: Only delete runs belonging to this company
    const result = await pool.query(
      "DELETE FROM payroll_runs WHERE id = $1 AND status = 'draft' AND company_id = $2 RETURNING *",
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found, already finalized, or belongs to another company' });
    }

    res.json({ message: 'Payroll run deleted' });
  } catch (error) {
    console.error('Error deleting payroll run:', error);
    res.status(500).json({ error: 'Failed to delete payroll run' });
  }
});

// =============================================================================
// PAYSLIPS & EXPORTS
// =============================================================================

/**
 * GET /api/payroll/items/:id/payslip
 * Get formatted payslip for a single item
 */
router.get('/items/:id/payslip', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(`
      SELECT
        pi.*,
        pr.month, pr.year, pr.status as run_status, pr.period_label,
        e.employee_id as emp_code,
        e.name as employee_name,
        e.ic_number,
        e.epf_number,
        e.socso_number,
        e.tax_number,
        e.bank_name,
        e.bank_account_no,
        e.position,
        e.join_date,
        d.name as department_name,
        o.name as outlet_name,
        c.name as company_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      LEFT JOIN companies c ON pr.company_id = c.id
      WHERE pi.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = result.rows[0];

    // CRITICAL: Verify payslip belongs to this company
    // The query includes pr.company_id via the JOIN with companies
    // We need to add pr.company_id to the select to check it
    // For now, fetch it separately or add to query - let's check via the join
    const companyCheck = await pool.query(
      'SELECT pr.company_id FROM payroll_items pi JOIN payroll_runs pr ON pi.payroll_run_id = pr.id WHERE pi.id = $1',
      [id]
    );
    if (companyCheck.rows[0]?.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied: payslip belongs to another company' });
    }

    const payslip = {
      company: {
        name: item.company_name || 'Company'
      },
      employee: {
        code: item.emp_code,
        name: item.employee_name,
        ic_number: item.ic_number,
        epf_number: item.epf_number,
        socso_number: item.socso_number,
        tax_number: item.tax_number,
        department: item.department_name,
        outlet_name: item.outlet_name,
        position: item.position,
        join_date: item.join_date,
        bank_name: item.bank_name,
        bank_account_no: item.bank_account_no
      },
      period: {
        month: item.month,
        year: item.year,
        month_name: getMonthName(item.month),
        label: item.period_label || `${getMonthName(item.month)} ${item.year}`
      },
      earnings: {
        basic_salary: parseFloat(item.basic_salary) || 0,
        wages: parseFloat(item.wages) || 0, // Part-time wages
        part_time_hours: parseFloat(item.part_time_hours) || 0,
        fixed_allowance: parseFloat(item.fixed_allowance) || 0,
        ot_hours: parseFloat(item.ot_hours) || 0,
        ot_amount: parseFloat(item.ot_amount) || 0,
        ph_days_worked: parseFloat(item.ph_days_worked) || 0,
        ph_pay: parseFloat(item.ph_pay) || 0,
        incentive_amount: parseFloat(item.incentive_amount) || 0,
        commission_amount: parseFloat(item.commission_amount) || 0,
        trade_commission_amount: parseFloat(item.trade_commission_amount) || 0,
        outstation_amount: parseFloat(item.outstation_amount) || 0,
        claims_amount: parseFloat(item.claims_amount) || 0,
        bonus: parseFloat(item.bonus) || 0,
        attendance_bonus: parseFloat(item.attendance_bonus) || 0,
        late_days: parseFloat(item.late_days) || 0
      },
      deductions: {
        absent_days: parseFloat(item.absent_days) || 0,
        absent_day_deduction: parseFloat(item.absent_day_deduction) || 0,
        short_hours: parseFloat(item.short_hours) || 0,
        short_hours_deduction: parseFloat(item.short_hours_deduction) || 0,
        unpaid_leave_days: parseFloat(item.unpaid_leave_days) || 0,
        unpaid_leave_deduction: parseFloat(item.unpaid_leave_deduction) || 0,
        epf_employee: parseFloat(item.epf_employee) || 0,
        socso_employee: parseFloat(item.socso_employee) || 0,
        eis_employee: parseFloat(item.eis_employee) || 0,
        pcb: parseFloat(item.pcb) || 0,
        advance_deduction: parseFloat(item.advance_deduction) || 0,
        other_deductions: parseFloat(item.other_deductions) || 0
      },
      // EPF/PCB breakdown for MyTax entry (Saraan Biasa vs Saraan Tambahan)
      mytax_breakdown: {
        epf_on_normal: parseFloat(item.epf_on_normal) || 0,
        epf_on_additional: parseFloat(item.epf_on_additional) || 0,
        pcb_normal: parseFloat(item.pcb_normal) || 0,
        pcb_additional: parseFloat(item.pcb_additional) || 0
      },
      employer_contributions: {
        epf_employer: parseFloat(item.epf_employer) || 0,
        socso_employer: parseFloat(item.socso_employer) || 0,
        eis_employer: parseFloat(item.eis_employer) || 0
      },
      totals: {
        gross_salary: parseFloat(item.gross_salary) || 0,
        statutory_base: parseFloat(item.statutory_base) || 0,
        total_deductions: parseFloat(item.total_deductions) || 0,
        net_pay: parseFloat(item.net_pay) || 0
      },
      ytd: {
        gross: parseFloat(item.ytd_gross) || 0,
        epf: parseFloat(item.ytd_epf) || 0,
        pcb: parseFloat(item.ytd_pcb) || 0
      }
    };

    res.json(payslip);
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({ error: 'Failed to fetch payslip' });
  }
});

/**
 * GET /api/payroll/runs/:id/bank-file
 * Generate bank payment file in various formats
 *
 * Query params:
 * - format: maybank, cimb, publicbank, rhb, csv (default: csv)
 * - payment_date: YYYYMMDD (optional, defaults to run payment date)
 *
 * Supported formats:
 * - maybank: Maybank IBG format
 * - cimb: CIMB BizChannel CSV
 * - publicbank: Public Bank format
 * - rhb: RHB Corporate CSV
 * - csv: Generic CSV (default)
 */
router.get('/runs/:id/bank-file', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv', payment_date } = req.query;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // CRITICAL: Verify run belongs to this company
    const runCheck = await pool.query(
      'SELECT company_id FROM payroll_runs WHERE id = $1',
      [id]
    );
    if (runCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }
    if (runCheck.rows[0].company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied: payroll run belongs to another company' });
    }

    // Use the bank file export utility
    const { generateBankFile, getAvailableFormats } = require('../utils/bankFileExport');

    // List available formats if requested
    if (format === 'list') {
      return res.json({ formats: getAvailableFormats() });
    }

    const options = {};
    if (payment_date) {
      options.paymentDate = payment_date;
    }

    const result = await generateBankFile(parseInt(id), format, options);

    // Set appropriate content type
    const contentType = result.extension === 'csv' ? 'text/csv' : 'text/plain';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);

  } catch (error) {
    console.error('Error generating bank file:', error);
    res.status(500).json({ error: 'Failed to generate bank file: ' + error.message });
  }
});

/**
 * GET /api/payroll/runs/:id/salary-report
 * Generate salary report with all employee details and bank info
 * Returns CSV for draft, or data for PDF generation
 */
router.get('/runs/:id/salary-report', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { format } = req.query; // 'csv' or 'json' (for PDF generation in frontend)
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get run details
    const runResult = await pool.query(
      'SELECT * FROM payroll_runs WHERE id = $1',
      [id]
    );
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }
    const run = runResult.rows[0];

    if (run.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all payroll items with employee and bank details
    const result = await pool.query(`
      SELECT
        e.employee_id as emp_code,
        e.name as employee_name,
        e.ic_number,
        COALESCE(d.name, o.name) as department_outlet,
        e.bank_name,
        e.bank_account_no,
        pi.basic_salary,
        pi.fixed_allowance,
        pi.ot_hours,
        pi.ot_amount,
        pi.ph_days_worked,
        pi.ph_pay,
        pi.commission_amount,
        pi.trade_commission_amount,
        pi.incentive_amount,
        pi.outstation_amount,
        pi.bonus,
        pi.attendance_bonus,
        pi.claims_amount,
        pi.gross_salary,
        pi.epf_employee,
        pi.socso_employee,
        pi.eis_employee,
        pi.pcb,
        pi.unpaid_leave_deduction,
        pi.advance_deduction,
        pi.other_deductions,
        pi.total_deductions,
        pi.net_pay,
        pi.epf_employer,
        pi.socso_employer,
        pi.eis_employer,
        pi.employer_total_cost
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.name
    `, [id]);

    // Calculate totals
    const totals = {
      basic_salary: 0, fixed_allowance: 0, ot_amount: 0, ph_pay: 0,
      commission_amount: 0, incentive_amount: 0, outstation_amount: 0, claims_amount: 0,
      bonus: 0, attendance_bonus: 0, gross_salary: 0,
      epf_employee: 0, socso_employee: 0, eis_employee: 0, pcb: 0,
      total_deductions: 0, net_pay: 0,
      epf_employer: 0, socso_employer: 0, eis_employer: 0, employer_total_cost: 0
    };

    result.rows.forEach(row => {
      totals.basic_salary += parseFloat(row.basic_salary) || 0;
      totals.fixed_allowance += parseFloat(row.fixed_allowance) || 0;
      totals.ot_amount += parseFloat(row.ot_amount) || 0;
      totals.ph_pay += parseFloat(row.ph_pay) || 0;
      totals.commission_amount += parseFloat(row.commission_amount) || 0;
      totals.incentive_amount += parseFloat(row.incentive_amount) || 0;
      totals.outstation_amount += parseFloat(row.outstation_amount) || 0;
      totals.claims_amount += parseFloat(row.claims_amount) || 0;
      totals.bonus += parseFloat(row.bonus) || 0;
      totals.attendance_bonus += parseFloat(row.attendance_bonus) || 0;
      totals.gross_salary += parseFloat(row.gross_salary) || 0;
      totals.epf_employee += parseFloat(row.epf_employee) || 0;
      totals.socso_employee += parseFloat(row.socso_employee) || 0;
      totals.eis_employee += parseFloat(row.eis_employee) || 0;
      totals.pcb += parseFloat(row.pcb) || 0;
      totals.total_deductions += parseFloat(row.total_deductions) || 0;
      totals.net_pay += parseFloat(row.net_pay) || 0;
      totals.epf_employer += parseFloat(row.epf_employer) || 0;
      totals.socso_employer += parseFloat(row.socso_employer) || 0;
      totals.eis_employer += parseFloat(row.eis_employer) || 0;
      totals.employer_total_cost += parseFloat(row.employer_total_cost) || 0;
    });

    // Return JSON for PDF generation or frontend display
    if (format === 'json' || run.status === 'finalized') {
      return res.json({
        run: {
          id: run.id,
          month: run.month,
          year: run.year,
          status: run.status,
          period_label: run.period_label,
          finalized_at: run.finalized_at
        },
        employees: result.rows,
        totals,
        generated_at: new Date().toISOString()
      });
    }

    // Generate CSV for draft payroll
    const headers = [
      'No', 'Emp Code', 'Name', 'IC Number', 'Dept/Outlet',
      'Basic', 'Allowance', 'OT Hrs', 'OT Amt', 'PH Pay',
      'Commission', 'Incentive', 'Outstation', 'Claims', 'Bonus', 'Gross',
      'EE EPF', 'EE SOCSO', 'EE EIS', 'PERKESO', 'PCB', 'Other Ded', 'Total Ded', 'Net Pay',
      'ER EPF', 'ER SOCSO', 'ER EIS', 'Employer Cost',
      'Bank', 'Account No'
    ];

    let csv = headers.join(',') + '\n';

    result.rows.forEach((row, idx) => {
      const perkeso = (parseFloat(row.socso_employee) || 0) + (parseFloat(row.eis_employee) || 0);
      csv += [
        idx + 1,
        `"${row.emp_code || ''}"`,
        `"${row.employee_name}"`,
        `"${row.ic_number || ''}"`,
        `"${row.department_outlet || ''}"`,
        parseFloat(row.basic_salary || 0).toFixed(2),
        parseFloat(row.fixed_allowance || 0).toFixed(2),
        parseFloat(row.ot_hours || 0).toFixed(1),
        parseFloat(row.ot_amount || 0).toFixed(2),
        parseFloat(row.ph_pay || 0).toFixed(2),
        parseFloat(row.commission_amount || 0).toFixed(2),
        parseFloat(row.incentive_amount || 0).toFixed(2),
        parseFloat(row.outstation_amount || 0).toFixed(2),
        parseFloat(row.claims_amount || 0).toFixed(2),
        parseFloat(row.bonus || 0).toFixed(2),
        parseFloat(row.gross_salary || 0).toFixed(2),
        parseFloat(row.epf_employee || 0).toFixed(2),
        parseFloat(row.socso_employee || 0).toFixed(2),
        parseFloat(row.eis_employee || 0).toFixed(2),
        perkeso.toFixed(2),
        parseFloat(row.pcb || 0).toFixed(2),
        parseFloat(row.other_deductions || 0).toFixed(2),
        parseFloat(row.total_deductions || 0).toFixed(2),
        parseFloat(row.net_pay || 0).toFixed(2),
        parseFloat(row.epf_employer || 0).toFixed(2),
        parseFloat(row.socso_employer || 0).toFixed(2),
        parseFloat(row.eis_employer || 0).toFixed(2),
        parseFloat(row.employer_total_cost || 0).toFixed(2),
        `"${row.bank_name || ''}"`,
        `"${row.bank_account_no || ''}"`
      ].join(',') + '\n';
    });

    // Add totals row
    const totalPerkeso = totals.socso_employee + totals.eis_employee;
    csv += [
      '', '', 'TOTAL', '', '',
      totals.basic_salary.toFixed(2),
      totals.fixed_allowance.toFixed(2),
      '', totals.ot_amount.toFixed(2), totals.ph_pay.toFixed(2),
      totals.commission_amount.toFixed(2),
      totals.incentive_amount.toFixed(2),
      totals.outstation_amount.toFixed(2),
      totals.claims_amount.toFixed(2),
      totals.bonus.toFixed(2),
      totals.gross_salary.toFixed(2),
      totals.epf_employee.toFixed(2),
      totals.socso_employee.toFixed(2),
      totals.eis_employee.toFixed(2),
      totalPerkeso.toFixed(2),
      totals.pcb.toFixed(2),
      '',
      totals.total_deductions.toFixed(2),
      totals.net_pay.toFixed(2),
      totals.epf_employer.toFixed(2),
      totals.socso_employer.toFixed(2),
      totals.eis_employer.toFixed(2),
      totals.employer_total_cost.toFixed(2),
      '', ''
    ].join(',') + '\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=salary_report_${run.period_label?.replace(/\s+/g, '_') || run.month + '_' + run.year}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error generating salary report:', error);
    res.status(500).json({ error: 'Failed to generate salary report' });
  }
});

/**
 * GET /api/payroll/summary/:year/:month
 * Get payroll summary for a period (for dashboard)
 */
router.get('/summary/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const summary = await pool.query(`
      SELECT
        COUNT(DISTINCT pi.id) as total_employees,
        SUM(pi.gross_salary) as total_gross,
        SUM(pi.net_pay) as total_net,
        SUM(pi.total_deductions) as total_deductions,
        SUM(pi.employer_total_cost) as total_employer_cost,
        SUM(pi.epf_employee) as total_epf_employee,
        SUM(pi.epf_employer) as total_epf_employer,
        SUM(pi.socso_employee) as total_socso_employee,
        SUM(pi.socso_employer) as total_socso_employer,
        SUM(pi.eis_employee) as total_eis_employee,
        SUM(pi.eis_employer) as total_eis_employer,
        SUM(pi.pcb) as total_pcb
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.year = $1 AND pr.month = $2 AND pr.company_id = $3
    `, [year, month, companyId]);

    const byDepartment = await pool.query(`
      SELECT d.name, COUNT(pi.id) as employee_count, SUM(pi.net_pay) as total
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE pr.year = $1 AND pr.month = $2 AND pr.company_id = $3
      GROUP BY d.id, d.name
    `, [year, month, companyId]);

    res.json({
      summary: summary.rows[0],
      byDepartment: byDepartment.rows
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /api/payroll/ot-summary/:year/:month
 * Get OT summary for a period (approved, pending, rejected hours)
 */
router.get('/ot-summary/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    const { department_id } = req.query;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Build employee filter
    let employeeQuery = `
      SELECT e.id, e.name, e.employee_id as emp_code, e.department_id,
             d.name as department_name,
             e.default_basic_salary as basic_salary
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active' AND e.company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 2;

    if (department_id) {
      employeeQuery += ` AND e.department_id = $${paramIndex}`;
      params.push(department_id);
      paramIndex++;
    }

    employeeQuery += ' ORDER BY d.name, e.name';

    const employees = await pool.query(employeeQuery, params);

    // Calculate OT summary for each employee
    const summary = [];
    let totalApproved = 0;
    let totalPending = 0;
    let totalRejected = 0;
    let totalEstimatedPay = 0;

    // Check if this company requires OT approval
    // AA Alive (company 1, 2): No approval needed - all OT auto-approved
    // Mimix (company 3): OT requires approval
    const otRequiresApproval = companyId === 3;

    for (const emp of employees.rows) {
      // Get OT records for this employee in the specified month
      // Note: OT is stored in ot_minutes, convert to hours for display
      // For AA Alive: All OT is auto-approved (no approval workflow)
      // For Mimix: Only explicitly approved OT counts
      const otRecords = await pool.query(`
        SELECT
          COALESCE(SUM(CASE
            WHEN $4 = false THEN COALESCE(ot_minutes, 0) / 60.0
            WHEN ot_approved = true THEN COALESCE(ot_minutes, 0) / 60.0
            ELSE 0
          END), 0) as approved_ot_hours,
          COALESCE(SUM(CASE
            WHEN $4 = true AND ot_approved IS NULL AND COALESCE(ot_minutes, 0) > 0 THEN ot_minutes / 60.0
            ELSE 0
          END), 0) as pending_ot_hours,
          COALESCE(SUM(CASE
            WHEN $4 = true AND ot_approved = false THEN COALESCE(ot_minutes, 0) / 60.0
            ELSE 0
          END), 0) as rejected_ot_hours,
          COUNT(CASE WHEN $4 = true AND ot_approved IS NULL AND COALESCE(ot_minutes, 0) > 0 THEN 1 END) as pending_records_count
        FROM clock_in_records
        WHERE employee_id = $1
          AND EXTRACT(MONTH FROM work_date) = $2
          AND EXTRACT(YEAR FROM work_date) = $3
          AND status IN ('clocked_out', 'approved', 'completed')
      `, [emp.id, month, year, otRequiresApproval]);

      const otData = otRecords.rows[0];
      const approvedHours = parseFloat(otData.approved_ot_hours) || 0;
      const pendingHours = parseFloat(otData.pending_ot_hours) || 0;
      const rejectedHours = parseFloat(otData.rejected_ot_hours) || 0;
      const pendingCount = parseInt(otData.pending_records_count) || 0;

      // Calculate estimated OT pay (using default 1.5x multiplier)
      const basicSalary = parseFloat(emp.basic_salary) || 0;
      const hourlyRate = basicSalary > 0 ? (basicSalary / 22 / 8) : 0;
      const estimatedPay = approvedHours * hourlyRate * 1.5;

      // Only include employees with any OT
      if (approvedHours > 0 || pendingHours > 0 || rejectedHours > 0) {
        summary.push({
          employee_id: emp.id,
          employee_name: emp.name,
          emp_code: emp.emp_code,
          department_name: emp.department_name,
          basic_salary: basicSalary,
          hourly_rate: Math.round(hourlyRate * 100) / 100,
          approved_ot_hours: Math.round(approvedHours * 100) / 100,
          pending_ot_hours: Math.round(pendingHours * 100) / 100,
          rejected_ot_hours: Math.round(rejectedHours * 100) / 100,
          pending_records_count: pendingCount,
          estimated_ot_pay: Math.round(estimatedPay * 100) / 100
        });

        totalApproved += approvedHours;
        totalPending += pendingHours;
        totalRejected += rejectedHours;
        totalEstimatedPay += estimatedPay;
      }
    }

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      summary,
      totals: {
        approved_ot_hours: Math.round(totalApproved * 100) / 100,
        pending_ot_hours: Math.round(totalPending * 100) / 100,
        rejected_ot_hours: Math.round(totalRejected * 100) / 100,
        estimated_ot_pay: Math.round(totalEstimatedPay * 100) / 100,
        employees_with_pending_ot: summary.filter(s => s.pending_ot_hours > 0).length
      }
    });
  } catch (error) {
    console.error('Error fetching OT summary:', error);
    res.status(500).json({ error: 'Failed to fetch OT summary' });
  }
});

/**
 * GET /api/payroll/items/:id/attendance-details
 * Get detailed attendance breakdown for a payroll item
 * Returns: days worked, absent days, hours per day, short hours, OT hours
 */
router.get('/items/:id/attendance-details', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Get payroll item with period dates
    const itemResult = await pool.query(`
      SELECT pi.*, pr.period_start_date, pr.period_end_date, pr.month, pr.year,
             e.name as employee_name, e.employee_id as employee_code
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = $1 AND pr.company_id = $2
    `, [id, companyId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = itemResult.rows[0];
    const periodStart = item.period_start_date;
    const periodEnd = item.period_end_date;

    // Get all clock-in records for the period
    const clockInsResult = await pool.query(`
      SELECT
        work_date,
        clock_in_1,
        clock_out_1,
        clock_in_2,
        clock_out_2,
        total_work_minutes,
        total_work_hours,
        ot_minutes,
        status,
        CASE WHEN ot_approved = true THEN 'approved'
             WHEN ot_minutes > 0 THEN 'pending'
             ELSE null END as ot_status
      FROM clock_in_records
      WHERE employee_id = $1
        AND work_date BETWEEN $2 AND $3
      ORDER BY work_date
    `, [item.employee_id, periodStart, periodEnd]);

    // Get schedules for the period
    const schedulesResult = await pool.query(`
      SELECT schedule_date, shift_start, shift_end, status
      FROM schedules
      WHERE employee_id = $1
        AND schedule_date BETWEEN $2 AND $3
        AND status IN ('scheduled', 'completed', 'confirmed')
      ORDER BY schedule_date
    `, [item.employee_id, periodStart, periodEnd]);

    // Get approved leave for the period
    const leaveResult = await pool.query(`
      SELECT lr.start_date, lr.end_date, lt.name as leave_type, lt.is_paid
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
        AND lr.status = 'approved'
        AND lr.start_date <= $2
        AND lr.end_date >= $3
    `, [item.employee_id, periodEnd, periodStart]);

    // Build scheduled dates set
    const scheduledDates = new Set(schedulesResult.rows.map(r =>
      r.schedule_date.toISOString().split('T')[0]
    ));

    // Get company settings to check if outlet-based
    const settings = await getCompanySettings(companyId);
    const isOutletBased = settings.groupingType === 'outlet';

    // Build days worked list
    // For outlet-based companies: only count days with BOTH schedule AND clock-in
    // OT rounding: Each day's OT rounded to 0.5h increments, min 1h per day
    const roundOTPerDay = (rawOtHours) => {
      if (rawOtHours < 1) return 0; // Min 1 hour required
      return Math.floor(rawOtHours * 2) / 2; // Round down to 0.5h
    };

    const allClockIns = clockInsResult.rows
      .filter(r => r.status === 'completed')
      .map(r => {
        const rawOtHours = (parseFloat(r.ot_minutes) || 0) / 60;
        return {
          date: r.work_date,
          dateStr: r.work_date.toISOString().split('T')[0],
          clock_in: r.clock_in_1,
          clock_out: r.clock_out_1,
          clock_in_2: r.clock_in_2,
          clock_out_2: r.clock_out_2,
          total_hours: parseFloat(r.total_work_hours) || (parseFloat(r.total_work_minutes) || 0) / 60,
          ot_hours: roundOTPerDay(rawOtHours), // Rounded OT per day
          raw_ot_hours: rawOtHours, // Keep raw for reference
          ot_status: r.ot_status,
          has_schedule: scheduledDates.has(r.work_date.toISOString().split('T')[0])
        };
      });

    // For outlet-based: split into scheduled work vs unscheduled work
    let daysWorked, unscheduledDays;
    if (isOutletBased) {
      // Days worked = has BOTH schedule AND clock-in
      daysWorked = allClockIns.filter(d => d.has_schedule);
      // Unscheduled = clock-in but NO schedule (won't be paid)
      unscheduledDays = allClockIns.filter(d => !d.has_schedule);
    } else {
      // For non-outlet companies: all clock-ins count as days worked
      daysWorked = allClockIns;
      unscheduledDays = [];
    }

    // Build worked dates set
    const workedDates = new Set(daysWorked.map(d =>
      new Date(d.date).toISOString().split('T')[0]
    ));

    // Build leave dates
    const leaveDays = [];
    for (const leave of leaveResult.rows) {
      let current = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (dateStr >= periodStart.toISOString().split('T')[0] &&
            dateStr <= periodEnd.toISOString().split('T')[0]) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
            leaveDays.push({
              date: dateStr,
              leave_type: leave.leave_type,
              is_paid: leave.is_paid
            });
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }
    const leaveDatesSet = new Set(leaveDays.map(l => l.date));

    // Calculate absent days (scheduled but not worked and not on leave)
    const absentDays = [];
    for (const sched of schedulesResult.rows) {
      const dateStr = sched.schedule_date.toISOString().split('T')[0];
      if (!workedDates.has(dateStr) && !leaveDatesSet.has(dateStr)) {
        absentDays.push({
          date: sched.schedule_date,
          scheduled_start: sched.shift_start,
          scheduled_end: sched.shift_end
        });
      }
    }

    // Calculate short hours (worked but less than expected)
    // settings already fetched above for outlet-based check
    const expectedHoursPerDay = settings.rates.standard_work_hours || 8;

    const shortHoursDays = daysWorked
      .filter(d => d.total_hours < expectedHoursPerDay && d.total_hours > 0)
      .map(d => ({
        date: d.date,
        worked_hours: Math.round(d.total_hours * 100) / 100,
        expected_hours: expectedHoursPerDay,
        short_hours: Math.round((expectedHoursPerDay - d.total_hours) * 100) / 100
      }));

    // OT breakdown
    const otDays = daysWorked
      .filter(d => d.ot_hours > 0)
      .map(d => ({
        date: d.date,
        ot_hours: Math.round(d.ot_hours * 100) / 100,
        status: d.ot_status
      }));

    // Summary
    const totalHoursWorked = daysWorked.reduce((sum, d) => sum + d.total_hours, 0);
    const totalOTHours = daysWorked.reduce((sum, d) => sum + d.ot_hours, 0);
    const totalShortHours = shortHoursDays.reduce((sum, d) => sum + d.short_hours, 0);

    res.json({
      employee: {
        id: item.employee_id,
        name: item.employee_name,
        code: item.employee_code
      },
      period: {
        start: periodStart,
        end: periodEnd,
        month: item.month,
        year: item.year
      },
      summary: {
        days_worked: daysWorked.length,
        days_scheduled: schedulesResult.rows.length,
        days_absent: absentDays.length,
        days_on_leave: leaveDays.length,
        days_unscheduled: unscheduledDays.length,
        total_hours: Math.round(totalHoursWorked * 100) / 100,
        total_short_hours: Math.round(totalShortHours * 100) / 100,
        total_ot_hours: Math.round(totalOTHours * 100) / 100,
        is_outlet_based: isOutletBased
      },
      details: {
        days_worked: daysWorked.map(d => ({
          ...d,
          date: new Date(d.date).toISOString().split('T')[0],
          total_hours: Math.round(d.total_hours * 100) / 100,
          ot_hours: Math.round(d.ot_hours * 100) / 100
        })),
        absent_days: absentDays.map(d => ({
          ...d,
          date: new Date(d.date).toISOString().split('T')[0]
        })),
        leave_days: leaveDays,
        short_hours_days: shortHoursDays.map(d => ({
          ...d,
          date: new Date(d.date).toISOString().split('T')[0]
        })),
        ot_days: otDays.map(d => ({
          ...d,
          date: new Date(d.date).toISOString().split('T')[0]
        })),
        unscheduled_days: unscheduledDays.map(d => ({
          date: new Date(d.date).toISOString().split('T')[0],
          clock_in: d.clock_in,
          clock_out: d.clock_out,
          clock_in_2: d.clock_in_2,
          clock_out_2: d.clock_out_2,
          total_hours: Math.round(d.total_hours * 100) / 100
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching attendance details:', error);
    res.status(500).json({ error: 'Failed to fetch attendance details' });
  }
});

module.exports = router;
