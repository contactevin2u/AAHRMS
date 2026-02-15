/**
 * ESS Dashboard Routes
 * Handles employee dashboard summary data
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');

// Get dashboard summary data
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();

  // Get employee info
  const empResult = await pool.query(
    `SELECT e.name, e.employee_id, e.position, d.name as department_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE e.id = $1`,
    [req.employee.id]
  );

  // Get latest payslip
  const payslipResult = await pool.query(
    `SELECT pi.net_pay, pi.gross_salary, pr.month, pr.year
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     WHERE pi.employee_id = $1 AND pr.status = 'finalized'
     ORDER BY pr.year DESC, pr.month DESC
     LIMIT 1`,
    [req.employee.id]
  );

  // Get leave balances summary
  const leaveResult = await pool.query(
    `SELECT lt.code, lb.entitled_days, lb.used_days, lb.carried_forward
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     WHERE lb.employee_id = $1 AND lb.year = $2
     ORDER BY lt.code`,
    [req.employee.id, currentYear]
  );

  // Get pending items count
  const pendingLeaveResult = await pool.query(
    `SELECT COUNT(*) as count FROM leave_requests
     WHERE employee_id = $1 AND status = 'pending'`,
    [req.employee.id]
  );

  const pendingClaimsResult = await pool.query(
    `SELECT COUNT(*) as count FROM claims
     WHERE employee_id = $1 AND status = 'pending'`,
    [req.employee.id]
  );

  // Get unread notifications
  const unreadResult = await pool.query(
    'SELECT COUNT(*) as count FROM notifications WHERE employee_id = $1 AND is_read = FALSE',
    [req.employee.id]
  );

  // Get unread letters
  const unreadLettersResult = await pool.query(
    `SELECT COUNT(*) as count FROM hr_letters WHERE employee_id = $1 AND status = 'unread'`,
    [req.employee.id]
  );

  // Get resignation info if any
  // Show resignation status banner for notice/clearing/resigned employees
  const resignationResult = await pool.query(
    `SELECT id, notice_date, last_working_day, reason, status,
            clearance_completed, required_notice_days, actual_notice_days
     FROM resignations
     WHERE employee_id = $1 AND status IN ('pending', 'clearing', 'completed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.employee.id]
  );

  // Get employee employment_status for banner display
  const empStatusResult = await pool.query(
    'SELECT employment_status, last_working_day FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employmentStatus = empStatusResult.rows[0]?.employment_status;

  let resignationInfo = null;
  if (resignationResult.rows.length > 0) {
    const r = resignationResult.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDay = new Date(r.last_working_day);
    lastDay.setHours(0, 0, 0, 0);
    const diffTime = lastDay - today;
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    resignationInfo = {
      notice_date: r.notice_date,
      last_working_day: r.last_working_day,
      reason: r.reason,
      resignation_status: r.status,
      employment_status: employmentStatus,
      days_remaining: daysRemaining,
      clearance_completed: r.clearance_completed
    };
  }

  res.json({
    employee: empResult.rows[0] || null,
    latestPayslip: payslipResult.rows[0] || null,
    leaveBalances: leaveResult.rows,
    pendingLeaveRequests: parseInt(pendingLeaveResult.rows[0].count),
    pendingClaims: parseInt(pendingClaimsResult.rows[0].count),
    unreadNotifications: parseInt(unreadResult.rows[0].count),
    unreadLetters: parseInt(unreadLettersResult.rows[0].count),
    resignation: resignationInfo
  });
}));

module.exports = router;
