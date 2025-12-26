/**
 * Scheduler Utility
 * Manages scheduled automation tasks
 *
 * This can be used with:
 * - node-cron for in-process scheduling
 * - External cron jobs calling API endpoints
 * - Render.com cron jobs
 */

const pool = require('../db');
const { runScheduledPayrollGeneration, lockPayroll } = require('./payrollAutomation');
const { generateProbationReminders } = require('./probationReminder');

/**
 * Record a scheduled task execution
 */
async function recordTaskExecution(taskType, companyId, result) {
  try {
    await pool.query(`
      UPDATE scheduled_tasks SET
        last_run_at = NOW(),
        last_result = $3,
        error_count = CASE WHEN $4 THEN 0 ELSE error_count + 1 END,
        updated_at = NOW()
      WHERE task_type = $1 AND (company_id = $2 OR ($2 IS NULL AND company_id IS NULL))
    `, [taskType, companyId, JSON.stringify(result), result.success !== false]);
  } catch (error) {
    console.error('Error recording task execution:', error);
  }
}

/**
 * Run payroll generation for the current month
 * Intended to run on 1st of each month
 */
async function runMonthlyPayrollGeneration() {
  console.log('[Scheduler] Running monthly payroll generation...');

  try {
    const result = await runScheduledPayrollGeneration();

    await recordTaskExecution('payroll_generate', null, result);

    console.log(`[Scheduler] Payroll generation complete. Processed ${result.companiesProcessed} companies.`);
    return result;
  } catch (error) {
    console.error('[Scheduler] Payroll generation failed:', error);
    await recordTaskExecution('payroll_generate', null, { success: false, error: error.message });
    throw error;
  }
}

/**
 * Run auto-lock for approved payrolls after lock period
 * Intended to run daily
 */
async function runAutoLockPayrolls() {
  console.log('[Scheduler] Running payroll auto-lock...');

  try {
    // Get approved payrolls past their lock period
    const result = await pool.query(`
      SELECT pr.id, pr.company_id, ac.payroll_lock_after_days
      FROM payroll_runs pr
      JOIN automation_configs ac ON pr.company_id = ac.company_id
      WHERE pr.status IN ('approved', 'auto_approved')
        AND pr.approved_at IS NOT NULL
        AND pr.approved_at + (ac.payroll_lock_after_days || ' days')::interval <= NOW()
    `);

    const locked = [];
    for (const run of result.rows) {
      const lockResult = await lockPayroll(run.id, null);
      if (lockResult.success) {
        locked.push(run.id);
      }
    }

    console.log(`[Scheduler] Auto-locked ${locked.length} payroll runs.`);
    return { success: true, locked };
  } catch (error) {
    console.error('[Scheduler] Payroll auto-lock failed:', error);
    throw error;
  }
}

/**
 * Run probation reminders
 * Intended to run daily
 */
async function runProbationReminders() {
  console.log('[Scheduler] Running probation reminders...');

  try {
    const result = await generateProbationReminders();

    await recordTaskExecution('probation_reminder', null, result);

    console.log(`[Scheduler] Probation reminders complete. ${result.notifications.length} notifications generated.`);
    return result;
  } catch (error) {
    console.error('[Scheduler] Probation reminders failed:', error);
    await recordTaskExecution('probation_reminder', null, { success: false, error: error.message });
    throw error;
  }
}

/**
 * Run all daily tasks
 */
async function runDailyTasks() {
  console.log('[Scheduler] Running daily tasks...');

  const results = {
    timestamp: new Date().toISOString(),
    tasks: {}
  };

  try {
    results.tasks.autoLock = await runAutoLockPayrolls();
  } catch (error) {
    results.tasks.autoLock = { error: error.message };
  }

  try {
    results.tasks.probationReminders = await runProbationReminders();
  } catch (error) {
    results.tasks.probationReminders = { error: error.message };
  }

  return results;
}

/**
 * Initialize scheduled tasks for a new company
 */
async function initializeCompanyScheduledTasks(companyId) {
  const tasks = [
    {
      task_type: 'payroll_generate',
      task_name: 'Monthly Payroll Generation',
      cron_expression: '0 0 1 * *' // 1st of every month at midnight
    },
    {
      task_type: 'probation_reminder',
      task_name: 'Probation Review Reminders',
      cron_expression: '0 9 * * 1' // Every Monday at 9am
    }
  ];

  for (const task of tasks) {
    await pool.query(`
      INSERT INTO scheduled_tasks (company_id, task_type, task_name, cron_expression, status)
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT DO NOTHING
    `, [companyId, task.task_type, task.task_name, task.cron_expression]);
  }
}

/**
 * Get pending scheduled tasks
 */
async function getPendingTasks() {
  const result = await pool.query(`
    SELECT st.*, c.name as company_name
    FROM scheduled_tasks st
    LEFT JOIN companies c ON st.company_id = c.id
    WHERE st.status = 'active'
      AND (st.next_run_at IS NULL OR st.next_run_at <= NOW())
    ORDER BY st.next_run_at ASC NULLS FIRST
  `);

  return result.rows;
}

/**
 * Get task execution history
 */
async function getTaskHistory(limit = 50) {
  // For now, return from scheduled_tasks table
  // In future, could have separate execution_logs table
  const result = await pool.query(`
    SELECT st.*, c.name as company_name
    FROM scheduled_tasks st
    LEFT JOIN companies c ON st.company_id = c.id
    WHERE st.last_run_at IS NOT NULL
    ORDER BY st.last_run_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

module.exports = {
  recordTaskExecution,
  runMonthlyPayrollGeneration,
  runAutoLockPayrolls,
  runProbationReminders,
  runDailyTasks,
  initializeCompanyScheduledTasks,
  getPendingTasks,
  getTaskHistory
};
