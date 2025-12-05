const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get all employees
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, status, search } = req.query;

    let query = `
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

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

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get single employee
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT e.*, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Create employee
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      employee_id, name, email, phone, ic_number, department_id, position, join_date,
      address, bank_name, bank_account_no, bank_account_holder,
      epf_number, socso_number, tax_number, epf_contribution_type,
      marital_status, spouse_working, children_count, date_of_birth,
      // Default salary fields
      default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
      // Additional earning fields
      default_bonus, default_incentive
    } = req.body;

    if (!employee_id || !name || !department_id) {
      return res.status(400).json({ error: 'Employee ID, name, and department are required' });
    }

    const result = await pool.query(
      `INSERT INTO employees (
        employee_id, name, email, phone, ic_number, department_id, position, join_date,
        address, bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth,
        default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
        default_bonus, default_incentive
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
       RETURNING *`,
      [
        employee_id, name, email, phone, ic_number, department_id, position, join_date,
        address, bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type || 'normal',
        marital_status || 'single', spouse_working || false, children_count || 0, date_of_birth,
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0, per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, default_incentive || 0
      ]
    );

    res.status(201).json(result.rows[0]);
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
    const {
      employee_id, name, email, phone, ic_number, department_id, position, join_date, status,
      address, bank_name, bank_account_no, bank_account_holder,
      epf_number, socso_number, tax_number, epf_contribution_type,
      marital_status, spouse_working, children_count, date_of_birth,
      // Default salary fields
      default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
      // Additional earning fields
      default_bonus, default_incentive
    } = req.body;

    const result = await pool.query(
      `UPDATE employees
       SET employee_id = $1, name = $2, email = $3, phone = $4, ic_number = $5,
           department_id = $6, position = $7, join_date = $8, status = $9,
           address = $10, bank_name = $11, bank_account_no = $12, bank_account_holder = $13,
           epf_number = $14, socso_number = $15, tax_number = $16, epf_contribution_type = $17,
           marital_status = $18, spouse_working = $19, children_count = $20, date_of_birth = $21,
           default_basic_salary = $22, default_allowance = $23, commission_rate = $24,
           per_trip_rate = $25, ot_rate = $26, outstation_rate = $27,
           default_bonus = $28, default_incentive = $29,
           updated_at = NOW()
       WHERE id = $30
       RETURNING *`,
      [
        employee_id, name, email, phone, ic_number, department_id, position, join_date, status,
        address, bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth,
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0,
        per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, default_incentive || 0, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee (soft delete - change status to inactive)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE employees SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deactivated successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
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

// Get employee stats
router.get('/stats/overview', authenticateAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive
      FROM employees
    `);

    const byDepartment = await pool.query(`
      SELECT d.name, COUNT(e.id) as count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
      GROUP BY d.id, d.name
      ORDER BY d.name
    `);

    res.json({
      overview: stats.rows[0],
      byDepartment: byDepartment.rows
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
