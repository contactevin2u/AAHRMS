require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkConstraints() {
  try {
    console.log('Checking clock_in_records table constraints...\n');

    // Get column info
    const columns = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'clock_in_records'
      ORDER BY ordinal_position
    `);

    console.log('Columns:');
    columns.rows.forEach(c => {
      console.log(`  ${c.column_name}: ${c.data_type}${c.character_maximum_length ? `(${c.character_maximum_length})` : ''} ${c.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'}`);
    });

    // Get constraints
    const constraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'clock_in_records'::regclass
    `);

    console.log('\nConstraints:');
    constraints.rows.forEach(c => {
      const type = {
        'p': 'PRIMARY KEY',
        'u': 'UNIQUE',
        'f': 'FOREIGN KEY',
        'c': 'CHECK'
      }[c.contype] || c.contype;
      console.log(`  ${c.conname} (${type}): ${c.definition}`);
    });

    // Check for any records that might have issues
    const problemRecords = await pool.query(`
      SELECT id, employee_id, work_date,
             clock_in_1, clock_out_1, clock_in_2, clock_out_2,
             total_work_minutes, ot_minutes, status
      FROM clock_in_records
      WHERE work_date >= CURRENT_DATE - INTERVAL '3 days'
        AND clock_in_1 IS NOT NULL
        AND clock_out_2 IS NULL
        AND status = 'in_progress'
      ORDER BY work_date DESC
      LIMIT 10
    `);

    console.log('\nOpen shifts (may need clock-out):');
    if (problemRecords.rows.length === 0) {
      console.log('  None found');
    } else {
      problemRecords.rows.forEach(r => {
        console.log(`  ID ${r.id}: emp=${r.employee_id} date=${r.work_date} in1=${r.clock_in_1} out1=${r.clock_out_1} in2=${r.clock_in_2}`);
      });
    }

    // Test if the photo_out columns have length limitations
    const photoColumns = columns.rows.filter(c => c.column_name.includes('photo'));
    console.log('\nPhoto columns:');
    photoColumns.forEach(c => {
      console.log(`  ${c.column_name}: ${c.data_type}${c.character_maximum_length ? `(${c.character_maximum_length})` : ''}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Full error:', e);
    process.exit(1);
  }
}

checkConstraints();
