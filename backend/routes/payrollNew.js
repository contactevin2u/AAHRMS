const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { calculateAllStatutory } = require('../utils/statutory');

// =====================================================
// PAYROLL RUNS
// =====================================================

// Get all payroll runs
router.get('/runs', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.query;

    let query = `
      SELECT pr.*,
             (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = pr.id) as item_count
      FROM payroll_runs pr
      WHERE 1=1
    `;
    const params = [];

    if (year) {
      query += ` AND pr.year = $1`;
      params.push(year);
    }

    query += ' ORDER BY pr.year DESC, pr.month DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ error: 'Failed to fetch payroll runs' });
  }
});

// Get single payroll run with items
router.get('/runs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get run details
    const runResult = await pool.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    // Get all items for this run
    const itemsResult = await pool.query(`
      SELECT pi.*,
             e.employee_id as emp_code,
             e.name as employee_name,
             e.bank_name,
             e.bank_account_no,
             d.name as department_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.name
    `, [id]);

    res.json({
      run: runResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching payroll run:', error);
    res.status(500).json({ error: 'Failed to fetch payroll run' });
  }
});

// Create new payroll run
router.post('/runs', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { month, year, notes } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    await client.query('BEGIN');

    // Check if run already exists
    const existing = await client.query(
      'SELECT id FROM payroll_runs WHERE month = $1 AND year = $2',
      [month, year]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Payroll run already exists for this month',
        existing_id: existing.rows[0].id
      });
    }

    // Create payroll run
    const runResult = await client.query(`
      INSERT INTO payroll_runs (month, year, status, notes)
      VALUES ($1, $2, 'draft', $3)
      RETURNING *
    `, [month, year, notes]);

    const runId = runResult.rows[0].id;

    // Get all active employees with salary data
    const employees = await client.query(`
      SELECT e.*,
             e.default_basic_salary as basic_salary,
             e.default_allowance as fixed_allowance
      FROM employees e
      WHERE e.status = 'active'
    `);

    // Check for employees without salary data
    const employeesWithoutSalary = employees.rows.filter(
      emp => !emp.basic_salary || parseFloat(emp.basic_salary) <= 0
    );
    const skippedNames = employeesWithoutSalary.map(e => e.name);

    // Get unpaid leave for this month
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
    const workingDaysInMonth = getWorkingDaysInMonth(year, month);

    const unpaidLeaveResult = await client.query(`
      SELECT lr.employee_id, SUM(lr.total_days) as unpaid_days
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lt.is_paid = FALSE
        AND lr.status = 'approved'
        AND lr.start_date <= $1
        AND lr.end_date >= $2
      GROUP BY lr.employee_id
    `, [endOfMonth, startOfMonth]);

    const unpaidLeaveMap = {};
    unpaidLeaveResult.rows.forEach(r => {
      unpaidLeaveMap[r.employee_id] = parseFloat(r.unpaid_days) || 0;
    });

    // Get approved claims for this month (not yet linked)
    const claimsResult = await client.query(`
      SELECT employee_id, SUM(amount) as total_claims
      FROM claims
      WHERE status = 'approved'
        AND linked_payroll_item_id IS NULL
        AND claim_date BETWEEN $1 AND $2
      GROUP BY employee_id
    `, [startOfMonth, endOfMonth]);

    const claimsMap = {};
    claimsResult.rows.forEach(r => {
      claimsMap[r.employee_id] = parseFloat(r.total_claims) || 0;
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployerCost = 0;
    let employeeCount = 0;

    // Create payroll item for each employee
    for (const emp of employees.rows) {
      const basicSalary = parseFloat(emp.basic_salary) || 0;
      const fixedAllowance = parseFloat(emp.fixed_allowance) || 0;
      const unpaidDays = unpaidLeaveMap[emp.id] || 0;
      const claimsAmount = claimsMap[emp.id] || 0;

      // Calculate unpaid leave deduction
      const dailyRate = basicSalary / workingDaysInMonth;
      const unpaidDeduction = dailyRate * unpaidDays;

      // Gross salary (before unpaid deduction)
      const grossBeforeUnpaid = basicSalary + fixedAllowance + claimsAmount;

      // Gross for statutory calculation (after unpaid deduction)
      const grossSalary = grossBeforeUnpaid - unpaidDeduction;

      // Calculate statutory deductions
      const statutory = calculateAllStatutory(grossSalary, emp, month, null);

      // Total deductions
      const totalDeductionsForEmp = (
        unpaidDeduction +
        statutory.epf.employee +
        statutory.socso.employee +
        statutory.eis.employee +
        statutory.pcb
      );

      // Net pay
      const netPay = grossBeforeUnpaid - totalDeductionsForEmp;

      // Employer total cost
      const employerCost = grossSalary + statutory.epf.employer + statutory.socso.employer + statutory.eis.employer;

      // Insert payroll item
      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id,
          basic_salary, fixed_allowance, claims_amount,
          unpaid_leave_days, unpaid_leave_deduction,
          gross_salary,
          epf_employee, epf_employer,
          socso_employee, socso_employer,
          eis_employee, eis_employer,
          pcb,
          total_deductions, net_pay, employer_total_cost
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        runId, emp.id,
        basicSalary, fixedAllowance, claimsAmount,
        unpaidDays, unpaidDeduction,
        grossSalary,
        statutory.epf.employee, statutory.epf.employer,
        statutory.socso.employee, statutory.socso.employer,
        statutory.eis.employee, statutory.eis.employer,
        statutory.pcb,
        totalDeductionsForEmp, netPay, employerCost
      ]);

      totalGross += grossSalary;
      totalDeductions += totalDeductionsForEmp;
      totalNet += netPay;
      totalEmployerCost += employerCost;
      employeeCount++;
    }

    // Update run totals
    await client.query(`
      UPDATE payroll_runs SET
        total_gross = $1, total_deductions = $2, total_net = $3,
        total_employer_cost = $4, employee_count = $5
      WHERE id = $6
    `, [totalGross, totalDeductions, totalNet, totalEmployerCost, employeeCount, runId]);

    await client.query('COMMIT');

    const response = {
      message: `Payroll run created with ${employeeCount} employees`,
      run: runResult.rows[0],
      employee_count: employeeCount,
      total_net: totalNet
    };

    // Add warning if some employees have no salary set
    if (skippedNames.length > 0) {
      response.warning = `${skippedNames.length} employee(s) have no basic salary set: ${skippedNames.join(', ')}. Please edit their payroll items to add salary.`;
      response.employees_without_salary = skippedNames;
    }

    res.status(201).json(response);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating payroll run:', error);
    res.status(500).json({ error: 'Failed to create payroll run' });
  } finally {
    client.release();
  }
});

// Update payroll item (manual adjustments)
router.put('/items/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      basic_salary,
      fixed_allowance,
      ot_amount,
      incentive_amount,
      commission_amount,
      bonus,
      other_earnings,
      other_deductions,
      deduction_remarks,
      notes
    } = req.body;

    // Get current item and employee data
    const itemResult = await pool.query(`
      SELECT pi.*, pr.month, pr.year, pr.status as run_status,
             e.date_of_birth, e.epf_contribution_type, e.marital_status, e.spouse_working, e.children_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = $1
    `, [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = itemResult.rows[0];

    if (item.run_status === 'finalized') {
      return res.status(400).json({ error: 'Cannot edit finalized payroll' });
    }

    // Calculate new values
    const newBasic = parseFloat(basic_salary) || item.basic_salary;
    const newAllowance = parseFloat(fixed_allowance) || item.fixed_allowance;
    const newOT = parseFloat(ot_amount) || 0;
    const newIncentive = parseFloat(incentive_amount) || 0;
    const newCommission = parseFloat(commission_amount) || 0;
    const newBonus = parseFloat(bonus) || 0;
    const newOtherEarnings = parseFloat(other_earnings) || 0;
    const newOtherDeductions = parseFloat(other_deductions) || 0;

    // Gross salary
    const grossSalary = (
      newBasic + newAllowance + newOT + newIncentive + newCommission +
      newBonus + newOtherEarnings + parseFloat(item.claims_amount || 0) -
      parseFloat(item.unpaid_leave_deduction || 0)
    );

    // Recalculate statutory
    const statutory = calculateAllStatutory(grossSalary, item, item.month, null);

    // Total deductions
    const totalDeductions = (
      parseFloat(item.unpaid_leave_deduction || 0) +
      statutory.epf.employee +
      statutory.socso.employee +
      statutory.eis.employee +
      statutory.pcb +
      newOtherDeductions
    );

    // Net pay
    const netPay = grossSalary + parseFloat(item.unpaid_leave_deduction || 0) - totalDeductions;

    // Employer cost
    const employerCost = grossSalary + statutory.epf.employer + statutory.socso.employer + statutory.eis.employer;

    // Update item
    const result = await pool.query(`
      UPDATE payroll_items SET
        basic_salary = $1, fixed_allowance = $2, ot_amount = $3,
        incentive_amount = $4, commission_amount = $5, bonus = $6,
        other_earnings = $7, other_deductions = $8, deduction_remarks = $9,
        gross_salary = $10,
        epf_employee = $11, epf_employer = $12,
        socso_employee = $13, socso_employer = $14,
        eis_employee = $15, eis_employer = $16,
        pcb = $17,
        total_deductions = $18, net_pay = $19, employer_total_cost = $20,
        notes = $21, updated_at = NOW()
      WHERE id = $22
      RETURNING *
    `, [
      newBasic, newAllowance, newOT, newIncentive, newCommission, newBonus,
      newOtherEarnings, newOtherDeductions, deduction_remarks,
      grossSalary,
      statutory.epf.employee, statutory.epf.employer,
      statutory.socso.employee, statutory.socso.employer,
      statutory.eis.employee, statutory.eis.employer,
      statutory.pcb,
      totalDeductions, netPay, employerCost,
      notes, id
    ]);

    // Update run totals
    await updateRunTotals(item.payroll_run_id);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payroll item:', error);
    res.status(500).json({ error: 'Failed to update payroll item' });
  }
});

// Finalize payroll run
router.post('/runs/:id/finalize', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check run exists and is draft
    const run = await client.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);

    if (run.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (run.rows[0].status === 'finalized') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payroll run is already finalized' });
    }

    // Link all approved claims to payroll items
    const items = await client.query(
      'SELECT id, employee_id FROM payroll_items WHERE payroll_run_id = $1',
      [id]
    );

    const startOfMonth = `${run.rows[0].year}-${String(run.rows[0].month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(run.rows[0].year, run.rows[0].month, 0).toISOString().split('T')[0];

    for (const item of items.rows) {
      await client.query(`
        UPDATE claims SET linked_payroll_item_id = $1, updated_at = NOW()
        WHERE employee_id = $2
          AND status = 'approved'
          AND linked_payroll_item_id IS NULL
          AND claim_date BETWEEN $3 AND $4
      `, [item.id, item.employee_id, startOfMonth, endOfMonth]);
    }

    // Update run status
    await client.query(`
      UPDATE payroll_runs SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [id]);

    await client.query('COMMIT');

    res.json({ message: 'Payroll run finalized successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error finalizing payroll run:', error);
    res.status(500).json({ error: 'Failed to finalize payroll run' });
  } finally {
    client.release();
  }
});

// Delete payroll run (only draft)
router.delete('/runs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM payroll_runs WHERE id = $1 AND status = 'draft' RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found or already finalized' });
    }

    res.json({ message: 'Payroll run deleted' });
  } catch (error) {
    console.error('Error deleting payroll run:', error);
    res.status(500).json({ error: 'Failed to delete payroll run' });
  }
});

// =====================================================
// PAYSLIPS & BANK FILE
// =====================================================

// Get payslip for a single item
router.get('/items/:id/payslip', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        pi.*,
        pr.month, pr.year, pr.status as run_status,
        e.employee_id as emp_code,
        e.name as employee_name,
        e.ic_number,
        e.epf_number,
        e.socso_number,
        e.tax_number,
        e.bank_name,
        e.bank_account_no,
        e.position,
        e.join_date,
        d.name as department_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = result.rows[0];

    const payslip = {
      company: {
        name: 'AA ALIVE SDN BHD',
        address: '',
        epf_number: '',
        socso_number: ''
      },
      employee: {
        code: item.emp_code,
        name: item.employee_name,
        ic_number: item.ic_number,
        epf_number: item.epf_number,
        socso_number: item.socso_number,
        tax_number: item.tax_number,
        department: item.department_name,
        position: item.position,
        join_date: item.join_date,
        bank_name: item.bank_name,
        bank_account_no: item.bank_account_no
      },
      period: {
        month: item.month,
        year: item.year,
        month_name: new Date(item.year, item.month - 1).toLocaleString('en-MY', { month: 'long' })
      },
      earnings: {
        basic_salary: parseFloat(item.basic_salary) || 0,
        fixed_allowance: parseFloat(item.fixed_allowance) || 0,
        ot_amount: parseFloat(item.ot_amount) || 0,
        incentive_amount: parseFloat(item.incentive_amount) || 0,
        commission_amount: parseFloat(item.commission_amount) || 0,
        claims_amount: parseFloat(item.claims_amount) || 0,
        bonus: parseFloat(item.bonus) || 0,
        other_earnings: parseFloat(item.other_earnings) || 0
      },
      deductions: {
        unpaid_leave_days: parseFloat(item.unpaid_leave_days) || 0,
        unpaid_leave_deduction: parseFloat(item.unpaid_leave_deduction) || 0,
        epf_employee: parseFloat(item.epf_employee) || 0,
        socso_employee: parseFloat(item.socso_employee) || 0,
        eis_employee: parseFloat(item.eis_employee) || 0,
        pcb: parseFloat(item.pcb) || 0,
        other_deductions: parseFloat(item.other_deductions) || 0
      },
      employer_contributions: {
        epf_employer: parseFloat(item.epf_employer) || 0,
        socso_employer: parseFloat(item.socso_employer) || 0,
        eis_employer: parseFloat(item.eis_employer) || 0
      },
      totals: {
        gross_salary: parseFloat(item.gross_salary) || 0,
        total_deductions: parseFloat(item.total_deductions) || 0,
        net_pay: parseFloat(item.net_pay) || 0
      }
    };

    res.json(payslip);
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({ error: 'Failed to fetch payslip' });
  }
});

// Generate bank file for a payroll run
router.get('/runs/:id/bank-file', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        e.name as employee_name,
        e.bank_name,
        e.bank_account_no,
        pi.net_pay
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1 AND pi.net_pay > 0
      ORDER BY e.name
    `, [id]);

    // Generate CSV content
    let csv = 'Bank Name,Account Number,Employee Name,Net Pay\n';
    result.rows.forEach(row => {
      csv += `"${row.bank_name || ''}","${row.bank_account_no || ''}","${row.employee_name}",${row.net_pay}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=bank_payment_${id}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error generating bank file:', error);
    res.status(500).json({ error: 'Failed to generate bank file' });
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getWorkingDaysInMonth(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  let workingDays = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) { // Not Sunday or Saturday
      workingDays++;
    }
  }

  return workingDays;
}

async function updateRunTotals(runId) {
  await pool.query(`
    UPDATE payroll_runs SET
      total_gross = (SELECT COALESCE(SUM(gross_salary), 0) FROM payroll_items WHERE payroll_run_id = $1),
      total_deductions = (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_items WHERE payroll_run_id = $1),
      total_net = (SELECT COALESCE(SUM(net_pay), 0) FROM payroll_items WHERE payroll_run_id = $1),
      total_employer_cost = (SELECT COALESCE(SUM(employer_total_cost), 0) FROM payroll_items WHERE payroll_run_id = $1),
      employee_count = (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = $1),
      updated_at = NOW()
    WHERE id = $1
  `, [runId]);
}

module.exports = router;
