/**
 * Final Settlement Calculation Utility
 * Calculates complete final pay for resigned employees
 *
 * Includes:
 * 1. Prorated salary for partial month
 * 2. Unused leave encashment
 * 3. Pending approved claims
 * 4. Prorated bonus (if applicable)
 * 5. Notice period buy-out
 */

const pool = require('../db');
const { calculateAllStatutory, calculateAgeFromIC } = require('./statutory');

/**
 * Working Days Calculation Helpers
 * Used for accurate prorate salary calculations
 */

/**
 * Get the number of working days in a given month
 * Excludes weekends (Saturday and Sunday)
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month (1-12)
 * @returns {number} Number of working days
 */
function getWorkingDaysInMonth(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let workingDays = 0;

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }

  return workingDays;
}

/**
 * Get the number of working days between two dates (inclusive)
 * Excludes weekends (Saturday and Sunday)
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {number} Number of working days
 */
function getWorkingDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let workingDays = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }

  return workingDays;
}

/**
 * Get working days from the 1st of the month to a specific date
 * @param {Date|string} date - The end date
 * @returns {number} Number of working days from 1st to the given date
 */
function getWorkingDaysUpToDate(date) {
  const d = new Date(date);
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  return getWorkingDaysBetween(firstOfMonth, d);
}

/**
 * Get company settlement settings
 */
async function getCompanySettlementSettings(companyId) {
  const result = await pool.query(
    'SELECT settings FROM companies WHERE id = $1',
    [companyId]
  );

  if (result.rows.length === 0) {
    return {};
  }

  const settings = result.rows[0].settings || {};

  return {
    settlement_notice_period_days: settings.settlement_notice_period_days || 30,
    settlement_include_prorated_bonus: settings.settlement_include_prorated_bonus || false,
    settlement_leave_encashment_rate: settings.settlement_leave_encashment_rate || 1.0,
    settlement_working_days_per_month: settings.settlement_working_days_per_month || 22
  };
}

/**
 * Calculate final settlement for a resignation
 *
 * @param {number} resignationId - Resignation record ID
 * @returns {Object} Complete settlement calculation breakdown
 */
async function calculateFinalSettlement(resignationId) {
  const client = await pool.connect();

  try {
    // Get resignation with employee and company details
    const resignationResult = await client.query(`
      SELECT
        r.*,
        e.id as emp_id,
        e.name as employee_name,
        e.employee_id as emp_code,
        e.ic_number,
        e.default_basic_salary,
        e.default_bonus,
        e.marital_status,
        e.spouse_working,
        e.children_count,
        e.join_date,
        e.company_id,
        c.name as company_name,
        c.settings as company_settings
      FROM resignations r
      JOIN employees e ON r.employee_id = e.id
      JOIN companies c ON e.company_id = c.id
      WHERE r.id = $1
    `, [resignationId]);

    if (resignationResult.rows.length === 0) {
      throw new Error('Resignation not found');
    }

    const r = resignationResult.rows[0];
    const lastWorkingDay = new Date(r.last_working_day);
    const noticeDate = new Date(r.notice_date);
    const basicSalary = parseFloat(r.default_basic_salary) || 0;
    const settings = await getCompanySettlementSettings(r.company_id);
    const workingDaysPerMonth = settings.settlement_working_days_per_month;
    const dailyRate = basicSalary / workingDaysPerMonth;

    // ========================================
    // 1. PRORATED SALARY (partial month)
    // ========================================
    const lastMonth = lastWorkingDay.getMonth() + 1;
    const lastYear = lastWorkingDay.getFullYear();

    // Calculate working days (Mon-Fri only) - not calendar days
    // This fixes the 40% overpayment risk when using calendar days
    const workingDaysInMonth = getWorkingDaysInMonth(lastYear, lastMonth);
    const workingDaysWorked = getWorkingDaysUpToDate(lastWorkingDay);

    // Check if already paid for this month
    const existingPayroll = await client.query(`
      SELECT pi.* FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pi.employee_id = $1 AND pr.month = $2 AND pr.year = $3 AND pr.status = 'finalized'
    `, [r.emp_id, lastMonth, lastYear]);

    let proratedSalary = 0;
    let salaryDaysWorked = 0;

    if (existingPayroll.rows.length === 0) {
      // Not yet paid, calculate prorated salary based on WORKING days (not calendar days)
      // Formula: proratedSalary = (basicSalary / workingDaysInMonth) * actualWorkingDaysWorked
      salaryDaysWorked = workingDaysWorked;
      proratedSalary = Math.round((basicSalary / workingDaysInMonth) * workingDaysWorked * 100) / 100;
    }

    // ========================================
    // 2. LEAVE ENCASHMENT
    // ========================================
    const leaveBalances = await client.query(`
      SELECT lb.*, lt.code, lt.name as leave_type_name, lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2
    `, [r.emp_id, lastYear]);

    let totalLeaveEncashDays = 0;
    const leaveBreakdown = [];

    for (const lb of leaveBalances.rows) {
      if (lb.is_paid) {
        const remainingDays = parseFloat(lb.entitled_days) + parseFloat(lb.carried_forward || 0) - parseFloat(lb.used_days);
        if (remainingDays > 0) {
          totalLeaveEncashDays += remainingDays;
          leaveBreakdown.push({
            type: lb.code,
            name: lb.leave_type_name,
            entitled: parseFloat(lb.entitled_days),
            used: parseFloat(lb.used_days),
            carried_forward: parseFloat(lb.carried_forward || 0),
            remaining: remainingDays
          });
        }
      }
    }

    const encashmentRate = settings.settlement_leave_encashment_rate;
    const leaveEncashmentAmount = Math.round(totalLeaveEncashDays * dailyRate * encashmentRate * 100) / 100;

    // ========================================
    // 3. PENDING APPROVED CLAIMS
    // ========================================
    const pendingClaims = await client.query(`
      SELECT id, claim_date, category, description, amount
      FROM claims
      WHERE employee_id = $1
        AND status = 'approved'
        AND (linked_payroll_item_id IS NULL OR linked_payroll_item_id = 0)
    `, [r.emp_id]);

    const pendingClaimsAmount = pendingClaims.rows.reduce(
      (sum, c) => sum + parseFloat(c.amount),
      0
    );

    // ========================================
    // 4. PRORATED BONUS (if applicable)
    // ========================================
    let proratedBonus = 0;
    let bonusMonthsWorked = 0;

    if (settings.settlement_include_prorated_bonus) {
      const annualBonus = parseFloat(r.default_bonus) || 0;
      if (annualBonus > 0) {
        bonusMonthsWorked = lastMonth;
        proratedBonus = Math.round((annualBonus / 12) * bonusMonthsWorked * 100) / 100;
      }
    }

    // ========================================
    // 5. NOTICE PERIOD BUYOUT
    // ========================================
    const requiredNoticeDays = settings.settlement_notice_period_days;
    const actualNoticeDays = Math.ceil((lastWorkingDay - noticeDate) / (1000 * 60 * 60 * 24));
    const shortfallDays = Math.max(0, requiredNoticeDays - actualNoticeDays);

    let noticeBuyoutAmount = 0;
    let noticeBuyoutType = null;

    if (shortfallDays > 0) {
      noticeBuyoutAmount = Math.round(shortfallDays * dailyRate * 100) / 100;
      noticeBuyoutType = 'employee_pays'; // Employee didn't serve full notice
    }

    // ========================================
    // 6. STATUTORY DEDUCTIONS (on prorated salary + bonus)
    // ========================================
    let statutoryDeductions = {
      epf_employee: 0,
      socso_employee: 0,
      eis_employee: 0,
      pcb: 0,
      total: 0
    };

    if (proratedSalary > 0 || proratedBonus > 0) {
      const age = calculateAgeFromIC(r.ic_number) || 30;
      const statutory = calculateAllStatutory({
        basicSalary: proratedSalary,
        commission: 0,
        bonus: proratedBonus,
        maritalStatus: r.marital_status || 'single',
        spouseWorking: r.spouse_working || false,
        childrenCount: r.children_count || 0,
        age: age
      });

      statutoryDeductions = {
        epf_employee: statutory.epfEmployee || 0,
        socso_employee: statutory.socsoEmployee || 0,
        eis_employee: statutory.eisEmployee || 0,
        pcb: statutory.pcb || 0,
        total: (statutory.epfEmployee || 0) + (statutory.socsoEmployee || 0) +
               (statutory.eisEmployee || 0) + (statutory.pcb || 0)
      };
    }

    // ========================================
    // FINAL CALCULATION
    // ========================================
    const grossSettlement = proratedSalary + leaveEncashmentAmount +
                            pendingClaimsAmount + proratedBonus;

    let totalDeductions = statutoryDeductions.total;
    let netSettlement;

    if (noticeBuyoutType === 'employee_pays') {
      // Employee owes company for short notice
      totalDeductions += noticeBuyoutAmount;
      netSettlement = grossSettlement - totalDeductions;
    } else if (noticeBuyoutType === 'company_pays') {
      // Company pays employee (termination scenario)
      netSettlement = grossSettlement - statutoryDeductions.total + noticeBuyoutAmount;
    } else {
      netSettlement = grossSettlement - statutoryDeductions.total;
    }

    // Round final amount
    netSettlement = Math.round(netSettlement * 100) / 100;

    const breakdown = {
      prorated_salary: {
        working_days_worked: salaryDaysWorked,
        working_days_in_month: workingDaysInMonth,
        daily_rate: Math.round(dailyRate * 100) / 100,
        amount: proratedSalary,
        already_paid: existingPayroll.rows.length > 0,
        calculation_method: 'working_days' // Indicates Mon-Fri only, excludes weekends
      },
      leave_encashment: {
        total_days: totalLeaveEncashDays,
        encashment_rate: encashmentRate,
        daily_rate: Math.round(dailyRate * 100) / 100,
        breakdown: leaveBreakdown,
        amount: leaveEncashmentAmount
      },
      pending_claims: {
        count: pendingClaims.rows.length,
        claims: pendingClaims.rows,
        amount: pendingClaimsAmount
      },
      prorated_bonus: {
        annual_bonus: parseFloat(r.default_bonus) || 0,
        months_worked: bonusMonthsWorked,
        enabled: settings.settlement_include_prorated_bonus,
        amount: proratedBonus
      },
      notice_buyout: {
        required_days: requiredNoticeDays,
        actual_days: actualNoticeDays,
        shortfall_days: shortfallDays,
        type: noticeBuyoutType,
        daily_rate: Math.round(dailyRate * 100) / 100,
        amount: noticeBuyoutAmount
      },
      statutory_deductions: statutoryDeductions,
      totals: {
        gross: Math.round(grossSettlement * 100) / 100,
        deductions: Math.round(totalDeductions * 100) / 100,
        net: netSettlement
      }
    };

    return {
      resignation_id: resignationId,
      employee: {
        id: r.emp_id,
        employee_id: r.emp_code,
        name: r.employee_name,
        company: r.company_name
      },
      dates: {
        notice_date: r.notice_date,
        last_working_day: r.last_working_day,
        join_date: r.join_date
      },
      basic_salary: basicSalary,
      final_amount: netSettlement,
      breakdown,
      calculated_at: new Date().toISOString()
    };

  } finally {
    client.release();
  }
}

/**
 * Save final settlement to resignation record
 */
async function saveFinalSettlement(resignationId, settlement) {
  const result = await pool.query(`
    UPDATE resignations SET
      prorated_salary = $2,
      salary_days_worked = $3,
      leave_encashment_days = $4,
      leave_encashment_amount = $5,
      pending_claims_amount = $6,
      prorated_bonus_amount = $7,
      notice_buyout_amount = $8,
      notice_buyout_type = $9,
      total_deductions = $10,
      final_salary_amount = $11,
      settlement_breakdown = $12,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [
    resignationId,
    settlement.breakdown.prorated_salary.amount,
    settlement.breakdown.prorated_salary.days_worked,
    settlement.breakdown.leave_encashment.total_days,
    settlement.breakdown.leave_encashment.amount,
    settlement.breakdown.pending_claims.amount,
    settlement.breakdown.prorated_bonus.amount,
    settlement.breakdown.notice_buyout.amount,
    settlement.breakdown.notice_buyout.type,
    settlement.breakdown.totals.deductions,
    settlement.final_amount,
    JSON.stringify(settlement.breakdown)
  ]);

  return result.rows[0];
}

module.exports = {
  getCompanySettlementSettings,
  calculateFinalSettlement,
  saveFinalSettlement,
  // Working days helpers (exported for testing and reuse)
  getWorkingDaysInMonth,
  getWorkingDaysBetween,
  getWorkingDaysUpToDate
};
