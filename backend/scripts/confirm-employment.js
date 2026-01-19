/**
 * Confirm Employment for employees with join date > 3 months
 * - If join_date is more than 3 months ago → employment_type = 'confirmed'
 * - If join_date is missing → ignore
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function confirmEmployment() {
  const client = await pool.connect();

  try {
    console.log('=== CONFIRM EMPLOYMENT STATUS ===\n');
    console.log('Criteria: Join date > 3 months ago → Confirmed\n');

    // Calculate date 3 months ago
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    console.log(`Cutoff date: ${threeMonthsAgo.toLocaleDateString('en-GB')}`);
    console.log('Employees who joined before this date will be confirmed.\n');

    // Find employees to confirm
    const toConfirmResult = await client.query(`
      SELECT
        e.id,
        e.employee_id,
        e.name,
        e.join_date,
        e.employment_type,
        c.name as company
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      WHERE e.status = 'active'
        AND e.join_date IS NOT NULL
        AND e.join_date <= $1
        AND (e.employment_type IS NULL OR e.employment_type != 'confirmed')
      ORDER BY c.name, e.join_date
    `, [threeMonthsAgo]);

    console.log(`Found ${toConfirmResult.rows.length} employees to confirm:\n`);

    if (toConfirmResult.rows.length === 0) {
      console.log('No employees need to be confirmed.');
    } else {
      // Show who will be confirmed
      let currentCompany = '';
      toConfirmResult.rows.forEach(emp => {
        if (emp.company !== currentCompany) {
          currentCompany = emp.company;
          console.log(`\n[${currentCompany}]`);
        }
        const joinDate = new Date(emp.join_date).toLocaleDateString('en-GB');
        console.log(`  ${emp.employee_id} - ${emp.name} - Joined: ${joinDate} - Current: ${emp.employment_type || 'not set'}`);
      });

      // Update employment_type to 'confirmed'
      const updateResult = await client.query(`
        UPDATE employees
        SET employment_type = 'confirmed'
        WHERE status = 'active'
          AND join_date IS NOT NULL
          AND join_date <= $1
          AND (employment_type IS NULL OR employment_type != 'confirmed')
      `, [threeMonthsAgo]);

      console.log(`\n\n✓ Updated ${updateResult.rowCount} employees to 'confirmed'`);
    }

    // Summary
    console.log('\n\n=== FINAL SUMMARY ===\n');

    const summaryResult = await client.query(`
      SELECT
        c.name as company,
        e.employment_type,
        COUNT(*) as count
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      WHERE e.status = 'active'
      GROUP BY c.name, e.employment_type
      ORDER BY c.name, e.employment_type
    `);

    let currentCompany = '';
    summaryResult.rows.forEach(row => {
      if (row.company !== currentCompany) {
        currentCompany = row.company;
        console.log(`\n${currentCompany}:`);
      }
      console.log(`  ${row.employment_type || 'not set'}: ${row.count}`);
    });

    console.log('\n\nDone!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

confirmEmployment();
