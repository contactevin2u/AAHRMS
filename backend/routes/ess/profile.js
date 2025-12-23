/**
 * ESS Profile Routes
 * Handles employee profile viewing
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

// Get current employee profile
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT e.*, d.name as department_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE e.id = $1`,
    [req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  const employee = result.rows[0];

  // Remove sensitive fields
  delete employee.password_hash;
  delete employee.password_reset_token;
  delete employee.password_reset_expires;

  res.json(employee);
}));

module.exports = router;
