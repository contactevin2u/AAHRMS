/**
 * ESS Team Overview Routes
 * Comprehensive overview for supervisors/managers - all data grouped by outlet
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { isSupervisorOrManager, getManagedOutlets, isMimixCompany } = require('../../middleware/essPermissions');

/**
 * Get complete team overview with all outlets
 * Returns team, pending approvals, attendance all grouped by outlet
 * Supervisors see level 1 approvals, Managers see level 2 approvals
 */
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is manager level or above (supervisors cannot access overview)
  const role = req.employee.employee_role;
  if (role !== 'manager' && role !== 'admin' && role !== 'director') {
    return res.status(403).json({ error: 'Access denied. Manager level or above required.' });
  }

  // Get employee's company and outlet
  const empResult = await pool.query(
    'SELECT company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const companyId = empResult.rows[0]?.company_id;
  const outletId = empResult.rows[0]?.outlet_id;

  if (!isMimixCompany(companyId)) {
    return res.status(403).json({ error: 'Team overview is only available for outlet-based companies.' });
  }

  // Determine approval level based on role
  // Supervisors see level 1 approvals, Managers see level 2 approvals
  const approvalLevel = role === 'manager' ? 2 : 1;

  // Get all outlets managed by this supervisor/manager
  const employee = { ...req.employee, company_id: companyId, outlet_id: outletId };
  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json({ outlets: [], summary: { total_staff: 0, pending_leave: 0, pending_claims: 0, clocked_in_today: 0 } });
  }

  // Get outlets info
  const outletsResult = await pool.query(
    'SELECT id, name FROM outlets WHERE id = ANY($1) ORDER BY name',
    [outletIds]
  );

  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Build comprehensive data for each outlet
  const outletsData = [];
  let totalStaff = 0;
  let totalPendingLeave = 0;
  let totalPendingClaims = 0;
  let totalClockedIn = 0;

  for (const outlet of outletsResult.rows) {
    // Get employees in this outlet
    const staffResult = await pool.query(`
      SELECT e.id, e.name, e.employee_id, e.employee_role, e.position,
             p.name as position_name
      FROM employees e
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE e.outlet_id = $1 AND e.status = 'active' AND e.id != $2
      ORDER BY
        CASE e.employee_role
          WHEN 'manager' THEN 1
          WHEN 'supervisor' THEN 2
          ELSE 3
        END,
        e.name
    `, [outlet.id, req.employee.id]);

    // Get pending leave requests for this outlet at current approver's level
    const pendingLeaveResult = await pool.query(`
      SELECT lr.id, lr.start_date, lr.end_date, lr.total_days, lr.reason,
             lt.name as leave_type_name, lt.code as leave_type_code,
             e.name as employee_name, e.employee_id as emp_code
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e ON lr.employee_id = e.id
      WHERE e.outlet_id = $1
        AND lr.status = 'pending'
        AND lr.approval_level = $2
      ORDER BY lr.created_at ASC
    `, [outlet.id, approvalLevel]);

    // Get pending claims for this outlet
    const pendingClaimsResult = await pool.query(`
      SELECT c.id, c.amount, c.description, c.claim_date, c.status,
             ct.name as claim_type_name,
             e.name as employee_name, e.employee_id as emp_code
      FROM claims c
      JOIN claim_types ct ON c.claim_type_id = ct.id
      JOIN employees e ON c.employee_id = e.id
      WHERE e.outlet_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at ASC
    `, [outlet.id]);

    // Get today's attendance for this outlet
    // Combine work_date with time columns to create proper timestamps
    const attendanceResult = await pool.query(`
      SELECT cr.id,
             CASE WHEN cr.clock_in_1 IS NOT NULL
                  THEN (cr.work_date || ' ' || cr.clock_in_1)::timestamp
                  ELSE NULL END as clock_in_time,
             CASE WHEN cr.clock_out_2 IS NOT NULL
                  THEN (cr.work_date || ' ' || cr.clock_out_2)::timestamp
                  ELSE NULL END as clock_out_time,
             cr.status,
             e.name as employee_name, e.employee_id as emp_code
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      WHERE e.outlet_id = $1 AND cr.work_date = $2
      ORDER BY cr.clock_in_1 DESC
    `, [outlet.id, today]);

    // Get scheduled today but not clocked in
    const scheduledResult = await pool.query(`
      SELECT s.id, e.id as employee_id, e.name as employee_name, e.employee_id as emp_code,
             s.shift_start, s.shift_end
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN clock_in_records cr ON cr.employee_id = e.id AND cr.work_date = $1
      WHERE e.outlet_id = $2
        AND s.schedule_date = $1
        AND s.status = 'scheduled'
        AND cr.id IS NULL
        AND e.status = 'active'
      ORDER BY s.shift_start
    `, [today, outlet.id]);

    const clockedInCount = attendanceResult.rows.filter(r => r.clock_in_time && !r.clock_out_time).length;

    outletsData.push({
      id: outlet.id,
      name: outlet.name,
      staff_count: staffResult.rows.length,
      staff: staffResult.rows,
      pending_leave: pendingLeaveResult.rows,
      pending_leave_count: pendingLeaveResult.rows.length,
      pending_claims: pendingClaimsResult.rows,
      pending_claims_count: pendingClaimsResult.rows.length,
      attendance_today: attendanceResult.rows,
      clocked_in_count: clockedInCount,
      not_clocked_in: scheduledResult.rows,
      not_clocked_in_count: scheduledResult.rows.length
    });

    totalStaff += staffResult.rows.length;
    totalPendingLeave += pendingLeaveResult.rows.length;
    totalPendingClaims += pendingClaimsResult.rows.length;
    totalClockedIn += clockedInCount;
  }

  res.json({
    outlets: outletsData,
    summary: {
      total_outlets: outletsData.length,
      total_staff: totalStaff,
      pending_leave: totalPendingLeave,
      pending_claims: totalPendingClaims,
      clocked_in_today: totalClockedIn
    }
  });
}));

/**
 * Get staff list for a specific outlet
 */
router.get('/outlet/:outletId/staff', authenticateEmployee, asyncHandler(async (req, res) => {
  const { outletId } = req.params;

  // Verify manager has access to this outlet
  const employee = { ...req.employee };
  const empResult = await pool.query('SELECT company_id FROM employees WHERE id = $1', [req.employee.id]);
  employee.company_id = empResult.rows[0]?.company_id;

  const managedOutlets = await getManagedOutlets(employee);
  if (!managedOutlets.includes(parseInt(outletId))) {
    return res.status(403).json({ error: 'Access denied to this outlet.' });
  }

  const result = await pool.query(`
    SELECT e.id, e.name, e.employee_id, e.employee_role, e.position, e.status,
           e.phone, e.email, e.ic_number,
           p.name as position_name
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    WHERE e.outlet_id = $1 AND e.status = 'active'
    ORDER BY
      CASE e.employee_role
        WHEN 'manager' THEN 1
        WHEN 'supervisor' THEN 2
        ELSE 3
      END,
      e.name
  `, [outletId]);

  res.json(result.rows);
}));

/**
 * Quick Add Employee (Manager only)
 * Managers can add employees to their managed outlets
 */
router.post('/quick-add', authenticateEmployee, asyncHandler(async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { formatIC, detectIDType } = require('../../utils/statutory');

  // Check if user is manager
  const role = req.employee.employee_role;
  if (role !== 'manager' && role !== 'admin' && role !== 'director') {
    return res.status(403).json({ error: 'Access denied. Manager level or above required.' });
  }

  const { employee_id, name, ic_number, id_type: providedIdType, outlet_id, position_id } = req.body;

  // Get manager's company and managed outlets
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const companyId = empResult.rows[0]?.company_id;

  if (!isMimixCompany(companyId)) {
    return res.status(403).json({ error: 'Quick add is only available for outlet-based companies.' });
  }

  const employee = { ...req.employee, company_id: companyId };
  const managedOutlets = await getManagedOutlets(employee);

  // Validate required fields
  if (!employee_id) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!ic_number) {
    return res.status(400).json({ error: 'IC Number is required (used for login)' });
  }
  if (!outlet_id) {
    return res.status(400).json({ error: 'Outlet is required' });
  }

  // Verify manager has access to this outlet
  if (!managedOutlets.includes(parseInt(outlet_id))) {
    return res.status(403).json({ error: 'You can only add employees to outlets you manage.' });
  }

  // Check if employee_id already exists in this company
  const existingCheck = await pool.query(
    'SELECT id FROM employees WHERE employee_id = $1 AND company_id = $2',
    [employee_id, companyId]
  );
  if (existingCheck.rows.length > 0) {
    return res.status(400).json({ error: 'Employee ID already exists in this company' });
  }

  // Use provided id_type or auto-detect
  const id_type = providedIdType || detectIDType(ic_number);
  const formattedIC = id_type === 'ic' ? formatIC(ic_number) : ic_number;

  // Auto-extract date of birth and gender from IC
  let dateOfBirth = null;
  let gender = null;
  if (id_type === 'ic' && ic_number) {
    // Extract DOB: YYMMDD from IC
    const cleaned = ic_number.replace(/[-\s]/g, '');
    if (cleaned.length >= 6) {
      const yy = parseInt(cleaned.substring(0, 2));
      const mm = cleaned.substring(2, 4);
      const dd = cleaned.substring(4, 6);
      const currentYear = new Date().getFullYear() % 100;
      const century = yy > currentYear ? '19' : '20';
      dateOfBirth = `${century}${cleaned.substring(0, 2)}-${mm}-${dd}`;
    }
    // Extract gender: last digit odd = male, even = female
    if (cleaned.length >= 12) {
      const lastDigit = parseInt(cleaned.charAt(11));
      gender = lastDigit % 2 === 1 ? 'male' : 'female';
    }
  }

  // Hash IC number as initial password (without dashes)
  const cleanIC = ic_number.replace(/[-\s]/g, '');
  const passwordHash = await bcrypt.hash(cleanIC, 10);

  // Set join_date to today
  const today = new Date().toISOString().split('T')[0];

  // Insert employee with ESS enabled
  const result = await pool.query(
    `INSERT INTO employees (
      employee_id, name, ic_number, id_type, company_id, outlet_id, position_id, join_date,
      date_of_birth, gender,
      status, ess_enabled, password_hash, must_change_password,
      employment_type, probation_months, profile_completed, employee_role
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', true, $11, true, 'probation', 3, false, 'staff')
     RETURNING id, employee_id, name, ic_number, id_type, outlet_id, status, ess_enabled, date_of_birth, gender`,
    [employee_id, name, formattedIC, id_type, companyId, outlet_id, position_id || null, today, dateOfBirth, gender, passwordHash]
  );

  const newEmployee = result.rows[0];

  // Add to employee_outlets table for outlet sync
  await pool.query(
    'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [newEmployee.id, outlet_id]
  );

  res.status(201).json({
    message: `Employee ${name} created successfully. They can now login to ESS.`,
    employee: newEmployee,
    login_info: {
      employee_id: employee_id,
      initial_password: cleanIC,
      login_url: '/ess/login'
    }
  });
}));

/**
 * Get attendance report for outlet
 */
router.get('/outlet/:outletId/attendance', authenticateEmployee, asyncHandler(async (req, res) => {
  const { outletId } = req.params;
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Verify access
  const employee = { ...req.employee };
  const empResult = await pool.query('SELECT company_id FROM employees WHERE id = $1', [req.employee.id]);
  employee.company_id = empResult.rows[0]?.company_id;

  const managedOutlets = await getManagedOutlets(employee);
  if (!managedOutlets.includes(parseInt(outletId))) {
    return res.status(403).json({ error: 'Access denied to this outlet.' });
  }

  // Get all staff with their attendance for the date
  // Combine work_date with time columns to create proper timestamps
  const result = await pool.query(`
    SELECT e.id, e.name, e.employee_id, e.position,
           p.name as position_name,
           s.shift_start, s.shift_end, s.status as schedule_status,
           CASE WHEN cr.clock_in_1 IS NOT NULL
                THEN (cr.work_date || ' ' || cr.clock_in_1)::timestamp
                ELSE NULL END as clock_in_time,
           CASE WHEN cr.clock_out_2 IS NOT NULL
                THEN (cr.work_date || ' ' || cr.clock_out_2)::timestamp
                ELSE NULL END as clock_out_time,
           cr.status as attendance_status,
           cr.total_hours, cr.late_minutes, cr.ot_hours
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    LEFT JOIN schedules s ON s.employee_id = e.id AND s.schedule_date = $2
    LEFT JOIN clock_in_records cr ON cr.employee_id = e.id AND cr.work_date = $2
    WHERE e.outlet_id = $1 AND e.status = 'active'
    ORDER BY e.name
  `, [outletId, targetDate]);

  res.json({
    date: targetDate,
    attendance: result.rows
  });
}));

module.exports = router;
