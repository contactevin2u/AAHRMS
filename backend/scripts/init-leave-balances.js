/**
 * One-time script to initialize leave balances for all employees
 * Run with: node scripts/init-leave-balances.js
 */

require('dotenv').config();
const pool = require('../db');
const { initializeYearlyLeaveBalances } = require('../utils/leaveProration');

async function initializeAllBalances() {
  const year = 2026;

  console.log(`\n=== Initializing Leave Balances for Year ${year} ===\n`);

  try {
    // Get all active employees
    const employeesResult = await pool.query(`
      SELECT id, name, join_date, company_id, gender
      FROM employees
      WHERE status = 'active'
      ORDER BY company_id, name
    `);

    const employees = employeesResult.rows;
    console.log(`Found ${employees.length} active employees\n`);

    const results = {
      success: [],
      skipped: [],
      failed: []
    };

    for (const emp of employees) {
      try {
        // Check if balances already exist for this year
        const existingCheck = await pool.query(
          'SELECT COUNT(*) as count FROM leave_balances WHERE employee_id = $1 AND year = $2',
          [emp.id, year]
        );

        if (parseInt(existingCheck.rows[0].count) > 0) {
          console.log(`⏭️  SKIP: ${emp.name} (ID: ${emp.id}) - Already has balances`);
          results.skipped.push({ id: emp.id, name: emp.name });
          continue;
        }

        // Initialize balances
        const result = await initializeYearlyLeaveBalances(
          emp.id,
          emp.company_id,
          year,
          emp.join_date
        );

        console.log(`✅ INIT: ${emp.name} (ID: ${emp.id}) - ${result.balances.length} leave types initialized`);
        results.success.push({ id: emp.id, name: emp.name, balances: result.balances.length });

      } catch (empError) {
        console.error(`❌ FAIL: ${emp.name} (ID: ${emp.id}) - ${empError.message}`);
        results.failed.push({ id: emp.id, name: emp.name, error: empError.message });
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total employees: ${employees.length}`);
    console.log(`Initialized: ${results.success.length}`);
    console.log(`Skipped (already exists): ${results.skipped.length}`);
    console.log(`Failed: ${results.failed.length}`);

    if (results.failed.length > 0) {
      console.log('\nFailed employees:');
      results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
    }

    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

initializeAllBalances();
