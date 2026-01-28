/**
 * Verify and Fix January 2026 Payroll
 *
 * Compares current DB values with correctly calculated values
 * and optionally updates the database.
 */

const pool = require('../db');
const { calculateEPF, calculateSOCSO, calculateEIS } = require('../utils/statutory');

// Run with --fix flag to actually update the database
const shouldFix = process.argv.includes('--fix');

async function run() {
  console.log('='.repeat(80));
  console.log('JANUARY 2026 PAYROLL VERIFICATION');
  console.log(shouldFix ? 'MODE: FIX (will update database)' : 'MODE: CHECK ONLY');
  console.log('='.repeat(80));
  console.log('');

  const result = await pool.query(`
    SELECT
      pi.id as payroll_item_id,
      e.name,
      pi.basic_salary,
      pi.commission_amount,
      pi.statutory_base,
      pi.gross_salary,
      pi.epf_employee,
      pi.epf_employer,
      pi.socso_employee,
      pi.eis_employee,
      pi.pcb
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pr.company_id = 1 AND pr.month = 1 AND pr.year = 2026
    ORDER BY e.name
  `);

  const issues = [];

  for (const row of result.rows) {
    const basic = parseFloat(row.basic_salary) || 0;
    const commission = parseFloat(row.commission_amount) || 0;
    const gross = parseFloat(row.gross_salary) || 0;

    // EPF is calculated on basic + commission (not full gross which includes claims/allowances)
    const epfBase = basic + commission;

    const calcEPF = calculateEPF(epfBase, 30);
    const calcSOCSO = calculateSOCSO(gross, 30);
    const calcEIS = calculateEIS(gross, 30);

    const dbEPFEE = parseFloat(row.epf_employee) || 0;
    const dbEPFER = parseFloat(row.epf_employer) || 0;
    const dbSOCSOEE = parseFloat(row.socso_employee) || 0;
    const dbEISEE = parseFloat(row.eis_employee) || 0;

    const rowIssues = [];

    // Check if EPF values are swapped
    if (dbEPFEE === calcEPF.employer && dbEPFER === calcEPF.employee) {
      rowIssues.push({
        field: 'EPF_SWAPPED',
        current_ee: dbEPFEE,
        current_er: dbEPFER,
        expected_ee: calcEPF.employee,
        expected_er: calcEPF.employer
      });
    } else {
      // Check individual EPF values
      if (Math.abs(dbEPFEE - calcEPF.employee) > 0.01) {
        rowIssues.push({
          field: 'EPF_EE',
          current: dbEPFEE,
          expected: calcEPF.employee,
          diff: dbEPFEE - calcEPF.employee
        });
      }
      if (Math.abs(dbEPFER - calcEPF.employer) > 0.01) {
        rowIssues.push({
          field: 'EPF_ER',
          current: dbEPFER,
          expected: calcEPF.employer,
          diff: dbEPFER - calcEPF.employer
        });
      }
    }

    // Check SOCSO
    if (Math.abs(dbSOCSOEE - calcSOCSO.employee) > 0.01) {
      rowIssues.push({
        field: 'SOCSO_EE',
        current: dbSOCSOEE,
        expected: calcSOCSO.employee,
        diff: dbSOCSOEE - calcSOCSO.employee
      });
    }

    // Check EIS
    if (Math.abs(dbEISEE - calcEIS.employee) > 0.01) {
      rowIssues.push({
        field: 'EIS_EE',
        current: dbEISEE,
        expected: calcEIS.employee,
        diff: dbEISEE - calcEIS.employee
      });
    }

    if (rowIssues.length > 0) {
      issues.push({
        id: row.payroll_item_id,
        name: row.name,
        epfBase,
        gross,
        calcEPF,
        calcSOCSO,
        calcEIS,
        issues: rowIssues
      });
    }
  }

  console.log(`Total employees checked: ${result.rows.length}`);
  console.log(`Employees with issues: ${issues.length}`);
  console.log('');

  if (issues.length === 0) {
    console.log('All values are correct!');
    pool.end();
    return;
  }

  console.log('ISSUES FOUND:');
  console.log('='.repeat(80));

  for (const emp of issues) {
    console.log(`\n${emp.name} (ID: ${emp.id})`);
    console.log(`  EPF Base: ${emp.epfBase.toFixed(2)}, Gross: ${emp.gross.toFixed(2)}`);

    for (const issue of emp.issues) {
      if (issue.field === 'EPF_SWAPPED') {
        console.log(`  ** EPF VALUES SWAPPED **`);
        console.log(`     Current:  EE=${issue.current_ee}, ER=${issue.current_er}`);
        console.log(`     Expected: EE=${issue.expected_ee}, ER=${issue.expected_er}`);
      } else {
        console.log(`  ${issue.field}: Current=${issue.current}, Expected=${issue.expected} (Diff: ${issue.diff.toFixed(2)})`);
      }
    }

    // Fix if requested
    if (shouldFix) {
      const updates = {};

      for (const issue of emp.issues) {
        if (issue.field === 'EPF_SWAPPED') {
          updates.epf_employee = issue.expected_ee;
          updates.epf_employer = issue.expected_er;
        } else if (issue.field === 'EPF_EE') {
          updates.epf_employee = issue.expected;
        } else if (issue.field === 'EPF_ER') {
          updates.epf_employer = issue.expected;
        } else if (issue.field === 'SOCSO_EE') {
          updates.socso_employee = issue.expected;
        } else if (issue.field === 'EIS_EE') {
          updates.eis_employee = issue.expected;
        }
      }

      if (Object.keys(updates).length > 0) {
        const setClauses = Object.entries(updates).map(([k, v], i) => `${k} = $${i + 2}`).join(', ');
        const values = [emp.id, ...Object.values(updates)];

        await pool.query(
          `UPDATE payroll_items SET ${setClauses} WHERE id = $1`,
          values
        );
        console.log(`  >> FIXED: ${Object.keys(updates).join(', ')}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  if (!shouldFix) {
    console.log('To fix these issues, run with --fix flag:');
    console.log('  node scripts/verify-and-fix-jan-payroll.js --fix');
  } else {
    console.log('All issues have been fixed!');
  }

  pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  pool.end();
});
