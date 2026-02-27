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
  isBossOrDirector,
  getManagedOutlets,
  getInitialApprovalLevel,
  isMimixCompany,
  canApproveForOutlet
} = require('../../middleware/essPermissions');
const {
  calculateYearsOfService,
  getEntitlementByServiceYears,
  checkLeaveEligibility,
  initializeLeaveBalances,
  initializeYearlyLeaveBalances,
  getCompanyLeaveSettings
} = require('../../utils/leaveProration');
const { revertAutoApprovedLeave, AA_ALIVE_COMPANY_ID } = require('../../jobs/autoApproveLeave');

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

  // Auto-initialize leave balances if none exist for current year
  const checkExisting = await pool.query(
    'SELECT COUNT(*) as cnt FROM leave_balances WHERE employee_id = $1 AND year = $2',
    [employeeId, currentYear]
  );
  if (parseInt(checkExisting.rows[0].cnt) === 0) {
    try {
      await initializeLeaveBalances(employeeId, employee.company_id, employee.join_date, { gender: employee.gender });
      console.log(`[Leave Balance] Auto-initialized balances for employee ${employeeId}, year ${currentYear}`);
    } catch (initErr) {
      console.error('[Leave Balance] Auto-init failed:', initErr.message);
    }
  }

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

  // Get company settings for rounding
  const settings = await getCompanyLeaveSettings(employee.company_id);

  // Calculate completed months for YTD earned
  const now = new Date();
  const joinDate = new Date(employee.join_date);
  let completedMonths;
  if (joinDate.getFullYear() === currentYear) {
    // Mid-year joiner: count from join month to current month
    completedMonths = now.getMonth() - joinDate.getMonth();
    if (completedMonths < 0) completedMonths = 0;
  } else {
    // Full-year employee: completed months = current month index (Jan=0 means 0 completed, Feb=1 means 1 completed, etc.)
    completedMonths = now.getMonth();
  }

  // Calculate expected entitlement based on current service years
  const balances = result.rows.map(lb => {
    const baseEntitlement = getEntitlementByServiceYears(
      { entitlement_rules: lb.entitlement_rules, default_days_per_year: lb.entitled_days },
      yearsOfService
    );

    const entitled = parseFloat(lb.entitled_days) || 0;
    const used = parseFloat(lb.used_days) || 0;
    const carriedForward = parseFloat(lb.carried_forward) || 0;

    // Calculate YTD earned (prorated) with company rounding
    let ytdEarnedRaw = entitled * completedMonths / 12;
    let ytdEarned;
    switch (settings.leave_proration_rounding) {
      case 'up':
        ytdEarned = Math.ceil(ytdEarnedRaw);
        break;
      case 'down':
        ytdEarned = Math.floor(ytdEarnedRaw);
        break;
      case 'nearest':
      default:
        ytdEarned = Math.round(ytdEarnedRaw * 2) / 2;
    }

    // Advance leave = what hasn't been earned yet
    const advanceLeave = entitled - ytdEarned;

    // Earned balance = earned + carried_forward - used (can be negative)
    const earnedBalance = ytdEarned + carriedForward - used;

    return {
      ...lb,
      years_of_service: Math.floor(yearsOfService * 10) / 10,
      base_entitlement: baseEntitlement,
      ytd_earned: ytdEarned,
      advance_leave: advanceLeave,
      earned_balance: earnedBalance,
      completed_months: completedMonths
    };
  });

  res.json({
    year: currentYear,
    years_of_service: Math.floor(yearsOfService * 10) / 10,
    completed_months: completedMonths,
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
           au.name as approver_name,
           e.company_id
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN employees e ON lr.employee_id = e.id
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
 * Excludes weekends and public holidays based on company
 * - AA Alive (company_id=1): Mon-Fri only (exclude Sat & Sun)
 * - Mimix (company_id=3): Mon-Sun (F&B shift work, only exclude public holidays)
 */
async function calculateWorkingDays(startDate, endDate, companyId) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Company working day rules:
  // - Mimix (company_id = 3): F&B with shifts, works Monday-Sunday
  // - AA Alive (company_id = 1): Office hours, works Monday-Friday only
  const isMimix = companyId === 3;
  const isAAAlive = companyId === 1;

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
    const day = current.getDay(); // 0 = Sunday, 6 = Saturday
    const dateStr = current.toISOString().split('T')[0];

    // Skip public holidays for all companies
    if (holidays.has(dateStr)) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    if (isMimix) {
      // Mimix (F&B): count all days Mon-Sun (only exclude public holidays)
      totalDays++;
    } else if (isAAAlive) {
      // AA Alive: Mon-Fri only (exclude Saturday=6 and Sunday=0)
      if (day !== 0 && day !== 6) {
        totalDays++;
      }
    } else {
      // Default: exclude Sundays (0) and public holidays
      if (day !== 0) {
        totalDays++;
      }
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
  const { leave_type_id, leave_type, start_date, end_date, reason, half_day, child_number } = req.body;
  const mcFile = req.file;

  console.log('[Leave Apply] Request body:', { leave_type_id, leave_type, start_date, end_date, reason });
  console.log('[Leave Apply] Employee ID:', req.employee?.id);

  if ((!leave_type_id && !leave_type) || !start_date || !end_date) {
    throw new ValidationError('Leave type, start date, and end date are required');
  }

  const start = new Date(start_date);
  const end = new Date(end_date);

  if (start > end) {
    throw new ValidationError('End date must be after start date');
  }

  // Cannot apply for past dates (only admin can)
  // Exception: Medical/Sick leave (requires_attachment types) can be applied up to 7 days in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get employee info
  const empResult = await pool.query(
    'SELECT e.*, c.id as company_id FROM employees e JOIN companies c ON e.company_id = c.id WHERE e.id = $1',
    [req.employee.id]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const employee = empResult.rows[0];

  // ESS restriction: reject leave if dates are after last working day (resigned employee)
  if (employee.last_working_day && employee.employment_status && ['notice', 'resigned_pending'].includes(employee.employment_status)) {
    const lwdDate = new Date(employee.last_working_day);
    lwdDate.setHours(0, 0, 0, 0);
    if (end > lwdDate) {
      throw new ValidationError(`Cannot apply leave beyond your last working day (${employee.last_working_day.toISOString().split('T')[0]})`);
    }
  }

  console.log('[Leave Apply] Employee company_id:', employee.company_id);

  // Get leave type details - support both leave_type_id (number) and leave_type (name string)
  let leaveTypeResult;
  if (leave_type_id) {
    leaveTypeResult = await pool.query(
      'SELECT * FROM leave_types WHERE id = $1',
      [leave_type_id]
    );
  } else {
    // Look up by name (case-insensitive) within the employee's company
    console.log('[Leave Apply] Looking up leave type by name:', leave_type, 'for company:', employee.company_id);
    leaveTypeResult = await pool.query(
      'SELECT * FROM leave_types WHERE LOWER(name) = LOWER($1) AND company_id = $2',
      [leave_type, employee.company_id]
    );
    console.log('[Leave Apply] Leave type lookup result:', leaveTypeResult.rows.length, 'rows');
  }

  if (leaveTypeResult.rows.length === 0) {
    // Debug: show available leave types for this company
    const availableTypes = await pool.query(
      'SELECT id, name FROM leave_types WHERE company_id = $1',
      [employee.company_id]
    );
    console.log('[Leave Apply] Available leave types for company:', availableTypes.rows);
    throw new ValidationError(`Invalid leave type: "${leave_type}". Available types: ${availableTypes.rows.map(t => t.name).join(', ')}`);
  }

  const leaveType = leaveTypeResult.rows[0];

  // Past date validation - moved here so we know the leave type
  // Medical leave types (requires_attachment) can be applied up to 7 days in the past
  // Other leave types cannot be applied for past dates
  if (start < today) {
    const isMedicalLeave = leaveType.requires_attachment || ['ML', 'SL', 'HL'].includes(leaveType.code);
    if (!isMedicalLeave) {
      throw new ValidationError('Cannot apply leave for past dates');
    }
    // Medical leave: allow up to 7 days in the past
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (start < sevenDaysAgo) {
      throw new ValidationError('Medical leave can only be applied up to 7 days in the past. Please contact HR for earlier dates.');
    }
  }

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
  let balanceResult = await pool.query(
    `SELECT lb.*, lt.is_paid
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     WHERE lb.employee_id = $1 AND lb.leave_type_id = $2 AND lb.year = $3`,
    [req.employee.id, leaveType.id, currentYear]
  );

  // Auto-initialize leave balances for current year if not exists
  if (balanceResult.rows.length === 0 && leaveType.is_paid) {
    console.log(`[Leave Apply] Auto-initializing leave balances for employee ${req.employee.id}, year ${currentYear}`);
    try {
      await initializeYearlyLeaveBalances(req.employee.id, employee.company_id, currentYear, employee.join_date);
      // Re-fetch the balance after initialization
      balanceResult = await pool.query(
        `SELECT lb.*, lt.is_paid
         FROM leave_balances lb
         JOIN leave_types lt ON lb.leave_type_id = lt.id
         WHERE lb.employee_id = $1 AND lb.leave_type_id = $2 AND lb.year = $3`,
        [req.employee.id, leaveType.id, currentYear]
      );
    } catch (initError) {
      console.error('[Leave Apply] Failed to auto-initialize balances:', initError);
      throw new ValidationError('Leave balance not initialized. Please contact HR.');
    }
  }

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

  // Check if this qualifies for auto-approval:
  // - AA Alive company (company_id = 1)
  // - Annual Leave (code = 'AL')
  // - Has sufficient balance (already validated above for paid leave)
  const isAAAlive = employee.company_id === AA_ALIVE_COMPANY_ID;
  const isAnnualLeave = leaveType.code === 'AL';
  const shouldAutoApprove = isAAAlive && isAnnualLeave && leaveType.is_paid;

  let leaveStatus = 'pending';
  let autoApproved = false;

  if (shouldAutoApprove) {
    leaveStatus = 'approved';
    autoApproved = true;
    console.log(`[Leave Apply] Auto-approving Annual Leave for AA Alive employee ${req.employee.id}`);
  }

  // Create leave request
  const result = await pool.query(
    `INSERT INTO leave_requests
       (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approval_level, mc_url, half_day, child_number, auto_approved, auto_approved_at, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      req.employee.id, leaveType.id, start_date, end_date, totalDays, reason,
      leaveStatus, approvalLevel, mcUrl, half_day || null, child_number || null,
      autoApproved, autoApproved ? new Date() : null, autoApproved ? new Date() : null
    ]
  );

  // If auto-approved, deduct leave balance immediately
  if (autoApproved && leaveType.is_paid) {
    const year = new Date(start_date).getFullYear();
    await pool.query(
      `UPDATE leave_balances
       SET used_days = used_days + $1, updated_at = NOW()
       WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
      [totalDays, req.employee.id, leaveType.id, year]
    );
    console.log(`[Leave Apply] Deducted ${totalDays} days from balance for auto-approved leave`);

    // Create notification for auto-approval
    await pool.query(
      `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
       VALUES ($1, 'leave', 'Leave Auto-Approved', 'Your Annual Leave request has been automatically approved.', 'leave_request', $2)`,
      [req.employee.id, result.rows[0].id]
    );
  }

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

  console.log(`New leave request from employee ${req.employee.id}: ${totalDays} days of ${leaveType.code}, approval_level: ${approvalLevel}, auto_approved: ${autoApproved}`);

  res.status(201).json({
    message: autoApproved ? 'Leave request auto-approved!' : 'Leave request submitted successfully',
    request: result.rows[0],
    autoApproved
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

// Revert auto-approved leave request (AA Alive only)
router.post('/:id/revert', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await revertAutoApprovedLeave(parseInt(id), req.employee.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

// =====================================================
// SUPERVISOR/MANAGER/BOSS/DIRECTOR APPROVAL ENDPOINTS (Mimix only)
// =====================================================

/**
 * Check if employee can approve leave (supervisor, manager, boss, or director)
 */
const canApproveLeave = (employee) => {
  return isSupervisorOrManager(employee) || isBossOrDirector(employee);
};

/**
 * Get pending leave requests for supervisor/manager's team
 * Supervisors see their outlet's staff
 * Managers see all outlets they manage
 * Boss/Director sees all pending leave requests
 */
router.get('/team-pending', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor, manager, boss, or director
  if (!canApproveLeave(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor, Manager, or Director role required.' });
  }

  // Get employee's full info including role and position
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  // Only for Mimix (outlet-based companies)
  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'Team leave approval is only available for outlet-based companies.' });
  }

  // Boss/Director can see ALL outlets
  let outletIds;
  if (isBossOrDirector(employee)) {
    const allOutletsResult = await pool.query(
      'SELECT id FROM outlets WHERE company_id = $1',
      [employee.company_id]
    );
    outletIds = allOutletsResult.rows.map(r => r.id);
  } else {
    outletIds = await getManagedOutlets(employee);
  }

  if (outletIds.length === 0) {
    return res.json([]);
  }

  // Get pending leave requests from employees in managed outlets
  // Boss/Director can see ALL pending leave at any approval level
  // Supervisor sees approval_level=1, Manager sees approval_level=2
  let result;
  if (isBossOrDirector(employee)) {
    // Boss/Director sees all pending leave requests
    result = await pool.query(
      `SELECT lr.*,
              lt.code,
              lt.name as leave_type_name,
              lt.requires_attachment,
              e.name as employee_name,
              e.employee_id as emp_code,
              e.outlet_id,
              e.employee_role,
              o.name as outlet_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN outlets o ON e.outlet_id = o.id
       WHERE e.outlet_id = ANY($1)
         AND lr.status = 'pending'
       ORDER BY lr.created_at ASC`,
      [outletIds]
    );
  } else {
    // Supervisor/Manager sees based on approval level
    result = await pool.query(
      `SELECT lr.*,
              lt.code,
              lt.name as leave_type_name,
              lt.requires_attachment,
              e.name as employee_name,
              e.employee_id as emp_code,
              e.outlet_id,
              e.employee_role,
              o.name as outlet_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN outlets o ON e.outlet_id = o.id
       WHERE e.outlet_id = ANY($1)
         AND lr.status = 'pending'
         AND (
           (lr.approval_level = 1 AND $2 IN ('supervisor', 'manager'))
           OR (lr.approval_level = 2 AND $2 = 'manager')
         )
       ORDER BY lr.created_at ASC`,
      [outletIds, employee.employee_role]
    );
  }

  res.json(result.rows);
}));

/**
 * Approve leave request (supervisor/manager/boss/director)
 */
router.post('/:id/approve', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if user is supervisor, manager, boss, or director
  if (!canApproveLeave(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor, Manager, or Director role required.' });
  }

  // Get employee's full info including position
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
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
  // Boss/Director can approve for any outlet in the company
  const canApprove = isBossOrDirector(approver) || await canApproveForOutlet(approver, leaveRequest.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot approve leave for this employee' });
  }

  // Boss/Director can approve at any level and fully approve the request
  if (isBossOrDirector(approver)) {
    // Boss/Director fully approves the leave request
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
       VALUES ($1, 'leave', 'Leave Request Update', 'Your leave request has been approved by management. Pending final admin approval.', 'leave_request', $2)`,
      [leaveRequest.employee_id, id]
    );

    return res.json({ message: 'Leave approved by management. Pending final admin approval.' });
  }

  // Verify approval level matches approver's role (for supervisor/manager)
  if (leaveRequest.approval_level === 1 && !['supervisor', 'manager'].includes(approver.employee_role)) {
    return res.status(400).json({ error: 'This leave request requires supervisor or manager approval first' });
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
    if (leaveRequest.approval_level === 1) {
      // Manager approves level 1 request (bypassing supervisor) - fill both supervisor and manager fields
      await pool.query(
        `UPDATE leave_requests
         SET supervisor_id = $1, supervisor_approved = true, supervisor_approved_at = NOW(),
             manager_id = $1, manager_approved = true, manager_approved_at = NOW(),
             approval_level = 3
         WHERE id = $2`,
        [req.employee.id, id]
      );
    } else {
      // Manager approves level 2 request (normal flow)
      await pool.query(
        `UPDATE leave_requests
         SET manager_id = $1, manager_approved = true, manager_approved_at = NOW(),
             approval_level = 3
         WHERE id = $2`,
        [req.employee.id, id]
      );
    }

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
 * Reject leave request (supervisor/manager/boss/director)
 */
router.post('/:id/reject', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  // Check if user is supervisor, manager, boss, or director
  if (!canApproveLeave(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor, Manager, or Director role required.' });
  }

  // Get employee's full info including position
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
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
  // Boss/Director can reject for any outlet in the company
  const canReject = isBossOrDirector(approver) || await canApproveForOutlet(approver, leaveRequest.employee_outlet_id);
  if (!canReject) {
    return res.status(403).json({ error: 'You cannot reject leave for this employee' });
  }

  // Update leave request to rejected
  // Use manager_id (references employees) instead of approver_id (references admin_users)
  await pool.query(
    `UPDATE leave_requests
     SET status = 'rejected', rejection_reason = $1, manager_id = $2, manager_approved = false, manager_approved_at = NOW()
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
 * Get count of pending leave approvals for supervisor/manager/boss/director
 */
router.get('/team-pending-count', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor, manager, boss, or director
  if (!canApproveLeave(req.employee)) {
    return res.json({ count: 0 });
  }

  // Get employee's full info including position
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.json({ count: 0 });
  }

  // Boss/Director can see ALL outlets
  let outletIds;
  if (isBossOrDirector(employee)) {
    const allOutletsResult = await pool.query(
      'SELECT id FROM outlets WHERE company_id = $1',
      [employee.company_id]
    );
    outletIds = allOutletsResult.rows.map(r => r.id);
  } else {
    outletIds = await getManagedOutlets(employee);
  }

  if (outletIds.length === 0) {
    return res.json({ count: 0 });
  }

  let result;
  if (isBossOrDirector(employee)) {
    // Boss/Director sees all pending leave requests
    result = await pool.query(
      `SELECT COUNT(*) as count
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE e.outlet_id = ANY($1)
         AND lr.status = 'pending'`,
      [outletIds]
    );
  } else {
    // Supervisor/Manager sees based on approval level
    result = await pool.query(
      `SELECT COUNT(*) as count
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE e.outlet_id = ANY($1)
         AND lr.status = 'pending'
         AND (
           (lr.approval_level = 1 AND $2 IN ('supervisor', 'manager'))
           OR (lr.approval_level = 2 AND $2 = 'manager')
         )`,
      [outletIds, employee.employee_role]
    );
  }

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
