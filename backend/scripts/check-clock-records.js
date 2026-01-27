require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    // Check table structure
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'clock_in_records'
      ORDER BY ordinal_position
    `);
    console.log('clock_in_records columns:');
    columns.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

    // Check recent records with issues
    const recent = await pool.query(`
      SELECT id, employee_id, work_date, clock_in_1, clock_out_1, clock_in_2, clock_out_2, status
      FROM clock_in_records
      WHERE work_date >= CURRENT_DATE - INTERVAL '2 days'
      ORDER BY work_date DESC, id DESC
      LIMIT 10
    `);
    console.log('\nRecent clock records:');
    recent.rows.forEach(r => {
      console.log(`  ID ${r.id}: emp=${r.employee_id} date=${r.work_date} in1=${r.clock_in_1} out1=${r.clock_out_1} in2=${r.clock_in_2} out2=${r.clock_out_2} status=${r.status}`);
    });

    // Check for any open shifts (clocked in but not out)
    const openShifts = await pool.query(`
      SELECT c.id, e.name, c.work_date, c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2, c.status
      FROM clock_in_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.work_date >= CURRENT_DATE - INTERVAL '2 days'
        AND c.clock_in_1 IS NOT NULL
        AND c.status = 'in_progress'
      ORDER BY c.work_date DESC
    `);
    console.log('\nOpen shifts (in_progress):');
    if (openShifts.rows.length === 0) {
      console.log('  None');
    } else {
      openShifts.rows.forEach(r => {
        console.log(`  ${r.name} (${r.work_date}): in1=${r.clock_in_1} out1=${r.clock_out_1} in2=${r.clock_in_2} out2=${r.clock_out_2}`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Full error:', e);
    process.exit(1);
  }
}

check();
