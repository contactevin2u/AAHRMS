const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function listMimix() {
  try {
    const result = await pool.query(`
      SELECT employee_id, name, ic_number, employee_role
      FROM employees
      WHERE company_id = 3
        AND status = 'active'
        AND employee_id NOT LIKE 'TEST%'
      ORDER BY employee_role DESC, employee_id
    `);

    console.log('=== MIMIX EMPLOYEES (' + result.rows.length + ') ===\n');
    console.log('Employee ID'.padEnd(15) + 'IC Number'.padEnd(18) + 'Role'.padEnd(12) + 'Name');
    console.log('─'.repeat(90));

    result.rows.forEach(emp => {
      const id = (emp.employee_id || '').padEnd(15);
      const ic = (emp.ic_number || '-').padEnd(18);
      const role = (emp.employee_role || 'staff').padEnd(12);
      const name = (emp.name || '-').substring(0, 40);
      console.log(`${id}${ic}${role}${name}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

listMimix();
