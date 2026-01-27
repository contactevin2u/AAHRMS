require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    // Check ess_enabled status for Mimix
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE ess_enabled = true) as ess_enabled_count,
        COUNT(*) FILTER (WHERE ess_enabled = false OR ess_enabled IS NULL) as ess_disabled_count,
        COUNT(*) FILTER (WHERE password_hash IS NULL) as no_password_count,
        COUNT(*) FILTER (WHERE status != 'active') as inactive_count
      FROM employees
      WHERE company_id = 3
    `);
    console.log('Mimix Employee Stats:');
    console.log(result.rows[0]);

    // List employees with ESS disabled
    const disabled = await pool.query(`
      SELECT employee_id, name, ess_enabled, status, password_hash IS NOT NULL as has_password
      FROM employees
      WHERE company_id = 3 AND (ess_enabled = false OR ess_enabled IS NULL)
      ORDER BY name
      LIMIT 20
    `);
    console.log('\nEmployees with ESS disabled (up to 20):');
    if (disabled.rows.length === 0) {
      console.log('  None - all employees have ESS enabled');
    } else {
      disabled.rows.forEach(e => {
        console.log(`  ${e.employee_id || 'N/A'} - ${e.name} | ess: ${e.ess_enabled} | status: ${e.status} | has_pwd: ${e.has_password}`);
      });
    }

    // Check employees without password
    const noPwd = await pool.query(`
      SELECT employee_id, name, username, ess_enabled, status
      FROM employees
      WHERE company_id = 3 AND password_hash IS NULL AND status = 'active'
      ORDER BY name
      LIMIT 20
    `);
    console.log('\nActive employees without password (up to 20):');
    if (noPwd.rows.length === 0) {
      console.log('  None - all active employees have password set');
    } else {
      noPwd.rows.forEach(e => {
        console.log(`  ${e.employee_id || 'N/A'} - ${e.name} | username: ${e.username || 'N/A'} | ess: ${e.ess_enabled}`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
