require('dotenv').config();
const pool = require('../db');
const { calculateAllStatutory, calculateAgeFromIC } = require('../utils/statutory');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Temporarily disable finalization lock trigger
    await client.query('ALTER TABLE payroll_items DISABLE TRIGGER payroll_item_finalization_lock');
    console.log('Disabled finalization lock trigger');

    const payrollRunId = 432;

    // Get employee details for statutory calculation
    const empDetails = await client.query(
      `SELECT e.id, e.employee_id, e.name, e.ic_number, e.date_of_birth,
        e.marital_status, e.spouse_working, e.children_count,
        e.residency_status
      FROM employees e
      WHERE e.id IN (227, 220, 225)`
    );

    const empMap = {};
    empDetails.rows.forEach(e => { empMap[e.id] = e; });

    // Get YTD data for each employee (months before Jan = nothing)
    // Jan is month 1, so YTD from previous months = 0

    // Amendment data from spreadsheet
    const amendments = [
      {
        pi_id: 4723,
        emp_id: 227, // SVATIKAH
        basic_salary: 923.04, // 76.92 * 12 days
        ot_hours: 0,
        ot_amount: 0,
        gross: 923.04
      },
      {
        pi_id: 4721,
        emp_id: 220, // PTNAYUNI
        basic_salary: 0,
        ot_hours: 15.5,
        ot_amount: 202.74, // 8.72 * 15.5 * 1.5 = 202.74
        gross: 202.74
      },
      {
        pi_id: 4718,
        emp_id: 225, // PTWISYA
        basic_salary: 0,
        ot_hours: 12.5,
        ot_amount: 163.50, // 8.72 * 12.5 * 1.5 = 163.50
        gross: 163.50
      }
    ];

    for (const amend of amendments) {
      const emp = empMap[amend.emp_id];

      // Calculate statutory on new gross
      const employeeObj = {
        ic_number: emp.ic_number,
        date_of_birth: emp.date_of_birth,
        marital_status: emp.marital_status || 'single',
        spouse_working: emp.spouse_working || false,
        children_count: emp.children_count || 0,
        residency_status: emp.residency_status || 'malaysian',
        is_disabled: false,
        spouse_disabled: false
      };

      const salaryBreakdown = {
        basic: amend.basic_salary,
        allowance: 0,
        commission: 0,
        bonus: 0,
        ot: amend.ot_amount,
        pcbGross: amend.gross
      };

      const ytdData = { ytdGross: 0, ytdEPF: 0, ytdPCB: 0, ytdZakat: 0 };

      const statutory = calculateAllStatutory(amend.gross, employeeObj, 1, ytdData, salaryBreakdown);

      const epfEmployee = statutory.epf.employee || 0;
      const epfEmployer = statutory.epf.employer || 0;
      const socsoEmployee = statutory.socso.employee || 0;
      const socsoEmployer = statutory.socso.employer || 0;
      const eisEmployee = statutory.eis.employee || 0;
      const eisEmployer = statutory.eis.employer || 0;
      const pcb = statutory.pcb || 0;

      const totalDeductions = epfEmployee + socsoEmployee + eisEmployee + pcb;
      const netPay = amend.gross - totalDeductions;
      const employerTotalCost = amend.gross + epfEmployer + socsoEmployer + eisEmployer;

      console.log(`\n${emp.employee_id} | ${emp.name}`);
      console.log(`  Gross: ${amend.gross} | EPF: ${epfEmployee} | SOCSO: ${socsoEmployee} | EIS: ${eisEmployee} | PCB: ${pcb}`);
      console.log(`  Total Deductions: ${totalDeductions} | Net: ${netPay}`);
      console.log(`  Employer EPF: ${epfEmployer} | SOCSO: ${socsoEmployer} | EIS: ${eisEmployer}`);

      // Update payroll item
      await client.query(
        `UPDATE payroll_items SET
          basic_salary = $1,
          ot_hours = $2,
          ot_amount = $3,
          fixed_allowance = 0,
          commission_amount = 0,
          incentive_amount = 0,
          attendance_bonus = 0,
          other_earnings = 0,
          gross_salary = $4,
          epf_employee = $5,
          epf_employer = $6,
          socso_employee = $7,
          socso_employer = $8,
          eis_employee = $9,
          eis_employer = $10,
          pcb = $11,
          total_deductions = $12,
          net_pay = $13,
          employer_total_cost = $14,
          statutory_base = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $15`,
        [
          amend.basic_salary,
          amend.ot_hours,
          amend.ot_amount,
          amend.gross,
          epfEmployee,
          epfEmployer,
          socsoEmployee,
          socsoEmployer,
          eisEmployee,
          eisEmployer,
          pcb,
          totalDeductions,
          netPay,
          employerTotalCost,
          amend.pi_id
        ]
      );

      console.log(`  ✓ Updated payroll_item id=${amend.pi_id}`);
    }

    // Update payroll_run totals
    const totals = await client.query(
      `SELECT
        COUNT(*) as emp_count,
        COALESCE(SUM(gross_salary), 0) as total_gross,
        COALESCE(SUM(total_deductions), 0) as total_deductions,
        COALESCE(SUM(net_pay), 0) as total_net,
        COALESCE(SUM(employer_total_cost), 0) as total_employer_cost
      FROM payroll_items WHERE payroll_run_id = $1`,
      [payrollRunId]
    );

    const t = totals.rows[0];
    await client.query(
      `UPDATE payroll_runs SET
        total_gross = $1,
        total_deductions = $2,
        total_net = $3,
        total_employer_cost = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5`,
      [t.total_gross, t.total_deductions, t.total_net, t.total_employer_cost, payrollRunId]
    );

    console.log(`\n✓ Updated payroll_run id=${payrollRunId} totals: gross=${t.total_gross}, net=${t.total_net}`);

    // Re-enable finalization lock trigger
    await client.query('ALTER TABLE payroll_items ENABLE TRIGGER payroll_item_finalization_lock');
    console.log('Re-enabled finalization lock trigger');

    await client.query('COMMIT');
    console.log('\n✅ All updates committed successfully.');
  } catch (err) {
    // Re-enable trigger even on error
    try { await client.query('ALTER TABLE payroll_items ENABLE TRIGGER payroll_item_finalization_lock'); } catch(e) {}
    await client.query('ROLLBACK');
    console.error('Error, rolled back:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
