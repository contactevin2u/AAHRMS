/**
 * Public Holiday Notifier Job
 *
 * Sends notifications to employees about upcoming public holidays.
 * - Mimix (outlet-based): No notifications (they follow shift schedules)
 * - Other companies: Notify if department is closed on that day
 *
 * Runs 3 days before the holiday.
 */

const pool = require('../db');

// Mimix company ID - excluded from public holiday notifications
const MIMIX_COMPANY_ID = 3;

/**
 * Send public holiday notifications to employees in departments that are closed
 * @param {number} daysAhead - How many days ahead to check for holidays (default: 3)
 */
async function sendPublicHolidayNotifications(daysAhead = 3) {
  const results = {
    holidaysProcessed: 0,
    notificationsSent: 0,
    outletsWorking: 0, // Outlets/departments that have schedules (working)
    outletsClosed: 0,  // Outlets/departments that are closed
    errors: []
  };

  try {
    // Get public holidays in the next X days
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    console.log(`[PublicHolidayNotifier] Checking holidays for ${targetDateStr}`);

    // Get all public holidays for the target date (excluding Mimix - they follow shift schedules)
    const holidaysResult = await pool.query(`
      SELECT ph.id, ph.company_id, ph.name, ph.date, c.name as company_name, c.grouping_type
      FROM public_holidays ph
      JOIN companies c ON ph.company_id = c.id
      WHERE ph.date = $1
        AND ph.company_id != $2
    `, [targetDateStr, MIMIX_COMPANY_ID]);

    if (holidaysResult.rows.length === 0) {
      console.log(`[PublicHolidayNotifier] No public holidays found for ${targetDateStr}`);
      return results;
    }

    for (const holiday of holidaysResult.rows) {
      results.holidaysProcessed++;
      console.log(`[PublicHolidayNotifier] Processing holiday: ${holiday.name} for ${holiday.company_name}`);

      // Format the date nicely
      const holidayDate = new Date(holiday.date);
      const formattedDate = holidayDate.toLocaleDateString('en-MY', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      // Skip outlet-based companies (they follow shift schedules, not PH notifications)
      if (holiday.grouping_type === 'outlet') {
        console.log(`[PublicHolidayNotifier] Skipping outlet-based company: ${holiday.company_name}`);
        continue;
      }

      // Department-based company (e.g., AA Alive)
      // Check each department to see if it has schedules on this day
      const deptsResult = await pool.query(`
        SELECT id, name FROM departments WHERE company_id = $1
      `, [holiday.company_id]);

      for (const dept of deptsResult.rows) {
        // Check if this department has ANY schedules on the holiday
        const deptSchedules = await pool.query(`
          SELECT COUNT(*) as count FROM schedules s
          JOIN employees e ON s.employee_id = e.id
          WHERE e.department_id = $1
            AND s.schedule_date = $2
            AND s.status IN ('scheduled', 'completed')
        `, [dept.id, holiday.date]);

        const hasSchedules = parseInt(deptSchedules.rows[0].count) > 0;

        if (hasSchedules) {
          // Department is working - don't notify employees in this department
          results.outletsWorking++;
          console.log(`[PublicHolidayNotifier] Department ${dept.name} is working on ${holiday.name} - skipping notifications`);
          continue;
        }

        // Department is closed - notify all employees in this department
        results.outletsClosed++;
        console.log(`[PublicHolidayNotifier] Department ${dept.name} is closed on ${holiday.name} - sending notifications`);

        const employeesResult = await pool.query(`
          SELECT id, name FROM employees
          WHERE department_id = $1 AND status = 'active'
        `, [dept.id]);

        for (const employee of employeesResult.rows) {
          await sendHolidayNotification(employee.id, holiday, formattedDate, results);
        }
      }

      // Also handle employees without department (if any)
      const noDeptEmployees = await pool.query(`
        SELECT id, name FROM employees
        WHERE company_id = $1 AND department_id IS NULL AND status = 'active'
      `, [holiday.company_id]);

      for (const employee of noDeptEmployees.rows) {
        // Check if employee has individual schedule
        const empSchedule = await pool.query(`
          SELECT COUNT(*) as count FROM schedules
          WHERE employee_id = $1 AND schedule_date = $2 AND status IN ('scheduled', 'completed')
        `, [employee.id, holiday.date]);

        if (parseInt(empSchedule.rows[0].count) === 0) {
          await sendHolidayNotification(employee.id, holiday, formattedDate, results);
        }
      }
    }

    console.log(`[PublicHolidayNotifier] Completed: ${results.notificationsSent} notifications sent`);
    console.log(`[PublicHolidayNotifier] Outlets/Departments working: ${results.outletsWorking}, closed: ${results.outletsClosed}`);
    return results;

  } catch (error) {
    console.error('[PublicHolidayNotifier] Error:', error);
    results.errors.push(error.message);
    return results;
  }
}

/**
 * Helper function to send notification to an employee
 */
async function sendHolidayNotification(employeeId, holiday, formattedDate, results) {
  try {
    // Check if notification already sent for this holiday
    const existingNotif = await pool.query(`
      SELECT id FROM notifications
      WHERE employee_id = $1
        AND reference_type = 'public_holiday'
        AND reference_id = $2
    `, [employeeId, holiday.id]);

    if (existingNotif.rows.length > 0) {
      // Notification already sent
      return;
    }

    // Send notification
    await pool.query(`
      INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      employeeId,
      'public_holiday',
      `Public Holiday: ${holiday.name}`,
      `No work on ${formattedDate}. Enjoy your holiday!`,
      'public_holiday',
      holiday.id
    ]);

    results.notificationsSent++;
  } catch (error) {
    console.error(`[PublicHolidayNotifier] Error sending notification to employee ${employeeId}:`, error);
  }
}

/**
 * Check and notify for holidays in the next few days
 * Called by the scheduler daily
 */
async function runPublicHolidayNotifier() {
  console.log('[PublicHolidayNotifier] Starting daily run at', new Date().toISOString());

  // Check holidays for tomorrow (1 day ahead)
  const results = await sendPublicHolidayNotifications(1);

  return results;
}

module.exports = {
  runPublicHolidayNotifier,
  sendPublicHolidayNotifications
};
