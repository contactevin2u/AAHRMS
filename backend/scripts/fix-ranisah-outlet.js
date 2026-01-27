/**
 * Fix Ranisah outlet assignment
 */
require('dotenv').config();
const { Pool } = require('pg');

// Direct connection to avoid any middleware
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fix() {
  try {
    // Direct update - outlet 6 is Sri Jati
    const result = await pool.query(`
      UPDATE employees
      SET outlet_id = 6
      WHERE employee_id = 'SVRANISAH'
      RETURNING employee_id, name, outlet_id
    `);
    console.log('Updated:', result.rows[0]);

    // Also update outlet supervisor
    await pool.query(`
      UPDATE outlets
      SET supervisor_id = (SELECT id FROM employees WHERE employee_id = 'SVRANISAH')
      WHERE id = 6
    `);
    console.log('Updated outlet supervisor');

    // Verify with fresh query
    const verify = await pool.query(`
      SELECT e.employee_id, e.name, e.outlet_id, e.employee_role, o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.employee_id = 'SVRANISAH'
    `);
    console.log('\nFinal state:', verify.rows[0]);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}
fix();
