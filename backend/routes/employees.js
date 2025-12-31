const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter, isSuperAdmin, getOutletFilter, isSupervisor } = require('../middleware/tenant');
const { initializeLeaveBalances } = require('../utils/leaveProration');
const { initializeProbation } = require('../utils/probationReminder');
const { sanitizeEmployeeData, escapeHtml } = require('../middleware/sanitize');

// Get all employees (filtered by company and outlet for supervisors)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, status, search, employment_type, probation_status, outlet_id } = req.query;
    const companyId = getCompanyFilter(req);
    const outletId = getOutletFilter(req);

    let query = `
      SELECT e.*, d.name as department_name, d.payroll_structure_code, o.name as outlet_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
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
      // Probation fields
      employment_type, probation_months, salary_before_confirmation, salary_after_confirmation, increment_amount,
      // Multi-outlet for managers
      additional_outlet_ids
    } = { ...req.body, ...sanitizedBody };

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
    if (!department_id && !outlet_id) {
      return res.status(400).json({ error: 'Department or Outlet is required' });
    }
    if (!join_date) {
      return res.status(400).json({ error: 'Join Date is required' });
    }

    // Hash IC number as initial password (employee will change on first login)
    const cleanIC = ic_number.replace(/[-\s]/g, '');
    const passwordHash = await bcrypt.hash(cleanIC, 10);

    // Calculate probation end date if join_date and probation_months are provided
    let probation_end_date = null;
    const empType = employment_type || 'probation';
    const probMonths = probation_months || 3;

    if (join_date && empType === 'probation') {
      const joinDateObj = new Date(join_date);
      joinDateObj.setMonth(joinDateObj.getMonth() + probMonths);
      probation_end_date = joinDateObj.toISOString().split('T')[0];
    }

    // Calculate increment amount if both salaries provided
    let calcIncrement = increment_amount;
    if (!calcIncrement && salary_before_confirmation && salary_after_confirmation) {
      calcIncrement = parseFloat(salary_after_confirmation) - parseFloat(salary_before_confirmation);
    }

    const result = await pool.query(
      `INSERT INTO employees (
        employee_id, name, email, phone, ic_number, department_id, outlet_id, position, position_id, join_date,
        address, bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth,
        default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
        default_bonus, default_incentive,
        employment_type, probation_months, probation_end_date, probation_status,
        salary_before_confirmation, salary_after_confirmation, increment_amount,
        company_id, profile_completed, password_hash, must_change_password
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41)
       RETURNING *`,
      [
        employee_id, name || null, email || null, phone || null, ic_number, department_id || null, outlet_id || null, position || null, position_id || null, join_date,
        address || null, bank_name || null, bank_account_no || null, bank_account_holder || null,
        epf_number || null, socso_number || null, tax_number || null, epf_contribution_type || 'normal',
        marital_status || 'single', spouse_working || false, children_count || 0, date_of_birth || null,
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0, per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, default_incentive || 0,
        empType, probMonths, probation_end_date, empType === 'confirmed' ? 'confirmed' : 'ongoing',
        salary_before_confirmation || null, salary_after_confirmation || null, calcIncrement || null,
        companyId, false, passwordHash, true
      ]
    );

    const newEmployee = result.rows[0];

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
      employee_id, name, email, phone, ic_number, department_id, outlet_id, position, join_date, status,
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

    // Get current employee data to check if we need to recalculate probation_end_date
    const currentEmp = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (currentEmp.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const current = currentEmp.rows[0];

    // Calculate probation end date if join_date or probation_months changed
    let probation_end_date = current.probation_end_date;
    const newJoinDate = join_date || current.join_date;
    const newProbMonths = probation_months !== undefined ? probation_months : (current.probation_months || 3);
    const newEmpType = employment_type || current.employment_type || 'probation';

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

    const result = await pool.query(
      `UPDATE employees
       SET employee_id = $1, name = $2, email = $3, phone = $4, ic_number = $5,
           department_id = $6, outlet_id = $7, position = $8, join_date = $9, status = $10,
           address = $11, bank_name = $12, bank_account_no = $13, bank_account_holder = $14,
           epf_number = $15, socso_number = $16, tax_number = $17, epf_contribution_type = $18,
           marital_status = $19, spouse_working = $20, children_count = $21, date_of_birth = $22,
           default_basic_salary = $23, default_allowance = $24, commission_rate = $25,
           per_trip_rate = $26, ot_rate = $27, outstation_rate = $28,
           default_bonus = $29, default_incentive = $30,
           employment_type = $31, probation_months = $32, probation_end_date = $33,
           salary_before_confirmation = $34, salary_after_confirmation = $35, increment_amount = $36,
           probation_notes = $37,
           updated_at = NOW()
       WHERE id = $38
       RETURNING *`,
      [
        employee_id, name, email, phone, ic_number, department_id, outlet_id || null, position, join_date, status,
        address, bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth,
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0,
        per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, default_incentive || 0,
        newEmpType, newProbMonths, probation_end_date,
        salary_before_confirmation, salary_after_confirmation, calcIncrement,
        probation_notes, id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
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

module.exports = router;
