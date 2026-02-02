require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv', ssl: { rejectUnauthorized: false } });

const OT_THRESHOLD = 540; // 9 hours for AA Alive

async function run() {
  // Find AA Alive records with clock times but 0/null hours
  const r = await pool.query(`
    SELECT id, employee_id, work_date, clock_in_1, clock_out_1, total_work_minutes
    FROM clock_in_records
    WHERE company_id = 1
      AND clock_in_1 IS NOT NULL AND clock_out_1 IS NOT NULL
      AND (total_work_minutes IS NULL OR total_work_minutes = 0)
    ORDER BY work_date
  `);

  console.log(`Found ${r.rows.length} records with missing hours`);

  let fixed = 0, skipped = 0;
  for (const row of r.rows) {
    const inStr = row.clock_in_1.toString();
    const outStr = row.clock_out_1.toString();
    const [ih, im] = inStr.split(':').map(Number);
    const [oh, om] = outStr.split(':').map(Number);

    // Skip records where in == out (incomplete sync)
    if (ih === oh && im === om) {
      console.log(`  SKIP id:${row.id} eid:${row.employee_id} ${row.work_date.toISOString().slice(0,10)} - same in/out ${inStr}`);
      skipped++;
      continue;
    }

    let inMin = ih * 60 + im;
    let outMin = oh * 60 + om;
    if (outMin <= inMin) outMin += 24 * 60;
    const totalMin = outMin - inMin;
    const totalHrs = (totalMin / 60).toFixed(2);
    const otMin = Math.max(0, totalMin - OT_THRESHOLD);
    const otHrs = (otMin / 60).toFixed(2);

    await pool.query(`
      UPDATE clock_in_records SET
        total_work_minutes = $1, total_work_hours = $2, total_hours = $2,
        ot_minutes = $3, ot_hours = $4, attendance_status = 'present'
      WHERE id = $5
    `, [totalMin, totalHrs, otMin, otHrs, row.id]);

    console.log(`  FIXED id:${row.id} eid:${row.employee_id} ${row.work_date.toISOString().slice(0,10)} ${inStr}-${outStr} = ${totalHrs}h (OT: ${otHrs}h)`);
    fixed++;
  }

  console.log(`\nDone: ${fixed} fixed, ${skipped} skipped (same in/out)`);
  pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
