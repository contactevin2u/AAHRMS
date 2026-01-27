const pool = require('../db');

async function fixAslieHours() {
  const employeeId = 45; // ASLIE BIN ABU BAKAR

  // Get all records for ASLIE
  const records = await pool.query(`
    SELECT id, work_date::text, clock_in_1, clock_out_2, total_hours
    FROM clock_in_records
    WHERE employee_id = $1
    ORDER BY work_date DESC
  `, [employeeId]);

  console.log('ASLIE records before fix:');
  records.rows.forEach(r => {
    console.log(r.work_date, '| in:', r.clock_in_1, '| out:', r.clock_out_2, '| hours:', r.total_hours);
  });

  console.log('\n=== FIXING TOTAL HOURS ===\n');

  for (const r of records.rows) {
    if (r.clock_in_1 && r.clock_out_2) {
      const inSeconds = parseTime(r.clock_in_1);
      let outSeconds = parseTime(r.clock_out_2);

      // If out time is before in time, it's next day
      if (outSeconds < inSeconds) {
        outSeconds += 24 * 3600;
      }

      const totalHours = ((outSeconds - inSeconds) / 3600).toFixed(2);

      await pool.query(
        'UPDATE clock_in_records SET total_hours = $1 WHERE id = $2',
        [totalHours, r.id]
      );

      console.log(`${r.work_date}: ${r.clock_in_1} -> ${r.clock_out_2} = ${totalHours} hours (updated)`);
    }
  }

  // Verify
  console.log('\n=== AFTER FIX ===\n');
  const verify = await pool.query(`
    SELECT work_date::text, clock_in_1, clock_out_2, total_hours
    FROM clock_in_records
    WHERE employee_id = $1
    ORDER BY work_date DESC
  `, [employeeId]);

  verify.rows.forEach(r => {
    console.log(r.work_date, '| in:', r.clock_in_1, '| out:', r.clock_out_2, '| hours:', r.total_hours);
  });

  process.exit(0);
}

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2] || '0', 10);
  return h * 3600 + m * 60 + s;
}

fixAslieHours().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
