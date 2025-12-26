const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { calculateAllStatutory, calculateOT, calculatePublicHolidayPay, getPublicHolidaysInMonth } = require('../utils/statutory');
const { calculateOTFromClockIn, calculatePHDaysWorked } = require('../utils/otCalculation');

// =====================================================
// PAYROLL RUNS
// =====================================================

// Get all payroll runs
router.get('/runs', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.query;

    let query = `
      SELECT pr.*,
             d.name as department_name,
             (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = pr.id) as item_count
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (year) {
      query += ` AND pr.year = $1`;
      params.push(year);
    }

    query += ' ORDER BY pr.year DESC, pr.month DESC, d.name NULLS FIRST';

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

    // Get run details with department name
    const runResult = await pool.query(`
      SELECT pr.*, d.name as department_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE pr.id = $1
    `, [id]);

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
    const { month, year, notes, department_id } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    await client.query('BEGIN');

    // Check if run already exists for this month/year/department combination
    let existingQuery = 'SELECT id FROM payroll_runs WHERE month = $1 AND year = $2';
    let existingParams = [month, year];

    if (department_id) {
      existingQuery += ' AND department_id = $3';
      existingParams.push(department_id);
    } else {
      existingQuery += ' AND department_id IS NULL';
    }

    const existing = await client.query(existingQuery, existingParams);

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: department_id
          ? 'Payroll run already exists for this department and month'
          : 'Payroll run already exists for this month (all departments)',
        existing_id: existing.rows[0].id
      });
    }

    // Get department name if filtering by department
    let departmentName = null;
    if (department_id) {
      const deptResult = await client.query('SELECT name FROM departments WHERE id = $1', [department_id]);
      if (deptResult.rows.length > 0) {
        departmentName = deptResult.rows[0].name;
      }
    }

    // Get company ID
    const companyId = req.companyId || 1;

    // Get payroll period configuration
    const periodConfig = await getPayrollPeriodConfig(companyId, department_id, month, year);
    console.log(`Payroll period: ${periodConfig.period.label}`);
    console.log(`Period dates: ${periodConfig.period.start.toISOString().split('T')[0]} to ${periodConfig.period.end.toISOString().split('T')[0]}`);

    // Create payroll run with department info and period dates
    const runResult = await client.query(`
      INSERT INTO payroll_runs (month, year, status, notes, department_id, company_id,
                                period_start_date, period_end_date, payment_due_date, period_label)
      VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      month, year,
      notes || (departmentName ? `${departmentName} Department` : null),
      department_id || null,
      companyId,
      periodConfig.period.start.toISOString().split('T')[0],
      periodConfig.period.end.toISOString().split('T')[0],
      periodConfig.payment.date.toISOString().split('T')[0],
      periodConfig.period.label
    ]);

    const runId = runResult.rows[0].id;

    // Get active employees (optionally filtered by department)
    let employeeQuery = `
      SELECT e.*,
             e.default_basic_salary as basic_salary,
             e.default_allowance as fixed_allowance,
             d.name as department_name,
             d.payroll_structure_code
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
    `;
    let employeeParams = [];

    if (department_id) {
      employeeQuery += ' AND e.department_id = $1';
      employeeParams.push(department_id);
    }

    const employees = await client.query(employeeQuery, employeeParams);

    // Get company settings for Indoor Sales calculation
    const companySettingsResult = await client.query(
      'SELECT settings FROM companies WHERE id = $1',
      [req.companyId || 1]
    );
    const companySettings = companySettingsResult.rows[0]?.settings || {};
    const indoorSalesBasic = companySettings.indoor_sales_basic || 4000;
    const indoorSalesCommissionRate = companySettings.indoor_sales_commission_rate || 6;

    // Get sales data for Indoor Sales employees
    const salesResult = await client.query(`
      SELECT employee_id, SUM(total_sales) as total_monthly_sales
      FROM sales_records
      WHERE month = $1 AND year = $2
      GROUP BY employee_id
    `, [month, year]);

    const salesMap = {};
    salesResult.rows.forEach(r => {
      salesMap[r.employee_id] = parseFloat(r.total_monthly_sales) || 0;
    });

    console.log('Found active employees:', employees.rows.length);
    console.log('Employee names:', employees.rows.map(e => e.name));
    if (department_id) {
      console.log('Filtered by department_id:', department_id);
    }

    // Get previous month's payroll data for salary carry-forward
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // Look for previous month's payroll - first try same department, then any department
    let prevPayrollQuery = `
      SELECT pi.employee_id, pi.basic_salary, pi.fixed_allowance
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.month = $1 AND pr.year = $2
    `;
    let prevPayrollParams = [prevMonth, prevYear];

    if (department_id) {
      // First try to find previous payroll for same department
      prevPayrollQuery += ' AND (pr.department_id = $3 OR pr.department_id IS NULL)';
      prevPayrollParams.push(department_id);
    }

    const prevPayrollResult = await client.query(prevPayrollQuery, prevPayrollParams);

    // Create map of previous month's salaries
    const prevSalaryMap = {};
    prevPayrollResult.rows.forEach(row => {
      prevSalaryMap[row.employee_id] = {
        basic_salary: parseFloat(row.basic_salary) || 0,
        fixed_allowance: parseFloat(row.fixed_allowance) || 0
      };
    });

    console.log(`Previous payroll (${prevMonth}/${prevYear}): ${prevPayrollResult.rows.length} records found`);

    // Check for employees without salary data (considering carry-forward)
    const employeesWithoutSalary = employees.rows.filter(emp => {
      const prevSalary = prevSalaryMap[emp.id];
      const hasPrevSalary = prevSalary && prevSalary.basic_salary > 0;
      const hasDefaultSalary = emp.basic_salary && parseFloat(emp.basic_salary) > 0;
      return !hasPrevSalary && !hasDefaultSalary;
    });
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

    // Get flexible commissions for each employee
    const commissionsResult = await client.query(`
      SELECT ec.employee_id,
             SUM(ec.amount) as total_commissions,
             json_agg(json_build_object('type', ct.name, 'amount', ec.amount)) as commission_details
      FROM employee_commissions ec
      JOIN commission_types ct ON ec.commission_type_id = ct.id
      WHERE ec.is_active = TRUE AND ct.is_active = TRUE
      GROUP BY ec.employee_id
    `);

    const commissionsMap = {};
    commissionsResult.rows.forEach(r => {
      commissionsMap[r.employee_id] = {
        total: parseFloat(r.total_commissions) || 0,
        details: r.commission_details
      };
    });

    // Get flexible allowances for each employee
    const allowancesResult = await client.query(`
      SELECT ea.employee_id,
             SUM(ea.amount) as total_allowances,
             json_agg(json_build_object('type', at.name, 'amount', ea.amount, 'taxable', at.is_taxable)) as allowance_details
      FROM employee_allowances ea
      JOIN allowance_types at ON ea.allowance_type_id = at.id
      WHERE ea.is_active = TRUE AND at.is_active = TRUE
      GROUP BY ea.employee_id
    `);

    const allowancesMap = {};
    allowancesResult.rows.forEach(r => {
      allowancesMap[r.employee_id] = {
        total: parseFloat(r.total_allowances) || 0,
        details: r.allowance_details
      };
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployerCost = 0;
    let employeeCount = 0;
    let carriedForwardCount = 0;

    // Create payroll item for each employee
    // Note: We process ALL employees including those with zero salary
    // Commission is included in gross for statutory deduction calculation
    for (const emp of employees.rows) {
      // Salary carry-forward: Use previous month's salary if available, otherwise use employee default
      const prevSalary = prevSalaryMap[emp.id];
      let basicSalary = prevSalary ? prevSalary.basic_salary : (parseFloat(emp.basic_salary) || 0);
      const fixedAllowance = prevSalary ? prevSalary.fixed_allowance : (parseFloat(emp.fixed_allowance) || 0);

      // Get flexible commissions and allowances
      const flexCommissions = commissionsMap[emp.id] || { total: 0, details: [] };
      const flexAllowances = allowancesMap[emp.id] || { total: 0, details: [] };
      let commissionAmount = flexCommissions.total; // Auto-populated from employee settings
      const flexAllowanceAmount = flexAllowances.total; // Additional allowances from settings

      const unpaidDays = unpaidLeaveMap[emp.id] || 0;
      const claimsAmount = claimsMap[emp.id] || 0;

      // Indoor Sales special logic: compare basic vs commission, take higher
      let salaryCalculationMethod = null;
      let salesAmount = 0;

      if (emp.payroll_structure_code === 'indoor_sales') {
        salesAmount = salesMap[emp.id] || 0;
        const calculatedCommission = salesAmount * (indoorSalesCommissionRate / 100);

        if (calculatedCommission >= indoorSalesBasic) {
          // Use commission (it's higher)
          basicSalary = calculatedCommission;
          commissionAmount = 0; // Already included in basic
          salaryCalculationMethod = 'commission';
          console.log(`${emp.name} (Indoor Sales): Using commission RM${calculatedCommission.toFixed(2)} (sales: RM${salesAmount})`);
        } else {
          // Use basic (it's higher)
          basicSalary = indoorSalesBasic;
          commissionAmount = 0; // Not applicable when using basic
          salaryCalculationMethod = 'basic';
          console.log(`${emp.name} (Indoor Sales): Using basic RM${indoorSalesBasic} (commission would be RM${calculatedCommission.toFixed(2)})`);
        }
      }

      // Track carry-forward
      if (prevSalary) {
        carriedForwardCount++;
      }

      // DEBUG: Log salary values
      const salarySource = prevSalary ? 'previous month' : 'employee default';
      console.log(`Processing ${emp.name}: basic=${basicSalary}, allowance=${fixedAllowance} (from ${salarySource})`);

      // =====================================================
      // AUTO-CALCULATE OT FROM CLOCK-IN RECORDS
      // =====================================================
      let otHours = 0;
      let otAmount = 0;
      let phDaysWorked = 0;
      let phPay = 0;

      try {
        // Get employee-specific period config (may differ by department)
        const empPeriodConfig = await getPayrollPeriodConfig(companyId, emp.department_id, month, year);

        // Calculate OT from clock-in records
        const otResult = await calculateOTFromClockIn(
          emp.id,
          companyId,
          emp.department_id,
          empPeriodConfig.period.start.toISOString().split('T')[0],
          empPeriodConfig.period.end.toISOString().split('T')[0],
          basicSalary
        );

        otHours = otResult.total_ot_hours || 0;
        otAmount = otResult.total_ot_amount || 0;

        // Calculate PH days worked and PH pay
        phDaysWorked = await calculatePHDaysWorked(
          emp.id,
          companyId,
          empPeriodConfig.period.start.toISOString().split('T')[0],
          empPeriodConfig.period.end.toISOString().split('T')[0]
        );

        if (phDaysWorked > 0 && basicSalary > 0) {
          // PH pay = extra 1.0x daily rate for working on PH (on top of normal pay)
          const dailyRateForPH = basicSalary / 22;
          phPay = phDaysWorked * dailyRateForPH;
        }

        if (otHours > 0 || phDaysWorked > 0) {
          console.log(`${emp.name}: OT ${otHours}hrs = RM${otAmount}, PH ${phDaysWorked}days = RM${phPay}`);
        }
      } catch (otError) {
        console.error(`Error calculating OT for ${emp.name}:`, otError.message);
        // Continue without OT if calculation fails
      }

      // Calculate unpaid leave deduction (based on basic salary only)
      const dailyRate = basicSalary > 0 ? basicSalary / workingDaysInMonth : 0;
      const unpaidDeduction = dailyRate * unpaidDays;

      // Gross salary = basic + allowance + flex allowances + OT + PH pay + commission + claims - unpaid leave
      // Commission and flexible allowances are auto-populated from employee settings
      // OT and PH pay are auto-calculated from clock-in records
      const totalAllowances = fixedAllowance + flexAllowanceAmount;
      const grossBeforeUnpaid = basicSalary + totalAllowances + otAmount + phPay + commissionAmount + claimsAmount;
      const grossSalary = Math.max(0, grossBeforeUnpaid - unpaidDeduction);

      // DEBUG: Log gross calculation
      console.log(`${emp.name}: gross=${grossSalary} (basic:${basicSalary} + allow:${totalAllowances} + OT:${otAmount} + PH:${phPay} + comm:${commissionAmount} + claims:${claimsAmount} - unpaid:${unpaidDeduction})`);

      // IMPORTANT: Statutory deductions only apply to: basic + commission + bonus
      // OT, allowance, outstation, incentive are NOT subject to EPF, SOCSO, EIS, PCB
      // At payroll creation, bonus is 0 (can be added later via edit)
      const statutoryBase = basicSalary + commissionAmount; // bonus added during edit
      console.log(`${emp.name}: statutory base (basic + commission) = ${statutoryBase}`);

      // Calculate statutory deductions based on statutory base only
      // EPF, SOCSO, EIS are calculated even for zero salary (will be zero)
      // This uses IC number to detect Malaysian and age
      const statutory = calculateAllStatutory(statutoryBase, emp, month, null);

      // Total deductions
      const totalDeductionsForEmp = (
        unpaidDeduction +
        statutory.epf.employee +
        statutory.socso.employee +
        statutory.eis.employee +
        statutory.pcb
      );

      // Net pay (can be negative if deductions > earnings)
      const netPay = grossBeforeUnpaid - totalDeductionsForEmp;

      // Employer total cost = gross + employer contributions
      const employerCost = grossSalary + statutory.epf.employer + statutory.socso.employer + statutory.eis.employer;

      // Insert payroll item (fixed_allowance now includes flex allowances combined)
      // OT and PH pay are auto-calculated from clock-in records
      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id,
          basic_salary, fixed_allowance, commission_amount, claims_amount,
          ot_hours, ot_amount, ph_days_worked, ph_pay,
          unpaid_leave_days, unpaid_leave_deduction,
          gross_salary,
          epf_employee, epf_employer,
          socso_employee, socso_employer,
          eis_employee, eis_employer,
          pcb,
          total_deductions, net_pay, employer_total_cost,
          sales_amount, salary_calculation_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      `, [
        runId, emp.id,
        basicSalary, totalAllowances, commissionAmount, claimsAmount,
        otHours, otAmount, phDaysWorked, phPay,
        unpaidDays, unpaidDeduction,
        grossSalary,
        statutory.epf.employee, statutory.epf.employer,
        statutory.socso.employee, statutory.socso.employer,
        statutory.eis.employee, statutory.eis.employer,
        statutory.pcb,
        totalDeductionsForEmp, netPay, employerCost,
        salesAmount, salaryCalculationMethod
      ]);

      totalGross += grossSalary;
      totalDeductions += totalDeductionsForEmp;
      totalNet += netPay;
      totalEmployerCost += employerCost;
      employeeCount++;
      console.log(`Created payroll item for ${emp.name}, basic: ${basicSalary}`);
    }

    console.log('Total employees processed:', employeeCount);

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
      total_net: totalNet,
      carried_forward_count: carriedForwardCount
    };

    // Add info about salary carry-forward
    if (carriedForwardCount > 0) {
      response.info = `${carriedForwardCount} employee(s) had salary carried forward from ${prevMonth}/${prevYear}`;
    }

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
      ot_hours,
      ot_amount,
      ph_days_worked,    // Public holiday days worked
      ph_pay,            // Public holiday extra pay
      incentive_amount,
      commission_amount,
      trade_commission_amount,  // Upsell commission for Driver
      outstation_amount,
      bonus,
      other_deductions,
      deduction_remarks,
      notes
    } = req.body;

    // Get current item and employee data (including ic_number for age calculation)
    const itemResult = await pool.query(`
      SELECT pi.*, pr.month, pr.year, pr.status as run_status,
             e.ic_number, e.date_of_birth, e.epf_contribution_type, e.marital_status, e.spouse_working, e.children_count
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
    const newBasic = parseFloat(basic_salary) || parseFloat(item.basic_salary) || 0;
    const newAllowance = parseFloat(fixed_allowance) || parseFloat(item.fixed_allowance) || 0;
    const newOTHours = parseFloat(ot_hours) || 0;
    const newOT = parseFloat(ot_amount) || 0;  // OT amount (1.0x rate, not subject to deductions)
    const newPHDays = parseFloat(ph_days_worked) || 0;
    const newPHPay = parseFloat(ph_pay) || 0;  // PH extra pay (1.0x daily rate, not subject to deductions)
    const newIncentive = parseFloat(incentive_amount) || 0;
    const newCommission = parseFloat(commission_amount) || 0;
    const newTradeCommission = parseFloat(trade_commission_amount) || 0;  // Upsell commission
    const newOutstation = parseFloat(outstation_amount) || 0;
    const newBonus = parseFloat(bonus) || 0;
    const newOtherDeductions = parseFloat(other_deductions) || 0;

    // DEBUG: Log incoming values
    console.log(`UPDATE Item ${id}: incoming basic_salary=${basic_salary}, item.basic_salary=${item.basic_salary}, newBasic=${newBasic}`);

    // Gross salary (includes all earning components)
    // Payroll Structure:
    // - Office: basic + allowance + bonus + OT + PH pay
    // - Indoor Sales: basic + commission
    // - Outdoor Sales: basic + commission + allowance + bonus
    // - Driver: basic + upsell commission (trade_commission) + outstation + OT + trip commission + PH pay
    // Note: OT and PH pay are NOT subject to statutory deductions
    const grossSalary = (
      newBasic + newAllowance + newOT + newPHPay + newIncentive + newCommission +
      newTradeCommission + newOutstation + newBonus +
      parseFloat(item.claims_amount || 0) - parseFloat(item.unpaid_leave_deduction || 0)
    );

    // DEBUG: Log gross calculation
    console.log(`UPDATE Gross calc: basic=${newBasic} + allow=${newAllowance} + ot=${newOT} + ph=${newPHPay} + incent=${newIncentive} + comm=${newCommission} + trade=${newTradeCommission} + outstation=${newOutstation} + bonus=${newBonus} + claims=${item.claims_amount || 0} - unpaid=${item.unpaid_leave_deduction || 0} = ${grossSalary}`);

    // IMPORTANT: Statutory deductions only apply to: basic + commission + bonus
    // OT, allowance, outstation, incentive are NOT subject to EPF, SOCSO, EIS, PCB
    const statutoryBase = newBasic + newCommission + newTradeCommission + newBonus;
    console.log(`Statutory base (basic + commission + bonus): ${statutoryBase}`);

    // Recalculate statutory on the statutory base only
    const statutory = calculateAllStatutory(statutoryBase, item, item.month, null);

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
        basic_salary = $1, fixed_allowance = $2,
        ot_hours = $3, ot_amount = $4,
        ph_days_worked = $5, ph_pay = $6,
        incentive_amount = $7, commission_amount = $8,
        trade_commission_amount = $9, outstation_amount = $10, bonus = $11,
        other_deductions = $12, deduction_remarks = $13,
        gross_salary = $14,
        epf_employee = $15, epf_employer = $16,
        socso_employee = $17, socso_employer = $18,
        eis_employee = $19, eis_employer = $20,
        pcb = $21,
        total_deductions = $22, net_pay = $23, employer_total_cost = $24,
        notes = $25, updated_at = NOW()
      WHERE id = $26
      RETURNING *
    `, [
      newBasic, newAllowance,
      newOTHours, newOT,
      newPHDays, newPHPay,
      newIncentive, newCommission,
      newTradeCommission, newOutstation, newBonus,
      newOtherDeductions, deduction_remarks,
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
        ot_hours: parseFloat(item.ot_hours) || 0,
        ot_amount: parseFloat(item.ot_amount) || 0,
        ph_days_worked: parseFloat(item.ph_days_worked) || 0,
        ph_pay: parseFloat(item.ph_pay) || 0,
        incentive_amount: parseFloat(item.incentive_amount) || 0,
        commission_amount: parseFloat(item.commission_amount) || 0,
        trade_commission_amount: parseFloat(item.trade_commission_amount) || 0,
        outstation_amount: parseFloat(item.outstation_amount) || 0,
        claims_amount: parseFloat(item.claims_amount) || 0,
        bonus: parseFloat(item.bonus) || 0
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

/**
 * Get payroll period configuration for a company/department
 * Returns period start/end dates and payment date
 */
async function getPayrollPeriodConfig(companyId, departmentId, month, year) {
  // Try to get department-specific config first, then company default
  const result = await pool.query(`
    SELECT * FROM payroll_period_configs
    WHERE company_id = $1
      AND (department_id = $2 OR department_id IS NULL)
      AND is_active = TRUE
    ORDER BY department_id NULLS LAST
    LIMIT 1
  `, [companyId, departmentId]);

  const config = result.rows[0] || {
    period_type: 'calendar_month',
    period_start_day: 1,
    period_end_day: 0,
    payment_day: 5,
    payment_month_offset: 1,
    commission_period_offset: 0
  };

  // Calculate actual period dates
  let periodStart, periodEnd, periodLabel;

  switch (config.period_type) {
    case 'mid_month':
      // 15th of previous month to 14th of current month
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      periodStart = new Date(prevYear, prevMonth - 1, config.period_start_day);
      periodEnd = new Date(year, month - 1, config.period_end_day);
      periodLabel = `${getMonthName(prevMonth)} ${config.period_start_day} - ${getMonthName(month)} ${config.period_end_day}, ${year}`;
      break;

    case 'calendar_month':
    default:
      periodStart = new Date(year, month - 1, 1);
      periodEnd = new Date(year, month, 0); // Last day of month
      periodLabel = `${getMonthName(month)} ${year}`;
      break;
  }

  // Calculate payment date
  let payMonth = month + (config.payment_month_offset || 0);
  let payYear = year;
  if (payMonth > 12) {
    payMonth -= 12;
    payYear += 1;
  }
  const paymentDate = new Date(payYear, payMonth - 1, config.payment_day);

  // Calculate commission period (may be different from salary period)
  let commPeriodStart = periodStart;
  let commPeriodEnd = periodEnd;
  let commPeriodLabel = periodLabel;

  if (config.commission_period_offset && config.commission_period_offset !== 0) {
    let commMonth = month + config.commission_period_offset;
    let commYear = year;
    if (commMonth < 1) {
      commMonth += 12;
      commYear -= 1;
    } else if (commMonth > 12) {
      commMonth -= 12;
      commYear += 1;
    }
    commPeriodStart = new Date(commYear, commMonth - 1, 1);
    commPeriodEnd = new Date(commYear, commMonth, 0);
    commPeriodLabel = `${getMonthName(commMonth)} ${commYear}`;
  }

  return {
    config,
    period: {
      start: periodStart,
      end: periodEnd,
      label: periodLabel
    },
    payment: {
      date: paymentDate,
      day: config.payment_day,
      month_offset: config.payment_month_offset
    },
    commission_period: {
      start: commPeriodStart,
      end: commPeriodEnd,
      label: commPeriodLabel,
      offset: config.commission_period_offset || 0
    }
  };
}

function getMonthName(month) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || '';
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
