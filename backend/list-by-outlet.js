const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function listByOutlet() {
  try {
    const result = await pool.query(`
      SELECT e.employee_id, e.name, e.ic_number, e.employee_role, e.position,
             o.id as outlet_id, o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.company_id = 3
        AND e.status = 'active'
        AND e.employee_id NOT LIKE 'TEST%'
      ORDER BY o.name, e.employee_role DESC, e.employee_id
    `);

    // Group by outlet
    const byOutlet = {};
    result.rows.forEach(emp => {
      const outlet = emp.outlet_name || 'No Outlet Assigned';
      if (!byOutlet[outlet]) byOutlet[outlet] = [];
      byOutlet[outlet].push(emp);
    });

    console.log('=== MIMIX EMPLOYEES BY OUTLET ===\n');

    for (const [outlet, employees] of Object.entries(byOutlet)) {
      const supervisors = employees.filter(e => e.employee_role === 'supervisor');
      const managers = employees.filter(e => e.employee_role === 'manager');
      const staff = employees.filter(e => e.employee_role === 'staff' || !e.employee_role);

      console.log(`\n${'═'.repeat(70)}`);
      console.log(`📍 ${outlet} (${employees.length} employees)`);
      console.log(`${'═'.repeat(70)}`);

      if (managers.length > 0) {
        console.log('\n👔 MANAGER:');
        managers.forEach(emp => {
          console.log(`   ${emp.employee_id.padEnd(15)} ${emp.ic_number.padEnd(16)} ${emp.name}`);
        });
      }

      if (supervisors.length > 0) {
        console.log('\n👷 SUPERVISORS:');
        supervisors.forEach(emp => {
          console.log(`   ${emp.employee_id.padEnd(15)} ${emp.ic_number.padEnd(16)} ${emp.name}`);
        });
      }

      if (staff.length > 0) {
        console.log('\n👤 STAFF:');
        staff.forEach(emp => {
          console.log(`   ${emp.employee_id.padEnd(15)} ${emp.ic_number.padEnd(16)} ${(emp.name || '-').substring(0, 35)}`);
        });
      }
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`TOTAL: ${result.rows.length} employees across ${Object.keys(byOutlet).length} outlets`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

listByOutlet();
