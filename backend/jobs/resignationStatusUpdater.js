/**
 * Resignation Status Updater
 *
 * Daily cron job that:
 * 1. Finds employees with employment_status='notice' AND last_working_day < TODAY
 * 2. Updates them to employment_status='resigned_pending'
 * 3. Auto-rejects pending leave requests with dates after last_working_day
 */

const pool = require('../db');

async function runResignationStatusUpdater() {
  const client = await pool.connect();
  const results = {
    transitioned: 0,
    leavesRejected: 0,
    errors: []
  };

  try {
    console.log('[ResignationUpdater] Starting daily resignation status check...');

    await client.query('BEGIN');

    // Find employees who are past their last working day but still on 'notice'
    const noticeEmployees = await client.query(`
      SELECT e.id, e.name, e.employee_id, e.last_working_day, r.id as resignation_id
      FROM employees e
      JOIN resignations r ON r.employee_id = e.id AND r.status = 'clearing'
      WHERE e.employment_status = 'notice'
        AND e.last_working_day < CURRENT_DATE
    `);

    console.log(`[ResignationUpdater] Found ${noticeEmployees.rows.length} employees past last working day`);

    for (const emp of noticeEmployees.rows) {
      try {
        // Transition employee to resigned_pending
        await client.query(`
          UPDATE employees SET
            employment_status = 'resigned_pending',
            updated_at = NOW()
          WHERE id = $1
        `, [emp.id]);

        // Auto-reject pending leave requests after last working day
        const rejectedLeaves = await client.query(`
          UPDATE leave_requests SET
            status = 'rejected',
            rejection_reason = 'Auto-rejected: past last working day due to resignation',
            updated_at = NOW()
          WHERE employee_id = $1
            AND status = 'pending'
            AND start_date > $2
          RETURNING id
        `, [emp.id, emp.last_working_day]);

        results.transitioned++;
        results.leavesRejected += rejectedLeaves.rows.length;

        console.log(`[ResignationUpdater] Transitioned ${emp.name} (${emp.employee_id}) to resigned_pending, rejected ${rejectedLeaves.rows.length} leaves`);
      } catch (empError) {
        console.error(`[ResignationUpdater] Error processing employee ${emp.id}:`, empError.message);
        results.errors.push({ employee_id: emp.id, error: empError.message });
      }
    }

    await client.query('COMMIT');

    console.log(`[ResignationUpdater] Completed. Transitioned: ${results.transitioned}, Leaves rejected: ${results.leavesRejected}`);
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ResignationUpdater] Job failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { runResignationStatusUpdater };
