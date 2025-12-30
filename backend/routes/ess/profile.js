/**
 * ESS Profile Routes
 * Handles employee profile viewing and self-onboarding
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

// Required fields for profile to be marked complete
const PROFILE_REQUIRED_FIELDS = [
  'name', 'ic_number', 'date_of_birth', 'phone', 'address',
  'bank_name', 'bank_account_no',
  'epf_number', 'socso_number', 'tax_number'
];

// Fields employee can edit BEFORE profile is complete (during onboarding)
const EDITABLE_BEFORE_COMPLETE = [
  'name', 'date_of_birth', 'address', 'phone', 'email',
  'bank_name', 'bank_account_no', 'bank_account_holder',
  'epf_number', 'socso_number', 'tax_number',
  'marital_status', 'spouse_working', 'children_count'
];

// Fields employee can edit AFTER profile is complete
const EDITABLE_AFTER_COMPLETE = ['phone', 'address'];

// Helper to check if profile is complete
const checkProfileComplete = (employee) => {
  const missing = [];
  for (const field of PROFILE_REQUIRED_FIELDS) {
    const value = employee[field];
    if (value === null || value === undefined || value === '') {
      missing.push(field);
    }
  }
  return { complete: missing.length === 0, missing };
};

// Get current employee profile
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT e.*, d.name as department_name, o.name as outlet_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
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

  // Check profile completion status
  const { complete, missing } = checkProfileComplete(employee);

  // Calculate deadline (1 month from join_date)
  let deadline = null;
  if (employee.join_date) {
    const joinDate = new Date(employee.join_date);
    deadline = new Date(joinDate.setMonth(joinDate.getMonth() + 1));
  }

  res.json({
    ...employee,
    profile_status: {
      complete: employee.profile_completed || complete,
      missing_fields: employee.profile_completed ? [] : missing,
      deadline: deadline,
      editable_fields: employee.profile_completed ? EDITABLE_AFTER_COMPLETE : EDITABLE_BEFORE_COMPLETE
    }
  });
}));

// Get profile completion status
router.get('/completion-status', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT name, ic_number, date_of_birth, phone, address,
            bank_name, bank_account_no, epf_number, socso_number, tax_number,
            join_date, profile_completed, profile_completed_at
     FROM employees WHERE id = $1`,
    [req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  const employee = result.rows[0];
  const { complete, missing } = checkProfileComplete(employee);

  // Calculate deadline (1 month from join_date)
  let deadline = null;
  let daysRemaining = null;
  if (employee.join_date) {
    const joinDate = new Date(employee.join_date);
    deadline = new Date(joinDate.setMonth(joinDate.getMonth() + 1));
    const today = new Date();
    daysRemaining = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  }

  res.json({
    complete: employee.profile_completed || complete,
    profile_completed_at: employee.profile_completed_at,
    missing_fields: employee.profile_completed ? [] : missing,
    total_required: PROFILE_REQUIRED_FIELDS.length,
    completed_count: PROFILE_REQUIRED_FIELDS.length - missing.length,
    deadline,
    days_remaining: daysRemaining,
    editable_fields: employee.profile_completed ? EDITABLE_AFTER_COMPLETE : EDITABLE_BEFORE_COMPLETE
  });
}));

// Update employee profile (conditional fields based on profile_completed status)
router.put('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  // First, get current employee to check profile_completed status
  const currentResult = await pool.query(
    'SELECT profile_completed FROM employees WHERE id = $1',
    [employeeId]
  );

  if (currentResult.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  const isProfileCompleted = currentResult.rows[0].profile_completed;
  const allowedFields = isProfileCompleted ? EDITABLE_AFTER_COMPLETE : EDITABLE_BEFORE_COMPLETE;

  // Filter incoming data to only allowed fields
  const updateData = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      error: 'No valid fields to update',
      allowed_fields: allowedFields
    });
  }

  // Build dynamic UPDATE query
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [field, value] of Object.entries(updateData)) {
    setClauses.push(`${field} = $${paramIndex}`);
    values.push(value === '' ? null : value);
    paramIndex++;
  }

  // Always update updated_at
  setClauses.push(`updated_at = NOW()`);

  // Add employee id for WHERE clause
  values.push(employeeId);

  const updateQuery = `
    UPDATE employees
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const updateResult = await pool.query(updateQuery, values);

  if (updateResult.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  const updatedEmployee = updateResult.rows[0];

  // Check if profile is now complete (only if not already marked complete)
  if (!isProfileCompleted) {
    const { complete } = checkProfileComplete(updatedEmployee);

    if (complete) {
      // Mark profile as completed
      await pool.query(
        `UPDATE employees
         SET profile_completed = TRUE, profile_completed_at = NOW()
         WHERE id = $1`,
        [employeeId]
      );
      updatedEmployee.profile_completed = true;
      updatedEmployee.profile_completed_at = new Date();
    }
  }

  // Remove sensitive fields
  delete updatedEmployee.password_hash;
  delete updatedEmployee.password_reset_token;
  delete updatedEmployee.password_reset_expires;

  // Return completion status
  const { complete: nowComplete, missing } = checkProfileComplete(updatedEmployee);

  res.json({
    message: updatedEmployee.profile_completed ?
      'Profile updated and marked as complete!' :
      'Profile updated successfully',
    employee: updatedEmployee,
    profile_status: {
      complete: updatedEmployee.profile_completed || nowComplete,
      missing_fields: updatedEmployee.profile_completed ? [] : missing,
      editable_fields: updatedEmployee.profile_completed ? EDITABLE_AFTER_COMPLETE : allowedFields
    }
  });
}));

// Submit/Complete profile (explicit action to mark profile as complete)
router.post('/complete', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  // Get current employee data
  const result = await pool.query(
    'SELECT * FROM employees WHERE id = $1',
    [employeeId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  const employee = result.rows[0];

  // Check if already completed
  if (employee.profile_completed) {
    return res.status(400).json({ error: 'Profile is already completed' });
  }

  // Validate all required fields are filled
  const { complete, missing } = checkProfileComplete(employee);

  if (!complete) {
    return res.status(400).json({
      error: 'Cannot complete profile - missing required fields',
      missing_fields: missing
    });
  }

  // Mark as complete
  await pool.query(
    `UPDATE employees
     SET profile_completed = TRUE, profile_completed_at = NOW()
     WHERE id = $1`,
    [employeeId]
  );

  res.json({
    message: 'Profile completed successfully! Some fields are now locked.',
    locked_fields: EDITABLE_BEFORE_COMPLETE.filter(f => !EDITABLE_AFTER_COMPLETE.includes(f)),
    editable_fields: EDITABLE_AFTER_COMPLETE
  });
}));

module.exports = router;
