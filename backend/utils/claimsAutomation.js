/**
 * Claims Auto-Approval Utility
 * Handles automatic approval of claims based on configurable rules
 */

const pool = require('../db');
const { logClaimAction } = require('./auditLog');

/**
 * Get claim type configuration
 */
async function getClaimType(claimTypeId) {
  const result = await pool.query(
    'SELECT * FROM claim_types WHERE id = $1',
    [claimTypeId]
  );
  return result.rows[0] || null;
}

/**
 * Get claim type by category code for a company
 */
async function getClaimTypeByCategory(companyId, categoryCode) {
  const result = await pool.query(
    'SELECT * FROM claim_types WHERE company_id = $1 AND code = $2',
    [companyId, categoryCode.toUpperCase()]
  );
  return result.rows[0] || null;
}

/**
 * Get all claim types for a company
 */
async function getCompanyClaimTypes(companyId) {
  const result = await pool.query(
    'SELECT * FROM claim_types WHERE company_id = $1 AND is_active = TRUE ORDER BY name',
    [companyId]
  );
  return result.rows;
}

/**
 * Get department claim restrictions
 */
async function getDepartmentClaimRestrictions(companyId, departmentId) {
  const result = await pool.query(
    'SELECT * FROM department_claim_restrictions WHERE company_id = $1 AND department_id = $2',
    [companyId, departmentId]
  );
  return result.rows[0] || null;
}

/**
 * Get allowed claim types for an employee based on their department
 * Returns null if no restrictions (all types allowed)
 */
async function getAllowedClaimTypesForEmployee(employeeId) {
  const result = await pool.query(`
    SELECT dcr.allowed_claim_types, dcr.restriction_type, d.name as department_name
    FROM employees e
    JOIN departments d ON e.department_id = d.id
    LEFT JOIN department_claim_restrictions dcr ON dcr.department_id = e.department_id AND dcr.company_id = e.company_id
    WHERE e.id = $1
  `, [employeeId]);

  if (result.rows.length === 0) {
    return { restricted: false, allowedTypes: null, departmentName: null };
  }

  const row = result.rows[0];
  if (!row.allowed_claim_types) {
    return { restricted: false, allowedTypes: null, departmentName: row.department_name };
  }

  return {
    restricted: true,
    allowedTypes: row.allowed_claim_types,
    restrictionType: row.restriction_type,
    departmentName: row.department_name
  };
}

/**
 * Validate if employee can submit a claim for given category
 */
async function validateClaimCategory(employeeId, categoryCode) {
  const restrictions = await getAllowedClaimTypesForEmployee(employeeId);

  if (!restrictions.restricted) {
    return { valid: true };
  }

  const upperCategory = categoryCode.toUpperCase();
  const isAllowed = restrictions.allowedTypes.includes(upperCategory);

  if (!isAllowed) {
    return {
      valid: false,
      reason: `${restrictions.departmentName} employees can only claim: ${restrictions.allowedTypes.join(', ')}`,
      allowedTypes: restrictions.allowedTypes
    };
  }

  return { valid: true };
}

/**
 * Check if employee has outstation meal allowance
 */
async function getEmployeeMealAllowance(employeeId) {
  const result = await pool.query(
    'SELECT outstation_meal_allowance FROM employees WHERE id = $1',
    [employeeId]
  );
  return result.rows[0]?.outstation_meal_allowance || null;
}

/**
 * Check if a claim can be auto-approved
 *
 * @param {Object} claim - Claim details
 * @param {Object} claimType - Claim type configuration
 * @param {Object} automationConfig - Company automation config
 * @returns {Object} { canAutoApprove, reason }
 */
async function canAutoApproveClaim(claim, claimType, automationConfig) {
  const amount = parseFloat(claim.amount);
  const category = (claim.category || '').toUpperCase();

  // Special case: Check for outstation meal allowance (bypasses normal rules)
  if (category === 'MEAL' || category === 'FOOD' || category === 'MAKAN') {
    const mealAllowance = await getEmployeeMealAllowance(claim.employee_id);
    if (mealAllowance && amount <= parseFloat(mealAllowance)) {
      return {
        canAutoApprove: true,
        reason: `Outstation meal allowance: RM${amount} within RM${mealAllowance} limit`,
        bypassedNormalRules: true
      };
    }
  }

  // Check if auto-approval is enabled at company level
  if (!automationConfig.claims_auto_approve) {
    return { canAutoApprove: false, reason: 'Claims auto-approval disabled for company' };
  }

  // Check if claim type exists and has auto-approval enabled
  if (!claimType) {
    return { canAutoApprove: false, reason: 'Claim type not configured' };
  }

  if (!claimType.auto_approve_enabled) {
    return { canAutoApprove: false, reason: `Auto-approval disabled for ${claimType.name}` };
  }

  // Check amount against claim type limit
  const amount = parseFloat(claim.amount);

  if (claimType.auto_approve_max_amount && amount > parseFloat(claimType.auto_approve_max_amount)) {
    return {
      canAutoApprove: false,
      reason: `Amount RM${amount} exceeds auto-approve limit RM${claimType.auto_approve_max_amount}`
    };
  }

  // Check against company-wide limit
  if (amount > parseFloat(automationConfig.claims_auto_approve_max_amount)) {
    return {
      canAutoApprove: false,
      reason: `Amount RM${amount} exceeds company limit RM${automationConfig.claims_auto_approve_max_amount}`
    };
  }

  // Check if receipt is required but not provided
  if (claimType.require_receipt && !claim.receipt_url && !claim.document_url) {
    return { canAutoApprove: false, reason: 'Receipt required but not attached' };
  }

  // Check receipt requirement based on amount
  if (automationConfig.claims_require_receipt_above &&
      amount > parseFloat(automationConfig.claims_require_receipt_above) &&
      !claim.receipt_url && !claim.document_url) {
    return {
      canAutoApprove: false,
      reason: `Receipt required for claims above RM${automationConfig.claims_require_receipt_above}`
    };
  }

  // Check monthly limit if configured
  if (claimType.max_per_month) {
    const monthlyTotal = await getMonthlyClaimTotal(claim.employee_id, claimType.id);
    if (monthlyTotal + amount > parseFloat(claimType.max_per_month)) {
      return {
        canAutoApprove: false,
        reason: `Would exceed monthly limit of RM${claimType.max_per_month}`
      };
    }
  }

  // Check yearly limit if configured
  if (claimType.max_per_year) {
    const yearlyTotal = await getYearlyClaimTotal(claim.employee_id, claimType.id);
    if (yearlyTotal + amount > parseFloat(claimType.max_per_year)) {
      return {
        canAutoApprove: false,
        reason: `Would exceed yearly limit of RM${claimType.max_per_year}`
      };
    }
  }

  return { canAutoApprove: true, reason: 'All criteria met' };
}

/**
 * Get employee's total claims for a claim type this month
 */
async function getMonthlyClaimTotal(employeeId, claimTypeId) {
  const result = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM claims
    WHERE employee_id = $1
      AND claim_type_id = $2
      AND status IN ('approved', 'pending')
      AND EXTRACT(MONTH FROM claim_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM claim_date) = EXTRACT(YEAR FROM CURRENT_DATE)
  `, [employeeId, claimTypeId]);

  return parseFloat(result.rows[0].total) || 0;
}

/**
 * Get employee's total claims for a claim type this year
 */
async function getYearlyClaimTotal(employeeId, claimTypeId) {
  const result = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM claims
    WHERE employee_id = $1
      AND claim_type_id = $2
      AND status IN ('approved', 'pending')
      AND EXTRACT(YEAR FROM claim_date) = EXTRACT(YEAR FROM CURRENT_DATE)
  `, [employeeId, claimTypeId]);

  return parseFloat(result.rows[0].total) || 0;
}

/**
 * Process a claim for auto-approval
 * Called when a new claim is submitted
 *
 * @param {number} claimId - ID of the claim to process
 * @returns {Object} Result of auto-approval attempt
 */
async function processClaimAutoApproval(claimId) {
  const client = await pool.connect();

  try {
    // Get claim details with employee and company info
    const claimResult = await client.query(`
      SELECT c.*, e.company_id, e.name as employee_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.id = $1
    `, [claimId]);

    if (claimResult.rows.length === 0) {
      return { success: false, reason: 'Claim not found' };
    }

    const claim = claimResult.rows[0];

    // Only process pending claims
    if (claim.status !== 'pending') {
      return { success: false, reason: `Claim status is ${claim.status}, not pending` };
    }

    // Get automation config
    const configResult = await client.query(
      'SELECT * FROM automation_configs WHERE company_id = $1',
      [claim.company_id]
    );

    const automationConfig = configResult.rows[0] || {
      claims_auto_approve: false,
      claims_auto_approve_max_amount: 100,
      claims_require_receipt_above: 50
    };

    // Try to match claim to a claim type
    let claimType = null;
    if (claim.claim_type_id) {
      claimType = await getClaimType(claim.claim_type_id);
    } else if (claim.category) {
      claimType = await getClaimTypeByCategory(claim.company_id, claim.category);
    }

    // Check if can auto-approve
    const check = await canAutoApproveClaim(claim, claimType, automationConfig);

    if (!check.canAutoApprove) {
      // Log the failed auto-approval attempt
      await logClaimAction(claimId, 'auto_approve_failed', null, {
        companyId: claim.company_id,
        reason: check.reason
      });

      return {
        success: false,
        autoApproved: false,
        reason: check.reason
      };
    }

    // Auto-approve the claim
    await client.query('BEGIN');

    await client.query(`
      UPDATE claims SET
        status = 'approved',
        approval_type = 'auto',
        auto_approved = TRUE,
        auto_approval_reason = $2,
        claim_type_id = $3,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [claimId, check.reason, claimType?.id]);

    // Log the action
    await logClaimAction(claimId, 'approve', null, {
      companyId: claim.company_id,
      autoApproved: true,
      oldValues: { status: 'pending' },
      newValues: { status: 'approved', auto_approved: true },
      reason: check.reason
    });

    await client.query('COMMIT');

    return {
      success: true,
      autoApproved: true,
      reason: check.reason,
      claimType: claimType?.name
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in processClaimAutoApproval:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Manually approve a claim
 */
async function manualApproveClaim(claimId, adminId, notes = null) {
  const result = await pool.query(`
    UPDATE claims SET
      status = 'approved',
      approval_type = 'manual',
      approver_id = $2,
      approved_at = NOW(),
      updated_at = NOW()
    WHERE id = $1 AND status = 'pending'
    RETURNING *
  `, [claimId, adminId]);

  if (result.rows.length === 0) {
    return { success: false, reason: 'Claim not found or not pending' };
  }

  const claim = result.rows[0];

  // Get company_id for logging
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [claim.employee_id]
  );

  await logClaimAction(claimId, 'approve', { id: adminId }, {
    companyId: empResult.rows[0]?.company_id,
    oldValues: { status: 'pending' },
    newValues: { status: 'approved' }
  });

  return { success: true, claim };
}

/**
 * Reject a claim
 */
async function rejectClaim(claimId, adminId, reason) {
  const result = await pool.query(`
    UPDATE claims SET
      status = 'rejected',
      approver_id = $2,
      rejection_reason = $3,
      updated_at = NOW()
    WHERE id = $1 AND status = 'pending'
    RETURNING *
  `, [claimId, adminId, reason]);

  if (result.rows.length === 0) {
    return { success: false, reason: 'Claim not found or not pending' };
  }

  const claim = result.rows[0];

  // Get company_id for logging
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [claim.employee_id]
  );

  await logClaimAction(claimId, 'reject', { id: adminId }, {
    companyId: empResult.rows[0]?.company_id,
    oldValues: { status: 'pending' },
    newValues: { status: 'rejected' },
    reason
  });

  return { success: true, claim };
}

/**
 * Get pending claims summary for a company
 */
async function getPendingClaimsSummary(companyId) {
  const result = await pool.query(`
    SELECT
      c.category,
      ct.name as claim_type_name,
      COUNT(*) as count,
      SUM(c.amount) as total_amount
    FROM claims c
    JOIN employees e ON c.employee_id = e.id
    LEFT JOIN claim_types ct ON c.claim_type_id = ct.id
    WHERE e.company_id = $1 AND c.status = 'pending'
    GROUP BY c.category, ct.name
    ORDER BY count DESC
  `, [companyId]);

  return result.rows;
}

module.exports = {
  getClaimType,
  getClaimTypeByCategory,
  getCompanyClaimTypes,
  getDepartmentClaimRestrictions,
  getAllowedClaimTypesForEmployee,
  validateClaimCategory,
  canAutoApproveClaim,
  processClaimAutoApproval,
  manualApproveClaim,
  rejectClaim,
  getPendingClaimsSummary,
  getMonthlyClaimTotal,
  getYearlyClaimTotal,
  getEmployeeMealAllowance
};
