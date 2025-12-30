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

// Update employee profile (limited fields only)
// Employees can only update: name, email, phone, ic_number, date_of_birth, address
router.put('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { name, email, phone, ic_number, date_of_birth, address } = req.body;

  // Validate required field
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  // Only allow these specific fields to be updated
  const result = await pool.query(
    `UPDATE employees
     SET name = $1,
         email = $2,
         phone = $3,
         ic_number = $4,
         date_of_birth = $5,
         address = $6,
         updated_at = NOW()
     WHERE id = $7
     RETURNING id, employee_id, name, email, phone, ic_number, date_of_birth, address`,
    [
      name.trim(),
      email || null,
      phone || null,
      ic_number || null,
      date_of_birth || null,
      address || null,
      employeeId
    ]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  res.json({
    message: 'Profile updated successfully',
    employee: result.rows[0]
  });
}));

module.exports = router;
