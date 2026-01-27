const pool = require('../db');

async function fixAllZeroHours() {
  // Find all records with 0 hours but have both clock_in and clock_out
  const records = await pool.query(`
    SELECT c.id, c.employee_id, e.name, c.work_date::text,
           c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2,
           c.total_hours, e.company_id
    FROM clock_in_records c
    JOIN employees e ON c.employee_id = e.id
    WHERE c.total_hours = 0 OR c.total_hours IS NULL
    ORDER BY c.work_date DESC, e.name
  `);

  console.log('=== RECORDS WITH 0 OR NULL HOURS ===');
  console.log('Total records to check:', records.rows.length);
  console.log('');

  let fixed = 0;
  let skipped = 0;

  for (const r of records.rows) {
    // Determine clock out time based on company type
    // AA Alive (company_id = 1): uses clock_out_2 as final out
    // Mimix (company_id = 3): uses clock_out_2 as final out after break
    let clockOut = r.clock_out_2 || r.clock_out_1;

    if (!r.clock_in_1 || !clockOut) {
      // Can't calculate without both in and out
      skipped++;
      continue;
    }

    const inSeconds = parseTime(r.clock_in_1);
    let outSeconds = parseTime(clockOut);

    // If out time is before in time, it's next day
    if (outSeconds < inSeconds) {
      outSeconds += 24 * 3600;
    }

    // Calculate total working hours
    let totalHours;

    if (r.clock_in_2 && r.clock_out_1) {
      // Has break - calculate session 1 + session 2
      const out1Seconds = parseTime(r.clock_out_1);
      const in2Seconds = parseTime(r.clock_in_2);
      let out2Seconds = parseTime(r.clock_out_2 || clockOut);

      // Handle overnight for out2
      if (out2Seconds < in2Seconds) {
        out2Seconds += 24 * 3600;
      }

      const session1 = out1Seconds - inSeconds;
      const session2 = out2Seconds - in2Seconds;
      totalHours = ((session1 + session2) / 3600).toFixed(2);
    } else {
      // No break - simple calculation
      totalHours = ((outSeconds - inSeconds) / 3600).toFixed(2);
    }

    // Update the record
    await pool.query(
      'UPDATE clock_in_records SET total_hours = $1 WHERE id = $2',
      [totalHours, r.id]
    );

    console.log(`${r.work_date} | ${r.name} | ${r.clock_in_1} -> ${clockOut} = ${totalHours} hrs`);
    fixed++;
  }

  console.log('\n=== SUMMARY ===');
  console.log('Records fixed:', fixed);
  console.log('Records skipped (no clock out):', skipped);

  // Show remaining records with 0 hours
  const remaining = await pool.query(`
    SELECT COUNT(*) as cnt FROM clock_in_records
    WHERE (total_hours = 0 OR total_hours IS NULL)
    AND clock_in_1 IS NOT NULL
    AND (clock_out_1 IS NOT NULL OR clock_out_2 IS NOT NULL)
  `);

  console.log('Remaining records with 0 hours (should be 0):', remaining.rows[0].cnt);

  process.exit(0);
}

function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.toString().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2] || '0', 10) || 0;
  return h * 3600 + m * 60 + s;
}

fixAllZeroHours().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
