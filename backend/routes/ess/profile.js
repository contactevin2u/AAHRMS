/**
 * ESS Profile Routes
 * Handles employee profile viewing and self-onboarding
 *
 * SECURITY NOTE: Salary and sensitive financial data are NOT exposed to employees.
 * Employees can see their own profile info but NOT salary-related fields.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError, ValidationError } = require('../../middleware/errorHandler');
const { uploadProfilePicture, deleteFile, extractPublicId } = require('../../utils/cloudinaryStorage');

// Required fields for profile to be marked complete
// Note: EPF, SOCSO, Tax numbers are handled by admin, not required for employee self-service
const PROFILE_REQUIRED_FIELDS = [
  'name', 'ic_number', 'date_of_birth', 'phone', 'address',
  'bank_name', 'bank_account_no'
];

// Fields employee can edit BEFORE profile is complete (during onboarding)
// Note: EPF, SOCSO, Tax numbers are handled by admin
const EDITABLE_BEFORE_COMPLETE = [
  'name', 'date_of_birth', 'address', 'phone', 'email', 'username',
  'bank_name', 'bank_account_no', 'bank_account_holder',
  'marital_status', 'spouse_working', 'children_count'
];

// Fields employee can edit AFTER profile is complete
const EDITABLE_AFTER_COMPLETE = ['phone', 'address', 'username'];

// Fields to HIDE from employee profile response (sensitive financial data)
const HIDDEN_FIELDS = [
  'default_basic_salary', 'current_basic_salary', 'hourly_rate',
  'daily_rate', 'overtime_rate', 'commission_rate',
  'epf_rate', 'socso_rate', 'eis_rate',
  'password_hash', 'password_reset_token', 'password_reset_expires'
];

// Helper to sanitize employee data (remove hidden fields)
const sanitizeEmployeeData = (employee) => {
  const sanitized = { ...employee };
  for (const field of HIDDEN_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
};

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

/**
 * Calculate profile completion deadline based on join_date
 * Deadline is always 28th of the month (for payroll processing)
 * - If join_date is on or before 28th → deadline is 28th of that month
 * - If join_date is after 28th → deadline is 28th of next month
 * - Minimum deadline is 28/02/2026 for all existing employees (system launch grace period)
 */
const SYSTEM_LAUNCH_DEADLINE = new Date(2026, 1, 28); // 28 Feb 2026

const calculateDeadline = (joinDate) => {
  if (!joinDate) return SYSTEM_LAUNCH_DEADLINE;

  const date = new Date(joinDate);
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  let calculatedDeadline;
  if (day <= 28) {
    // Same month, 28th
    calculatedDeadline = new Date(year, month, 28);
  } else {
    // Next month, 28th
    calculatedDeadline = new Date(year, month + 1, 28);
  }

  // Use the later of: system launch deadline OR calculated deadline
  // This gives existing employees until 28/02/2026 to complete profile
  return calculatedDeadline > SYSTEM_LAUNCH_DEADLINE ? calculatedDeadline : SYSTEM_LAUNCH_DEADLINE;
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

  // Remove sensitive fields (salary, rates, passwords)
  const sanitizedEmployee = sanitizeEmployeeData(employee);

  // Check profile completion status
  const { complete, missing } = checkProfileComplete(employee);

  // Calculate deadline (28th of the month for payroll)
  const deadline = calculateDeadline(employee.join_date);

  res.json({
    ...sanitizedEmployee,
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
            bank_name, bank_account_no,
            join_date, profile_completed, profile_completed_at
     FROM employees WHERE id = $1`,
    [req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Employee');
  }

  const employee = result.rows[0];
  const { complete, missing } = checkProfileComplete(employee);

  // Calculate deadline (28th of the month for payroll)
  const deadline = calculateDeadline(employee.join_date);
  let daysRemaining = null;
  if (deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time for accurate day calculation
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

  // Validate username if provided
  if (req.body.username !== undefined) {
    const username = req.body.username?.trim().toLowerCase();
    if (username) {
      // Check minimum length
      if (username.length < 4) {
        return res.status(400).json({ error: 'Username must be at least 4 characters' });
      }
      // Check for valid characters (alphanumeric and underscore only)
      if (!/^[a-z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
      }
      // Check uniqueness
      const existingUser = await pool.query(
        'SELECT id FROM employees WHERE LOWER(username) = $1 AND id != $2',
        [username, employeeId]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      req.body.username = username; // Normalize to lowercase
    }
  }

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

  // Remove sensitive fields (salary, rates, passwords)
  const sanitizedEmployee = sanitizeEmployeeData(updatedEmployee);

  // Return completion status
  const { complete: nowComplete, missing } = checkProfileComplete(updatedEmployee);

  res.json({
    message: updatedEmployee.profile_completed ?
      'Profile updated and marked as complete!' :
      'Profile updated successfully',
    employee: sanitizedEmployee,
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

// Upload profile picture
router.post('/picture', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const companyId = req.employee.company_id;
  const { image } = req.body;

  if (!image) {
    throw new ValidationError('Image data is required');
  }

  // Validate base64 image
  if (!image.startsWith('data:image/')) {
    throw new ValidationError('Invalid image format. Please upload a valid image file.');
  }

  // Check file size (rough estimate from base64 - actual limit ~2MB)
  const base64Size = image.length * 0.75; // Approximate decoded size
  if (base64Size > 5 * 1024 * 1024) { // 5MB limit for base64
    throw new ValidationError('Image is too large. Please upload an image smaller than 2MB.');
  }

  // Get current profile picture URL to delete old one later
  const currentResult = await pool.query(
    'SELECT profile_picture FROM employees WHERE id = $1',
    [employeeId]
  );

  const oldPictureUrl = currentResult.rows[0]?.profile_picture;

  // Upload new picture to Cloudinary (with compression)
  const pictureUrl = await uploadProfilePicture(image, companyId, employeeId);

  // Update employee record with new picture URL
  await pool.query(
    'UPDATE employees SET profile_picture = $1, updated_at = NOW() WHERE id = $2',
    [pictureUrl, employeeId]
  );

  // Delete old picture from Cloudinary (non-blocking)
  if (oldPictureUrl) {
    const oldPublicId = extractPublicId(oldPictureUrl);
    if (oldPublicId) {
      deleteFile(oldPublicId).catch(err => {
        console.error('Failed to delete old profile picture:', err);
      });
    }
  }

  res.json({
    message: 'Profile picture updated successfully',
    profile_picture: pictureUrl
  });
}));

// Delete profile picture
router.delete('/picture', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  // Get current profile picture URL
  const result = await pool.query(
    'SELECT profile_picture FROM employees WHERE id = $1',
    [employeeId]
  );

  const pictureUrl = result.rows[0]?.profile_picture;

  if (!pictureUrl) {
    return res.status(400).json({ error: 'No profile picture to delete' });
  }

  // Remove from database
  await pool.query(
    'UPDATE employees SET profile_picture = NULL, updated_at = NOW() WHERE id = $1',
    [employeeId]
  );

  // Delete from Cloudinary (non-blocking)
  const publicId = extractPublicId(pictureUrl);
  if (publicId) {
    deleteFile(publicId).catch(err => {
      console.error('Failed to delete profile picture from Cloudinary:', err);
    });
  }

  res.json({ message: 'Profile picture deleted successfully' });
}));

module.exports = router;
