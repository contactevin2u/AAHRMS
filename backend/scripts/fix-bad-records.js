require('dotenv').config();
const { Pool } = require('pg');
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });

const STANDARD_WORK_MINUTES_MIMIX = 450;

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function calculateWorkTimeMimix(record) {
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;
  if (!clock_in_1) return { totalMinutes: 0, otMinutes: 0, totalHours: 0, otHours: 0 };

  let totalMinutes = 0;
  const timeDiff = (start, end) => end >= start ? end - start : end + 1440 - start;

  if (clock_in_1 && clock_out_1 && clock_in_2 && clock_out_2) {
    // Full 4-action: session1 + session2
    totalMinutes = timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_1))
                 + timeDiff(timeToMinutes(clock_in_2), timeToMinutes(clock_out_2));
  } else if (clock_in_1 && clock_out_2 && !clock_out_1 && !clock_in_2) {
    // No break: in1 to out2
    totalMinutes = timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_2));
  } else if (clock_in_1 && clock_out_1 && !clock_in_2 && !clock_out_2) {
    // Only session 1
    totalMinutes = timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_1));
  } else if (clock_in_1 && clock_out_1 && clock_in_2 && !clock_out_2) {
    // Session 1 complete, session 2 in progress
    totalMinutes = timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_1));
  } else {
    // Just clock_in_1
    totalMinutes = 0;
  }

  const rawOtMinutes = Math.max(0, totalMinutes - STANDARD_WORK_MINUTES_MIMIX);
  let otMinutes = 0;
  if (rawOtMinutes >= 60) {
    otMinutes = Math.floor(rawOtMinutes / 30) * 30;
  }

  return {
    totalMinutes,
    totalHours: Math.round(totalMinutes / 60 * 100) / 100,
    otMinutes,
    otHours: otMinutes / 60
  };
}

(async () => {
  // Fix records with >18 hours (clearly wrong)
  const bad = await pool.query(`
    SELECT id, employee_id, work_date::text,
           clock_in_1::text, clock_out_1::text, clock_in_2::text, clock_out_2::text,
           total_hours, status
    FROM clock_in_records
    WHERE company_id = 3
      AND work_date >= '2026-01-01'
      AND total_hours > 18
  `);

  console.log('=== Fixing', bad.rows.length, 'records with >18 hours ===');
  for (const rec of bad.rows) {
    const calc = calculateWorkTimeMimix(rec);
    // If still >18, something is fundamentally wrong with the data
    if (calc.totalHours > 18) {
      console.log('STILL BAD id:', rec.id, '|', rec.work_date, '| in1:', rec.clock_in_1, '| out1:', rec.clock_out_1, '| in2:', rec.clock_in_2, '| out2:', rec.clock_out_2, '| calc hrs:', calc.totalHours, '- SKIPPING');
      continue;
    }
    console.log('id:', rec.id, '|', rec.work_date, '| OLD hrs:', rec.total_hours, '| NEW hrs:', calc.totalHours);
    await pool.query(
      'UPDATE clock_in_records SET total_work_minutes = $1, total_hours = $2, ot_hours = $3, ot_minutes = $4 WHERE id = $5',
      [calc.totalMinutes, calc.totalHours, calc.otHours, calc.otMinutes, rec.id]
    );
  }

  // Also revert Jan 29 in_progress records that don't have clock_out_2 back to 0
  // These are still working, hours will be calculated at clock_out_2
  const inProgress = await pool.query(`
    SELECT id, clock_in_1::text, clock_out_1::text, clock_in_2::text, clock_out_2::text, total_hours
    FROM clock_in_records
    WHERE company_id = 3
      AND status = 'in_progress'
      AND clock_out_2 IS NULL
      AND total_hours > 0
  `);
  console.log('\n=== Resetting', inProgress.rows.length, 'in_progress records to 0 hours ===');
  for (const rec of inProgress.rows) {
    console.log('id:', rec.id, '| hrs:', rec.total_hours, '-> 0');
    await pool.query(
      'UPDATE clock_in_records SET total_work_minutes = 0, total_hours = 0, ot_hours = 0, ot_minutes = 0 WHERE id = $1',
      [rec.id]
    );
  }

  // Verify Taufiq's records
  console.log('\n=== Taufiq records after fix ===');
  const t = await pool.query(`
    SELECT id, work_date::text, clock_in_1::text, clock_out_1::text, clock_in_2::text, clock_out_2::text,
           total_hours, ot_hours, status
    FROM clock_in_records WHERE employee_id = 118 AND work_date >= '2026-01-15'
    ORDER BY work_date DESC
  `);
  t.rows.forEach(x => {
    console.log('id:', x.id, '|', x.work_date, '| in1:', x.clock_in_1, '| out1:', x.clock_out_1, '| in2:', x.clock_in_2, '| out2:', x.clock_out_2, '| hrs:', x.total_hours, '| ot:', x.ot_hours, '| st:', x.status);
  });

  await pool.end();
})();
