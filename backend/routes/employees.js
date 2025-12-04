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
      bank_name, bank_account_no, bank_account_holder,
      epf_number, socso_number, tax_number, epf_contribution_type,
      marital_status, spouse_working, children_count, date_of_birth,
      // Default salary fields
      default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
      // Additional earning fields
      default_bonus, trade_commission_rate, default_incentive, default_other_earnings, other_earnings_description
    } = req.body;

    if (!employee_id || !name || !department_id) {
      return res.status(400).json({ error: 'Employee ID, name, and department are required' });
    }

    const result = await pool.query(
      `INSERT INTO employees (
        employee_id, name, email, phone, ic_number, department_id, position, join_date,
        bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth,
        default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
        default_bonus, trade_commission_rate, default_incentive, default_other_earnings, other_earnings_description
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
       RETURNING *`,
      [
        employee_id, name, email, phone, ic_number, department_id, position, join_date,
        bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type || 'normal',
        marital_status || 'single', spouse_working || false, children_count || 0, date_of_birth,
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0, per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, trade_commission_rate || 0, default_incentive || 0, default_other_earnings || 0, other_earnings_description || null
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
      bank_name, bank_account_no, bank_account_holder,
      epf_number, socso_number, tax_number, epf_contribution_type,
      marital_status, spouse_working, children_count, date_of_birth,
      // Default salary fields
      default_basic_salary, default_allowance, commission_rate, per_trip_rate, ot_rate, outstation_rate,
      // Additional earning fields
      default_bonus, trade_commission_rate, default_incentive, default_other_earnings, other_earnings_description
    } = req.body;

    const result = await pool.query(
      `UPDATE employees
       SET employee_id = $1, name = $2, email = $3, phone = $4, ic_number = $5,
           department_id = $6, position = $7, join_date = $8, status = $9,
           bank_name = $10, bank_account_no = $11, bank_account_holder = $12,
           epf_number = $13, socso_number = $14, tax_number = $15, epf_contribution_type = $16,
           marital_status = $17, spouse_working = $18, children_count = $19, date_of_birth = $20,
           default_basic_salary = $21, default_allowance = $22, commission_rate = $23,
           per_trip_rate = $24, ot_rate = $25, outstation_rate = $26,
           default_bonus = $27, trade_commission_rate = $28, default_incentive = $29,
           default_other_earnings = $30, other_earnings_description = $31,
           updated_at = NOW()
       WHERE id = $32
       RETURNING *`,
      [
        employee_id, name, email, phone, ic_number, department_id, position, join_date, status,
        bank_name, bank_account_no, bank_account_holder,
        epf_number, socso_number, tax_number, epf_contribution_type,
        marital_status, spouse_working, children_count, date_of_birth,
        default_basic_salary || 0, default_allowance || 0, commission_rate || 0,
        per_trip_rate || 0, ot_rate || 0, outstation_rate || 0,
        default_bonus || 0, trade_commission_rate || 0, default_incentive || 0,
        default_other_earnings || 0, other_earnings_description || null, id
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
        if (!emp.employee_id || !emp.name) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: Employee ID and Name are required`);
          continue;
        }

        // Map department name to ID
        let departmentId = null;
        if (emp.department) {
          departmentId = departmentMap[emp.department.toLowerCase()];
          if (!departmentId) {
            results.failed++;
            results.errors.push(`Row ${rowNum}: Department "${emp.department}" not found`);
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

        if (existingEmp.rows.length > 0) {
          // Update existing employee
          await client.query(
            `UPDATE employees SET
              name = $1, email = $2, phone = $3, ic_number = $4,
              department_id = $5, position = $6, join_date = $7,
              bank_name = $8, bank_account_no = $9, bank_account_holder = $10,
              status = COALESCE($11, status), updated_at = NOW()
            WHERE employee_id = $12`,
            [
              emp.name,
              emp.email || null,
              emp.phone || null,
              emp.ic_number || null,
              departmentId,
              emp.position || null,
              joinDate,
              emp.bank_name || null,
              emp.bank_account_no || null,
              emp.bank_account_holder || null,
              emp.status || null,
              emp.employee_id
            ]
          );
        } else {
          // Insert new employee
          await client.query(
            `INSERT INTO employees (employee_id, name, email, phone, ic_number, department_id, position, join_date, bank_name, bank_account_no, bank_account_holder, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              emp.employee_id,
              emp.name,
              emp.email || null,
              emp.phone || null,
              emp.ic_number || null,
              departmentId,
              emp.position || null,
              joinDate,
              emp.bank_name || null,
              emp.bank_account_no || null,
              emp.bank_account_holder || null,
              emp.status || 'active'
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
