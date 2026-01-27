require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testLogin() {
  try {
    // Get all Mimix managers/supervisors
    const result = await pool.query(`
      SELECT employee_id, name, username, ic_number, password_hash, must_change_password
      FROM employees
      WHERE company_id = 3 AND employee_role IN ('manager', 'supervisor') AND status = 'active'
    `);

    console.log('Testing Mimix Manager/Supervisor Passwords:\n');

    for (const emp of result.rows) {
      // Clean IC - remove dashes
      const cleanIC = emp.ic_number ? emp.ic_number.replace(/[-\s]/g, '') : null;

      // Test if password matches clean IC
      let passwordStatus = 'UNKNOWN';
      if (cleanIC && emp.password_hash) {
        const matchesIC = await bcrypt.compare(cleanIC, emp.password_hash);
        if (matchesIC) {
          passwordStatus = 'DEFAULT (IC number)';
        } else {
          passwordStatus = 'CHANGED (custom password)';
        }
      }

      console.log(`${emp.name}`);
      console.log(`  Login with: ${emp.username || emp.employee_id}`);
      console.log(`  IC: ${emp.ic_number} -> Clean: ${cleanIC}`);
      console.log(`  Password: ${passwordStatus}`);
      console.log(`  Must Change: ${emp.must_change_password}`);
      console.log('');
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

testLogin();
