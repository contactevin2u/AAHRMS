/**
 * Script to remove all test employees (employee_id starting with 'TEST')
 * Run with: node scripts/remove-test-employees.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hrms_db',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

async function removeTestEmployees() {
  const client = await pool.connect();

  try {
    console.log('Starting removal of test employees...\n');

    // First, find all test employee IDs
    const testEmployees = await client.query(`
      SELECT id, employee_id, name
      FROM employees
      WHERE employee_id LIKE 'TEST%'
      ORDER BY employee_id
    `);

    if (testEmployees.rows.length === 0) {
      console.log('No test employees found.');
      return;
    }

    console.log(`Found ${testEmployees.rows.length} test employees to remove:\n`);
    testEmployees.rows.forEach(emp => {
      console.log(`  - ${emp.employee_id}: ${emp.name}`);
    });

    const employeeIds = testEmployees.rows.map(e => e.id);

    // Start transaction
    await client.query('BEGIN');

    // Delete related records first (in order of dependencies)
    const tables = [
      { name: 'attendance_records', column: 'employee_id' },
      { name: 'leave_requests', column: 'employee_id' },
      { name: 'claim_requests', column: 'employee_id' },
      { name: 'payroll_items', column: 'employee_id' },
      { name: 'employee_letters', column: 'employee_id' },
      { name: 'employee_benefits', column: 'employee_id' },
      { name: 'employee_contributions', column: 'employee_id' },
      { name: 'salary_details', column: 'employee_id' },
      { name: 'schedule_assignments', column: 'employee_id' },
      { name: 'shift_swaps', column: 'requester_id' },
      { name: 'shift_swaps', column: 'target_id' },
      { name: 'notifications', column: 'employee_id' },
      { name: 'feedback', column: 'employee_id' },
    ];

    for (const table of tables) {
      try {
        const result = await client.query(`
          DELETE FROM ${table.name}
          WHERE ${table.column} = ANY($1::int[])
        `, [employeeIds]);

        if (result.rowCount > 0) {
          console.log(`\n  Deleted ${result.rowCount} records from ${table.name}`);
        }
      } catch (err) {
        // Table might not exist, skip it
        if (err.code !== '42P01') {
          console.log(`  Warning: Could not delete from ${table.name}: ${err.message}`);
        }
      }
    }

    // Finally, delete the employees
    const deleteResult = await client.query(`
      DELETE FROM employees
      WHERE employee_id LIKE 'TEST%'
    `);

    console.log(`\n✓ Deleted ${deleteResult.rowCount} test employees`);

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n✓ All test employees removed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ Error removing test employees:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

removeTestEmployees()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
