/**
 * ESS Leave Routes
 * Handles employee leave balance, history, and applications
 * Implements Malaysian Employment Act 1955 leave rules
 * Includes supervisor/manager approval endpoints for Mimix
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const cloudinary = require('../../config/cloudinary');
const multer = require('multer');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const {
  isSupervisorOrManager,
  getManagedOutlets,
  getInitialApprovalLevel,
  isMimixCompany,
  canApproveForOutlet
} = require('../../middleware/essPermissions');
const {
  calculateYearsOfService,
  getEntitlementByServiceYears,
  checkLeaveEligibility
} = require('../../utils/leaveProration');

// Multer setup for MC upload (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and PDF allowed.'));
    }
  }
});

// Get leave balances with service-year based entitlements
router.get('/balance', authenticateEmployee, asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();
  const employeeId = req.employee.id;

  // Get employee info for service calculation
  const empResult = await pool.query(
    'SELECT join_date, gender, company_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (empResult.rows.length === 0) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const employee = empResult.rows[0];
  const yearsOfService = calculateYearsOfService(employee.join_date);

  // Get leave balances with full leave type info
  const result = await pool.query(
    `SELECT lb.*,
            lt.code,
            lt.name as leave_type_name,
            lt.is_paid,
            lt.requires_attachment,
            lt.is_consecutive,
            lt.max_occurrences,
            lt.min_service_days,
            lt.gender_restriction,
            lt.entitlement_rules,
            lt.carries_forward,
            lt.max_carry_forward,
            (lb.entitled_days + lb.carried_forward - lb.used_days) as balance
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     WHERE lb.employee_id = $1 AND lb.year = $2
     ORDER BY
       CASE lt.code
         WHEN 'AL' THEN 1
         WHEN 'SL' THEN 2
         WHEN 'HL' THEN 3
         WHEN 'MAT' THEN 4
         WHEN 'PAT' THEN 5
         WHEN 'CL' THEN 6
         WHEN 'EL' THEN 7
         WHEN 'UL' THEN 8
         ELSE 9
       END`,
    [employeeId, currentYear]
  );

  // Calculate expected entitlement based on current service years
  const balances = result.rows.map(lb => {
    const baseEntitlement = getEntitlementByServiceYears(
      { entitlement_rules: lb.entitlement_rules, default_days_per_year: lb.entitled_days },
      yearsOfService
    );

    return {
      ...lb,
      years_of_service: Math.floor(yearsOfService * 10) / 10, // 1 decimal
      base_entitlement: baseEntitlement
    };
  });

  res.json({
    year: currentYear,
    years_of_service: Math.floor(yearsOfService * 10) / 10,
    balances
  });
}));

// Get leave history
router.get('/history', authenticateEmployee, asyncHandler(async (req, res) => {
  const { year, status } = req.query;

  let query = `
    SELECT lr.*,
           lt.code,
           lt.name as leave_type_name,
           lt.requires_attachment,
           sup.name as supervisor_name,
           mgr.name as manager_name,
           au.name as approver_name
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    LEFT JOIN employees sup ON lr.supervisor_id = sup.id
    LEFT JOIN employees mgr ON lr.manager_id = mgr.id
    LEFT JOIN admin_users au ON lr.approver_id = au.id
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

/**
 * Calculate working days between two dates
 * Excludes weekends and public holidays
 */
async function calculateWorkingDays(startDate, endDate, companyId) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Get public holidays in date range
  const holidaysResult = await pool.query(
    `SELECT date FROM public_holidays
     WHERE date BETWEEN $1 AND $2
       AND (company_id = $3 OR company_id IS NULL)`,
    [startDate, endDate, companyId]
  );

  const holidays = new Set(
    holidaysResult.rows.map(h => h.date.toISOString().split('T')[0])
  );

  let totalDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    const dateStr = current.toISOString().split('T')[0];

    // Exclude Sundays (0) and public holidays
    // Note: Saturday may be a working day in some companies
    if (day !== 0 && !holidays.has(dateStr)) {
      totalDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return totalDays;
}

/**
 * Upload MC to Cloudinary
 */
async function uploadMCToCloudinary(fileBuffer, employeeId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'hrms/medical-certificates',
        public_id: `mc_${employeeId}_${Date.now()}`,
        resource_type: 'auto',
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    uploadStream.end(fileBuffer);
  });
}

// Apply for leave with MC upload support
router.post('/apply', authenticateEmployee, upload.single('mc_file'), asyncHandler(async (req, res) => {
  const { leave_type_id, start_date, end_date, reason, half_day, child_number } = req.body;
  const mcFile = req.file;

  if (!leave_type_id || !start_date || !end_date) {
    throw new ValidationError('Leave type, start date, and end date are required');
  }

  const start = new Date(start_date);
  const end = new Date(end_date);

  if (start > end) {
    throw new ValidationError('End date must be after start date');
  }

  // Cannot apply for past dates (only admin can)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) {
    throw new ValidationError('Cannot apply leave for past dates');
  }

  // Get employee info
  const empResult = await pool.query(
    'SELECT e.*, c.id as company_id FROM employees e JOIN companies c ON e.company_id = c.id WHERE e.id = $1',
    [req.employee.id]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const employee = empResult.rows[0];

  // Get leave type details
  const leaveTypeResult = await pool.query(
    'SELECT * FROM leave_types WHERE id = $1',
    [leave_type_id]
  );

  if (leaveTypeResult.rows.length === 0) {
    throw new ValidationError('Invalid leave type');
  }

  const leaveType = leaveTypeResult.rows[0];

  // Check eligibility (gender, service, occurrences)
  const eligibility = await checkLeaveEligibility(
    { ...employee, id: req.employee.id },
    leaveType
  );

  if (!eligibility.eligible) {
    throw new ValidationError(eligibility.reason);
  }

  // Check if MC is required but not provided
  if (leaveType.requires_attachment && !mcFile) {
    throw new ValidationError('Medical Certificate (MC) is required for this leave type');
  }

  // Check for overlapping leave requests
  const overlapResult = await pool.query(
    `SELECT id FROM leave_requests
     WHERE employee_id = $1
       AND status IN ('pending', 'approved')
       AND ((start_date <= $2 AND end_date >= $2)
            OR (start_date <= $3 AND end_date >= $3)
            OR (start_date >= $2 AND end_date <= $3))`,
    [req.employee.id, start_date, end_date]
  );

  if (overlapResult.rows.length > 0) {
    throw new ValidationError('You already have a leave request for these dates');
  }

  // Calculate total working days
  let totalDays = await calculateWorkingDays(start_date, end_date, employee.company_id);

  // Handle half-day leave
  if (half_day && totalDays === 1) {
    totalDays = 0.5;
  }

  // For consecutive leave types (maternity/paternity), count all days
  if (leaveType.is_consecutive) {
    const diffTime = end - start;
    totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  // Check leave balance for paid leave
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
  } else if (leaveType.is_paid) {
    throw new ValidationError('Leave balance not initialized. Please contact HR.');
  }

  // Upload MC to Cloudinary if provided
  let mcUrl = null;
  if (mcFile) {
    try {
      const uploadResult = await uploadMCToCloudinary(mcFile.buffer, req.employee.id);
      mcUrl = uploadResult.secure_url;
    } catch (uploadError) {
      console.error('MC upload error:', uploadError);
      throw new ValidationError('Failed to upload Medical Certificate. Please try again.');
    }
  }

  // Determine initial approval level based on role and company
  const approvalLevel = getInitialApprovalLevel(employee);

  // Create leave request
  const result = await pool.query(
    `INSERT INTO leave_requests
       (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approval_level, mc_url, half_day, child_number)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10)
     RETURNING *`,
    [req.employee.id, leave_type_id, start_date, end_date, totalDays, reason, approvalLevel, mcUrl, half_day || null, child_number || null]
  );

  // Create notification for supervisor if Mimix
  if (isMimixCompany(employee.company_id) && approvalLevel === 1) {
    const supervisorResult = await pool.query(
      `SELECT id FROM employees
       WHERE outlet_id = $1 AND employee_role = 'supervisor' AND status = 'active'
       LIMIT 1`,
      [employee.outlet_id]
    );

    if (supervisorResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
         VALUES ($1, 'leave', 'New Leave Request', $2, 'leave_request', $3)`,
        [supervisorResult.rows[0].id, `${employee.name} has applied for ${leaveType.name}`, result.rows[0].id]
      );
    }
  }

  console.log(`New leave request from employee ${req.employee.id}: ${totalDays} days of ${leaveType.code}, approval_level: ${approvalLevel}`);

  res.status(201).json({
    message: 'Leave request submitted successfully',
    request: result.rows[0]
  });
}));

// Get leave types with eligibility info
router.get('/types', authenticateEmployee, asyncHandler(async (req, res) => {
  // Get employee info for eligibility checks
  const empResult = await pool.query(
    'SELECT gender, join_date, company_id FROM employees WHERE id = $1',
    [req.employee.id]
  );

  if (empResult.rows.length === 0) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const employee = { ...empResult.rows[0], id: req.employee.id };
  const yearsOfService = calculateYearsOfService(employee.join_date);

  // Get all leave types
  const result = await pool.query(
    `SELECT * FROM leave_types
     WHERE company_id = $1 OR company_id IS NULL
     ORDER BY
       CASE code
         WHEN 'AL' THEN 1
         WHEN 'SL' THEN 2
         WHEN 'HL' THEN 3
         WHEN 'MAT' THEN 4
         WHEN 'PAT' THEN 5
         WHEN 'CL' THEN 6
         WHEN 'EL' THEN 7
         WHEN 'UL' THEN 8
         ELSE 9
       END`,
    [employee.company_id]
  );

  // Add eligibility info to each leave type
  const leaveTypes = await Promise.all(
    result.rows.map(async (lt) => {
      const eligibility = await checkLeaveEligibility(employee, lt);
      const entitledDays = getEntitlementByServiceYears(lt, yearsOfService);

      return {
        ...lt,
        entitled_days_for_service: entitledDays,
        eligible: eligibility.eligible,
        eligibility_reason: eligibility.reason
      };
    })
  );

  res.json(leaveTypes);
}));

// Cancel pending leave request
router.post('/:id/cancel', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get the leave request
  const leaveResult = await pool.query(
    'SELECT * FROM leave_requests WHERE id = $1',
    [id]
  );

  if (leaveResult.rows.length === 0) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  const leaveRequest = leaveResult.rows[0];

  // Verify this is the employee's own request
  if (leaveRequest.employee_id !== req.employee.id) {
    return res.status(403).json({ error: 'You can only cancel your own leave requests' });
  }

  // Can only cancel pending requests
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Can only cancel pending leave requests' });
  }

  // Delete the request
  await pool.query('DELETE FROM leave_requests WHERE id = $1', [id]);

  res.json({ message: 'Leave request cancelled successfully' });
}));

// =====================================================
// SUPERVISOR/MANAGER APPROVAL ENDPOINTS (Mimix only)
// =====================================================

/**
 * Get pending leave requests for supervisor/manager's team
 * Supervisors see their outlet's staff
 * Managers see all outlets they manage
 */
router.get('/team-pending', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info including role
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  // Only for Mimix (outlet-based companies)
  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'Team leave approval is only available for outlet-based companies.' });
  }

  // Get outlets this supervisor/manager can approve for
  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json([]);
  }

  // Get pending leave requests from employees in managed outlets
  // approval_level=1 means waiting for supervisor, approval_level=2 means waiting for manager
  const result = await pool.query(
    `SELECT lr.*,
            lt.code,
            lt.name as leave_type_name,
            lt.requires_attachment,
            e.name as employee_name,
            e.employee_id as emp_code,
            e.outlet_id,
            o.name as outlet_name
     FROM leave_requests lr
     JOIN leave_types lt ON lr.leave_type_id = lt.id
     JOIN employees e ON lr.employee_id = e.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.outlet_id = ANY($1)
       AND lr.status = 'pending'
       AND (
         (lr.approval_level = 1 AND $2 = 'supervisor')
         OR (lr.approval_level = 2 AND $2 = 'manager')
       )
     ORDER BY lr.created_at ASC`,
    [outletIds, employee.employee_role]
  );

  res.json(result.rows);
}));

/**
 * Approve leave request (supervisor/manager)
 */
router.post('/:id/approve', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  // Get the leave request with employee info
  const leaveResult = await pool.query(
    `SELECT lr.*, e.outlet_id as employee_outlet_id, e.name as employee_name
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE lr.id = $1`,
    [id]
  );

  if (leaveResult.rows.length === 0) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  const leaveRequest = leaveResult.rows[0];

  // Verify leave is pending
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Leave request is not pending' });
  }

  // Verify approver can approve for this outlet
  const canApprove = await canApproveForOutlet(approver, leaveRequest.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot approve leave for this employee' });
  }

  // Verify approval level matches approver's role
  if (leaveRequest.approval_level === 1 && approver.employee_role !== 'supervisor') {
    return res.status(400).json({ error: 'This leave request requires supervisor approval first' });
  }
  if (leaveRequest.approval_level === 2 && approver.employee_role !== 'manager') {
    return res.status(400).json({ error: 'This leave request requires manager approval' });
  }

  // Update leave request based on approval level
  if (approver.employee_role === 'supervisor') {
    // Supervisor approves - move to next level (manager or admin)
    await pool.query(
      `UPDATE leave_requests
       SET supervisor_id = $1, supervisor_approved = true, supervisor_approved_at = NOW(),
           approval_level = 2
       WHERE id = $2`,
      [req.employee.id, id]
    );

    // Create notification for employee
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'leave', 'Leave Request Update', 'Your leave request has been approved by supervisor. Pending final approval.', 'leave_request', $2)`,
      [leaveRequest.employee_id, id]
    );

    res.json({ message: 'Leave approved by supervisor. Pending manager/admin approval.' });

  } else if (approver.employee_role === 'manager') {
    // Manager approves - move to admin level
    await pool.query(
      `UPDATE leave_requests
       SET manager_id = $1, manager_approved = true, manager_approved_at = NOW(),
           approval_level = 3
       WHERE id = $2`,
      [req.employee.id, id]
    );

    // Create notification for employee
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'leave', 'Leave Request Update', 'Your leave request has been approved by manager. Pending final admin approval.', 'leave_request', $2)`,
      [leaveRequest.employee_id, id]
    );

    res.json({ message: 'Leave approved by manager. Pending admin approval.' });
  }
}));

/**
 * Reject leave request (supervisor/manager)
 */
router.post('/:id/reject', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  // Get the leave request with employee info
  const leaveResult = await pool.query(
    `SELECT lr.*, e.outlet_id as employee_outlet_id
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE lr.id = $1`,
    [id]
  );

  if (leaveResult.rows.length === 0) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  const leaveRequest = leaveResult.rows[0];

  // Verify leave is pending
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Leave request is not pending' });
  }

  // Verify approver can approve for this outlet
  const canApprove = await canApproveForOutlet(approver, leaveRequest.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot reject leave for this employee' });
  }

  // Update leave request to rejected
  await pool.query(
    `UPDATE leave_requests
     SET status = 'rejected', rejection_reason = $1, approver_id = $2, approved_at = NOW()
     WHERE id = $3`,
    [reason, req.employee.id, id]
  );

  // Create notification for employee
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'leave', 'Leave Request Rejected', $2, 'leave_request', $3)`,
    [leaveRequest.employee_id, `Your leave request has been rejected. Reason: ${reason}`, id]
  );

  res.json({ message: 'Leave request rejected.' });
}));

/**
 * Get count of pending leave approvals for supervisor/manager
 */
router.get('/team-pending-count', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.json({ count: 0 });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.json({ count: 0 });
  }

  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json({ count: 0 });
  }

  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE e.outlet_id = ANY($1)
       AND lr.status = 'pending'
       AND (
         (lr.approval_level = 1 AND $2 = 'supervisor')
         OR (lr.approval_level = 2 AND $2 = 'manager')
       )`,
    [outletIds, employee.employee_role]
  );

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
