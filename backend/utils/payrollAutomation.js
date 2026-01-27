/**
 * Payroll Automation Utility
 * Handles auto-generation and auto-approval of payroll runs
 *
 * Status Flow:
 * - draft → auto_generated → auto_approved → locked
 * - With manual edit: auto_approved → edited → approved → locked
 */

const pool = require('../db');
const { logPayrollAction } = require('./auditLog');

/**
 * Get automation config for a company
 */
async function getAutomationConfig(companyId) {
  const result = await pool.query(
    'SELECT * FROM automation_configs WHERE company_id = $1',
    [companyId]
  );

  if (result.rows.length === 0) {
    // Return defaults
    return {
      payroll_auto_generate: true,
      payroll_auto_approve: false,
      payroll_variance_threshold: 5.00,
      payroll_lock_after_days: 3,
      claims_auto_approve: false,
      claims_auto_approve_max_amount: 100.00
    };
  }

  return result.rows[0];
}

/**
 * Calculate variance between current and previous payroll
 */
async function calculatePayrollVariance(companyId, departmentId, month, year, currentTotal) {
  // Get previous month's payroll
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  let query = `
    SELECT SUM(pi.net_salary) as previous_total
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
      AND pr.status IN ('finalized', 'locked', 'approved')
  `;
  const params = [companyId, prevMonth, prevYear];

  if (departmentId) {
    query += ' AND pr.department_id = $4';
    params.push(departmentId);
  }

  const result = await pool.query(query, params);
  const previousTotal = parseFloat(result.rows[0]?.previous_total) || 0;

  if (previousTotal === 0) {
    return { variance: 0, percentage: 0, hasPrevious: false };
  }

  const variance = currentTotal - previousTotal;
  const percentage = (variance / previousTotal) * 100;

  return {
    variance: Math.round(variance * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
    previousTotal,
    hasPrevious: true
  };
}

/**
 * Auto-generate payroll for a company/department
 * Called by scheduler or manually triggered
 */
async function autoGeneratePayroll(companyId, departmentId, month, year) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if payroll already exists
    let checkQuery = `
      SELECT id FROM payroll_runs
      WHERE company_id = $1 AND month = $2 AND year = $3
    `;
    const checkParams = [companyId, month, year];

    if (departmentId) {
      checkQuery += ' AND department_id = $4';
      checkParams.push(departmentId);
    } else {
      checkQuery += ' AND department_id IS NULL';
    }

    const existing = await client.query(checkQuery, checkParams);

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: 'Payroll already exists for this period',
        existingId: existing.rows[0].id
      };
    }

    // Create payroll run with auto_generated status
    const runResult = await client.query(`
      INSERT INTO payroll_runs (
        company_id, department_id, month, year, status,
        generation_type, generated_at
      ) VALUES ($1, $2, $3, $4, 'auto_generated', 'auto', NOW())
      RETURNING *
    `, [companyId, departmentId, month, year]);

    const payrollRun = runResult.rows[0];

    // Get employees for this company/department
    let empQuery = `
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1 AND e.status = 'active'
    `;
    const empParams = [companyId];

    if (departmentId) {
      empQuery += ' AND e.department_id = $2';
      empParams.push(departmentId);
    }

    const employees = await client.query(empQuery, empParams);

    let totalNet = 0;
    let itemCount = 0;

    // Create payroll items for each employee
    for (const emp of employees.rows) {
      const basicSalary = parseFloat(emp.default_basic_salary) || 0;
      const allowance = parseFloat(emp.default_allowance) || 0;

      // Get all approved claims not yet linked to any payroll
      const claims = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM claims
        WHERE employee_id = $1
          AND status = 'approved'
          AND linked_payroll_item_id IS NULL
      `, [emp.id]);

      const claimsAmount = parseFloat(claims.rows[0].total) || 0;

      // TODO: Calculate OT from clock-in records (already implemented in otCalculation.js)
      // For now, use 0 - will be enhanced in next iteration
      const otHours = 0;
      const otAmount = 0;

      const grossSalary = basicSalary + allowance + claimsAmount + otAmount;

      // Simplified statutory calculations for auto-generation
      // Full calculations happen during review/finalization
      const epfEmployee = Math.round(basicSalary * 0.11 * 100) / 100;
      const socsoEmployee = Math.min(Math.round(basicSalary * 0.005 * 100) / 100, 9.90);
      const eisEmployee = Math.min(Math.round(basicSalary * 0.002 * 100) / 100, 3.95);
      const totalDeductions = epfEmployee + socsoEmployee + eisEmployee;
      const netSalary = grossSalary - totalDeductions;

      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id, basic_salary, allowance,
          claims_amount, ot_hours, ot_amount, gross_salary,
          epf_employee, socso_employee, eis_employee, total_deductions, net_salary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        payrollRun.id, emp.id, basicSalary, allowance,
        claimsAmount, otHours, otAmount, grossSalary,
        epfEmployee, socsoEmployee, eisEmployee, totalDeductions, netSalary
      ]);

      totalNet += netSalary;
      itemCount++;
    }

    // Calculate variance
    const variance = await calculatePayrollVariance(companyId, departmentId, month, year, totalNet);

    // Update payroll run with variance
    await client.query(`
      UPDATE payroll_runs SET
        variance_from_previous = $2,
        variance_percentage = $3,
        updated_at = NOW()
      WHERE id = $1
    `, [payrollRun.id, variance.variance, variance.percentage]);

    // Log the action
    await logPayrollAction(payrollRun.id, 'auto_generate', null, {
      companyId,
      newValues: {
        status: 'auto_generated',
        employee_count: itemCount,
        total_net: totalNet,
        variance: variance
      }
    });

    await client.query('COMMIT');

    return {
      success: true,
      payrollRunId: payrollRun.id,
      employeeCount: itemCount,
      totalNet: Math.round(totalNet * 100) / 100,
      variance,
      status: 'auto_generated'
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in autoGeneratePayroll:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if payroll can be auto-approved
 */
async function canAutoApprove(payrollRunId) {
  const result = await pool.query(`
    SELECT pr.*, ac.payroll_variance_threshold
    FROM payroll_runs pr
    JOIN automation_configs ac ON pr.company_id = ac.company_id
    WHERE pr.id = $1
  `, [payrollRunId]);

  if (result.rows.length === 0) {
    return { canApprove: false, reason: 'Payroll run not found' };
  }

  const run = result.rows[0];

  // Check status
  if (run.status !== 'auto_generated') {
    return { canApprove: false, reason: `Status must be auto_generated, current: ${run.status}` };
  }

  // Check variance threshold
  const threshold = parseFloat(run.payroll_variance_threshold) || 5.00;
  const variance = Math.abs(parseFloat(run.variance_percentage) || 0);

  if (variance > threshold) {
    return {
      canApprove: false,
      reason: `Variance ${variance}% exceeds threshold ${threshold}%`,
      variance,
      threshold
    };
  }

  return { canApprove: true, variance, threshold };
}

/**
 * Auto-approve a payroll run
 */
async function autoApprovePayroll(payrollRunId) {
  const check = await canAutoApprove(payrollRunId);

  if (!check.canApprove) {
    return { success: false, ...check };
  }

  const result = await pool.query(`
    UPDATE payroll_runs SET
      status = 'auto_approved',
      approval_type = 'auto',
      approved_at = NOW(),
      updated_at = NOW()
    WHERE id = $1 AND status = 'auto_generated'
    RETURNING *
  `, [payrollRunId]);

  if (result.rows.length === 0) {
    return { success: false, reason: 'Failed to update status' };
  }

  // Log the action
  await logPayrollAction(payrollRunId, 'auto_approve', null, {
    companyId: result.rows[0].company_id,
    newValues: {
      status: 'auto_approved',
      variance: check.variance,
      threshold: check.threshold
    }
  });

  return {
    success: true,
    status: 'auto_approved',
    variance: check.variance
  };
}

/**
 * Mark payroll as edited (when admin modifies an auto_approved run)
 */
async function markPayrollEdited(payrollRunId, adminId, reason = null) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current state
    const current = await client.query(
      'SELECT * FROM payroll_runs WHERE id = $1',
      [payrollRunId]
    );

    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'Payroll run not found' };
    }

    const run = current.rows[0];

    // Only allow editing if status is auto_approved
    if (run.status !== 'auto_approved') {
      await client.query('ROLLBACK');
      return { success: false, reason: `Cannot edit payroll with status: ${run.status}` };
    }

    // Update to edited status
    const result = await client.query(`
      UPDATE payroll_runs SET
        status = 'edited',
        is_edited = TRUE,
        edited_at = NOW(),
        edited_by = $2,
        edit_reason = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [payrollRunId, adminId, reason]);

    // Log the action
    await logPayrollAction(payrollRunId, 'edit', { id: adminId }, {
      companyId: run.company_id,
      oldValues: { status: 'auto_approved' },
      newValues: { status: 'edited' },
      reason
    });

    await client.query('COMMIT');

    return { success: true, payroll: result.rows[0] };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Manually approve an edited payroll
 */
async function manualApprovePayroll(payrollRunId, adminId) {
  const result = await pool.query(`
    UPDATE payroll_runs SET
      status = 'approved',
      approval_type = 'manual',
      approved_at = NOW(),
      approved_by = $2,
      updated_at = NOW()
    WHERE id = $1 AND status IN ('edited', 'auto_generated', 'draft')
    RETURNING *
  `, [payrollRunId, adminId]);

  if (result.rows.length === 0) {
    return { success: false, reason: 'Payroll run not found or invalid status' };
  }

  await logPayrollAction(payrollRunId, 'approve', { id: adminId }, {
    companyId: result.rows[0].company_id,
    newValues: { status: 'approved', approved_by: adminId }
  });

  return { success: true, payroll: result.rows[0] };
}

/**
 * Lock a payroll (finalize it)
 */
async function lockPayroll(payrollRunId, adminId = null) {
  const result = await pool.query(`
    UPDATE payroll_runs SET
      status = 'locked',
      locked_at = NOW(),
      locked_by = $2,
      updated_at = NOW()
    WHERE id = $1 AND status IN ('approved', 'auto_approved')
    RETURNING *
  `, [payrollRunId, adminId]);

  if (result.rows.length === 0) {
    return { success: false, reason: 'Payroll run not found or not ready for locking' };
  }

  await logPayrollAction(payrollRunId, 'lock', adminId ? { id: adminId } : null, {
    companyId: result.rows[0].company_id,
    newValues: { status: 'locked' }
  });

  return { success: true, payroll: result.rows[0] };
}

/**
 * Get companies that need payroll generation for this month
 */
async function getCompaniesNeedingPayroll(month, year) {
  const result = await pool.query(`
    SELECT c.id, c.name, c.code, ac.*
    FROM companies c
    LEFT JOIN automation_configs ac ON c.id = ac.company_id
    WHERE c.is_active = TRUE
      AND (ac.payroll_auto_generate = TRUE OR ac.id IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM payroll_runs pr
        WHERE pr.company_id = c.id
          AND pr.month = $1
          AND pr.year = $2
          AND pr.department_id IS NULL
      )
  `, [month, year]);

  return result.rows;
}

/**
 * Run scheduled payroll generation for all companies
 * Called by cron job or scheduler
 */
async function runScheduledPayrollGeneration() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const companies = await getCompaniesNeedingPayroll(month, year);
  const results = [];

  for (const company of companies) {
    try {
      const result = await autoGeneratePayroll(company.id, null, month, year);
      results.push({
        companyId: company.id,
        companyName: company.name,
        ...result
      });

      // If auto-approve is enabled, try to auto-approve
      if (result.success && company.payroll_auto_approve) {
        const approveResult = await autoApprovePayroll(result.payrollRunId);
        results[results.length - 1].autoApprove = approveResult;
      }
    } catch (error) {
      results.push({
        companyId: company.id,
        companyName: company.name,
        success: false,
        error: error.message
      });
    }
  }

  return {
    month,
    year,
    companiesProcessed: companies.length,
    results
  };
}

module.exports = {
  getAutomationConfig,
  calculatePayrollVariance,
  autoGeneratePayroll,
  canAutoApprove,
  autoApprovePayroll,
  markPayrollEdited,
  manualApprovePayroll,
  lockPayroll,
  getCompaniesNeedingPayroll,
  runScheduledPayrollGeneration
};
