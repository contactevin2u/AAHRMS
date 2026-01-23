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
    require_approval: false
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
    'SELECT payroll_settings, settings, grouping_type FROM companies WHERE id = $1',
    [companyId]
  );

  if (result.rows.length === 0) {
    return DEFAULT_PAYROLL_SETTINGS;
  }

  const payrollSettings = result.rows[0].payroll_settings || {};
  const legacySettings = result.rows[0].settings || {};
  const groupingType = result.rows[0].grouping_type;

  // Merge with defaults
  return {
    features: { ...DEFAULT_PAYROLL_SETTINGS.features, ...payrollSettings.features },
    rates: {
      ...DEFAULT_PAYROLL_SETTINGS.rates,
      ...payrollSettings.rates,
      // Legacy settings override
      indoor_sales_basic: legacySettings.indoor_sales_basic || payrollSettings.rates?.indoor_sales_basic || 4000,
      indoor_sales_commission_rate: legacySettings.indoor_sales_commission_rate || payrollSettings.rates?.indoor_sales_commission_rate || 6
    },
    period: { ...DEFAULT_PAYROLL_SETTINGS.period, ...payrollSettings.period },
    statutory: { ...DEFAULT_PAYROLL_SETTINGS.statutory, ...payrollSettings.statutory },
    groupingType // 'department' or 'outlet'
  };
}

/**
 * Part-time hourly rate (RM)
 */
const PART_TIME_HOURLY_RATE = 8.72;

/**
 * Get total work hours for part-time employee from clock-in records
 * Returns: { totalMinutes, totalHours, grossSalary }
 */
async function calculatePartTimeHours(employeeId, periodStart, periodEnd) {
  const result = await pool.query(`
    SELECT COALESCE(SUM(total_work_minutes), 0) as total_minutes
    FROM clock_in_records
    WHERE employee_id = $1
      AND work_date BETWEEN $2 AND $3
      AND status = 'completed'
  `, [employeeId, periodStart, periodEnd]);

  const totalMinutes = parseFloat(result.rows[0]?.total_minutes || 0);
  const totalHours = totalMinutes / 60;
  const grossSalary = Math.round(totalHours * PART_TIME_HOURLY_RATE * 100) / 100;

  return {
    totalMinutes,
    totalHours: Math.round(totalHours * 100) / 100,
    grossSalary
  };
}

/**
 * Calculate schedule-based payable days for outlet companies (Mimix)
 * Returns: { scheduledDays, attendedDays, payableDays }
 */
async function calculateScheduleBasedPay(employeeId, periodStart, periodEnd) {
  // Get all schedules for the period with attendance data
  const result = await pool.query(`
    SELECT
      s.schedule_date,
      s.status as schedule_status,
      cr.clock_in_1,
      cr.clock_out_1,
      cr.clock_in_2,
      cr.clock_out_2,
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
      AND s.status IN ('scheduled', 'completed')
    ORDER BY s.schedule_date
  `, [employeeId, periodStart, periodEnd]);

  const scheduledDays = result.rows.length;
  const attendedDays = result.rows.filter(r => r.attended).length;

  // Payable days = scheduled AND attended
  // Or if schedule marked as 'completed' (for approved absences)
  const payableDays = result.rows.filter(r =>
    r.attended || r.schedule_status === 'completed'
  ).length;

  return {
    scheduledDays,
    attendedDays,
    payableDays,
    absentDays: scheduledDays - payableDays
  };
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
             (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = pr.id) as item_count,
             au.name as approved_by_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
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

    query += ' ORDER BY pr.year DESC, pr.month DESC, d.name NULLS FIRST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ error: 'Failed to fetch payroll runs' });
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
      SELECT pr.*, d.name as department_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE pr.id = $1
    `, [id]);

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    // CRITICAL: Verify run belongs to this company
    if (runResult.rows[0].company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied: payroll run belongs to another company' });
    }

    const itemsResult = await pool.query(`
      SELECT pi.*,
             e.employee_id as emp_code,
             e.name as employee_name,
             e.bank_name,
             e.bank_account_no,
             d.name as department_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.name
    `, [id]);

    res.json({
      run: runResult.rows[0],
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
    const { month, year, department_id, notes, employee_ids } = req.body;
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    await client.query('BEGIN');

    // CRITICAL: Use SELECT FOR UPDATE to prevent race conditions
    // Lock existing runs for this period to prevent duplicates
    const lockQuery = `
      SELECT id FROM payroll_runs
      WHERE month = $1 AND year = $2 AND company_id = $3
      ${department_id ? 'AND department_id = $4' : 'AND department_id IS NULL'}
      FOR UPDATE NOWAIT
    `;
    const lockParams = department_id
      ? [month, year, companyId, department_id]
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

    // Get company settings
    const settings = await getCompanySettings(companyId);
    const { features, rates, period: periodConfig, statutory } = settings;

    // Check if run already exists
    let existingQuery = 'SELECT id FROM payroll_runs WHERE month = $1 AND year = $2 AND company_id = $3';
    let existingParams = [month, year, companyId];

    if (department_id) {
      existingQuery += ' AND department_id = $4';
      existingParams.push(department_id);
    } else {
      existingQuery += ' AND department_id IS NULL';
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

    // Create payroll run
    const runResult = await client.query(`
      INSERT INTO payroll_runs (
        month, year, status, notes, department_id, company_id,
        period_start_date, period_end_date, payment_due_date, period_label
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      month, year, notes, department_id || null, companyId,
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

    if (department_id) {
      employeeQuery += ` AND e.department_id = $${employeeParams.length + 1}`;
      employeeParams.push(department_id);
    }

    if (employee_ids && employee_ids.length > 0) {
      employeeQuery += ` AND e.id = ANY($${employeeParams.length + 1})`;
      employeeParams.push(employee_ids);
    }

    const employees = await client.query(employeeQuery, employeeParams);

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
        SELECT ea.employee_id, SUM(ea.amount) as total
        FROM employee_allowances ea
        JOIN allowance_types at ON ea.allowance_type_id = at.id
        WHERE ea.is_active = TRUE AND at.is_active = TRUE
        GROUP BY ea.employee_id
      `);
      allowResult.rows.forEach(r => {
        allowancesMap[r.employee_id] = parseFloat(r.total) || 0;
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

    // Get approved claims
    let claimsMap = {};
    if (features.auto_claims_linking) {
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

      const claimsResult = await client.query(`
        SELECT employee_id, SUM(amount) as total_claims
        FROM claims
        WHERE status = 'approved'
          AND linked_payroll_item_id IS NULL
          AND claim_date BETWEEN $1 AND $2
        GROUP BY employee_id
      `, [startOfMonth, endOfMonth]);

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

      // Part-time employee: salary = total work hours × RM 8.72
      // Part-time employees don't get fixed salary, allowances, or leave
      let partTimeData = null;
      if (emp.work_type === 'part_time') {
        partTimeData = await calculatePartTimeHours(
          emp.id,
          period.start.toISOString().split('T')[0],
          period.end.toISOString().split('T')[0]
        );
        basicSalary = partTimeData.grossSalary;
        fixedAllowance = 0; // Part-time no fixed allowance
      }

      // Flexible earnings
      let commissionAmount = commissionsMap[emp.id] || 0;
      let flexAllowance = allowancesMap[emp.id] || 0;

      // Part-time employees don't get flexible allowances
      if (emp.work_type === 'part_time') {
        flexAllowance = 0;
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

      // OT calculation (skip for part-time - they're paid by actual hours worked)
      let otHours = 0, otAmount = 0, phDaysWorked = 0, phPay = 0;

      if (features.auto_ot_from_clockin && emp.work_type !== 'part_time') {
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

      // PH pay (skip for part-time - they're paid by actual hours worked)
      if (features.auto_ph_pay && emp.work_type !== 'part_time') {
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

      if (emp.work_type !== 'part_time') {
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

      // Claims (reimbursements - added to pay)
      const claimsAmount = claimsMap[emp.id] || 0;

      // Salary advance deductions
      const advanceDeduction = advancesMap[emp.id] || 0;

      // Calculate totals
      const totalAllowances = fixedAllowance + flexAllowance;
      const grossBeforeDeductions = basicSalary + totalAllowances + otAmount + phPay + commissionAmount + claimsAmount;
      const grossSalary = Math.max(0, grossBeforeDeductions - unpaidDeduction);

      // Statutory base calculation
      let statutoryBase = basicSalary + commissionAmount;
      if (statutory.statutory_on_ot) statutoryBase += otAmount;
      if (statutory.statutory_on_allowance) statutoryBase += totalAllowances;

      // Get YTD data for PCB
      let ytdData = null;
      if (features.ytd_pcb_calculation) {
        ytdData = await getYTDData(emp.id, year, month);
      }

      // Calculate statutory deductions
      const statutoryResult = calculateAllStatutory(statutoryBase, emp, month, ytdData);

      // Apply statutory toggles
      const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
      const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
      const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
      const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
      const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
      const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;
      const pcb = statutory.pcb_enabled ? statutoryResult.pcb : 0;

      const totalDeductions = unpaidDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + advanceDeduction;
      const netPay = grossSalary - totalDeductions + unpaidDeduction; // unpaidDeduction already subtracted from gross
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
          gross_salary, statutory_base,
          epf_employee, epf_employer,
          socso_employee, socso_employer,
          eis_employee, eis_employer,
          pcb,
          total_deductions, net_pay, employer_total_cost,
          sales_amount, salary_calculation_method,
          ytd_gross, ytd_epf, ytd_pcb,
          prev_month_net, variance_amount, variance_percent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
      `, [
        runId, emp.id,
        basicSalary, totalAllowances, commissionAmount, claimsAmount,
        otHours, otAmount, phDaysWorked, phPay,
        unpaidDays, unpaidDeduction, advanceDeduction,
        grossSalary, statutoryBase,
        epfEmployee, epfEmployer,
        socsoEmployee, socsoEmployer,
        eisEmployee, eisEmployer,
        pcb,
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

      // Warning for large variance
      if (variancePercent !== null && Math.abs(variancePercent) > 10) {
        warnings.push(`${emp.name} has ${variancePercent > 0 ? '+' : ''}${variancePercent.toFixed(1)}% variance from last month`);
      }
    }

    // Update run totals
    await client.query(`
      UPDATE payroll_runs SET
        total_gross = $1, total_deductions = $2, total_net = $3,
        total_employer_cost = $4, employee_count = $5,
        has_variance_warning = $6
      WHERE id = $7
    `, [stats.totalGross, stats.totalDeductions, stats.totalNet, stats.totalEmployerCost, stats.created, warnings.length > 0, runId]);

    await client.query('COMMIT');

    res.status(201).json({
      message: `Payroll run created with ${stats.created} employees`,
      run: runResult.rows[0],
      stats,
      warnings: warnings.length > 0 ? warnings : undefined
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
             e.ic_number, e.date_of_birth, e.marital_status, e.spouse_working, e.children_count
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
    const fixedAllowance = parseFloat(updates.fixed_allowance ?? item.fixed_allowance) || 0;
    const otHours = parseFloat(updates.ot_hours ?? item.ot_hours) || 0;
    const otAmount = parseFloat(updates.ot_amount ?? item.ot_amount) || 0;
    const phDaysWorked = parseFloat(updates.ph_days_worked ?? item.ph_days_worked) || 0;
    const phPay = parseFloat(updates.ph_pay ?? item.ph_pay) || 0;
    const incentiveAmount = parseFloat(updates.incentive_amount ?? item.incentive_amount) || 0;
    const commissionAmount = parseFloat(updates.commission_amount ?? item.commission_amount) || 0;
    const tradeCommission = parseFloat(updates.trade_commission_amount ?? item.trade_commission_amount) || 0;
    const outstationAmount = parseFloat(updates.outstation_amount ?? item.outstation_amount) || 0;
    const bonus = parseFloat(updates.bonus ?? item.bonus) || 0;
    const otherDeductions = parseFloat(updates.other_deductions ?? item.other_deductions) || 0;
    const claimsAmount = parseFloat(item.claims_amount) || 0;
    const unpaidDeduction = parseFloat(item.unpaid_leave_deduction) || 0;

    // Gross salary
    const grossSalary = basicSalary + fixedAllowance + otAmount + phPay + incentiveAmount +
                        commissionAmount + tradeCommission + outstationAmount + bonus + claimsAmount - unpaidDeduction;

    // Statutory base
    let statutoryBase = basicSalary + commissionAmount + tradeCommission + bonus;
    if (statutory.statutory_on_ot) statutoryBase += otAmount;
    if (statutory.statutory_on_allowance) statutoryBase += fixedAllowance;
    if (statutory.statutory_on_incentive) statutoryBase += incentiveAmount;

    // Get YTD data
    let ytdData = null;
    if (settings.features.ytd_pcb_calculation) {
      ytdData = await getYTDData(item.employee_id, item.year, item.month);
    }

    // Recalculate statutory
    const statutoryResult = calculateAllStatutory(statutoryBase, item, item.month, ytdData);

    const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
    const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
    const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
    const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
    const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
    const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;
    const pcb = statutory.pcb_enabled ? statutoryResult.pcb : 0;

    const totalDeductions = unpaidDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + otherDeductions;
    const netPay = grossSalary + unpaidDeduction - totalDeductions;
    const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

    // Update item
    const result = await pool.query(`
      UPDATE payroll_items SET
        basic_salary = $1, fixed_allowance = $2,
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
        notes = $26, updated_at = NOW()
      WHERE id = $27
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
      updates.notes, id
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
            AND claim_date BETWEEN $3 AND $4
        `, [item.id, item.employee_id, startOfMonth, endOfMonth]);
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

    res.json({ message: 'Payroll run finalized successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error finalizing payroll run:', error);
    res.status(500).json({ error: 'Failed to finalize payroll run' });
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
        c.name as company_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
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
        position: item.position,
        join_date: item.join_date,
        bank_name: item.bank_name,
        bank_account_no: item.bank_account_no
      },
      period: {
        month: item.month,
        year: item.year,
        label: item.period_label || `${getMonthName(item.month)} ${item.year}`
      },
      earnings: {
        basic_salary: parseFloat(item.basic_salary) || 0,
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
        bonus: parseFloat(item.bonus) || 0
      },
      deductions: {
        unpaid_leave_days: parseFloat(item.unpaid_leave_days) || 0,
        unpaid_leave_deduction: parseFloat(item.unpaid_leave_deduction) || 0,
        epf_employee: parseFloat(item.epf_employee) || 0,
        socso_employee: parseFloat(item.socso_employee) || 0,
        eis_employee: parseFloat(item.eis_employee) || 0,
        pcb: parseFloat(item.pcb) || 0,
        other_deductions: parseFloat(item.other_deductions) || 0
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
 * Generate bank payment file (CSV)
 */
router.get('/runs/:id/bank-file', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
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

    const result = await pool.query(`
      SELECT
        e.name as employee_name,
        e.bank_name,
        e.bank_account_no,
        pi.net_pay
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1 AND pi.net_pay > 0
      ORDER BY e.name
    `, [id]);

    let csv = 'Bank Name,Account Number,Employee Name,Net Pay\n';
    result.rows.forEach(row => {
      csv += `"${row.bank_name || ''}","${row.bank_account_no || ''}","${row.employee_name}",${row.net_pay}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=bank_payment_${id}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error generating bank file:', error);
    res.status(500).json({ error: 'Failed to generate bank file' });
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

    for (const emp of employees.rows) {
      // Get OT records for this employee in the specified month
      const otRecords = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN ot_approved = true THEN ot_hours ELSE 0 END), 0) as approved_ot_hours,
          COALESCE(SUM(CASE WHEN ot_approved IS NULL AND ot_hours > 0 THEN ot_hours ELSE 0 END), 0) as pending_ot_hours,
          COALESCE(SUM(CASE WHEN ot_approved = false THEN ot_hours ELSE 0 END), 0) as rejected_ot_hours,
          COUNT(CASE WHEN ot_approved IS NULL AND ot_hours > 0 THEN 1 END) as pending_records_count
        FROM clock_in_records
        WHERE employee_id = $1
          AND EXTRACT(MONTH FROM work_date) = $2
          AND EXTRACT(YEAR FROM work_date) = $3
          AND status IN ('clocked_out', 'approved', 'completed')
      `, [emp.id, month, year]);

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

module.exports = router;
