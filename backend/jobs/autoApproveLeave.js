/**
 * Auto-Approve Leave Utilities
 *
 * For AA Alive (company_id = 1) only:
 * - Annual Leave (AL) is automatically approved immediately upon application
 * - Other leave types require manual approval
 *
 * This file contains the revert function for auto-approved leaves.
 */

const pool = require('../db');

// AA Alive company ID
const AA_ALIVE_COMPANY_ID = 1;

/**
 * Revert an auto-approved leave request
 * Called when employee or admin wants to undo the auto-approval
 */
async function revertAutoApprovedLeave(leaveId, employeeId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get leave request details
    const leaveResult = await client.query(`
      SELECT lr.*, lt.is_paid, lt.code as leave_type_code, e.company_id
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e ON lr.employee_id = e.id
      WHERE lr.id = $1
    `, [leaveId]);

    if (leaveResult.rows.length === 0) {
      throw new Error('Leave request not found');
    }

    const leave = leaveResult.rows[0];

    // Verify it's an AA Alive company
    if (leave.company_id !== AA_ALIVE_COMPANY_ID) {
      throw new Error('Revert is only available for AA Alive leaves');
    }

    // Verify it was auto-approved
    if (!leave.auto_approved) {
      throw new Error('This leave was not auto-approved');
    }

    // Verify it's still approved (not already cancelled)
    if (leave.status !== 'approved') {
      throw new Error('Leave is no longer in approved status');
    }

    // If employeeId provided, verify ownership
    if (employeeId && leave.employee_id !== employeeId) {
      throw new Error('You can only revert your own leave requests');
    }

    // Restore leave balance for paid leaves
    if (leave.is_paid) {
      const year = new Date(leave.start_date).getFullYear();
      await client.query(`
        UPDATE leave_balances
        SET used_days = GREATEST(0, used_days - $1), updated_at = NOW()
        WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4
      `, [leave.total_days, leave.employee_id, leave.leave_type_id, year]);
    }

    // Update leave request back to pending
    await client.query(`
      UPDATE leave_requests
      SET status = 'pending',
          approved_at = NULL,
          auto_approved = FALSE,
          auto_approved_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [leaveId]);

    // Create notification
    await client.query(`
      INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
      VALUES ($1, 'leave', 'Leave Reverted', 'Your auto-approved leave has been reverted to pending status for manual review.', 'leave_request', $2)
    `, [leave.employee_id, leaveId]);

    await client.query('COMMIT');
    console.log(`[AutoApproveLeave] Reverted auto-approved leave ${leaveId}`);

    return { success: true, message: 'Leave reverted to pending status' };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  revertAutoApprovedLeave,
  AA_ALIVE_COMPANY_ID
};
