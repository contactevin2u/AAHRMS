/**
 * Fix ML (Medical Leave) Balances
 * Sets all ML entitled days to 14 for all employees
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixMLBalances() {
  const client = await pool.connect();

  try {
    console.log('Starting ML balance fix...\n');

    // Get current year
    const currentYear = new Date().getFullYear();

    // Find all ML leave types
    const mlTypesResult = await client.query(`
      SELECT id, name, company_id FROM leave_types WHERE code = 'ML'
    `);

    console.log(`Found ${mlTypesResult.rows.length} ML leave type(s)`);

    for (const mlType of mlTypesResult.rows) {
      console.log(`\nProcessing ML type: ${mlType.name} (ID: ${mlType.id}, Company: ${mlType.company_id || 'All'})`);

      // Update existing ML balances to 14 entitled days
      const updateResult = await client.query(`
        UPDATE leave_balances
        SET entitled_days = 14
        WHERE leave_type_id = $1
          AND year = $2
          AND entitled_days != 14
        RETURNING employee_id
      `, [mlType.id, currentYear]);

      console.log(`  Updated ${updateResult.rowCount} existing balances to 14 days`);

      // Find employees without ML balance for this year and create them
      const missingResult = await client.query(`
        SELECT e.id, e.name, e.employee_id
        FROM employees e
        LEFT JOIN leave_balances lb ON e.id = lb.employee_id
          AND lb.leave_type_id = $1
          AND lb.year = $2
        WHERE lb.id IS NULL
          AND e.status = 'active'
          AND (e.company_id = $3 OR $3 IS NULL)
      `, [mlType.id, currentYear, mlType.company_id]);

      console.log(`  Found ${missingResult.rows.length} employees without ML balance`);

      // Create missing balances
      for (const emp of missingResult.rows) {
        await client.query(`
          INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days, used_days, carried_forward)
          VALUES ($1, $2, $3, 14, 0, 0)
        `, [emp.id, mlType.id, currentYear]);
        console.log(`    Created ML balance for ${emp.name} (${emp.employee_id})`);
      }
    }

    // Show summary
    console.log('\n--- Summary ---');
    const summaryResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN entitled_days = 14 THEN 1 END) as correct,
        COUNT(CASE WHEN entitled_days != 14 THEN 1 END) as incorrect
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lt.code = 'ML' AND lb.year = $1
    `, [currentYear]);

    const summary = summaryResult.rows[0];
    console.log(`Total ML balances: ${summary.total}`);
    console.log(`Correct (14 days): ${summary.correct}`);
    console.log(`Incorrect: ${summary.incorrect}`);

    console.log('\nML balance fix completed!');

  } catch (error) {
    console.error('Error fixing ML balances:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixMLBalances();
