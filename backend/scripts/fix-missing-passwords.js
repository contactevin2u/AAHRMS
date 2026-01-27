require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixMissingPasswords() {
  try {
    // Find all active employees without password_hash
    const result = await pool.query(`
      SELECT id, employee_id, name, ic_number
      FROM employees
      WHERE password_hash IS NULL AND status = 'active' AND ic_number IS NOT NULL
      ORDER BY company_id, name
    `);

    console.log(`Found ${result.rows.length} active employees without password\n`);

    if (result.rows.length === 0) {
      console.log('No employees need password fix');
      process.exit(0);
    }

    let fixed = 0;
    let skipped = 0;

    for (const emp of result.rows) {
      // Clean IC number - remove dashes and spaces
      const cleanIC = emp.ic_number.replace(/[-\s]/g, '');

      if (!cleanIC || cleanIC.length < 6) {
        console.log(`SKIP: ${emp.name} - IC too short: ${emp.ic_number}`);
        skipped++;
        continue;
      }

      // Hash the IC number as the default password
      const passwordHash = await bcrypt.hash(cleanIC, 10);

      // Update employee
      await pool.query(
        'UPDATE employees SET password_hash = $1, must_change_password = true WHERE id = $2',
        [passwordHash, emp.id]
      );

      console.log(`FIXED: ${emp.employee_id || 'N/A'} - ${emp.name} (IC: ${cleanIC.substring(0, 6)}***)`);
      fixed++;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`\nEmployees can now login with:`);
    console.log(`- Username: their employee ID or email`);
    console.log(`- Password: their IC number (no dashes)`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

fixMissingPasswords();
