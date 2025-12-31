/**
 * Scheduled Jobs Index
 *
 * Exports all scheduled jobs and scheduler utilities.
 */

const { initScheduler, triggerAutoClockOut } = require('./scheduler');
const {
  runAutoClockOut,
  getRecordsNeedingReview,
  markAsReviewed,
  processAutoClockOut,
  STANDARD_WORK_MINUTES
} = require('./autoClockOut');

module.exports = {
  // Scheduler
  initScheduler,
  triggerAutoClockOut,

  // Auto Clock-Out
  runAutoClockOut,
  getRecordsNeedingReview,
  markAsReviewed,
  processAutoClockOut,
  STANDARD_WORK_MINUTES
};
