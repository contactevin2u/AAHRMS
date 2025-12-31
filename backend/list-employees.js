const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function listEmployees() {
  try {
    const result = await pool.query(`
      SELECT e.employee_id, e.name, e.ic_number, e.position, e.employee_role, e.status,
             c.name as company_name, o.name as outlet_name
      FROM employees e
      LEFT JOIN companies c ON e.company_id = c.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.status = 'active'
        AND e.employee_id NOT LIKE 'TEST%'
      ORDER BY c.name, e.employee_id
    `);

    // Group by company
    const byCompany = {};
    result.rows.forEach(emp => {
      const company = emp.company_name || 'Unknown';
      if (!byCompany[company]) byCompany[company] = [];
      byCompany[company].push(emp);
    });

    console.log('=== ALL ACTIVE EMPLOYEES ===\n');

    for (const [company, employees] of Object.entries(byCompany)) {
      console.log(`\n${company} (${employees.length} employees)`);
      console.log('─'.repeat(80));
      console.log('Employee ID'.padEnd(15) + 'Name'.padEnd(35) + 'IC Number'.padEnd(18) + 'Role');
      console.log('─'.repeat(80));

      employees.forEach(emp => {
        const id = (emp.employee_id || '').padEnd(15);
        const name = (emp.name || '-').substring(0, 33).padEnd(35);
        const ic = (emp.ic_number || '-').padEnd(18);
        const role = emp.employee_role || 'staff';
        console.log(`${id}${name}${ic}${role}`);
      });
    }

    console.log('\n\nTotal:', result.rows.length, 'active employees');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

listEmployees();
