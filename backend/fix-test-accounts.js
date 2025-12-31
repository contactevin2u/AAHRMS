const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function fixTestAccounts() {
  try {
    // Enable ESS for test accounts
    const result = await pool.query(`
      UPDATE employees
      SET ess_enabled = true
      WHERE employee_id IN ('TEST-SV01', 'TEST-MG01')
      RETURNING employee_id, name, ic_number, ess_enabled, employee_role
    `);

    console.log('Fixed test accounts:');
    result.rows.forEach(r => {
      console.log('  ' + r.employee_id + ' | ' + r.name + ' | ESS: ' + r.ess_enabled + ' | Role: ' + r.employee_role);
    });

    // Also enable ESS for real manager
    const managerResult = await pool.query(`
      UPDATE employees
      SET ess_enabled = true
      WHERE employee_id = 'MGTAUFIQ'
      RETURNING employee_id, name, ic_number, ess_enabled
    `);

    console.log('\nEnabled ESS for real manager:');
    managerResult.rows.forEach(r => {
      console.log('  ' + r.employee_id + ' | ' + r.name + ' | ESS: ' + r.ess_enabled);
    });

    console.log('\n========================================');
    console.log('=== LOGIN INSTRUCTIONS ===');
    console.log('========================================');
    console.log('\nThe login form requires TWO fields:');
    console.log('  1. Employee ID (e.g., TEST-SV01)');
    console.log('  2. IC Number (e.g., 900101-01-0001)');
    console.log('\n--- TEST SUPERVISOR ---');
    console.log('  Employee ID: TEST-SV01');
    console.log('  IC Number: 900101-01-0001');
    console.log('\n--- TEST MANAGER ---');
    console.log('  Employee ID: TEST-MG01');
    console.log('  IC Number: 900101-01-0002');
    console.log('\n--- REAL MANAGER ---');
    console.log('  Employee ID: MGTAUFIQ');
    console.log('  IC Number: 931003-14-6247');
    console.log('========================================');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

fixTestAccounts();
