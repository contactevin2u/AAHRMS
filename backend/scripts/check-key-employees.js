const pool = require('../db');
const { calculateEPF, calculateSOCSO, calculateEIS } = require('../utils/statutory');

async function run() {
  const result = await pool.query(`
    SELECT
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
      AND e.name IN ('EVIN LIM', 'MICHELLE CHEAN MEI TZEE', 'LAU JIA CHENG')
    ORDER BY e.name
  `);

  console.log('Current DB Values and Recalculations:');
  console.log('='.repeat(80));

  for (const row of result.rows) {
    console.log(`\n${row.name}`);
    console.log('-'.repeat(40));
    console.log('  Basic Salary:', parseFloat(row.basic_salary).toFixed(2));
    console.log('  Commission:', parseFloat(row.commission_amount || 0).toFixed(2));
    console.log('  Statutory Base:', parseFloat(row.statutory_base || 0).toFixed(2));
    console.log('  Gross Salary:', parseFloat(row.gross_salary).toFixed(2));

    // For EPF: calculate based on basic + commission (not full gross which includes claims etc)
    const basic = parseFloat(row.basic_salary) || 0;
    const commission = parseFloat(row.commission_amount) || 0;
    const epfBase = basic + commission;

    const calcEPF = calculateEPF(epfBase, 30);
    const calcSOCSO = calculateSOCSO(parseFloat(row.gross_salary), 30);
    const calcEIS = calculateEIS(parseFloat(row.gross_salary), 30);

    console.log('\n  EPF Base (Basic + Commission):', epfBase.toFixed(2));
    console.log('  DB EPF EE:', row.epf_employee, '| Calc:', calcEPF.employee);
    console.log('  DB EPF ER:', row.epf_employer, '| Calc:', calcEPF.employer);
    console.log('  DB SOCSO EE:', row.socso_employee, '| Calc:', calcSOCSO.employee);
    console.log('  DB EIS EE:', row.eis_employee, '| Calc:', calcEIS.employee);
    console.log('  DB PCB:', row.pcb);
  }

  pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  pool.end();
});
