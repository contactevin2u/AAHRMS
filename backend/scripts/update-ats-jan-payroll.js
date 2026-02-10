const { Pool } = require('pg');
const { calculateAllStatutory } = require('../utils/statutoryCalculator');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const PAYROLL_RUN_ID = 440;

    // 4 employees from the screenshots
    const employees = [
      {
        employee_id: 144, // INTAN NURISYAH
        name: 'INTAN NURISYAH',
        days: 9, hours: 76.5,
        gross: 667.08, net: 587.53,
        bank_name: 'Hong Leong Bank', bank_account_no: '26501054078'
      },
      {
        employee_id: 143, // SHAFRINAZ ZULAIKHA
        name: 'SHAFRINAZ ZULAIKHA',
        days: 4, hours: 34,
        gross: 296.48, net: 261.73,
        bank_name: 'Maybank', bank_account_no: '162290116314'
      },
      {
        employee_id: 366, // AZ-NUR AMIRAH
        name: 'AZ-NUR AMIRAH',
        days: 2, hours: 17,
        gross: 148.24, net: 129.04,
        bank_name: 'Maybank', bank_account_no: '164155654106'
      },
      {
        employee_id: 136, // NUR SYABRA SYATILA
        name: 'NUR SYABRA SYATILA',
        days: 4, hours: 34,
        gross: 296.48, net: 261.73,
        bank_name: 'Bank Islam', bank_account_no: '03090021120217'
      }
    ];

    for (const emp of employees) {
      const totalDed = parseFloat((emp.gross - emp.net).toFixed(2));
      const stat = calculateAllStatutory(emp.gross);
      // Adjust EPF to match exact total deductions from user's document
      const epfEmployee = parseFloat((totalDed - stat.socso_employee - stat.eis_employee).toFixed(2));
      const epfEmployer = stat.epf_employer;

      // Check if payroll item already exists
      const existing = await client.query(
        'SELECT id FROM payroll_items WHERE payroll_run_id = $1 AND employee_id = $2',
        [PAYROLL_RUN_ID, emp.employee_id]
      );

      const employerCost = emp.gross + epfEmployer + stat.socso_employer + stat.eis_employer;

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE payroll_items SET
            wages = $1, part_time_hours = $2, gross_salary = $3, statutory_base = $3,
            epf_employee = $4, epf_employer = $5,
            socso_employee = $6, socso_employer = $7,
            eis_employee = $8, eis_employer = $9,
            pcb = 0, total_deductions = $10, net_pay = $11,
            employer_total_cost = $12, updated_at = NOW()
          WHERE id = $13`,
          [
            emp.gross, emp.hours, emp.gross,
            epfEmployee, epfEmployer,
            stat.socso_employee, stat.socso_employer,
            stat.eis_employee, stat.eis_employer,
            totalDed, emp.net,
            employerCost,
            existing.rows[0].id
          ]
        );
        console.log('UPDATED:', emp.name, '(item ' + existing.rows[0].id + ')');
      } else {
        const res = await client.query(
          `INSERT INTO payroll_items (
            payroll_run_id, employee_id,
            basic_salary, wages, part_time_hours,
            gross_salary, statutory_base,
            epf_employee, epf_employer,
            socso_employee, socso_employer,
            eis_employee, eis_employer,
            pcb, total_deductions, net_pay,
            employer_total_cost, created_at, updated_at
          ) VALUES ($1, $2, 0, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14, NOW(), NOW())
          RETURNING id`,
          [
            PAYROLL_RUN_ID, emp.employee_id,
            emp.gross, emp.hours, emp.gross,
            epfEmployee, epfEmployer,
            stat.socso_employee, stat.socso_employer,
            stat.eis_employee, stat.eis_employer,
            totalDed, emp.net,
            employerCost
          ]
        );
        console.log('INSERTED:', emp.name, '(new item ' + res.rows[0].id + ')');
      }

      // Update employee bank details
      await client.query(
        'UPDATE employees SET bank_name = $1, bank_account_no = $2 WHERE id = $3',
        [emp.bank_name, emp.bank_account_no, emp.employee_id]
      );
      console.log('  Bank updated:', emp.bank_name, emp.bank_account_no);
    }

    // Recalculate payroll run totals
    const totals = await client.query(
      `SELECT COUNT(*) as count,
              SUM(gross_salary) as total_gross,
              SUM(total_deductions) as total_deductions,
              SUM(net_pay) as total_net,
              SUM(employer_total_cost) as total_employer_cost
       FROM payroll_items WHERE payroll_run_id = $1`,
      [PAYROLL_RUN_ID]
    );
    const t = totals.rows[0];
    await client.query(
      `UPDATE payroll_runs SET
        employee_count = $1, total_gross = $2, total_deductions = $3,
        total_net = $4, total_employer_cost = $5, updated_at = NOW()
       WHERE id = $6`,
      [t.count, t.total_gross, t.total_deductions, t.total_net, t.total_employer_cost, PAYROLL_RUN_ID]
    );
    console.log('\n=== PAYROLL RUN 440 TOTALS UPDATED ===');
    console.log('Employees:', t.count, '| Gross:', t.total_gross, '| Deductions:', t.total_deductions, '| Net:', t.total_net);

    await client.query('COMMIT');
    console.log('\nDONE - All changes committed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
