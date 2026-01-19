/**
 * Check all employees' join/start dates
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkJoinDates() {
  const client = await pool.connect();

  try {
    // Summary by company
    console.log('=== JOIN DATE SUMMARY ===\n');

    const summaryResult = await client.query(`
      SELECT
        c.name as company,
        COUNT(*) as total_employees,
        COUNT(e.join_date) as has_join_date,
        COUNT(*) - COUNT(e.join_date) as missing_join_date
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      WHERE e.status = 'active'
      GROUP BY c.name
      ORDER BY c.name
    `);

    summaryResult.rows.forEach(row => {
      console.log(`${row.company}:`);
      console.log(`  Total: ${row.total_employees}`);
      console.log(`  Has join date: ${row.has_join_date}`);
      console.log(`  Missing join date: ${row.missing_join_date}`);
      console.log('');
    });

    // List employees without join date
    console.log('=== EMPLOYEES WITHOUT JOIN DATE ===\n');

    const missingResult = await client.query(`
      SELECT
        c.name as company,
        e.employee_id,
        e.name
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      WHERE e.status = 'active' AND e.join_date IS NULL
      ORDER BY c.name, e.name
    `);

    if (missingResult.rows.length === 0) {
      console.log('All employees have join dates set!');
    } else {
      console.log(`Found ${missingResult.rows.length} employees without join date:\n`);
      let currentCompany = '';
      missingResult.rows.forEach(emp => {
        if (emp.company !== currentCompany) {
          currentCompany = emp.company;
          console.log(`\n[${currentCompany}]`);
        }
        console.log(`  ${emp.employee_id} - ${emp.name}`);
      });
    }

    // List all employees with join dates (first 100)
    console.log('\n\n=== EMPLOYEES WITH JOIN DATES (Sample) ===\n');

    const withDatesResult = await client.query(`
      SELECT
        c.name as company,
        e.employee_id,
        e.name,
        e.join_date
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      WHERE e.status = 'active' AND e.join_date IS NOT NULL
      ORDER BY c.name, e.join_date DESC
      LIMIT 100
    `);

    let currentCompany = '';
    withDatesResult.rows.forEach(emp => {
      if (emp.company !== currentCompany) {
        currentCompany = emp.company;
        console.log(`\n[${currentCompany}]`);
      }
      const joinDate = new Date(emp.join_date).toLocaleDateString('en-GB');
      console.log(`  ${emp.employee_id} - ${emp.name} - ${joinDate}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkJoinDates();
