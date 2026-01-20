/**
 * Leave Proration Utility
 * Calculates prorated leave entitlements based on company configuration
 *
 * AA Alive (company_id=1) - Malaysian Employment Act 1955:
 * - Annual Leave: 8 days (<2 years), 12 days (2-5 years), 16 days (>5 years)
 * - Medical Leave: 14 days (<2 years), 18 days (2-5 years), 22 days (>5 years)
 *
 * Mimix (company_id=3):
 * - Annual Leave: 12 days (0-4 years), 16 days (5+ years)
 * - Medical Leave: 14 days (<2 years), 18 days (2-5 years), 22 days (>5 years)
 * - Part-time employees: No leave entitlement (paid by hours worked)
 *
 * Common:
 * - Hospitalization: 60 days (separate from medical leave)
 * - Maternity: 98 consecutive days (first 5 children, 90 days service required)
 * - Paternity: 7 consecutive days (first 5 children, married males)
 *
 * Proration Formula: Prorated Days = (Entitled Days x Months Worked) / 12
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
 * Calculate years of service
 * @param {Date|string} joinDate - Employee join date
 * @param {Date|string} asOfDate - Date to calculate service as of (default: today)
 * @returns {number} Years of service (decimal)
 */
function calculateYearsOfService(joinDate, asOfDate = new Date()) {
  const join = new Date(joinDate);
  const asOf = new Date(asOfDate);

  const diffMs = asOf - join;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const years = diffDays / 365;

  return Math.max(0, years);
}

/**
 * Get entitled days based on service years using entitlement rules
 * @param {Object} leaveType - Leave type with entitlement_rules
 * @param {number} yearsOfService - Years of service
 * @returns {number} Entitled days
 */
function getEntitlementByServiceYears(leaveType, yearsOfService) {
  // If no service-based rules, use default
  if (!leaveType.entitlement_rules || !leaveType.entitlement_rules.rules) {
    return leaveType.default_days_per_year;
  }

  const rules = leaveType.entitlement_rules.rules;

  // Find matching rule based on years of service
  for (const rule of rules) {
    if (yearsOfService >= rule.min_years && yearsOfService < rule.max_years) {
      return rule.days;
    }
  }

  // Fallback to default
  return leaveType.default_days_per_year;
}

/**
 * Check if employee meets gender requirement for leave type
 * @param {string} employeeGender - Employee's gender (male/female)
 * @param {string} genderRestriction - Leave type gender restriction
 * @returns {boolean}
 */
function meetsGenderRequirement(employeeGender, genderRestriction) {
  if (!genderRestriction) return true;
  return employeeGender?.toLowerCase() === genderRestriction.toLowerCase();
}

/**
 * Check if employee meets minimum service requirement
 * @param {Date|string} joinDate - Employee join date
 * @param {number} minServiceDays - Minimum service days required
 * @returns {boolean}
 */
function meetsServiceRequirement(joinDate, minServiceDays) {
  if (!minServiceDays || minServiceDays <= 0) return true;

  const join = new Date(joinDate);
  const now = new Date();
  const diffMs = now - join;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= minServiceDays;
}

/**
 * Get count of maternity/paternity leave used (for max_occurrences check)
 * @param {number} employeeId
 * @param {string} leaveTypeCode - 'MAT' or 'PAT'
 * @returns {Promise<number>}
 */
async function getLeaveOccurrenceCount(employeeId, leaveTypeCode) {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT lr.child_number) as count
     FROM leave_requests lr
     JOIN leave_types lt ON lr.leave_type_id = lt.id
     WHERE lr.employee_id = $1
       AND lt.code = $2
       AND lr.status = 'approved'
       AND lr.child_number IS NOT NULL`,
    [employeeId, leaveTypeCode]
  );

  return parseInt(result.rows[0]?.count || 0);
}

/**
 * Check if employee can take this leave type (gender, service, occurrences)
 * @param {Object} employee - Employee with gender, join_date
 * @param {Object} leaveType - Leave type with restrictions
 * @returns {Promise<{eligible: boolean, reason: string|null}>}
 */
async function checkLeaveEligibility(employee, leaveType) {
  // Check gender restriction
  if (leaveType.gender_restriction) {
    if (!meetsGenderRequirement(employee.gender, leaveType.gender_restriction)) {
      return {
        eligible: false,
        reason: `This leave type is only available for ${leaveType.gender_restriction} employees`
      };
    }
  }

  // Check minimum service requirement
  if (leaveType.min_service_days > 0) {
    if (!meetsServiceRequirement(employee.join_date, leaveType.min_service_days)) {
      return {
        eligible: false,
        reason: `Minimum ${leaveType.min_service_days} days of service required`
      };
    }
  }

  // Check max occurrences (maternity/paternity)
  if (leaveType.max_occurrences) {
    const used = await getLeaveOccurrenceCount(employee.id, leaveType.code);
    if (used >= leaveType.max_occurrences) {
      return {
        eligible: false,
        reason: `Maximum ${leaveType.max_occurrences} occurrences already used`
      };
    }
  }

  return { eligible: true, reason: null };
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
 * Uses Malaysian Employment Act service-year based entitlements
 *
 * @param {number} employeeId - Employee ID
 * @param {number} companyId - Company ID
 * @param {Date|string} joinDate - Employee join date
 * @param {Object} employeeInfo - Optional employee info for gender checks
 * @returns {Object} Created leave balances
 */
async function initializeLeaveBalances(employeeId, companyId, joinDate, employeeInfo = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const join = new Date(joinDate);
    const year = join.getFullYear();

    // Get company settings
    const settings = await getCompanyLeaveSettings(companyId);

    // Get employee info if not provided
    if (!employeeInfo.gender) {
      const empResult = await client.query(
        'SELECT gender, marital_status FROM employees WHERE id = $1',
        [employeeId]
      );
      if (empResult.rows.length > 0) {
        employeeInfo = { ...employeeInfo, ...empResult.rows[0] };
      }
    }

    // Calculate years of service (for new employees, this is 0)
    const yearsOfService = calculateYearsOfService(joinDate);

    // Get leave types for this company
    const leaveTypesResult = await client.query(
      'SELECT * FROM leave_types WHERE company_id = $1 OR company_id IS NULL ORDER BY code',
      [companyId]
    );

    const createdBalances = [];

    for (const lt of leaveTypesResult.rows) {
      // Skip leave types that employee is not eligible for (gender, etc.)
      if (lt.gender_restriction) {
        if (!meetsGenderRequirement(employeeInfo.gender, lt.gender_restriction)) {
          continue; // Skip this leave type
        }
      }

      // Get base entitlement based on years of service
      const baseEntitlement = getEntitlementByServiceYears(lt, yearsOfService);

      // Calculate prorated entitlement for mid-year joiners
      const entitled = calculateProratedLeave(
        joinDate,
        baseEntitlement,
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
          full_entitlement: baseEntitlement,
          prorated_entitlement: entitled,
          years_of_service: yearsOfService
        });
      }
    }

    await client.query('COMMIT');

    return {
      employee_id: employeeId,
      company_id: companyId,
      join_date: joinDate,
      year,
      years_of_service: yearsOfService,
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
 * Recalculates entitlements based on updated years of service
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

    // Calculate years of service as of Jan 1st of the new year
    const yearStart = new Date(year, 0, 1);
    const yearsOfService = calculateYearsOfService(joinDate, yearStart);

    // Get employee info for gender checks
    const empResult = await client.query(
      'SELECT gender, marital_status FROM employees WHERE id = $1',
      [employeeId]
    );
    const employeeInfo = empResult.rows[0] || {};

    // Get previous year balances for carry forward
    const prevYear = year - 1;
    const prevBalances = await client.query(`
      SELECT lb.*, lt.code, lt.carries_forward, lt.max_carry_forward
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
      'SELECT * FROM leave_types WHERE company_id = $1 OR company_id IS NULL ORDER BY code',
      [companyId]
    );

    const createdBalances = [];

    for (const lt of leaveTypesResult.rows) {
      // Skip leave types that employee is not eligible for (gender, etc.)
      if (lt.gender_restriction) {
        if (!meetsGenderRequirement(employeeInfo.gender, lt.gender_restriction)) {
          continue;
        }
      }

      // Check if balance already exists for this year
      const existing = await client.query(`
        SELECT id FROM leave_balances
        WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3
      `, [employeeId, lt.id, year]);

      if (existing.rows.length > 0) continue;

      // Get entitlement based on years of service (this updates when employee tenure increases)
      let baseEntitlement = getEntitlementByServiceYears(lt, yearsOfService);

      // For employees who joined this year, use proration
      let entitled = baseEntitlement;
      if (joinYear === year) {
        entitled = calculateProratedLeave(joinDate, baseEntitlement, settings);
      }

      // Calculate carry forward from previous year
      let carriedForward = 0;
      const prevBalance = prevBalanceMap[lt.id];
      if (prevBalance) {
        // Use leave type's own carry forward setting, or company default
        const canCarry = lt.carries_forward || settings.leave_carry_forward_enabled;
        const maxCarry = lt.max_carry_forward || settings.leave_carry_forward_max_days;

        if (canCarry) {
          const remaining = parseFloat(prevBalance.entitled_days) +
                           parseFloat(prevBalance.carried_forward) -
                           parseFloat(prevBalance.used_days);
          carriedForward = Math.min(
            Math.max(0, remaining),
            maxCarry
          );
        }
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
        leave_type_name: lt.name,
        base_entitlement: baseEntitlement,
        years_of_service: yearsOfService
      });
    }

    await client.query('COMMIT');

    return {
      employee_id: employeeId,
      year,
      years_of_service: yearsOfService,
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
  calculateLeaveEncashment,
  // New Malaysian Employment Act functions
  calculateYearsOfService,
  getEntitlementByServiceYears,
  checkLeaveEligibility,
  meetsGenderRequirement,
  meetsServiceRequirement,
  getLeaveOccurrenceCount
};
