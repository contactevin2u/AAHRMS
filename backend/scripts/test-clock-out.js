require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testClockOut() {
  try {
    // Find an employee with open shift who needs to clock out
    const openShift = await pool.query(`
      SELECT c.id, c.employee_id, e.name, c.work_date, c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2, c.status, e.company_id
      FROM clock_in_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.work_date = CURRENT_DATE
        AND c.clock_in_1 IS NOT NULL
        AND c.clock_out_1 IS NOT NULL
        AND c.clock_in_2 IS NOT NULL
        AND c.clock_out_2 IS NULL
        AND c.status = 'in_progress'
      LIMIT 1
    `);

    if (openShift.rows.length === 0) {
      console.log('No open shifts needing clock_out_2');

      // Check for shifts needing clock_out_1
      const needsOut1 = await pool.query(`
        SELECT c.id, c.employee_id, e.name, c.work_date, c.clock_in_1, c.clock_out_1, c.status, e.company_id
        FROM clock_in_records c
        JOIN employees e ON c.employee_id = e.id
        WHERE c.work_date = CURRENT_DATE
          AND c.clock_in_1 IS NOT NULL
          AND c.clock_out_1 IS NULL
          AND c.status = 'in_progress'
        LIMIT 5
      `);

      console.log('\nShifts needing clock_out_1:');
      needsOut1.rows.forEach(r => {
        console.log(`  ${r.name} (emp=${r.employee_id}, company=${r.company_id}): in1=${r.clock_in_1}`);
      });

      process.exit(0);
    }

    const shift = openShift.rows[0];
    console.log('Found open shift:');
    console.log(shift);

    // Test the UPDATE query that would be run during clock out
    console.log('\nTesting UPDATE query...');
    const testTime = '19:30:00';

    const result = await pool.query(`
      UPDATE clock_in_records SET
        clock_out_2 = $1,
        status = 'completed'
      WHERE id = $2
      RETURNING *
    `, [testTime, shift.id]);

    console.log('UPDATE successful:');
    console.log(result.rows[0]);

    // Rollback by setting it back to null
    await pool.query(`
      UPDATE clock_in_records SET
        clock_out_2 = NULL,
        status = 'in_progress'
      WHERE id = $1
    `, [shift.id]);
    console.log('\nRolled back test change');

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Code:', e.code);
    console.error('Detail:', e.detail);
    console.error('Full error:', e);
    process.exit(1);
  }
}

testClockOut();
