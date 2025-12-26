/**
 * Leave Proration Utility
 * Calculates prorated leave entitlements for mid-year joiners
 *
 * Method: Option B - Prorated by months
 * Formula: Prorated Days = (Entitled Days x Months Worked) / 12
 */

const pool = require('../db');

/**
 * Get company leave settings
 */
async function getCompanyLeaveSettings(companyId) {
  const result = await pool.query(
    'SELECT settings FROM companies WHERE id = $1',
    [companyId]
  );

  if (result.rows.length === 0) {
    return {};
  }

  const settings = result.rows[0].settings || {};

  return {
    leave_proration_method: settings.leave_proration_method || 'by_month',
    leave_proration_rounding: settings.leave_proration_rounding || 'nearest', // 'up', 'down', 'nearest'
    leave_proration_count_join_month: settings.leave_proration_count_join_month !== false, // Default true
    leave_carry_forward_enabled: settings.leave_carry_forward_enabled || false,
    leave_carry_forward_max_days: settings.leave_carry_forward_max_days || 5
  };
}

/**
 * Calculate prorated leave for mid-year joiner
 *
 * @param {Date|string} joinDate - Employee join date
 * @param {number} entitledDays - Full year entitlement
 * @param {Object} settings - Company leave settings
 * @returns {number} Prorated days
 */
function calculateProratedLeave(joinDate, entitledDays, settings = {}) {
  const join = new Date(joinDate);
  const joinYear = join.getFullYear();
  const joinMonth = join.getMonth(); // 0-indexed
  const joinDay = join.getDate();

  // Count months from join to end of year
  let monthsWorked = 12 - joinMonth;

  // Option: don't count join month if started after 15th
  if (!settings.leave_proration_count_join_month && joinDay > 15) {
    monthsWorked = Math.max(0, monthsWorked - 1);
  }

  // Calculate prorated entitlement
  const prorated = (entitledDays * monthsWorked) / 12;

  // Apply rounding
  switch (settings.leave_proration_rounding) {
    case 'up':
      return Math.ceil(prorated);
    case 'down':
      return Math.floor(prorated);
    case 'nearest':
    default:
      // Round to nearest 0.5
      return Math.round(prorated * 2) / 2;
  }
}

/**
 * Initialize leave balances for a new employee
 * Called when employee is created
 *
 * @param {number} employeeId - Employee ID
 * @param {number} companyId - Company ID
 * @param {Date|string} joinDate - Employee join date
 * @returns {Object} Created leave balances
 */
async function initializeLeaveBalances(employeeId, companyId, joinDate) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const join = new Date(joinDate);
    const year = join.getFullYear();

    // Get company settings
    const settings = await getCompanyLeaveSettings(companyId);

    // Get leave types for this company
    const leaveTypesResult = await client.query(
      'SELECT * FROM leave_types WHERE company_id = $1',
      [companyId]
    );

    const createdBalances = [];

    for (const lt of leaveTypesResult.rows) {
      // Calculate prorated entitlement
      const entitled = calculateProratedLeave(
        joinDate,
        lt.default_days_per_year,
        settings
      );

      // Check if balance already exists
      const existing = await client.query(`
        SELECT id FROM leave_balances
        WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3
      `, [employeeId, lt.id, year]);

      if (existing.rows.length === 0) {
        // Create new balance
        const result = await client.query(`
          INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days, used_days, carried_forward)
          VALUES ($1, $2, $3, $4, 0, 0)
          RETURNING *
        `, [employeeId, lt.id, year, entitled]);

        createdBalances.push({
          ...result.rows[0],
          leave_type_code: lt.code,
          leave_type_name: lt.name,
          full_entitlement: lt.default_days_per_year,
          prorated_entitlement: entitled
        });
      }
    }

    await client.query('COMMIT');

    return {
      employee_id: employeeId,
      company_id: companyId,
      join_date: joinDate,
      year,
      settings,
      balances: createdBalances
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Initialize leave balances for a new year (annual reset)
 * Called at the start of each year or when needed
 *
 * @param {number} employeeId - Employee ID
 * @param {number} companyId - Company ID
 * @param {number} year - Year to initialize
 * @param {Date|string} joinDate - Employee join date (for tenure-based entitlements)
 */
async function initializeYearlyLeaveBalances(employeeId, companyId, year, joinDate) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const settings = await getCompanyLeaveSettings(companyId);
    const join = new Date(joinDate);
    const joinYear = join.getFullYear();

    // Get previous year balances for carry forward
    const prevYear = year - 1;
    const prevBalances = await client.query(`
      SELECT lb.*, lt.code
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2
    `, [employeeId, prevYear]);

    const prevBalanceMap = {};
    for (const pb of prevBalances.rows) {
      prevBalanceMap[pb.leave_type_id] = pb;
    }

    // Get leave types
    const leaveTypesResult = await client.query(
      'SELECT * FROM leave_types WHERE company_id = $1',
      [companyId]
    );

    const createdBalances = [];

    for (const lt of leaveTypesResult.rows) {
      // Check if balance already exists for this year
      const existing = await client.query(`
        SELECT id FROM leave_balances
        WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3
      `, [employeeId, lt.id, year]);

      if (existing.rows.length > 0) continue;

      // For employees who joined this year, use proration
      let entitled = lt.default_days_per_year;
      if (joinYear === year) {
        entitled = calculateProratedLeave(joinDate, lt.default_days_per_year, settings);
      }

      // Calculate carry forward from previous year
      let carriedForward = 0;
      if (settings.leave_carry_forward_enabled && prevBalanceMap[lt.id]) {
        const prev = prevBalanceMap[lt.id];
        const remaining = prev.entitled_days + prev.carried_forward - prev.used_days;
        carriedForward = Math.min(
          Math.max(0, remaining),
          settings.leave_carry_forward_max_days
        );
      }

      // Create new balance
      const result = await client.query(`
        INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days, used_days, carried_forward)
        VALUES ($1, $2, $3, $4, 0, $5)
        RETURNING *
      `, [employeeId, lt.id, year, entitled, carriedForward]);

      createdBalances.push({
        ...result.rows[0],
        leave_type_code: lt.code,
        leave_type_name: lt.name
      });
    }

    await client.query('COMMIT');

    return {
      employee_id: employeeId,
      year,
      balances: createdBalances
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get leave balance summary for an employee
 */
async function getLeaveBalanceSummary(employeeId, year = null) {
  const targetYear = year || new Date().getFullYear();

  const result = await pool.query(`
    SELECT
      lb.*,
      lt.code as leave_type_code,
      lt.name as leave_type_name,
      lt.is_paid,
      (lb.entitled_days + lb.carried_forward - lb.used_days) as remaining_days
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    WHERE lb.employee_id = $1 AND lb.year = $2
    ORDER BY lt.code
  `, [employeeId, targetYear]);

  return result.rows;
}

/**
 * Calculate leave encashment value for resignation
 */
function calculateLeaveEncashment(remainingDays, basicSalary, workingDaysPerMonth = 22, encashmentRate = 1.0) {
  const dailyRate = basicSalary / workingDaysPerMonth;
  return Math.round(remainingDays * dailyRate * encashmentRate * 100) / 100;
}

module.exports = {
  getCompanyLeaveSettings,
  calculateProratedLeave,
  initializeLeaveBalances,
  initializeYearlyLeaveBalances,
  getLeaveBalanceSummary,
  calculateLeaveEncashment
};
