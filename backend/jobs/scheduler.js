/**
 * Scheduled Jobs Scheduler
 *
 * Initializes and manages all cron jobs for the HRMS system.
 */

const cron = require('node-cron');
const { runAutoClockOut } = require('./autoClockOut');
const { runPublicHolidayNotifier } = require('./publicHolidayNotifier');
const { runDriverSync, syncDriverAttendance } = require('./driverSync');
const { runResignationStatusUpdater } = require('./resignationStatusUpdater');

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

  // Driver Attendance Sync Job - Runs at 3:30 AM and 10:00 AM daily
  // Syncs driver attendance from OrderOps to HRMS
  const driverSyncMorningJob = cron.schedule('30 3 * * *', async () => {
    console.log('[Scheduler] Running driver sync (3:30 AM) at', new Date().toISOString());
    try {
      const results = await runDriverSync();
      console.log('[Scheduler] Driver sync (3:30 AM) completed:', results);
    } catch (error) {
      console.error('[Scheduler] Driver sync (3:30 AM) failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kuala_Lumpur'
  });

  console.log('[Scheduler] Driver sync scheduled for 03:30 daily (MYT)');

  const driverSyncDayJob = cron.schedule('0 10 * * *', async () => {
    console.log('[Scheduler] Running driver sync (10:00 AM) at', new Date().toISOString());
    try {
      const results = await runDriverSync();
      console.log('[Scheduler] Driver sync (10:00 AM) completed:', results);
    } catch (error) {
      console.error('[Scheduler] Driver sync (10:00 AM) failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kuala_Lumpur'
  });

  console.log('[Scheduler] Driver sync scheduled for 10:00 daily (MYT)');

  // Resignation Status Updater - Runs at 00:30 AM daily (after auto clock-out)
  // Transitions employees past their last working day from 'notice' to 'resigned_pending'
  const resignationUpdaterJob = cron.schedule('30 0 * * *', async () => {
    console.log('[Scheduler] Running resignation status updater at', new Date().toISOString());
    try {
      const results = await runResignationStatusUpdater();
      console.log('[Scheduler] Resignation updater completed:', results);
    } catch (error) {
      console.error('[Scheduler] Resignation status updater failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kuala_Lumpur'
  });

  console.log('[Scheduler] Resignation status updater scheduled for 00:30 daily (MYT)');

  // Note: Auto-Approve Leave is now done immediately upon application (not via cron)
  // See: backend/routes/ess/leave.js - Annual Leave for AA Alive is auto-approved instantly

  // Return jobs for potential manual control
  return {
    autoClockOutJob,
    publicHolidayJob,
    driverSyncMorningJob,
    driverSyncDayJob,
    resignationUpdaterJob
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

/**
 * Run driver sync manually (for testing or admin trigger)
 * @param {string} date - Optional specific date to sync (YYYY-MM-DD)
 */
async function triggerDriverSync(date = null) {
  console.log('[Scheduler] Manually triggering driver sync for', date || 'yesterday+today');
  try {
    if (date) {
      const result = await syncDriverAttendance(date);
      return { success: true, ...result };
    } else {
      const results = await runDriverSync();
      return { success: true, ...results };
    }
  } catch (error) {
    console.error('[Scheduler] Manual driver sync failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run resignation status updater manually
 */
async function triggerResignationUpdater() {
  console.log('[Scheduler] Manually triggering resignation status updater');
  try {
    const results = await runResignationStatusUpdater();
    return { success: true, ...results };
  } catch (error) {
    console.error('[Scheduler] Manual resignation updater failed:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initScheduler,
  triggerAutoClockOut,
  triggerPublicHolidayNotifier,
  triggerDriverSync,
  triggerResignationUpdater
};
