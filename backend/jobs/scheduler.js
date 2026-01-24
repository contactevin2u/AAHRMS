/**
 * Scheduled Jobs Scheduler
 *
 * Initializes and manages all cron jobs for the HRMS system.
 */

const cron = require('node-cron');
const { runAutoClockOut } = require('./autoClockOut');
const { runPublicHolidayNotifier } = require('./publicHolidayNotifier');

/**
 * Initialize all scheduled jobs
 */
function initScheduler() {
  console.log('[Scheduler] Initializing scheduled jobs...');

  // Auto Clock-Out Job - Runs at 12:05 AM daily (5 mins after midnight for buffer)
  // Cron expression: '5 0 * * *' = At 00:05 every day
  const autoClockOutJob = cron.schedule('5 0 * * *', async () => {
    console.log('[Scheduler] Running auto clock-out job at', new Date().toISOString());
    try {
      const results = await runAutoClockOut();
      console.log('[Scheduler] Auto clock-out completed. Processed', results.length, 'records');
    } catch (error) {
      console.error('[Scheduler] Auto clock-out job failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kuala_Lumpur' // Malaysia timezone
  });

  console.log('[Scheduler] Auto clock-out job scheduled for 00:05 daily (MYT)');

  // Public Holiday Notifier Job - Runs at 9:00 AM daily
  // Notifies employees 3 days before public holidays (excludes Mimix)
  const publicHolidayJob = cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Running public holiday notifier at', new Date().toISOString());
    try {
      const results = await runPublicHolidayNotifier();
      console.log('[Scheduler] Public holiday notifier completed:', results);
    } catch (error) {
      console.error('[Scheduler] Public holiday notifier failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kuala_Lumpur'
  });

  console.log('[Scheduler] Public holiday notifier scheduled for 09:00 daily (MYT)');

  // Return jobs for potential manual control
  return {
    autoClockOutJob,
    publicHolidayJob
  };
}

/**
 * Run auto clock-out job manually (for testing or admin trigger)
 */
async function triggerAutoClockOut() {
  console.log('[Scheduler] Manually triggering auto clock-out job');
  try {
    const results = await runAutoClockOut();
    return {
      success: true,
      processed: results.length,
      results
    };
  } catch (error) {
    console.error('[Scheduler] Manual auto clock-out failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Run public holiday notifier manually (for testing or admin trigger)
 * @param {number} daysAhead - Days ahead to check (default: 1 = tomorrow)
 */
async function triggerPublicHolidayNotifier(daysAhead = 1) {
  console.log('[Scheduler] Manually triggering public holiday notifier for', daysAhead, 'day(s) ahead');
  try {
    const { sendPublicHolidayNotifications } = require('./publicHolidayNotifier');
    const results = await sendPublicHolidayNotifications(daysAhead);
    return {
      success: true,
      ...results
    };
  } catch (error) {
    console.error('[Scheduler] Manual public holiday notifier failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  initScheduler,
  triggerAutoClockOut,
  triggerPublicHolidayNotifier
};
