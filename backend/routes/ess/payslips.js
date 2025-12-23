/**
 * ESS Payslips Routes
 * Handles employee payslip viewing
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

// Get employee's payslips
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const { year } = req.query;

  let query = `
    SELECT pi.*, pr.month, pr.year, pr.status as run_status
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pi.employee_id = $1
  `;
  const params = [req.employee.id];

  if (year) {
    query += ' AND pr.year = $2';
    params.push(year);
  }

  query += ' ORDER BY pr.year DESC, pr.month DESC';

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Get single payslip details
router.get('/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT pi.*, pr.month, pr.year, pr.status as run_status
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     WHERE pi.id = $1 AND pi.employee_id = $2`,
    [id, req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Payslip');
  }

  res.json(result.rows[0]);
}));

module.exports = router;
