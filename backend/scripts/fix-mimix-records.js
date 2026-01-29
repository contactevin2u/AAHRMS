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

function calculateWorkTime(record) {
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;
  if (!clock_in_1) return { totalMinutes: 0, otMinutes: 0, totalHours: 0, otHours: 0 };

  let totalMinutes = 0;
  const timeDiff = (start, end) => end >= start ? end - start : end + 1440 - start;

  // Session 1
  if (clock_in_1 && clock_out_1) {
    totalMinutes += timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_1));
  }
  // Session 2
  if (clock_in_2 && clock_out_2) {
    totalMinutes += timeDiff(timeToMinutes(clock_in_2), timeToMinutes(clock_out_2));
  }
  // No break recorded
  if (clock_in_1 && clock_out_2 && !clock_out_1 && !clock_in_2) {
    totalMinutes = timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_2));
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
  // Find all Mimix completed records that might have wrong calculations
  // Focus on records where clock_out crosses midnight (out time < in time)
  const r = await pool.query(`
    SELECT id, employee_id, work_date::text,
           clock_in_1::text, clock_out_1::text, clock_in_2::text, clock_out_2::text,
           total_work_minutes, total_hours, ot_hours, ot_minutes
    FROM clock_in_records
    WHERE company_id = 3
      AND work_date >= '2026-01-01'
      AND status IN ('completed', 'in_progress')
      AND clock_in_1 IS NOT NULL
  `);

  let fixCount = 0;
  const fixes = [];

  for (const rec of r.rows) {
    const calc = calculateWorkTime(rec);
    const currentMins = parseInt(rec.total_work_minutes) || 0;
    const currentHrs = parseFloat(rec.total_hours) || 0;
    const currentOt = parseFloat(rec.ot_hours) || 0;

    // Check if recalculation differs
    if (Math.abs(calc.totalMinutes - currentMins) > 1 || Math.abs(calc.totalHours - currentHrs) > 0.05) {
      fixes.push({
        id: rec.id,
        date: rec.work_date,
        in1: rec.clock_in_1, out1: rec.clock_out_1,
        in2: rec.clock_in_2, out2: rec.clock_out_2,
        oldMins: currentMins, newMins: calc.totalMinutes,
        oldHrs: currentHrs, newHrs: calc.totalHours,
        oldOt: currentOt, newOt: calc.otHours
      });
    }
  }

  console.log('Found', fixes.length, 'records needing recalculation:');
  fixes.forEach(f => {
    console.log('id:', f.id, '|', f.date,
      '| in1:', f.in1, '| out1:', f.out1, '| in2:', f.in2, '| out2:', f.out2,
      '| OLD mins:', f.oldMins, 'hrs:', f.oldHrs, 'ot:', f.oldOt,
      '| NEW mins:', f.newMins, 'hrs:', f.newHrs, 'ot:', f.newOt);
  });

  // Apply fixes
  for (const f of fixes) {
    await pool.query(`
      UPDATE clock_in_records
      SET total_work_minutes = $1, total_hours = $2, ot_hours = $3, ot_minutes = $4
      WHERE id = $5
    `, [f.newMins, f.newHrs, f.newOt, f.newOt * 60, f.id]);
  }
  console.log('\nUpdated', fixes.length, 'records');

  await pool.end();
})();
