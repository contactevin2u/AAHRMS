require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const result = await pool.query(`
      SELECT employee_id, name, username, employee_role, ic_number,
             password_hash IS NOT NULL as has_password,
             ess_enabled, status
      FROM employees
      WHERE company_id = 3 AND employee_role IN ('manager', 'supervisor')
      ORDER BY employee_role, name
    `);

    console.log('Mimix Managers & Supervisors:');
    console.log('=============================\n');

    result.rows.forEach(row => {
      console.log(`${row.employee_role.toUpperCase()}: ${row.name}`);
      console.log(`  Employee ID: ${row.employee_id || 'N/A'}`);
      console.log(`  Username: ${row.username || 'N/A'}`);
      console.log(`  IC: ${row.ic_number || 'N/A'}`);
      console.log(`  Has Password: ${row.has_password}`);
      console.log(`  ESS Enabled: ${row.ess_enabled}`);
      console.log(`  Status: ${row.status}`);
      console.log('');
    });

    console.log(`Total: ${result.rows.length} managers/supervisors`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
