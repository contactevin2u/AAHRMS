const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter, isSuperAdmin, getOutletFilter, isSupervisor } = require('../middleware/tenant');
const { initializeLeaveBalances } = require('../utils/leaveProration');
const { initializeProbation } = require('../utils/probationReminder');
const { sanitizeEmployeeData, escapeHtml } = require('../middleware/sanitize');
const { formatIC, detectIDType } = require('../utils/statutory');

/**
 * Extract date of birth from Malaysian IC number
 * IC format: YYMMDD-PB-XXXX
 * @param {string} icNumber - IC number with or without dashes
 * @returns {string|null} Date in YYYY-MM-DD format or null
 */
const extractDOBFromIC = (icNumber) => {
  if (!icNumber) return null;
  const cleaned = icNumber.replace(/[-\s]/g, '');
  if (cleaned.length < 6) return null;

  const yy = parseInt(cleaned.substring(0, 2));
  const mm = cleaned.substring(2, 4);
  const dd = cleaned.substring(4, 6);

  // Determine century: if YY > current year's last 2 digits, assume 1900s
  const currentYear = new Date().getFullYear() % 100;
  const century = yy > currentYear ? '19' : '20';
  const yyyy = century + cleaned.substring(0, 2);

  // Validate month and day
  const month = parseInt(mm);
  const day = parseInt(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Extract gender from Malaysian IC number
 * Last digit: odd = male, even = female
 * @param {string} icNumber - IC number with or without dashes
 * @returns {string|null} 'male' or 'female' or null
 */
const extractGenderFromIC = (icNumber) => {
  if (!icNumber) return null;
  const cleaned = icNumber.replace(/[-\s]/g, '');
  if (cleaned.length < 12) return null;

  const lastDigit = parseInt(cleaned.charAt(11));
  return lastDigit % 2 === 1 ? 'male' : 'female';
};

/**
 * Get Mimix salary configuration based on position role, work type, and employment status
 * @param {number} companyId - Company ID (should be Mimix = 3)
 * @param {string} positionRole - Position role (supervisor, crew, manager)
 * @param {string} workType - Work type (full_time, part_time)
 * @param {string} employmentType - Employment type (probation, confirmed)
 * @returns {Object|null} Salary config { basic_salary, hourly_rate, salary_after_confirmation }
 */
const getMimixSalaryConfig = async (companyId, positionRole, workType, employmentType) => {
  try {
    // Check if this is Mimix company
    const companyCheck = await pool.query(
      "SELECT id FROM companies WHERE id = $1 AND (code = 'MIMIX' OR name LIKE '%Mimix%')",
      [companyId]
    );
    if (companyCheck.rows.length === 0) return null;

    // Try to get from mimix_salary_config table
    const result = await pool.query(`
      SELECT basic_salary, hourly_rate
      FROM mimix_salary_config
      WHERE company_id = $1
        AND position_role = $2
        AND work_type = $3
        AND (employment_type = $4 OR employment_type IS NULL)
      ORDER BY employment_type NULLS LAST
      LIMIT 1
    `, [companyId, positionRole || 'crew', workType || 'full_time', employmentType]);

    if (result.rows.length > 0) {
      const config = result.rows[0];

      // For full-time crew, also get the confirmed salary for salary_after_confirmation
      if (workType === 'full_time' && employmentType === 'probation' && positionRole === 'crew') {
        const confirmedResult = await pool.query(`
          SELECT basic_salary FROM mimix_salary_config
          WHERE company_id = $1 AND position_role = 'crew'
            AND work_type = 'full_time' AND employment_type = 'confirmed'
        `, [companyId]);
        if (confirmedResult.rows.length > 0) {
          config.salary_after_confirmation = parseFloat(confirmedResult.rows[0].basic_salary);
        }
      }

      return {
        basic_salary: parseFloat(config.basic_salary) || 0,
        hourly_rate: parseFloat(config.hourly_rate) || 0,
        salary_after_confirmation: config.salary_after_confirmation || parseFloat(config.basic_salary) || 0
      };
    }

    // Default values if no config found
    if (workType === 'PART TIMER' || workType === 'part_time') {
      return { basic_salary: 0, hourly_rate: 8.72, salary_after_confirmation: 0 };
    }

    if (positionRole === 'supervisor' || positionRole === 'manager') {
      return { basic_salary: 2000, hourly_rate: 0, salary_after_confirmation: 2000 };
    }

    // Default for crew
    return employmentType === 'probation'
      ? { basic_salary: 1700, hourly_rate: 0, salary_after_confirmation: 1800 }
      : { basic_salary: 1800, hourly_rate: 0, salary_after_confirmation: 1800 };
  } catch (err) {
    console.error('Error getting Mimix salary config:', err);
    return null;
  }
};

/**
 * Check if a position is Manager level or above (should NOT have outlet_id)
 * Positions at level >= 80 (manager, director, admin) should have outlet_id = NULL
 */
const isManagerOrAbove = async (positionId, positionName, employeeRole) => {
  const managerRoles = ['manager', 'director', 'admin', 'boss', 'super_admin'];

  // Check employee_role directly
  if (employeeRole && managerRoles.some(r => employeeRole.toLowerCase().includes(r))) {
    return true;
  }

  // Check position name for keywords
  if (positionName) {
    const lowerName = positionName.toLowerCase();
    if (managerRoles.some(role => lowerName.includes(role))) {
      return true;
    }
  }

  // Check position_id linking to positions table
  if (positionId) {
    try {
      const posResult = await pool.query(
        'SELECT role FROM positions WHERE id = $1',
        [positionId]
      );
      if (posResult.rows.length > 0) {
        const role = posResult.rows[0].role?.toLowerCase();
        if (role && managerRoles.some(r => role.includes(r))) {
          return true;
        }
      }
    } catch (err) {
      console.error('Error checking position role for manager:', err);
    }
  }

  return false;
};

/**
 * Check if a position requires confirmed employment status
 * Positions at level >= 40 (assistant supervisor and above) should have employment_type = 'confirmed'
 * This includes: assistant supervisor (40), supervisor (60), manager (80), director (90), admin/boss (100)
 */
/**
 * Get employee_role based on position's role field
 * Maps: crew -> staff, supervisor -> supervisor, manager -> manager
 * @param {number} positionId - The position ID to look up
 * @returns {Promise<string|null>} The mapped employee_role or null if not found
 */
const getEmployeeRoleFromPosition = async (positionId) => {
  if (!positionId) return null;

  try {
    const result = await pool.query(
      'SELECT role FROM positions WHERE id = $1',
      [positionId]
    );

    if (result.rows.length === 0) return null;

    const positionRole = result.rows[0].role?.toLowerCase();

    // Map position role to employee_role
    const roleMapping = {
      'crew': 'staff',
      'supervisor': 'supervisor',
      'manager': 'manager'
    };

    return roleMapping[positionRole] || 'staff';
  } catch (err) {
    console.error('Error getting employee role from position:', err);
    return null;
  }
};

const isHighLevelPosition = async (positionId, positionName, employeeRole) => {
  // High-level roles that should be auto-confirmed (level >= 40)
  const highLevelRoles = ['assistant supervisor', 'assistant_supervisor', 'asst supervisor', 'asst. supervisor',
                          'supervisor', 'manager', 'director', 'admin', 'boss', 'super_admin'];

  // Check employee_role directly
  if (employeeRole && highLevelRoles.includes(employeeRole.toLowerCase())) {
    return true;
  }

  // Check position name for keywords
  if (positionName) {
    const lowerName = positionName.toLowerCase();
    // Check for assistant supervisor first (includes 'supervisor' keyword)
    if (lowerName.includes('supervisor') ||
        lowerName.includes('manager') ||
        lowerName.includes('director') ||
        lowerName.includes('admin') ||
        lowerName.includes('boss')) {
      return true;
    }
  }

  // Check position_id linking to positions table
  if (positionId) {
    const posResult = await pool.query(
      'SELECT role FROM positions WHERE id = $1',
      [positionId]
    );
    if (posResult.rows.length > 0) {
      const role = posResult.rows[0].role;
      if (role && ['manager', 'supervisor', 'admin', 'director', 'assistant supervisor', 'assistant_supervisor'].includes(role.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
};

// Get all employees (filtered by company and outlet for supervisors)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, status, search, employment_type, probation_status, outlet_id } = req.query;
    const companyId = getCompanyFilter(req);
    const outletId = getOutletFilter(req);

    let query = `
      SELECT e.*, d.name as department_name, d.payroll_structure_code, o.name as outlet_name,
             p.name as position_name, p.role as position_role
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Company filter (skip for super_admin viewing all)
    if (companyId !== null) {
      paramCount++;
      query += ` AND e.company_id = $${paramCount}`;
      params.push(companyId);
    }

    // Outlet filter (for supervisors - they can ONLY see their outlet)
    if (outletId !== null) {
      paramCount++;
      query += ` AND e.outlet_id = $${paramCount}`;
      params.push(outletId);
    } else if (outlet_id) {
      // Allow admins to filter by specific outlet via query param
      paramCount++;
      query += ` AND e.outlet_id = $${paramCount}`;
      params.push(outlet_id);
    }

    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (status) {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      query += ` AND (e.name ILIKE $${paramCount} OR e.employee_id ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Filter by employment type (probation, confirmed, contract)
    if (employment_type) {
      paramCount++;
      query += ` AND e.employment_type = $${paramCount}`;
      params.push(employment_type);
    }

    // Filter by probation status (ongoing, pending_review, confirmed, extended)
    if (probation_status) {
      paramCount++;
      query += ` AND e.probation_status = $${paramCount}`;
      params.push(probation_status);
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get single employee (with company check)
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT e.*, d.name as department_name, d.payroll_structure_code
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = $1
    `;
    const params = [id];

    // Company filter (skip for super_admin viewing all)
    if (companyId !== null) {
      query += ` AND e.company_id = $2`;
      params.push(companyId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Create employee (with company_id)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    // Sanitize text inputs to prevent XSS
    const sanitizedBody = sanitizeEmployeeData(req.body);

    const {
      employee_id, name, email, phone, ic_number, department_id, outlet_id, position, position_id, join_date,
      address, bank_name, bank_account_no, bank_account_holder,
      epf_number, socso_number, tax_number, epf_contribution_type,
      marital_status, spouse_working, children_count, date_of_birth,
      // Default salary fields
      default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
      // Additional earning fields
      default_bonus, default_incentive,
      // Hourly rate for part-time
      hourly_rate,
      // Work type (full_time or part_time)
      work_type,
      // Probation fields
      employment_type, probation_months, salary_before_confirmation, salary_after_confirmation, increment_amount,
      // Multi-outlet for managers
      additional_outlet_ids
    } = { ...req.body, ...sanitizedBody };

    // Helper function to convert empty strings to null for integer and date fields
    const toNullable = (val) => (val === '' || val === undefined || val === null) ? null : val;

    // Get company_id from authenticated user - REQUIRED for tenant isolation
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required. Please select a company.' });
    }

    // Validate required fields for employee creation
    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    if (!ic_number) {
      return res.status(400).json({ error: 'IC Number is required (for employee login)' });
    }
    if (!toNullable(department_id) && !toNullable(outlet_id)) {
      return res.status(400).json({ error: 'Department or Outlet is required' });
    }
    if (!join_date) {
      return res.status(400).json({ error: 'Join Date is required' });
    }

    // Auto-detect and format IC number
    let id_type = req.body.id_type;
    let formattedIC = ic_number;

    if (!id_type) {
      // Auto-detect if not provided
      id_type = detectIDType(ic_number);
    }

    if (id_type === 'ic') {
      // Format IC with dashes: yymmddxxxxxx -> yymmdd-xx-xxxx
      formattedIC = formatIC(ic_number);
    }

    // Auto-extract date of birth and gender from IC if not provided
    let finalDateOfBirth = date_of_birth;
    let finalGender = req.body.gender;
    if (id_type === 'ic' && ic_number) {
      if (!finalDateOfBirth) {
        finalDateOfBirth = extractDOBFromIC(ic_number);
      }
      if (!finalGender) {
        finalGender = extractGenderFromIC(ic_number);
      }
    }

    // Hash IC number as initial password (employee will change on first login)
    const cleanIC = ic_number.replace(/[-\s]/g, '');
    const passwordHash = await bcrypt.hash(cleanIC, 10);

    // Calculate probation end date if join_date and probation_months are provided
    let probation_end_date = null;
    let empType = employment_type || 'probation';
    const probMonths = probation_months || 3;

    // Check if this is a high-level position (supervisor, manager, director)
    // If so, auto-set employment_type to 'confirmed'
    const isHighLevel = await isHighLevelPosition(toNullable(position_id), position, null);
    if (isHighLevel) {
      empType = 'confirmed';
    }

    // Check if this is a manager or above - if so, outlet_id should be NULL
    let finalOutletId = toNullable(outlet_id);
    const isManager = await isManagerOrAbove(toNullable(position_id), position, null);
    if (isManager) {
      finalOutletId = null;
    }

    if (join_date && empType === 'probation') {
      const joinDateObj = new Date(join_date);
      joinDateObj.setMonth(joinDateObj.getMonth() + probMonths);
      probation_end_date = joinDateObj.toISOString().split('T')[0];
    }

    // Determine work type (full_time or PART TIMER)
    const finalWorkType = work_type || 'full_time';

    // Get position role and name for salary lookup and auto-sync
    let positionRole = 'crew';
    let finalPosition = position; // Auto-sync position text from position_id if not provided
    if (toNullable(position_id)) {
      const posResult = await pool.query('SELECT name, role FROM positions WHERE id = $1', [position_id]);
      if (posResult.rows.length > 0) {
        positionRole = posResult.rows[0].role || 'crew';
        // Auto-set position text from position_id if not provided
        if (!finalPosition) {
          finalPosition = posResult.rows[0].name;
        }
      }
    } else if (position) {
      const lowerPos = position.toLowerCase();
      if (lowerPos.includes('manager')) positionRole = 'manager';
      else if (lowerPos.includes('supervisor')) positionRole = 'supervisor';
    }

    // Auto-set Mimix salary if not explicitly provided
    let finalBasicSalary = default_basic_salary;
    let finalHourlyRate = hourly_rate;
    let finalSalaryBefore = salary_before_confirmation;
    let finalSalaryAfter = salary_after_confirmation;

    // Only auto-set if salary fields are not provided
    if (!default_basic_salary && !hourly_rate) {
      const mimixConfig = await getMimixSalaryConfig(companyId, positionRole, finalWorkType, empType);
      if (mimixConfig) {
        finalBasicSalary = mimixConfig.basic_salary;
        finalHourlyRate = mimixConfig.hourly_rate;
        if (!finalSalaryAfter) {
          finalSalaryAfter = mimixConfig.salary_after_confirmation;
        }
        if (!finalSalaryBefore && empType === 'probation') {
          finalSalaryBefore = mimixConfig.basic_salary;
        }
        console.log('[Employee Create] Applied Mimix salary config:', {
          companyId, positionRole, workType: finalWorkType, empType,
          basic_salary: finalBasicSalary, hourly_rate: finalHourlyRate
        });
      }
    }

    // Calculate increment amount if both salaries provided
    let calcIncrement = increment_amount;
    if (!calcIncrement && finalSalaryBefore && finalSalaryAfter) {
      calcIncrement = parseFloat(finalSalaryAfter) - parseFloat(finalSalaryBefore);
    }

    const result = await pool.query(
      `INSERT INTO employees (
        employee_id, name, email, phone, ic_number, id_type, department_id, outlet_id, position, position_id, join_date,
        address, bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth, gender,
        default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
        default_bonus, default_incentive, hourly_rate, work_type,
        employment_type, probation_months, probation_end_date, probation_status,
        salary_before_confirmation, salary_after_confirmation, increment_amount,
        company_id, profile_completed, password_hash, must_change_password
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45)
       RETURNING *`,
      [
        employee_id, toNullable(name), toNullable(email), toNullable(phone), formattedIC, id_type, toNullable(department_id), finalOutletId, toNullable(finalPosition), toNullable(position_id), join_date,
        toNullable(address), toNullable(bank_name), toNullable(bank_account_no), toNullable(bank_account_holder),
        toNullable(epf_number), toNullable(socso_number), toNullable(tax_number), epf_contribution_type || 'normal',
        marital_status || 'single', spouse_working || false, children_count || 0, toNullable(finalDateOfBirth), toNullable(finalGender),
        finalBasicSalary || 0, default_allowance || 0, commission_rate || 0, per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, default_incentive || 0, finalHourlyRate || 0, finalWorkType,
        empType, probMonths, probation_end_date, empType === 'confirmed' ? 'confirmed' : 'ongoing',
        toNullable(finalSalaryBefore), toNullable(finalSalaryAfter), toNullable(calcIncrement),
        companyId, false, passwordHash, true
      ]
    );

    const newEmployee = result.rows[0];

    // Add primary outlet to employee_outlets table
    if (finalOutletId) {
      await pool.query(
        'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newEmployee.id, finalOutletId]
      );
    }

    // If multi-outlet manager, add additional outlet assignments
    if (additional_outlet_ids && Array.isArray(additional_outlet_ids) && additional_outlet_ids.length > 0) {
      for (const addOutletId of additional_outlet_ids) {
        await pool.query(
          'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newEmployee.id, addOutletId]
        );
      }
    }

    // Initialize leave balances for the new employee (with proration for mid-year joiners)
    if (join_date) {
      try {
        await initializeLeaveBalances(newEmployee.id, companyId, join_date);
      } catch (leaveError) {
        console.error('Error initializing leave balances:', leaveError);
        // Don't fail employee creation if leave init fails
      }

      // Initialize probation tracking if on probation
      if (empType === 'probation') {
        try {
          await initializeProbation(newEmployee.id, companyId, join_date, probMonths);
        } catch (probError) {
          console.error('Error initializing probation tracking:', probError);
          // Don't fail employee creation if probation init fails
        }
      }
    }

    res.status(201).json(newEmployee);
  } catch (error) {
    console.error('Error creating employee:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Update employee
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Sanitize text inputs to prevent XSS
    const sanitizedBody = sanitizeEmployeeData(req.body);

    const {
      employee_id, name, email, phone, ic_number, department_id, outlet_id, position, position_id, join_date, status,
      address, bank_name, bank_account_no, bank_account_holder,
      epf_number, socso_number, tax_number, epf_contribution_type,
      marital_status, spouse_working, children_count, date_of_birth,
      // Default salary fields
      default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
      // Additional earning fields
      default_bonus, default_incentive,
      // Probation fields
      employment_type, probation_months, salary_before_confirmation, salary_after_confirmation, increment_amount,
      probation_notes
    } = { ...req.body, ...sanitizedBody };

    // Helper function to convert empty strings to null for integer and date fields
    const toNullable = (val) => (val === '' || val === undefined || val === null) ? null : val;

    // Get current employee data to check if we need to recalculate probation_end_date
    const currentEmp = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (currentEmp.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const current = currentEmp.rows[0];

    // Auto-detect and format IC number if provided
    let id_type = req.body.id_type;
    let formattedIC = ic_number;

    if (ic_number) {
      if (!id_type) {
        // Auto-detect if not provided
        id_type = detectIDType(ic_number);
      }

      if (id_type === 'ic') {
        // Format IC with dashes: yymmddxxxxxx -> yymmdd-xx-xxxx
        formattedIC = formatIC(ic_number);
      }
    } else {
      // Keep existing values if IC not being updated
      formattedIC = current.ic_number;
      id_type = current.id_type || 'ic';
    }

    // Auto-extract date of birth and gender from IC if IC is being updated and DOB/gender not provided
    let finalDateOfBirth = date_of_birth;
    let finalGender = req.body.gender;
    if (ic_number && id_type === 'ic') {
      // Only auto-extract if not explicitly provided
      if (finalDateOfBirth === undefined || finalDateOfBirth === null || finalDateOfBirth === '') {
        finalDateOfBirth = extractDOBFromIC(ic_number);
      }
      if (finalGender === undefined || finalGender === null || finalGender === '') {
        finalGender = extractGenderFromIC(ic_number);
      }
    }
    // Keep existing values if not being updated
    if (finalDateOfBirth === undefined) {
      finalDateOfBirth = current.date_of_birth;
    }
    if (finalGender === undefined) {
      finalGender = current.gender;
    }

    // Calculate probation end date if join_date or probation_months changed
    let probation_end_date = current.probation_end_date;
    const newJoinDate = join_date || current.join_date;
    const newProbMonths = probation_months !== undefined ? probation_months : (current.probation_months || 3);
    let newEmpType = employment_type || current.employment_type || 'probation';

    // Check if this is a high-level position (supervisor, manager, director)
    // If so, auto-set employment_type to 'confirmed'
    const isHighLevel = await isHighLevelPosition(toNullable(position_id) || current.position_id, position || current.position, null);
    if (isHighLevel) {
      newEmpType = 'confirmed';
    }

    // Check if this is a manager or above - if so, outlet_id should be NULL
    let finalOutletId = outlet_id !== undefined ? toNullable(outlet_id) : current.outlet_id;
    const isManager = await isManagerOrAbove(toNullable(position_id) || current.position_id, position || current.position, null);
    if (isManager) {
      finalOutletId = null;
    }

    // Auto-sync employee_role and position text when position_id changes
    const newPositionId = toNullable(position_id);
    let finalEmployeeRole = req.body.employee_role || current.employee_role || 'staff';
    let finalPosition = position; // Auto-sync position text from position_id
    if (newPositionId && newPositionId !== current.position_id) {
      const mappedRole = await getEmployeeRoleFromPosition(newPositionId);
      if (mappedRole) {
        finalEmployeeRole = mappedRole;
      }
      // Auto-sync position text from position_id if position not explicitly provided
      if (!finalPosition) {
        const posResult = await pool.query('SELECT name FROM positions WHERE id = $1', [newPositionId]);
        if (posResult.rows.length > 0) {
          finalPosition = posResult.rows[0].name;
        }
      }
    }
    // Keep existing position if not being updated
    if (finalPosition === undefined) {
      finalPosition = current.position;
    }

    // Recalculate if still on probation and dates/months changed
    if (newEmpType === 'probation' && newJoinDate) {
      const joinDateObj = new Date(newJoinDate);
      joinDateObj.setMonth(joinDateObj.getMonth() + newProbMonths);
      probation_end_date = joinDateObj.toISOString().split('T')[0];
    }

    // Calculate increment amount if both salaries provided
    let calcIncrement = increment_amount;
    if (calcIncrement === undefined && salary_before_confirmation && salary_after_confirmation) {
      calcIncrement = parseFloat(salary_after_confirmation) - parseFloat(salary_before_confirmation);
    }

    // Determine probation_status based on employment_type
    const newProbationStatus = newEmpType === 'confirmed' ? 'confirmed' : (current.probation_status || 'ongoing');

    const result = await pool.query(
      `UPDATE employees
       SET employee_id = $1, name = $2, email = $3, phone = $4, ic_number = $5, id_type = $6,
           department_id = $7, outlet_id = $8, position = $9, position_id = $10, join_date = $11, status = $12,
           address = $13, bank_name = $14, bank_account_no = $15, bank_account_holder = $16,
           epf_number = $17, socso_number = $18, tax_number = $19, epf_contribution_type = $20,
           marital_status = $21, spouse_working = $22, children_count = $23, date_of_birth = $24, gender = $25,
           default_basic_salary = $26, default_allowance = $27, commission_rate = $28,
           per_trip_rate = $29, ot_rate = $30, outstation_rate = $31,
           default_bonus = $32, default_incentive = $33,
           employment_type = $34, probation_months = $35, probation_end_date = $36,
           salary_before_confirmation = $37, salary_after_confirmation = $38, increment_amount = $39,
           probation_notes = $40, probation_status = $41, employee_role = $42,
           updated_at = NOW()
       WHERE id = $43
       RETURNING *`,
      [
        employee_id, name, toNullable(email), toNullable(phone), formattedIC, id_type, toNullable(department_id), finalOutletId, toNullable(finalPosition), toNullable(position_id), toNullable(join_date), status,
        toNullable(address), toNullable(bank_name), toNullable(bank_account_no), toNullable(bank_account_holder),
        toNullable(epf_number), toNullable(socso_number), toNullable(tax_number), epf_contribution_type || 'normal',
        marital_status || 'single', spouse_working || false, children_count || 0, toNullable(finalDateOfBirth), toNullable(finalGender),
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0,
        per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, default_incentive || 0,
        newEmpType, newProbMonths, probation_end_date,
        toNullable(salary_before_confirmation), toNullable(salary_after_confirmation), toNullable(calcIncrement),
        toNullable(probation_notes), newProbationStatus, finalEmployeeRole, id
      ]
    );

    // Sync employee_outlets when outlet_id changes
    if (finalOutletId && finalOutletId !== current.outlet_id) {
      // Remove old outlet assignment if it was primary
      if (current.outlet_id) {
        await pool.query(
          'DELETE FROM employee_outlets WHERE employee_id = $1 AND outlet_id = $2',
          [id, current.outlet_id]
        );
      }
      // Add new outlet assignment
      await pool.query(
        'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, finalOutletId]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// PATCH - Partial update (for inline editing)
router.patch('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Allowed fields for partial update
    const allowedFields = [
      'employee_id', 'outlet_id', 'position_id', 'position', 'employment_type', 'status',
      'department_id', 'name', 'email', 'phone', 'address', 'gender', 'clock_in_required',
      'employee_role'
    ];

    // Build dynamic SET clause
    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        // Convert empty string to null for foreign keys
        if (['outlet_id', 'position_id', 'department_id'].includes(key)) {
          values.push(value === '' ? null : value);
        } else {
          values.push(value);
        }
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Check if position_id, position, or employee_role is being updated
    // If it's a high-level position, auto-set employment_type to 'confirmed'
    const positionId = updates.position_id !== undefined ? (updates.position_id === '' ? null : updates.position_id) : null;
    const positionName = updates.position || null;
    const employeeRole = updates.employee_role || null;

    if (positionId || positionName || employeeRole) {
      const isHighLevel = await isHighLevelPosition(positionId, positionName, employeeRole);
      if (isHighLevel) {
        // Add employment_type and probation_status to the update
        setClauses.push(`employment_type = $${paramCount}`);
        values.push('confirmed');
        paramCount++;
        setClauses.push(`probation_status = $${paramCount}`);
        values.push('confirmed');
        paramCount++;
      }

      // Check if this is a manager or above - if so, outlet_id should be NULL
      const isManager = await isManagerOrAbove(positionId, positionName, employeeRole);
      if (isManager) {
        setClauses.push(`outlet_id = $${paramCount}`);
        values.push(null);
        paramCount++;
      }
    }

    // Auto-sync employee_role when position_id changes (and employee_role not explicitly set)
    if (positionId && !updates.employee_role) {
      const mappedRole = await getEmployeeRoleFromPosition(positionId);
      if (mappedRole) {
        setClauses.push(`employee_role = $${paramCount}`);
        values.push(mappedRole);
        paramCount++;
      }
    }

    // Auto-sync position text when position_id changes (and position not explicitly set)
    if (positionId && !updates.position) {
      const posResult = await pool.query('SELECT name FROM positions WHERE id = $1', [positionId]);
      if (posResult.rows.length > 0) {
        setClauses.push(`position = $${paramCount}`);
        values.push(posResult.rows[0].name);
        paramCount++;
      }
    }

    // Add updated_at
    setClauses.push(`updated_at = NOW()`);

    // Add id as last parameter
    values.push(id);

    const query = `
      UPDATE employees
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Sync employee_outlets when outlet_id changes
    if (updates.outlet_id !== undefined && updates.outlet_id) {
      const newOutletId = updates.outlet_id === '' ? null : parseInt(updates.outlet_id);
      if (newOutletId) {
        await pool.query(
          'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, newOutletId]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee (PATCH):', error);
    // Check for unique constraint violation
    if (error.code === '23505') {
      if (error.constraint?.includes('employee_id')) {
        return res.status(400).json({ error: 'Employee ID already exists' });
      }
      return res.status(400).json({ error: 'Duplicate value not allowed' });
    }
    res.status(500).json({ error: 'Failed to update employee', details: error.message });
  }
});

// Delete employee (soft delete - change status to inactive)
// Only Super Admin and Owner roles can delete employees
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user has delete permission (Super Admin or Owner only)
    const adminRole = req.admin?.role;
    const allowedRoles = ['super_admin', 'owner', 'admin'];

    if (!allowedRoles.includes(adminRole)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only Super Admin, Owner, or Admin can delete/deactivate employees'
      });
    }

    // Get company filter for tenant isolation
    const companyId = getCompanyFilter(req);

    let query = `UPDATE employees SET status = 'inactive', updated_at = NOW() WHERE id = $1`;
    let params = [id];

    // Non-super-admin can only delete employees from their company
    if (companyId !== null) {
      query += ` AND company_id = $2`;
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deactivated successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Reset employee password (admin only)
router.post('/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    // Get employee details
    let query = 'SELECT id, employee_id, name, ic_number, company_id FROM employees WHERE id = $1';
    const params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    const empResult = await pool.query(query, params);

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empResult.rows[0];

    // IC number is required for password reset
    if (!employee.ic_number) {
      return res.status(400).json({
        error: 'Cannot reset password: Employee has no IC number on record'
      });
    }

    // Remove dashes from IC number to use as password
    const newPassword = employee.ic_number.replace(/-/g, '');
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and set must_change_password flag
    await pool.query(
      `UPDATE employees
       SET password_hash = $1, must_change_password = true, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, id]
    );

    res.json({
      message: `Password reset successfully for ${employee.name}. New password is their IC number (without dashes).`,
      employee_id: employee.employee_id,
      name: employee.name
    });
  } catch (error) {
    console.error('Error resetting employee password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Update employee role and reporting structure
router.put('/:id/role', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_role, reports_to } = req.body;

    // Validate role
    const validRoles = ['staff', 'supervisor', 'manager', 'director'];
    if (employee_role && !validRoles.includes(employee_role)) {
      return res.status(400).json({
        error: 'Invalid role',
        valid_roles: validRoles
      });
    }

    const result = await pool.query(
      `UPDATE employees
       SET employee_role = COALESCE($1, employee_role),
           reports_to = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, employee_id, name, employee_role, reports_to`,
      [employee_role, reports_to, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({
      message: 'Employee role updated',
      employee: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating employee role:', error);
    res.status(500).json({ error: 'Failed to update employee role' });
  }
});

// =====================================================
// MANAGER OUTLET ASSIGNMENT ENDPOINTS
// =====================================================

// Get manager's assigned outlets
router.get('/:id/outlets', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    // Verify employee exists and is a manager
    let empQuery = 'SELECT id, name, employee_role, company_id FROM employees WHERE id = $1';
    const empParams = [id];

    if (companyId !== null) {
      empQuery += ' AND company_id = $2';
      empParams.push(companyId);
    }

    const empResult = await pool.query(empQuery, empParams);

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empResult.rows[0];

    // Get assigned outlets from employee_outlets junction table
    const outletsResult = await pool.query(`
      SELECT o.id, o.name, o.address, eo.created_at as assigned_at
      FROM employee_outlets eo
      JOIN outlets o ON eo.outlet_id = o.id
      WHERE eo.employee_id = $1
      ORDER BY o.name
    `, [id]);

    res.json({
      employee_id: employee.id,
      employee_name: employee.name,
      employee_role: employee.employee_role,
      outlets: outletsResult.rows
    });
  } catch (error) {
    console.error('Error fetching employee outlets:', error);
    res.status(500).json({ error: 'Failed to fetch employee outlets' });
  }
});

// Update manager's assigned outlets
router.put('/:id/outlets', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { outlet_ids } = req.body;
    const companyId = getCompanyFilter(req);

    if (!outlet_ids || !Array.isArray(outlet_ids)) {
      return res.status(400).json({ error: 'outlet_ids must be an array' });
    }

    // Verify employee exists
    let empQuery = 'SELECT id, name, employee_role, company_id FROM employees WHERE id = $1';
    const empParams = [id];

    if (companyId !== null) {
      empQuery += ' AND company_id = $2';
      empParams.push(companyId);
    }

    const empResult = await pool.query(empQuery, empParams);

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empResult.rows[0];

    // Verify all outlet_ids belong to the same company
    if (outlet_ids.length > 0) {
      const outletCheck = await pool.query(
        'SELECT id FROM outlets WHERE id = ANY($1) AND company_id = $2',
        [outlet_ids, employee.company_id]
      );

      if (outletCheck.rows.length !== outlet_ids.length) {
        return res.status(400).json({ error: 'Some outlets do not exist or belong to a different company' });
      }
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove all existing outlet assignments for this employee
      await client.query('DELETE FROM employee_outlets WHERE employee_id = $1', [id]);

      // Add new outlet assignments
      for (const outletId of outlet_ids) {
        await client.query(
          'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2)',
          [id, outletId]
        );
      }

      // If employee is a manager, set outlet_id to NULL (managers don't have a single outlet)
      if (['manager', 'supervisor'].includes(employee.employee_role)) {
        await client.query(
          'UPDATE employees SET outlet_id = NULL WHERE id = $1',
          [id]
        );
      }

      await client.query('COMMIT');

      // Fetch updated outlet assignments
      const updatedOutlets = await pool.query(`
        SELECT o.id, o.name, o.address
        FROM employee_outlets eo
        JOIN outlets o ON eo.outlet_id = o.id
        WHERE eo.employee_id = $1
        ORDER BY o.name
      `, [id]);

      res.json({
        message: 'Outlet assignments updated successfully',
        employee_id: id,
        employee_name: employee.name,
        outlets: updatedOutlets.rows
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating employee outlets:', error);
    res.status(500).json({ error: 'Failed to update employee outlets' });
  }
});

// Get employees by role (for dropdowns)
router.get('/by-role/:role', authenticateAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT id, employee_id, name, employee_role, department_id
      FROM employees
      WHERE employee_role = $1 AND status = 'active'
    `;
    const params = [role];

    if (companyId !== null) {
      query += ` AND company_id = $2`;
      params.push(companyId);
    }

    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees by role:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Bulk update employee roles
router.put('/bulk-role', authenticateAdmin, async (req, res) => {
  try {
    const { employee_ids, employee_role, reports_to } = req.body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ error: 'No employees selected' });
    }

    const validRoles = ['staff', 'supervisor', 'manager', 'director'];
    if (employee_role && !validRoles.includes(employee_role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const result = await pool.query(
      `UPDATE employees
       SET employee_role = COALESCE($1, employee_role),
           reports_to = COALESCE($2, reports_to),
           updated_at = NOW()
       WHERE id = ANY($3)
       RETURNING id`,
      [employee_role, reports_to, employee_ids]
    );

    res.json({
      message: `Updated ${result.rowCount} employees`,
      updated: result.rowCount
    });
  } catch (error) {
    console.error('Error bulk updating roles:', error);
    res.status(500).json({ error: 'Failed to update roles' });
  }
});

// Bulk import employees
router.post('/bulk-import', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { employees } = req.body;

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'No employees data provided' });
    }

    // Get all departments for mapping
    const deptResult = await client.query('SELECT id, name FROM departments');
    const departmentMap = {};
    deptResult.rows.forEach(d => {
      departmentMap[d.name.toLowerCase()] = d.id;
    });

    await client.query('BEGIN');

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header)

      try {
        // Validate required fields
        const missingFields = [];
        if (!emp.employee_id) missingFields.push('Employee ID');
        if (!emp.name) missingFields.push('Name');
        if (!emp.department) missingFields.push('Department');
        if (!emp.ic_number) missingFields.push('IC Number');
        if (!emp.default_basic_salary && emp.default_basic_salary !== 0) missingFields.push('Basic Salary');

        if (missingFields.length > 0) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: Missing required fields: ${missingFields.join(', ')}`);
          continue;
        }

        // Map department name to ID
        let departmentId = null;
        if (emp.department) {
          departmentId = departmentMap[emp.department.toLowerCase()];
          if (!departmentId) {
            results.failed++;
            results.errors.push(`Row ${rowNum}: Department "${emp.department}" not found. Valid departments: ${Object.keys(departmentMap).join(', ')}`);
            continue;
          }
        }

        // Parse join_date if provided
        let joinDate = null;
        if (emp.join_date) {
          joinDate = new Date(emp.join_date);
          if (isNaN(joinDate.getTime())) {
            joinDate = null;
          }
        }

        // Check if employee_id already exists
        const existingEmp = await client.query(
          'SELECT id FROM employees WHERE employee_id = $1',
          [emp.employee_id]
        );

        // Parse date_of_birth if provided
        let dateOfBirth = null;
        if (emp.date_of_birth) {
          dateOfBirth = new Date(emp.date_of_birth);
          if (isNaN(dateOfBirth.getTime())) {
            dateOfBirth = null;
          }
        }

        if (existingEmp.rows.length > 0) {
          // Update existing employee
          await client.query(
            `UPDATE employees SET
              name = $1, email = $2, phone = $3, ic_number = $4,
              department_id = $5, position = $6, join_date = $7,
              address = COALESCE($8, address),
              bank_name = $9, bank_account_no = $10, bank_account_holder = $11,
              status = COALESCE($12, status),
              epf_number = COALESCE($13, epf_number),
              socso_number = COALESCE($14, socso_number),
              tax_number = COALESCE($15, tax_number),
              epf_contribution_type = COALESCE($16, epf_contribution_type),
              marital_status = COALESCE($17, marital_status),
              spouse_working = COALESCE($18, spouse_working),
              children_count = COALESCE($19, children_count),
              date_of_birth = COALESCE($20, date_of_birth),
              default_basic_salary = COALESCE($21, default_basic_salary),
              default_allowance = COALESCE($22, default_allowance),
              commission_rate = COALESCE($23, commission_rate),
              per_trip_rate = COALESCE($24, per_trip_rate),
              ot_rate = COALESCE($25, ot_rate),
              outstation_rate = COALESCE($26, outstation_rate),
              default_bonus = COALESCE($27, default_bonus),
              default_incentive = COALESCE($28, default_incentive),
              updated_at = NOW()
            WHERE employee_id = $29`,
            [
              emp.name,
              emp.email || null,
              emp.phone || null,
              emp.ic_number || null,
              departmentId,
              emp.position || null,
              joinDate,
              emp.address || null,
              emp.bank_name || null,
              emp.bank_account_no || null,
              emp.bank_account_holder || null,
              emp.status || null,
              emp.epf_number || null,
              emp.socso_number || null,
              emp.tax_number || null,
              emp.epf_contribution_type || null,
              emp.marital_status || null,
              emp.spouse_working === 'true' || emp.spouse_working === true ? true : (emp.spouse_working === 'false' || emp.spouse_working === false ? false : null),
              emp.children_count ? parseInt(emp.children_count) : null,
              dateOfBirth,
              emp.default_basic_salary ? parseFloat(emp.default_basic_salary) : null,
              emp.default_allowance ? parseFloat(emp.default_allowance) : null,
              emp.commission_rate ? parseFloat(emp.commission_rate) : null,
              emp.per_trip_rate ? parseFloat(emp.per_trip_rate) : null,
              emp.ot_rate ? parseFloat(emp.ot_rate) : null,
              emp.outstation_rate ? parseFloat(emp.outstation_rate) : null,
              emp.default_bonus ? parseFloat(emp.default_bonus) : null,
              emp.default_incentive ? parseFloat(emp.default_incentive) : null,
              emp.employee_id
            ]
          );
        } else {
          // Insert new employee
          await client.query(
            `INSERT INTO employees (
              employee_id, name, email, phone, ic_number, department_id, position, join_date,
              address, bank_name, bank_account_no, bank_account_holder, status,
              epf_number, socso_number, tax_number, epf_contribution_type,
              marital_status, spouse_working, children_count, date_of_birth,
              default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
              default_bonus, default_incentive
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
            [
              emp.employee_id,
              emp.name,
              emp.email || null,
              emp.phone || null,
              emp.ic_number || null,
              departmentId,
              emp.position || null,
              joinDate,
              emp.address || null,
              emp.bank_name || null,
              emp.bank_account_no || null,
              emp.bank_account_holder || null,
              emp.status || 'active',
              emp.epf_number || null,
              emp.socso_number || null,
              emp.tax_number || null,
              emp.epf_contribution_type || 'normal',
              emp.marital_status || 'single',
              emp.spouse_working === 'true' || emp.spouse_working === true ? true : false,
              emp.children_count ? parseInt(emp.children_count) : 0,
              dateOfBirth,
              emp.default_basic_salary ? parseFloat(emp.default_basic_salary) : 0,
              emp.default_allowance ? parseFloat(emp.default_allowance) : 0,
              emp.commission_rate ? parseFloat(emp.commission_rate) : 0,
              emp.per_trip_rate ? parseFloat(emp.per_trip_rate) : 0,
              emp.ot_rate ? parseFloat(emp.ot_rate) : 0,
              emp.outstation_rate ? parseFloat(emp.outstation_rate) : 0,
              emp.default_bonus ? parseFloat(emp.default_bonus) : 0,
              emp.default_incentive ? parseFloat(emp.default_incentive) : 0
            ]
          );
        }

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    await client.query('COMMIT');

    res.json({
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      ...results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error importing employees:', error);
    res.status(500).json({ error: 'Failed to import employees' });
  } finally {
    client.release();
  }
});

// Bulk update employees
router.put('/bulk-update', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { employee_ids, updates } = req.body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ error: 'No employees selected' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await client.query('BEGIN');

    // Build dynamic update query based on provided fields
    const allowedFields = [
      'department_id', 'position', 'status', 'bank_name',
      'default_basic_salary', 'default_allowance', 'commission_rate',
      'per_trip_rate', 'ot_rate', 'outstation_rate', 'default_bonus', 'default_incentive'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 0;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field) && value !== '' && value !== null && value !== undefined) {
        paramCount++;
        setClauses.push(`${field} = $${paramCount}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at
    paramCount++;
    setClauses.push(`updated_at = NOW()`);

    // Add employee IDs as final parameter
    paramCount++;
    values.push(employee_ids);

    const query = `
      UPDATE employees
      SET ${setClauses.join(', ')}
      WHERE id = ANY($${paramCount})
      RETURNING id
    `;

    const result = await client.query(query, values);

    await client.query('COMMIT');

    res.json({
      message: `Successfully updated ${result.rowCount} employees`,
      updated: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk updating employees:', error);
    res.status(500).json({ error: 'Failed to bulk update employees' });
  } finally {
    client.release();
  }
});

// Bulk delete (deactivate) employees
router.post('/bulk-delete', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { employee_ids } = req.body;

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ error: 'No employees selected' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE employees
       SET status = 'inactive', updated_at = NOW()
       WHERE id = ANY($1) AND status = 'active'
       RETURNING id`,
      [employee_ids]
    );

    await client.query('COMMIT');

    res.json({
      message: `Successfully deactivated ${result.rowCount} employees`,
      deactivated: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk deleting employees:', error);
    res.status(500).json({ error: 'Failed to bulk delete employees' });
  } finally {
    client.release();
  }
});

// Public endpoint to seed AA Alive employees (no auth required - for initial setup)
router.post('/init-seed-aa-alive', async (req, res) => {
  const client = await pool.connect();
  const companyId = 1; // AA Alive Sdn Bhd

  // Employee data from the provided list
  const EMPLOYEES = [
    { employee_id: 'ADAM', name: 'AR ADAM MIRZA BIN ARAZMI', ic_number: '021223-12-0863', department: 'Driver', email: 'bell68594@gmail.com', join_date: '2025-08-24' },
    { employee_id: 'ADIN', name: 'HABER BIN ABU HASSAN', ic_number: '930220-12-6379', department: 'Driver', email: 'boydin819@gmail.com', join_date: '2025-03-01' },
    { employee_id: 'AIMAN', name: 'MOHAMAD SHAHZUWAN AIMAN BIN MD KHARI', ic_number: '990929-03-5321', department: 'Driver', email: 'zuwanshah785@gmail.com', join_date: '2025-09-08' },
    { employee_id: 'ALIA', name: 'ALIA NATASHA BINTI NORZAIN', ic_number: '981007-01-6680', department: 'Office', email: 'alianatasha1311@gmail.com', join_date: '2025-04-01' },
    { employee_id: 'ALIFF', name: 'MUHAMMAD NOR ALIF BIN MOHD GHAFAR', ic_number: '871010-08-6447', department: 'Driver', email: 'jiacheng911202@googlemail.com', join_date: '2025-03-01' },
    { employee_id: 'ANELICE', name: 'LEONG XIA HWEI', ic_number: '960213-14-6192', department: 'Office', email: 'aneliceleong06@gmail.com', join_date: '2025-05-29' },
    { employee_id: 'ASLIE', name: 'ASLIE BIN ABU BAKAR', ic_number: '720506-12-5667', department: 'Driver', email: 'aslie9191@gmail.com', join_date: '2025-08-19' },
    { employee_id: 'ASRI', name: 'MOHAMMAD AL-ASRI ZULFADLI BIN ASLIE', ic_number: '020112-12-0831', department: 'Driver', email: 'namikazeyakuza02@icloud.com', join_date: '2025-10-25' },
    { employee_id: 'BELLA', name: 'NASHRATUN NABILAH BINTI SABRI', ic_number: '950103-12-5674', department: 'Office', email: 'nashratun.nabilahh@gmail.com', join_date: '2025-11-10' },
    { employee_id: 'CHLOE', name: 'TAN HUI YANG', ic_number: '920428-14-5422', department: 'Office', email: 'yang_thy92@live.com', join_date: '2025-09-01' },
    { employee_id: 'CONNIE', name: 'CONNIE HUI KANG YI', ic_number: '020105-14-0076', department: 'Office', email: 'conniehuikangyi@gmail.com', join_date: '2025-11-03' },
    { employee_id: 'EZZATI', name: 'NUR EZZATI BINTI ISMAIL', ic_number: '010209-08-0988', department: 'Office', email: 'nurezzati.isml@gmail.com', join_date: '2025-11-17' },
    { employee_id: 'FAIQ', name: 'MOHD FAIQ BIN RUDZELAN', ic_number: '910913-06-5507', department: 'Driver', email: 'faiq6846@gmail.com', join_date: '2025-03-01' },
    { employee_id: 'FAKHRUL', name: 'FAKHRUL AZIZI BIN TALIB', ic_number: '871217-02-5609', department: 'Driver', email: 'fakhrul36azizi@gmail.com', join_date: '2025-06-09' },
    { employee_id: 'FARAH', name: 'NUR FARAH IZZATI BINTI MD LAZIM', ic_number: '980825-43-5188', department: 'Office', email: 'farah25izzati@gmail.com', join_date: '2025-06-02' },
    { employee_id: 'HAFIZ', name: 'HAFIZ BIN ZAINAL ABIDIN', ic_number: '930429-12-5289', department: 'Driver', email: 'poyzainal@gmail.com', join_date: '2025-03-01' },
    { employee_id: 'HANA', name: 'FARHANAH BINTI ABD TALIB', ic_number: '930102-10-5948', department: 'Office', email: 'farhanahtalib21@gmail.com', join_date: '2025-09-01' },
    { employee_id: 'HASLIZA', name: 'NUR HASLIZA ZAINAL ABIDIN', ic_number: '010927-12-0710', department: 'Office', email: 'lizazainal4@gmail.com', join_date: '2025-09-01' },
    { employee_id: 'HIDAYAH', name: 'HIDAYAH BINTI MUSTAPA', ic_number: '990518-07-5564', department: 'Office', email: 'hidayahmustapaworking@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'IQZAT', name: 'AR IQZAT ALFAYYADH B AR AZMI', ic_number: '920618-12-6441', department: 'Driver', email: 'ariqzatalfayyadh@gmail.com', join_date: '2025-03-01' },
    { employee_id: 'IZUWAN', name: 'MD IZUWAN BIN YUSIN', ic_number: '921221-12-6835', department: 'Driver', email: 'fareezuwan2112@gmail.com', join_date: '2025-06-09' },
    { employee_id: 'IZZUL', name: 'MUHAMMAD ISMAIZZUL BIN ZAINI', ic_number: '950623-14-5177', department: 'Driver', email: 'nursabihaa@gmail.com', join_date: '2025-03-01' },
    { employee_id: 'LINA', name: 'NUR AZLINA BINTI AHMAD APANDI', ic_number: '981031-10-5562', department: 'Office', email: 'azlinaahmad98@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'MICHELLE', name: 'MICHELLE CHEAN MEI TZEE', ic_number: '990929-08-6540', department: null, email: 'michellechean.work@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'NAD', name: 'NAJAH NADZIRAH BINTI ROSLI', ic_number: '921214-10-5710', department: 'Office', email: 'aaniz847@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'PIAN', name: 'MOHD SAFIAN BIN YUSIN', ic_number: '870127-49-5637', department: 'Driver', email: 'safianyusin426@gmail.com', join_date: '2025-03-01' },
    { employee_id: 'RAFINA', name: 'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH', ic_number: '010602-00-0076', department: 'Office', email: 'finarafina15@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'SAIFUL', name: 'ENGKU SAIFUL AZHARI BIN CHE ENGKU GARIB', ic_number: '850709-04-5259', department: 'Driver', email: 'saifulsaifulazhari2@gmail.com', join_date: '2025-04-04' },
    { employee_id: 'SHANIA', name: 'SHANIA IZZATY', ic_number: '990120-56-5360', department: 'Office', email: null, join_date: '2025-06-17' },
    { employee_id: 'SITI', name: 'SITI FATIMAH BINTI PARSON', ic_number: '940120-12-5466', department: 'Office', email: 'maymayparson94@gmail.com', join_date: '2025-06-01' },
    { employee_id: 'SYAKIRAH', name: 'RAJA NUR SYAKIRAH BINTI RAJA SHURAN', ic_number: '000101-14-0986', department: 'Office', email: 'rajasyakirah01@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'SYIFA', name: 'NUR SYIFA ATHIRAH BINTI HAMDAN', ic_number: '980824-14-5410', department: 'Office', email: 'nrsyifa.athirah@gmail.com', join_date: '2025-05-28' },
    { employee_id: 'SYUKRI', name: 'MUHAMMAD SYUKRI BIN MASKUR', ic_number: '940926-14-6725', department: 'Driver', email: 'syukrimuhd804@gmail.com', join_date: '2025-08-04' },
    { employee_id: 'ZAINAL', name: 'ZAINAL ABIDIN BIN ABU BAKAR', ic_number: '730515-12-5560', department: 'Driver', email: 'enanzainalabidin@gmail.com', join_date: '2025-08-19' }
  ];

  // Helper function to extract date of birth from IC number
  function extractDOBFromIC(icNumber) {
    if (!icNumber) return null;
    const cleaned = icNumber.replace(/-/g, '');
    if (cleaned.length < 6) return null;
    const yy = parseInt(cleaned.substring(0, 2));
    const mm = cleaned.substring(2, 4);
    const dd = cleaned.substring(4, 6);
    const century = yy > 25 ? '19' : '20';
    const yyyy = century + cleaned.substring(0, 2);
    return `${yyyy}-${mm}-${dd}`;
  }

  try {
    // Get department IDs
    const deptResult = await client.query(
      'SELECT id, name FROM departments WHERE company_id = $1',
      [companyId]
    );

    const deptMap = {};
    deptResult.rows.forEach(d => {
      deptMap[d.name.toLowerCase()] = d.id;
    });

    let successCount = 0;
    let skipCount = 0;
    const errors = [];

    for (const emp of EMPLOYEES) {
      try {
        // Check if employee already exists
        const existing = await client.query(
          'SELECT id FROM employees WHERE employee_id = $1 AND company_id = $2',
          [emp.employee_id, companyId]
        );

        if (existing.rows.length > 0) {
          skipCount++;
          continue;
        }

        // Get department ID
        let departmentId = null;
        if (emp.department) {
          departmentId = deptMap[emp.department.toLowerCase()];
        }

        // Extract DOB from IC
        const dateOfBirth = extractDOBFromIC(emp.ic_number);

        // Insert employee
        await client.query(`
          INSERT INTO employees (
            employee_id, name, email, ic_number, department_id,
            join_date, date_of_birth, status, company_id,
            employment_type, probation_months
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 'confirmed', 3)
        `, [
          emp.employee_id,
          emp.name,
          emp.email,
          emp.ic_number,
          departmentId,
          emp.join_date,
          dateOfBirth,
          companyId
        ]);

        successCount++;
      } catch (err) {
        errors.push(`${emp.employee_id}: ${err.message}`);
      }
    }

    // Get employee count by department
    const countResult = await client.query(`
      SELECT d.name as department, COUNT(e.id) as count
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
      GROUP BY d.name
      ORDER BY count DESC
    `, [companyId]);

    res.json({
      message: 'AA Alive employees seeding completed',
      total: EMPLOYEES.length,
      added: successCount,
      skipped: skipCount,
      errors: errors,
      byDepartment: countResult.rows
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Quick Add Employee - minimal fields for immediate ESS access
// Requires: employee_id, name, ic_number, outlet_id (for Mimix)
router.post('/quick-add', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, name, ic_number, outlet_id } = req.body;

    // Get company_id from authenticated user
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required. Please select a company.' });
    }

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

    // For Mimix (company_id = 3), outlet is required
    if (companyId === 3 && !outlet_id) {
      return res.status(400).json({ error: 'Outlet is required for Mimix employees' });
    }

    // Check if employee_id already exists in this company
    const existingCheck = await pool.query(
      'SELECT id FROM employees WHERE employee_id = $1 AND company_id = $2',
      [employee_id, companyId]
    );
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Employee ID already exists in this company' });
    }

    // Auto-detect and format IC number
    const id_type = detectIDType(ic_number);
    const formattedIC = id_type === 'ic' ? formatIC(ic_number) : ic_number;

    // Auto-extract date of birth and gender from IC
    let dateOfBirth = null;
    let gender = null;
    if (id_type === 'ic' && ic_number) {
      dateOfBirth = extractDOBFromIC(ic_number);
      gender = extractGenderFromIC(ic_number);
    }

    // Hash IC number as initial password (without dashes)
    const cleanIC = ic_number.replace(/[-\s]/g, '');
    const passwordHash = await bcrypt.hash(cleanIC, 10);

    // Set join_date to today
    const today = new Date().toISOString().split('T')[0];

    // Insert employee with ESS enabled
    const result = await pool.query(
      `INSERT INTO employees (
        employee_id, name, ic_number, id_type, company_id, outlet_id, join_date,
        date_of_birth, gender,
        status, ess_enabled, password_hash, must_change_password,
        employment_type, probation_months, profile_completed
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', true, $10, true, 'probation', 3, false)
       RETURNING id, employee_id, name, ic_number, id_type, outlet_id, status, ess_enabled, date_of_birth, gender`,
      [employee_id, name, formattedIC, id_type, companyId, outlet_id || null, today, dateOfBirth, gender, passwordHash]
    );

    const newEmployee = result.rows[0];

    // Add to employee_outlets table for outlet sync
    if (outlet_id) {
      await pool.query(
        'INSERT INTO employee_outlets (employee_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newEmployee.id, outlet_id]
      );
    }

    res.status(201).json({
      message: `Employee ${name} created successfully. They can now login to ESS using ${id_type === 'passport' ? 'Name and Passport' : 'Employee ID and IC Number'}.`,
      employee: newEmployee,
      login_info: {
        employee_id: employee_id,
        id_type: id_type,
        initial_password: cleanIC,
        login_url: '/ess/login'
      }
    });
  } catch (error) {
    console.error('Error quick-adding employee:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Get employee stats (filtered by company)
router.get('/stats/overview', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const companyFilter = companyId !== null ? 'AND company_id = $1' : '';
    const params = companyId !== null ? [companyId] : [];

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COUNT(*) FILTER (WHERE status = 'active' AND employment_type = 'probation') as on_probation,
        COUNT(*) FILTER (WHERE status = 'active' AND employment_type = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'active' AND probation_status = 'pending_review') as pending_review
      FROM employees
      WHERE 1=1 ${companyFilter}
    `, params);

    const byDepartmentQuery = companyId !== null
      ? `SELECT d.name, COUNT(e.id) as count
         FROM departments d
         LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active' AND e.company_id = $1
         WHERE d.company_id = $1
         GROUP BY d.id, d.name
         ORDER BY d.name`
      : `SELECT d.name, COUNT(e.id) as count
         FROM departments d
         LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
         GROUP BY d.id, d.name
         ORDER BY d.name`;

    const byDepartment = await pool.query(byDepartmentQuery, params);

    res.json({
      overview: stats.rows[0],
      byDepartment: byDepartment.rows
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Clear all test/seed data (public endpoint with key protection)
router.post('/init-clear-all-data', async (req, res) => {
  const client = await pool.connect();

  // Security key to prevent accidental calls
  const { confirmKey } = req.body;
  if (confirmKey !== 'CLEAR_ALL_DATA_2024') {
    return res.status(403).json({ error: 'Invalid confirmation key' });
  }

  try {
    await client.query('BEGIN');

    const deletedCounts = {};

    // Delete in order respecting foreign key constraints
    // 1. Delete payroll items first (depends on payroll_runs)
    const payrollItems = await client.query('DELETE FROM payroll_items RETURNING id');
    deletedCounts.payroll_items = payrollItems.rowCount;

    // 2. Delete payroll runs
    const payrollRuns = await client.query('DELETE FROM payroll_runs RETURNING id');
    deletedCounts.payroll_runs = payrollRuns.rowCount;

    // 3. Delete old payroll records
    const payroll = await client.query('DELETE FROM payroll RETURNING id');
    deletedCounts.payroll = payroll.rowCount;

    // 4. Delete leave requests
    const leaveRequests = await client.query('DELETE FROM leave_requests RETURNING id');
    deletedCounts.leave_requests = leaveRequests.rowCount;

    // 5. Delete leave balances
    const leaveBalances = await client.query('DELETE FROM leave_balances RETURNING id');
    deletedCounts.leave_balances = leaveBalances.rowCount;

    // 6. Delete claims
    const claims = await client.query('DELETE FROM claims RETURNING id');
    deletedCounts.claims = claims.rowCount;

    // 7. Delete resignations
    const resignations = await client.query('DELETE FROM resignations RETURNING id');
    deletedCounts.resignations = resignations.rowCount;

    // 8. Delete letters
    const letters = await client.query('DELETE FROM letters RETURNING id');
    deletedCounts.letters = letters.rowCount;

    // 9. Delete employee commissions
    const empCommissions = await client.query('DELETE FROM employee_commissions RETURNING id');
    deletedCounts.employee_commissions = empCommissions.rowCount;

    // 10. Delete employee allowances
    const empAllowances = await client.query('DELETE FROM employee_allowances RETURNING id');
    deletedCounts.employee_allowances = empAllowances.rowCount;

    // 11. Delete sales records
    const sales = await client.query('DELETE FROM sales_records RETURNING id');
    deletedCounts.sales_records = sales.rowCount;

    // 12. Delete clock in records
    const clockIn = await client.query('DELETE FROM clock_in_records RETURNING id');
    deletedCounts.clock_in_records = clockIn.rowCount;

    // 13. Delete feedback
    const feedback = await client.query('DELETE FROM feedback RETURNING id');
    deletedCounts.feedback = feedback.rowCount;

    // 14. Delete notifications
    const notifications = await client.query('DELETE FROM notifications RETURNING id');
    deletedCounts.notifications = notifications.rowCount;

    // 15. Delete employees
    const employees = await client.query('DELETE FROM employees RETURNING id');
    deletedCounts.employees = employees.rowCount;

    // 16. Delete commission types
    const commTypes = await client.query('DELETE FROM commission_types RETURNING id');
    deletedCounts.commission_types = commTypes.rowCount;

    // 17. Delete allowance types
    const allowTypes = await client.query('DELETE FROM allowance_types RETURNING id');
    deletedCounts.allowance_types = allowTypes.rowCount;

    // 18. Delete departments
    const departments = await client.query('DELETE FROM departments RETURNING id');
    deletedCounts.departments = departments.rowCount;

    // 19. Delete admin users (except super admin)
    const adminUsers = await client.query("DELETE FROM admin_users WHERE role != 'super_admin' RETURNING id");
    deletedCounts.admin_users = adminUsers.rowCount;

    // 20. Delete companies (except default)
    const companies = await client.query('DELETE FROM companies WHERE id > 1 RETURNING id');
    deletedCounts.companies = companies.rowCount;

    await client.query('COMMIT');

    // Calculate total
    const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

    res.json({
      message: 'All test data cleared successfully',
      totalDeleted,
      details: deletedCounts
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Delete all test employees (employee_id starting with 'TEST')
// Protected - requires super_admin role
router.delete('/test-employees/all', authenticateAdmin, async (req, res) => {
  // Only allow super_admin to delete test employees
  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super admin can delete test employees' });
  }

  const client = await pool.connect();

  try {
    console.log('Starting removal of test employees...');

    // Find all test employee IDs
    const testEmployees = await client.query(`
      SELECT id, employee_id, name
      FROM employees
      WHERE employee_id LIKE 'TEST%'
      ORDER BY employee_id
    `);

    if (testEmployees.rows.length === 0) {
      return res.json({ message: 'No test employees found', deleted: 0 });
    }

    const employeeIds = testEmployees.rows.map(e => e.id);
    const deletedCounts = {};

    // Start transaction
    await client.query('BEGIN');

    // Delete related records first (in order of dependencies)
    const tables = [
      { name: 'attendance_records', column: 'employee_id' },
      { name: 'leave_requests', column: 'employee_id' },
      { name: 'claim_requests', column: 'employee_id' },
      { name: 'payroll_items', column: 'employee_id' },
      { name: 'employee_letters', column: 'employee_id' },
      { name: 'employee_benefits', column: 'employee_id' },
      { name: 'employee_contributions', column: 'employee_id' },
      { name: 'salary_details', column: 'employee_id' },
      { name: 'schedule_assignments', column: 'employee_id' },
      { name: 'shift_swaps', column: 'requester_id' },
      { name: 'shift_swaps', column: 'target_id' },
      { name: 'notifications', column: 'employee_id' },
      { name: 'feedback', column: 'employee_id' },
    ];

    for (const table of tables) {
      try {
        const result = await client.query(`
          DELETE FROM ${table.name}
          WHERE ${table.column} = ANY($1::int[])
        `, [employeeIds]);

        if (result.rowCount > 0) {
          deletedCounts[table.name] = (deletedCounts[table.name] || 0) + result.rowCount;
        }
      } catch (err) {
        // Table might not exist, skip it
        if (err.code !== '42P01') {
          console.log(`Warning: Could not delete from ${table.name}: ${err.message}`);
        }
      }
    }

    // Finally, delete the employees
    const deleteResult = await client.query(`
      DELETE FROM employees
      WHERE employee_id LIKE 'TEST%'
    `);

    // Commit transaction
    await client.query('COMMIT');

    console.log(`Deleted ${deleteResult.rowCount} test employees`);

    res.json({
      message: `Successfully deleted ${deleteResult.rowCount} test employees`,
      deleted: deleteResult.rowCount,
      employees: testEmployees.rows.map(e => ({ employee_id: e.employee_id, name: e.name })),
      relatedRecords: deletedCounts
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing test employees:', error);
    res.status(500).json({ error: 'Failed to remove test employees: ' + error.message });
  } finally {
    client.release();
  }
});

// Get password status for employees (check if they have changed/set their password)
router.get('/password-status/check', authenticateAdmin, async (req, res) => {
  try {
    const { search, employee_id } = req.query;
    const companyId = getCompanyFilter(req);

    if (!search && !employee_id) {
      return res.status(400).json({ error: 'Please provide search term or employee_id' });
    }

    let query = `
      SELECT
        e.id,
        e.employee_id,
        e.name,
        e.email,
        e.ic_number,
        e.company_id,
        CASE WHEN e.password_hash IS NOT NULL AND e.password_hash != '' THEN true ELSE false END as password_set,
        e.must_change_password,
        e.last_login,
        e.created_at,
        e.updated_at,
        c.name as company_name,
        d.name as department_name
      FROM employees e
      LEFT JOIN companies c ON e.company_id = c.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Company filter (skip for super_admin viewing all)
    if (companyId !== null) {
      paramCount++;
      query += ` AND e.company_id = $${paramCount}`;
      params.push(companyId);
    }

    if (employee_id) {
      paramCount++;
      query += ` AND e.employee_id = $${paramCount}`;
      params.push(employee_id);
    } else if (search) {
      paramCount++;
      query += ` AND (e.name ILIKE $${paramCount} OR e.employee_id ILIKE $${paramCount} OR e.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY e.name ASC LIMIT 50';

    const result = await pool.query(query, params);

    // For each employee, get password change history from audit logs
    const employeesWithHistory = await Promise.all(result.rows.map(async (emp) => {
      // Check audit logs for password changes
      const auditResult = await pool.query(`
        SELECT action, created_at, actor_name, ip_address
        FROM audit_logs
        WHERE entity_type = 'employee'
          AND entity_id = $1
          AND action IN ('password_change', 'password_set', 'password_reset')
        ORDER BY created_at DESC
        LIMIT 5
      `, [emp.id.toString()]);

      return {
        ...emp,
        password_status: emp.password_set
          ? (emp.must_change_password ? 'Must Change' : 'Set')
          : 'Not Set',
        password_history: auditResult.rows
      };
    }));

    res.json({
      count: employeesWithHistory.length,
      employees: employeesWithHistory
    });
  } catch (error) {
    console.error('Error checking password status:', error);
    res.status(500).json({ error: 'Failed to check password status' });
  }
});

module.exports = router;
