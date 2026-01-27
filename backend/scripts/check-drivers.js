/**
 * Check AA Alive driver employees
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  try {
    // Check departments
    const depts = await pool.query("SELECT id, name FROM departments WHERE company_id = 1");
    console.log('AA Alive Departments:');
    for (const d of depts.rows) {
      console.log(`  ${d.id}: ${d.name}`);
    }

    // Get driver department employees
    const drivers = await pool.query(`
      SELECT e.id, e.employee_id, e.name, e.ic_number, d.name as department
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = 1
        AND e.status = 'active'
        AND (UPPER(d.name) LIKE '%DRIVER%' OR UPPER(e.position) LIKE '%DRIVER%')
      ORDER BY e.name
    `);

    console.log('\n' + '='.repeat(70));
    console.log('DRIVERS (' + drivers.rows.length + ' total)');
    console.log('='.repeat(70));

    for (const d of drivers.rows) {
      const empId = (d.employee_id || '').padEnd(12);
      const name = (d.name || '').padEnd(35);
      const ic = d.ic_number || 'No IC';
      console.log(`${empId} | ${name} | ${ic}`);
    }

  } finally {
    await pool.end();
  }
}
check();
