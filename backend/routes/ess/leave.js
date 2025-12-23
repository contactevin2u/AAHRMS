/**
 * ESS Leave Routes
 * Handles employee leave balance, history, and applications
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

// Get leave balances
router.get('/balance', authenticateEmployee, asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();

  const result = await pool.query(
    `SELECT lb.*, lt.code, lt.name as leave_type_name, lt.is_paid
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     WHERE lb.employee_id = $1 AND lb.year = $2
     ORDER BY lt.code`,
    [req.employee.id, currentYear]
  );

  res.json(result.rows);
}));

// Get leave history
router.get('/history', authenticateEmployee, asyncHandler(async (req, res) => {
  const { year, status } = req.query;

  let query = `
    SELECT lr.*, lt.code, lt.name as leave_type_name
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.employee_id = $1
  `;
  const params = [req.employee.id];
  let paramCount = 1;

  if (year) {
    paramCount++;
    query += ` AND EXTRACT(YEAR FROM lr.start_date) = $${paramCount}`;
    params.push(year);
  }

  if (status) {
    paramCount++;
    query += ` AND lr.status = $${paramCount}`;
    params.push(status);
  }

  query += ' ORDER BY lr.created_at DESC';

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Apply for leave
router.post('/apply', authenticateEmployee, asyncHandler(async (req, res) => {
  const { leave_type_id, start_date, end_date, reason } = req.body;

  if (!leave_type_id || !start_date || !end_date) {
    throw new ValidationError('Leave type, start date, and end date are required');
  }

  // Calculate total days (simple calculation, excludes weekends)
  const start = new Date(start_date);
  const end = new Date(end_date);

  if (start > end) {
    throw new ValidationError('End date must be after start date');
  }

  let totalDays = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) { // Not Sunday or Saturday
      totalDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  // Check leave balance
  const currentYear = new Date().getFullYear();
  const balanceResult = await pool.query(
    `SELECT lb.*, lt.is_paid
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     WHERE lb.employee_id = $1 AND lb.leave_type_id = $2 AND lb.year = $3`,
    [req.employee.id, leave_type_id, currentYear]
  );

  if (balanceResult.rows.length > 0) {
    const balance = balanceResult.rows[0];
    const available = parseFloat(balance.entitled_days) + parseFloat(balance.carried_forward) - parseFloat(balance.used_days);

    if (balance.is_paid && totalDays > available) {
      throw new ValidationError(`Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`);
    }
  }

  // Create leave request
  const result = await pool.query(
    `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [req.employee.id, leave_type_id, start_date, end_date, totalDays, reason]
  );

  console.log(`New leave request from employee ${req.employee.id}: ${totalDays} days`);

  res.status(201).json(result.rows[0]);
}));

// Get leave types
router.get('/types', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM leave_types ORDER BY code'
  );
  res.json(result.rows);
}));

module.exports = router;
