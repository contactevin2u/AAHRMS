/**
 * Probation Reminder System
 * Tracks probation periods and sends reminders before they end
 */

const pool = require('../db');
const { logEmployeeAction } = require('./auditLog');

/**
 * Calculate probation end date from join date
 *
 * @param {Date|string} joinDate - Employee join date
 * @param {number} probationMonths - Number of months (default 3)
 * @returns {Date} Probation end date
 */
function calculateProbationEndDate(joinDate, probationMonths = 3) {
  const join = new Date(joinDate);
  const endDate = new Date(join);
  endDate.setMonth(endDate.getMonth() + probationMonths);
  return endDate;
}

/**
 * Initialize probation tracking for a new employee
 * Called when employee is created
 *
 * @param {number} employeeId - Employee ID
 * @param {number} companyId - Company ID
 * @param {Date|string} joinDate - Employee join date
 * @param {number} probationMonths - Probation period in months
 */
async function initializeProbation(employeeId, companyId, joinDate, probationMonths = 3) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const probationEndDate = calculateProbationEndDate(joinDate, probationMonths);

    // Get company's reminder settings
    const configResult = await client.query(
      'SELECT probation_reminder_days_before FROM automation_configs WHERE company_id = $1',
      [companyId]
    );
    const reminderDaysBefore = configResult.rows[0]?.probation_reminder_days_before || 14;

    const reviewDueDate = new Date(probationEndDate);
    reviewDueDate.setDate(reviewDueDate.getDate() - reminderDaysBefore);

    // Update employee record
    await client.query(`
      UPDATE employees SET
        probation_months = $2,
        probation_end_date = $3,
        probation_status = 'ongoing',
        updated_at = NOW()
      WHERE id = $1
    `, [employeeId, probationMonths, probationEndDate]);

    // Create probation review record
    await client.query(`
      INSERT INTO probation_reviews (
        employee_id, company_id, probation_start_date, probation_end_date,
        review_due_date, status
      ) VALUES ($1, $2, $3, $4, $5, 'pending')
      ON CONFLICT DO NOTHING
    `, [employeeId, companyId, joinDate, probationEndDate, reviewDueDate]);

    await client.query('COMMIT');

    return {
      employeeId,
      probationEndDate,
      reviewDueDate,
      probationMonths
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get employees whose probation is ending soon
 *
 * @param {number} companyId - Company ID (optional, null for all companies)
 * @param {number} daysAhead - Days to look ahead (default 14)
 * @returns {Array} Employees with ending probation
 */
async function getUpcomingProbationEndings(companyId = null, daysAhead = 14) {
  let query = `
    SELECT
      e.id,
      e.employee_id as emp_code,
      e.name,
      e.email,
      e.join_date,
      e.probation_end_date,
      e.probation_status,
      e.company_id,
      c.name as company_name,
      d.name as department_name,
      pr.status as review_status,
      pr.reminder_sent_at,
      pr.reminder_count
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN probation_reviews pr ON pr.employee_id = e.id AND pr.status IN ('pending', 'reminded')
    WHERE e.status = 'active'
      AND e.probation_status = 'ongoing'
      AND e.probation_end_date IS NOT NULL
      AND e.probation_end_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
      AND e.probation_end_date >= CURRENT_DATE
  `;

  const params = [];

  if (companyId) {
    query += ' AND e.company_id = $1';
    params.push(companyId);
  }

  query += ' ORDER BY e.probation_end_date ASC';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get overdue probation reviews (past end date but not reviewed)
 */
async function getOverdueProbationReviews(companyId = null) {
  let query = `
    SELECT
      e.id,
      e.employee_id as emp_code,
      e.name,
      e.email,
      e.join_date,
      e.probation_end_date,
      e.company_id,
      c.name as company_name,
      d.name as department_name,
      CURRENT_DATE - e.probation_end_date as days_overdue
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.status = 'active'
      AND e.probation_status = 'ongoing'
      AND e.probation_end_date IS NOT NULL
      AND e.probation_end_date < CURRENT_DATE
  `;

  const params = [];

  if (companyId) {
    query += ' AND e.company_id = $1';
    params.push(companyId);
  }

  query += ' ORDER BY days_overdue DESC';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Mark reminder as sent for an employee's probation
 */
async function markReminderSent(employeeId) {
  const result = await pool.query(`
    UPDATE probation_reviews SET
      status = 'reminded',
      reminder_sent_at = NOW(),
      reminder_count = reminder_count + 1,
      updated_at = NOW()
    WHERE employee_id = $1 AND status IN ('pending', 'reminded')
    RETURNING *
  `, [employeeId]);

  return result.rows[0];
}

/**
 * Complete probation review
 *
 * @param {number} employeeId - Employee ID
 * @param {string} outcome - 'confirmed', 'extended', 'terminated'
 * @param {number} adminId - Admin who reviewed
 * @param {Object} options - Additional options (notes, newEndDate for extension)
 */
async function completeProbationReview(employeeId, outcome, adminId, options = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { notes, newEndDate } = options;

    // Get current employee data
    const empResult = await client.query(
      'SELECT * FROM employees WHERE id = $1',
      [employeeId]
    );

    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'Employee not found' };
    }

    const employee = empResult.rows[0];

    // Update employee status based on outcome
    let newStatus;
    let confirmedDate = null;
    let probationEndDate = employee.probation_end_date;

    switch (outcome) {
      case 'confirmed':
        newStatus = 'confirmed';
        confirmedDate = new Date();
        break;

      case 'extended':
        if (!newEndDate) {
          await client.query('ROLLBACK');
          return { success: false, reason: 'New end date required for extension' };
        }
        newStatus = 'extended';
        probationEndDate = new Date(newEndDate);
        break;

      case 'terminated':
        newStatus = 'terminated';
        break;

      default:
        await client.query('ROLLBACK');
        return { success: false, reason: 'Invalid outcome' };
    }

    // Update employee
    await client.query(`
      UPDATE employees SET
        probation_status = $2,
        probation_end_date = $3,
        confirmed_date = $4,
        status = CASE WHEN $2 = 'terminated' THEN 'resigned' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
    `, [employeeId, newStatus, probationEndDate, confirmedDate]);

    // Update probation review record
    await client.query(`
      UPDATE probation_reviews SET
        status = 'completed',
        outcome = $2,
        new_end_date = $3,
        review_notes = $4,
        reviewed_by = $5,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE employee_id = $1 AND status IN ('pending', 'reminded')
    `, [employeeId, outcome, outcome === 'extended' ? newEndDate : null, notes, adminId]);

    // If extended, create new probation review record
    if (outcome === 'extended') {
      const configResult = await client.query(
        'SELECT probation_reminder_days_before FROM automation_configs WHERE company_id = $1',
        [employee.company_id]
      );
      const reminderDaysBefore = configResult.rows[0]?.probation_reminder_days_before || 14;

      const reviewDueDate = new Date(newEndDate);
      reviewDueDate.setDate(reviewDueDate.getDate() - reminderDaysBefore);

      await client.query(`
        INSERT INTO probation_reviews (
          employee_id, company_id, probation_start_date, probation_end_date,
          review_due_date, status
        ) VALUES ($1, $2, $3, $4, $5, 'pending')
      `, [employeeId, employee.company_id, employee.probation_end_date, newEndDate, reviewDueDate]);
    }

    // Log the action
    await logEmployeeAction(employeeId, 'probation_review', { id: adminId }, {
      companyId: employee.company_id,
      oldValues: { probation_status: employee.probation_status },
      newValues: { probation_status: newStatus, outcome },
      reason: notes
    });

    await client.query('COMMIT');

    return {
      success: true,
      outcome,
      newStatus,
      probationEndDate: outcome === 'extended' ? newEndDate : null
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate probation reminder notifications
 * Called by scheduler
 */
async function generateProbationReminders() {
  const upcoming = await getUpcomingProbationEndings(null, 14);
  const overdue = await getOverdueProbationReviews();

  const notifications = [];

  // Process upcoming probation endings
  for (const emp of upcoming) {
    if (!emp.reminder_sent_at) {
      const daysUntilEnd = Math.ceil(
        (new Date(emp.probation_end_date) - new Date()) / (1000 * 60 * 60 * 24)
      );

      notifications.push({
        type: 'probation_ending',
        employeeId: emp.id,
        employeeName: emp.name,
        companyId: emp.company_id,
        companyName: emp.company_name,
        probationEndDate: emp.probation_end_date,
        daysRemaining: daysUntilEnd,
        message: `${emp.name}'s probation ends in ${daysUntilEnd} days (${new Date(emp.probation_end_date).toLocaleDateString()}).`
      });

      // Mark reminder as sent
      await markReminderSent(emp.id);
    }
  }

  // Process overdue reviews
  for (const emp of overdue) {
    notifications.push({
      type: 'probation_overdue',
      employeeId: emp.id,
      employeeName: emp.name,
      companyId: emp.company_id,
      companyName: emp.company_name,
      probationEndDate: emp.probation_end_date,
      daysOverdue: emp.days_overdue,
      message: `${emp.name}'s probation review is ${emp.days_overdue} days overdue!`
    });
  }

  return {
    upcoming: upcoming.length,
    overdue: overdue.length,
    notifications
  };
}

/**
 * Get probation summary for a company
 */
async function getProbationSummary(companyId) {
  const result = await pool.query(`
    SELECT
      probation_status,
      COUNT(*) as count
    FROM employees
    WHERE company_id = $1 AND status = 'active'
    GROUP BY probation_status
  `, [companyId]);

  const summary = {
    ongoing: 0,
    confirmed: 0,
    extended: 0
  };

  for (const row of result.rows) {
    if (row.probation_status) {
      summary[row.probation_status] = parseInt(row.count);
    }
  }

  // Get upcoming probation endings
  const upcoming = await getUpcomingProbationEndings(companyId, 30);
  summary.endingSoon = upcoming.length;

  // Get overdue
  const overdue = await getOverdueProbationReviews(companyId);
  summary.overdue = overdue.length;

  return summary;
}

module.exports = {
  calculateProbationEndDate,
  initializeProbation,
  getUpcomingProbationEndings,
  getOverdueProbationReviews,
  markReminderSent,
  completeProbationReview,
  generateProbationReminders,
  getProbationSummary
};
