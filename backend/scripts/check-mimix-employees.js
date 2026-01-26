const pool = require('../db');

async function checkEmployees() {
  // First, get all Mimix outlets
  const outlets = await pool.query(`
    SELECT o.id, o.name, c.name as company_name
    FROM outlets o
    JOIN companies c ON o.company_id = c.id
    WHERE c.id = 3
    ORDER BY o.name
  `);

  console.log('=== MIMIX OUTLETS ===');
  console.table(outlets.rows);

  // Get all employees in Mimix company with their outlet info
  const employees = await pool.query(`
    SELECT e.id, e.employee_id, e.name, e.ic_number,
           e.employee_role, e.work_type, e.status, e.employment_type,
           o.id as outlet_id, o.name as outlet_name
    FROM employees e
    LEFT JOIN outlets o ON e.outlet_id = o.id
    WHERE e.company_id = 3 AND e.status = 'active'
    ORDER BY o.name, e.employee_role DESC, e.name
  `);

  console.log('\n=== ALL ACTIVE MIMIX EMPLOYEES ===');
  console.log('Total:', employees.rows.length);

  // Group by outlet
  const byOutlet = {};
  for (const emp of employees.rows) {
    const outletName = emp.outlet_name || 'NO OUTLET';
    if (!byOutlet[outletName]) {
      byOutlet[outletName] = [];
    }
    byOutlet[outletName].push(emp);
  }

  for (const [outlet, emps] of Object.entries(byOutlet)) {
    console.log(`\n--- ${outlet} (${emps.length} employees) ---`);
    for (const e of emps) {
      const role = e.employee_role || 'staff';
      const workType = e.work_type || 'full_time';
      const ic = e.ic_number ? e.ic_number.replace(/-/g, '') : 'N/A';
      console.log(`  [${role.toUpperCase().padEnd(10)}][${workType.padEnd(9)}] ${e.name.padEnd(45)} | IC: ${ic}`);
    }
  }

  process.exit(0);
}

checkEmployees().catch(e => { console.error(e); process.exit(1); });
