/**
 * Public Holiday Notifier Job
 *
 * Sends notifications to employees who don't have work scheduled on public holidays.
 * Employees with a schedule on that day (need to work) will NOT receive the notification.
 */

const pool = require('../db');

/**
 * Send public holiday notifications to employees without schedules
 * @param {number} daysAhead - How many days ahead to check for holidays (default: 1)
 */
async function sendPublicHolidayNotifications(daysAhead = 1) {
  const results = {
    holidaysProcessed: 0,
    notificationsSent: 0,
    employeesSkipped: 0, // Employees who have schedules (need to work)
    errors: []
  };

  try {
    // Get public holidays in the next X days
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    console.log(`[PublicHolidayNotifier] Checking holidays for ${targetDateStr}`);

    // Get all public holidays for the target date across all companies
    const holidaysResult = await pool.query(`
      SELECT ph.id, ph.company_id, ph.name, ph.date, c.name as company_name
      FROM public_holidays ph
      JOIN companies c ON ph.company_id = c.id
      WHERE ph.date = $1
    `, [targetDateStr]);

    if (holidaysResult.rows.length === 0) {
      console.log(`[PublicHolidayNotifier] No public holidays found for ${targetDateStr}`);
      return results;
    }

    for (const holiday of holidaysResult.rows) {
      results.holidaysProcessed++;
      console.log(`[PublicHolidayNotifier] Processing holiday: ${holiday.name} for ${holiday.company_name}`);

      // Get all active employees for this company
      const employeesResult = await pool.query(`
        SELECT e.id, e.name, e.outlet_id
        FROM employees e
        WHERE e.company_id = $1
          AND e.status = 'active'
      `, [holiday.company_id]);

      for (const employee of employeesResult.rows) {
        // Check if employee has a schedule on this date (means they need to work)
        const scheduleResult = await pool.query(`
          SELECT id FROM schedules
          WHERE employee_id = $1
            AND schedule_date = $2
            AND status IN ('scheduled', 'completed')
        `, [employee.id, holiday.date]);

        if (scheduleResult.rows.length > 0) {
          // Employee has schedule - they need to work, skip notification
          results.employeesSkipped++;
          continue;
        }

        // Check if notification already sent for this holiday
        const existingNotif = await pool.query(`
          SELECT id FROM notifications
          WHERE employee_id = $1
            AND reference_type = 'public_holiday'
            AND reference_id = $2
        `, [employee.id, holiday.id]);

        if (existingNotif.rows.length > 0) {
          // Notification already sent
          continue;
        }

        // Format the date nicely
        const holidayDate = new Date(holiday.date);
        const formattedDate = holidayDate.toLocaleDateString('en-MY', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        // Send notification
        await pool.query(`
          INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          employee.id,
          'public_holiday',
          `Public Holiday: ${holiday.name}`,
          `No work on ${formattedDate}. Enjoy your holiday!`,
          'public_holiday',
          holiday.id
        ]);

        results.notificationsSent++;
      }
    }

    console.log(`[PublicHolidayNotifier] Completed: ${results.notificationsSent} notifications sent, ${results.employeesSkipped} employees skipped (working)`);
    return results;

  } catch (error) {
    console.error('[PublicHolidayNotifier] Error:', error);
    results.errors.push(error.message);
    return results;
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
