const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { calculateAllStatutory } = require('../utils/statutory');

// Get payroll for a month
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, department_id, status } = req.query;

    let query = `
      SELECT p.*, e.name as employee_name, e.employee_id as emp_id, d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (month) {
      paramCount++;
      query += ` AND p.month = $${paramCount}`;
      params.push(month);
    }

    if (year) {
      paramCount++;
      query += ` AND p.year = $${paramCount}`;
      params.push(year);
    }

    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY e.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

// Get single payroll record
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, e.name as employee_name, e.employee_id as emp_id, d.name as department_name, d.salary_type
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

// Generate payroll for all active employees for a month (or specific employees)
router.post('/generate', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, employee_ids } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Get employees - either specific ones or all active
    let employeeQuery = `
      SELECT e.id, e.default_basic_salary, e.default_allowance,
             e.date_of_birth, e.marital_status, e.spouse_working, e.children_count
      FROM employees e
      WHERE e.status = 'active'
    `;
    const queryParams = [];

    // If specific employee_ids provided, filter by them
    if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
      employeeQuery += ` AND e.id = ANY($1)`;
      queryParams.push(employee_ids);
    }

    const employees = await pool.query(employeeQuery, queryParams);

    let created = 0;
    let skipped = 0;

    for (const emp of employees.rows) {
      // Check if payroll already exists
      const existing = await pool.query(
        'SELECT id FROM payroll WHERE employee_id = $1 AND month = $2 AND year = $3',
        [emp.id, month, year]
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      const basicSalary = parseFloat(emp.default_basic_salary) || 0;
      const allowance = parseFloat(emp.default_allowance) || 0;
      const grossSalary = basicSalary + allowance;

      // Calculate statutory deductions
      const statutory = calculateAllStatutory(grossSalary, emp, month, null);

      // Create payroll record with default values and statutory deductions
      await pool.query(
        `INSERT INTO payroll (
          employee_id, month, year, basic_salary, allowance,
          gross_salary, net_salary,
          epf_employee, epf_employer, socso_employee, socso_employer,
          eis_employee, eis_employer, pcb, deductions
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          emp.id, month, year, basicSalary, allowance,
          grossSalary, statutory.netSalary,
          statutory.epf.employee, statutory.epf.employer,
          statutory.socso.employee, statutory.socso.employer,
          statutory.eis.employee, statutory.eis.employer,
          statutory.pcb, statutory.totalEmployeeDeductions
        ]
      );
      created++;
    }

    res.json({
      message: `Payroll generated: ${created} created, ${skipped} already existed`,
      created,
      skipped
    });
  } catch (error) {
    console.error('Error generating payroll:', error);
    res.status(500).json({ error: 'Failed to generate payroll' });
  }
});

// Get employees available for payroll generation (not yet generated for this month)
router.get('/available-employees/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;

    const result = await pool.query(`
      SELECT e.id, e.employee_id as emp_id, e.name, e.default_basic_salary, e.default_allowance,
             d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
        AND e.id NOT IN (
          SELECT employee_id FROM payroll WHERE year = $1 AND month = $2
        )
      ORDER BY e.name
    `, [year, month]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching available employees:', error);
    res.status(500).json({ error: 'Failed to fetch available employees' });
  }
});

// Delete payroll record
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM payroll WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    res.json({ message: 'Payroll record deleted successfully' });
  } catch (error) {
    console.error('Error deleting payroll:', error);
    res.status(500).json({ error: 'Failed to delete payroll record' });
  }
});

// Update payroll record (for entering sales, trips, OT, etc.)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      basic_salary,
      commission,
      allowance,
      trip_pay,
      ot_pay,
      outstation_pay,
      bonus,
      deductions,
      other_deductions,
      sales_amount,
      trip_count,
      ot_hours,
      outstation_days,
      notes,
      status
    } = req.body;

    // Get employee data and payroll month/year for statutory calculations
    const payrollRecord = await pool.query(
      `SELECT p.employee_id, p.month, p.year,
              e.date_of_birth, e.epf_contribution_type, e.marital_status, e.spouse_working, e.children_count
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.id = $1`,
      [id]
    );

    if (payrollRecord.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    const employee = payrollRecord.rows[0];
    const payrollMonth = employee.month;
    const payrollYear = employee.year;

    // Calculate gross salary
    const grossSalary = (
      parseFloat(basic_salary || 0) +
      parseFloat(commission || 0) +
      parseFloat(allowance || 0) +
      parseFloat(trip_pay || 0) +
      parseFloat(ot_pay || 0) +
      parseFloat(outstation_pay || 0) +
      parseFloat(bonus || 0)
    );

    // Get Year-to-Date data for accurate PCB calculation (LHDN computerized method)
    const ytdResult = await pool.query(
      `SELECT
        COALESCE(SUM(gross_salary), 0) as ytd_gross,
        COALESCE(SUM(epf_employee), 0) as ytd_epf,
        COALESCE(SUM(pcb), 0) as ytd_pcb
       FROM payroll
       WHERE employee_id = $1
         AND year = $2
         AND month < $3`,
      [employee.employee_id, payrollYear, payrollMonth]
    );

    const ytdData = {
      ytdGross: parseFloat(ytdResult.rows[0]?.ytd_gross || 0),
      ytdEPF: parseFloat(ytdResult.rows[0]?.ytd_epf || 0),
      ytdPCB: parseFloat(ytdResult.rows[0]?.ytd_pcb || 0),
      ytdZakat: 0 // Zakat not implemented yet
    };

    // Calculate statutory deductions with YTD data for accurate PCB
    const statutory = calculateAllStatutory(grossSalary, employee, payrollMonth, ytdData);

    // Total deductions including statutory
    const totalDeductions = (
      statutory.epf.employee +
      statutory.socso.employee +
      statutory.eis.employee +
      statutory.pcb +
      parseFloat(other_deductions || 0)
    );

    // Net salary after all deductions
    const netSalary = grossSalary - totalDeductions;

    const result = await pool.query(
      `UPDATE payroll SET
        basic_salary = $1, commission = $2, allowance = $3, trip_pay = $4,
        ot_pay = $5, outstation_pay = $6, bonus = $7,
        deductions = $8, other_deductions = $9,
        gross_salary = $10, net_salary = $11,
        epf_employee = $12, epf_employer = $13,
        socso_employee = $14, socso_employer = $15,
        eis_employee = $16, eis_employer = $17,
        pcb = $18,
        total_salary = $11,
        sales_amount = $19, trip_count = $20, ot_hours = $21,
        outstation_days = $22, notes = $23, status = $24, updated_at = NOW()
       WHERE id = $25
       RETURNING *`,
      [
        basic_salary, commission, allowance, trip_pay, ot_pay, outstation_pay, bonus,
        totalDeductions, other_deductions || 0,
        grossSalary, netSalary,
        statutory.epf.employee, statutory.epf.employer,
        statutory.socso.employee, statutory.socso.employer,
        statutory.eis.employee, statutory.eis.employer,
        statutory.pcb,
        sales_amount, trip_count, ot_hours, outstation_days, notes, status, id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payroll:', error);
    res.status(500).json({ error: 'Failed to update payroll' });
  }
});

// Calculate commission/trip pay based on inputs
router.post('/calculate', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, sales_amount, trip_count, ot_hours, outstation_days } = req.body;

    // Get employee's department config
    const emp = await pool.query(`
      SELECT e.*, sc.*
      FROM employees e
      LEFT JOIN salary_configs sc ON e.department_id = sc.department_id
      WHERE e.id = $1
    `, [employee_id]);

    if (emp.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const config = emp.rows[0];

    const calculations = {
      basic_salary: parseFloat(config.basic_salary) || 0,
      commission: config.has_commission ? (parseFloat(sales_amount || 0) * parseFloat(config.commission_rate || 0) / 100) : 0,
      allowance: config.has_allowance ? parseFloat(config.allowance_amount || 0) : 0,
      trip_pay: config.has_per_trip ? (parseInt(trip_count || 0) * parseFloat(config.per_trip_rate || 0)) : 0,
      ot_pay: config.has_ot ? (parseFloat(ot_hours || 0) * parseFloat(config.ot_rate || 0)) : 0,
      outstation_pay: config.has_outstation ? (parseInt(outstation_days || 0) * parseFloat(config.outstation_rate || 0)) : 0
    };

    calculations.total = Object.values(calculations).reduce((a, b) => a + b, 0);

    res.json(calculations);
  } catch (error) {
    console.error('Error calculating payroll:', error);
    res.status(500).json({ error: 'Failed to calculate payroll' });
  }
});

// Get payroll summary for a month
router.get('/summary/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;

    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_employees,
        SUM(gross_salary) as total_gross,
        SUM(net_salary) as total_net,
        SUM(total_salary) as total_payroll,
        SUM(basic_salary) as total_basic,
        SUM(commission) as total_commission,
        SUM(allowance) as total_allowance,
        SUM(trip_pay) as total_trip_pay,
        SUM(ot_pay) as total_ot,
        SUM(bonus) as total_bonus,
        SUM(deductions) as total_deductions,
        SUM(epf_employee) as total_epf_employee,
        SUM(epf_employer) as total_epf_employer,
        SUM(socso_employee) as total_socso_employee,
        SUM(socso_employer) as total_socso_employer,
        SUM(eis_employee) as total_eis_employee,
        SUM(eis_employer) as total_eis_employer,
        SUM(pcb) as total_pcb
      FROM payroll
      WHERE year = $1 AND month = $2
    `, [year, month]);

    const byDepartment = await pool.query(`
      SELECT d.name, COUNT(p.id) as employee_count, SUM(p.net_salary) as total
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE p.year = $1 AND p.month = $2
      GROUP BY d.id, d.name
    `, [year, month]);

    res.json({
      summary: summary.rows[0],
      byDepartment: byDepartment.rows
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Calculate statutory deductions preview
router.post('/calculate-statutory', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, gross_salary } = req.body;

    // Get employee data
    const empResult = await pool.query(
      `SELECT date_of_birth, epf_contribution_type, marital_status, spouse_working, children_count
       FROM employees WHERE id = $1`,
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empResult.rows[0];
    const statutory = calculateAllStatutory(parseFloat(gross_salary || 0), employee);

    res.json(statutory);
  } catch (error) {
    console.error('Error calculating statutory:', error);
    res.status(500).json({ error: 'Failed to calculate statutory deductions' });
  }
});

// Get payslip data for a single payroll record
router.get('/:id/payslip', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p.*,
        e.employee_id as emp_code,
        e.name as employee_name,
        e.ic_number,
        e.epf_number,
        e.socso_number,
        e.tax_number,
        e.bank_name,
        e.bank_account_no,
        e.bank_account_holder,
        e.position,
        e.join_date,
        d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    const payroll = result.rows[0];

    // Format payslip data
    const payslip = {
      // Company Info
      company: {
        name: 'AA ALIVE SDN BHD',
        address: '',
        epf_number: '',
        socso_number: ''
      },
      // Employee Info
      employee: {
        code: payroll.emp_code,
        name: payroll.employee_name,
        ic_number: payroll.ic_number,
        epf_number: payroll.epf_number,
        socso_number: payroll.socso_number,
        tax_number: payroll.tax_number,
        department: payroll.department_name,
        position: payroll.position,
        join_date: payroll.join_date,
        bank_name: payroll.bank_name,
        bank_account_no: payroll.bank_account_no
      },
      // Pay Period
      period: {
        month: payroll.month,
        year: payroll.year,
        month_name: new Date(payroll.year, payroll.month - 1).toLocaleString('en-MY', { month: 'long' })
      },
      // Earnings
      earnings: {
        basic_salary: parseFloat(payroll.basic_salary) || 0,
        allowance: parseFloat(payroll.allowance) || 0,
        commission: parseFloat(payroll.commission) || 0,
        trip_pay: parseFloat(payroll.trip_pay) || 0,
        ot_pay: parseFloat(payroll.ot_pay) || 0,
        outstation_pay: parseFloat(payroll.outstation_pay) || 0,
        bonus: parseFloat(payroll.bonus) || 0
      },
      // Deductions
      deductions: {
        epf_employee: parseFloat(payroll.epf_employee) || 0,
        socso_employee: parseFloat(payroll.socso_employee) || 0,
        eis_employee: parseFloat(payroll.eis_employee) || 0,
        pcb: parseFloat(payroll.pcb) || 0,
        other_deductions: parseFloat(payroll.other_deductions) || 0
      },
      // Employer Contributions (for info)
      employer_contributions: {
        epf_employer: parseFloat(payroll.epf_employer) || 0,
        socso_employer: parseFloat(payroll.socso_employer) || 0,
        eis_employer: parseFloat(payroll.eis_employer) || 0
      },
      // Totals
      totals: {
        gross_salary: parseFloat(payroll.gross_salary) || 0,
        total_deductions: parseFloat(payroll.deductions) || 0,
        net_salary: parseFloat(payroll.net_salary) || 0
      }
    };

    // Calculate totals if not already stored
    payslip.earnings.total = Object.values(payslip.earnings).reduce((a, b) => a + b, 0);
    payslip.deductions.total = Object.values(payslip.deductions).reduce((a, b) => a + b, 0);

    res.json(payslip);
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({ error: 'Failed to fetch payslip' });
  }
});

// Bulk generate payslips for a month
router.get('/payslips/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;

    const result = await pool.query(`
      SELECT
        p.*,
        e.employee_id as emp_code,
        e.name as employee_name,
        e.ic_number,
        e.epf_number,
        e.socso_number,
        e.tax_number,
        e.bank_name,
        e.bank_account_no,
        e.position,
        d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE p.year = $1 AND p.month = $2
      ORDER BY e.name
    `, [year, month]);

    res.json({
      period: { year: parseInt(year), month: parseInt(month) },
      payslips: result.rows
    });
  } catch (error) {
    console.error('Error fetching payslips:', error);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

module.exports = router;
