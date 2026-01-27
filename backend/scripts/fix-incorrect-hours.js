const pool = require('../db');

async function fixIncorrectHours() {
  // Find records with unrealistic hours (over 20 hours in a day is suspicious)
  const records = await pool.query(`
    SELECT c.id, c.employee_id, e.name, c.work_date::text,
           c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2,
           c.total_hours, e.company_id
    FROM clock_in_records c
    JOIN employees e ON c.employee_id = e.id
    WHERE c.total_hours > 20 OR c.total_hours < 0
    ORDER BY c.work_date DESC, e.name
  `);

  console.log('=== RECORDS WITH SUSPICIOUS HOURS (>20 or <0) ===');
  console.log('Total records to fix:', records.rows.length);
  console.log('');

  let fixed = 0;

  for (const r of records.rows) {
    console.log(`\n${r.work_date} | ${r.name} | Current hours: ${r.total_hours}`);
    console.log(`  in1: ${r.clock_in_1} | out1: ${r.clock_out_1} | in2: ${r.clock_in_2} | out2: ${r.clock_out_2}`);

    let totalHours = 0;

    // For Mimix (company_id = 3) with break: calculate session1 + session2
    if (r.company_id === 3 && r.clock_in_1 && r.clock_out_1 && r.clock_in_2 && r.clock_out_2) {
      const in1 = parseTime(r.clock_in_1);
      const out1 = parseTime(r.clock_out_1);
      const in2 = parseTime(r.clock_in_2);
      let out2 = parseTime(r.clock_out_2);

      // Only add 24 hours to out2 if it's genuinely next day (very early morning)
      if (out2 < in2 && out2 < 6 * 3600) {
        out2 += 24 * 3600;
      }

      const session1 = Math.max(0, out1 - in1);
      const session2 = Math.max(0, out2 - in2);
      totalHours = ((session1 + session2) / 3600).toFixed(2);

      console.log(`  Mimix: Session1=${(session1/3600).toFixed(2)}h + Session2=${(session2/3600).toFixed(2)}h = ${totalHours}h`);
    }
    // For AA Alive (company_id = 1) or simple clock: clock_in_1 to last clock_out
    else if (r.clock_in_1) {
      const in1 = parseTime(r.clock_in_1);
      let out = parseTime(r.clock_out_2 || r.clock_out_1);

      // Only add 24 hours if out time is very early morning (before 6am) and in time is afternoon/evening
      if (out < in1 && out < 6 * 3600 && in1 > 12 * 3600) {
        out += 24 * 3600;
      }

      totalHours = Math.max(0, (out - in1) / 3600).toFixed(2);
      console.log(`  Simple: ${r.clock_in_1} to ${r.clock_out_2 || r.clock_out_1} = ${totalHours}h`);
    }

    // Update the record
    await pool.query(
      'UPDATE clock_in_records SET total_hours = $1 WHERE id = $2',
      [totalHours, r.id]
    );

    console.log(`  FIXED: ${totalHours} hours`);
    fixed++;
  }

  console.log('\n=== SUMMARY ===');
  console.log('Records fixed:', fixed);

  // Verify no more suspicious hours
  const remaining = await pool.query(`
    SELECT COUNT(*) as cnt FROM clock_in_records
    WHERE total_hours > 20 OR total_hours < 0
  `);
  console.log('Remaining records with suspicious hours:', remaining.rows[0].cnt);

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

fixIncorrectHours().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
