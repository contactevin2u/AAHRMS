/**
 * Recalculate all attendance working hours & auto-create Mimix schedules
 *
 * Part 1: Recalculate total_work_minutes, ot_minutes, etc. for all records
 *         using correct standard hours (AA Alive 9h, Mimix 7.5h)
 *
 * Part 2: Create missing schedules for Mimix Jan 2026 clock records
 *         - Clock in 07:00-11:00 → FD (09:00-18:00), template ID 8
 *         - Clock in 14:00-16:30 → Afternoon (15:00-23:30), template ID 5
 *
 * Usage:
 *   node backend/scripts/recalculate-hours.js          # dry run
 *   node backend/scripts/recalculate-hours.js --apply   # apply changes
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hrms_db',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

// Company IDs
const AA_ALIVE = 1;
const MIMIX = 3;

// Standard work minutes
const STANDARD_WORK_MINUTES_AA_ALIVE = 540; // 9 hours (break included)
const STANDARD_WORK_MINUTES_MIMIX = 450;    // 7.5 hours (excluding break)

// Mimix shift templates
const MIMIX_SHIFTS = {
  MORNING:   { templateId: 8, start: '09:00:00', end: '18:00:00' },
  AFTERNOON: { templateId: 5, start: '15:00:00', end: '23:30:00' }
};

function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.toString().split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function calculateWorkTime(record, companyId) {
  const standardMinutes = parseInt(companyId) === AA_ALIVE
    ? STANDARD_WORK_MINUTES_AA_ALIVE
    : STANDARD_WORK_MINUTES_MIMIX;

  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;

  let totalMinutes = 0;
  let breakMinutes = 0;

  const t1_in  = parseTime(clock_in_1);
  const t1_out = parseTime(clock_out_1);
  const t2_in  = parseTime(clock_in_2);
  const t2_out = parseTime(clock_out_2);

  // Morning session: clock_in_1 to clock_out_1
  if (t1_in !== null && t1_out !== null) {
    totalMinutes += Math.max(0, t1_out - t1_in);
  }

  // Break time: clock_out_1 to clock_in_2
  if (t1_out !== null && t2_in !== null) {
    breakMinutes = Math.max(0, t2_in - t1_out);
  }

  // Afternoon session: clock_in_2 to clock_out_2
  if (t2_in !== null && t2_out !== null) {
    totalMinutes += Math.max(0, t2_out - t2_in);
  }

  // No break scenario: only clock_in_1 and clock_out_2
  if (t1_in !== null && t2_out !== null && t1_out === null && t2_in === null) {
    totalMinutes = Math.max(0, t2_out - t1_in);
  }

  const otMinutes = Math.max(0, totalMinutes - standardMinutes);

  return {
    totalMinutes,
    breakMinutes,
    workMinutes: totalMinutes,
    otMinutes,
    totalHours: Math.round(totalMinutes / 60 * 100) / 100,
    otHours: Math.round(otMinutes / 60 * 100) / 100
  };
}

function determineShift(clockIn1) {
  const mins = parseTime(clockIn1);
  if (mins === null) return null;
  if (mins >= 420 && mins <= 660) return MIMIX_SHIFTS.MORNING;   // 07:00-11:00
  if (mins >= 840 && mins <= 990) return MIMIX_SHIFTS.AFTERNOON; // 14:00-16:30
  return null;
}

async function recalculateHours(dryRun) {
  console.log('=== PART 1: RECALCULATE ALL ATTENDANCE HOURS ===\n');

  const result = await pool.query(`
    SELECT id, company_id, clock_in_1, clock_out_1, clock_in_2, clock_out_2,
           total_work_minutes, ot_minutes
    FROM clock_in_records
    WHERE clock_out_1 IS NOT NULL OR clock_out_2 IS NOT NULL
  `);

  console.log('Found', result.rows.length, 'records with clock-out data\n');

  let updated = 0;
  let changed = 0;

  for (const r of result.rows) {
    const calc = calculateWorkTime(r, r.company_id);

    const isChanged = calc.workMinutes !== r.total_work_minutes || calc.otMinutes !== r.ot_minutes;
    if (isChanged) changed++;

    if (!dryRun) {
      await pool.query(`
        UPDATE clock_in_records SET
          total_work_minutes = $1,
          total_break_minutes = $2,
          ot_minutes = $3,
          total_hours = $4,
          total_work_hours = $4,
          ot_hours = $5
        WHERE id = $6
      `, [calc.workMinutes, calc.breakMinutes, calc.otMinutes, calc.totalHours, calc.otHours, r.id]);
    }

    updated++;
    if (updated % 200 === 0) console.log('  Processed', updated, '...');
  }

  console.log('\nRecalculation complete:');
  console.log('  Total processed:', updated);
  console.log('  Actually changed:', changed);
}

async function createMimixSchedules(dryRun) {
  console.log('\n=== PART 2: CREATE MISSING MIMIX SCHEDULES (JAN 2026) ===\n');

  const result = await pool.query(`
    SELECT cir.id, cir.employee_id, cir.company_id, cir.outlet_id,
           TO_CHAR(cir.work_date, 'YYYY-MM-DD') as work_date,
           cir.clock_in_1, cir.schedule_id,
           e.name, e.employee_id as emp_code
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    WHERE cir.company_id = $1
      AND cir.work_date >= '2026-01-01'
      AND cir.work_date < '2026-02-01'
      AND cir.clock_in_1 IS NOT NULL
    ORDER BY cir.work_date, e.name
  `, [MIMIX]);

  console.log('Found', result.rows.length, 'Mimix clock records in Jan 2026\n');

  let created = 0;
  let linked = 0;
  let alreadyHas = 0;
  let unmatched = 0;
  const summary = { morning: 0, afternoon: 0 };

  for (const r of result.rows) {
    // Already has schedule
    if (r.schedule_id) {
      alreadyHas++;
      continue;
    }

    const shift = determineShift(r.clock_in_1);
    if (!shift) {
      unmatched++;
      console.log('  SKIP:', r.name, '|', r.work_date, '| clock_in:', r.clock_in_1, '(no matching shift)');
      continue;
    }

    if (shift === MIMIX_SHIFTS.MORNING) summary.morning++;
    else summary.afternoon++;

    if (!dryRun) {
      try {
        // Check if schedule already exists for this employee+date
        const existing = await pool.query(
          `SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2`,
          [r.employee_id, r.work_date]
        );

        let scheduleId;
        if (existing.rows.length > 0) {
          scheduleId = existing.rows[0].id;
        } else {
          // Determine outlet_id: use record's outlet_id, or first managed outlet for managers
          let outletId = r.outlet_id;
          if (!outletId) {
            const eo = await pool.query(
              `SELECT outlet_id FROM employee_outlets WHERE employee_id = $1 LIMIT 1`,
              [r.employee_id]
            );
            if (eo.rows.length > 0) outletId = eo.rows[0].outlet_id;
          }

          const ins = await pool.query(`
            INSERT INTO schedules (
              employee_id, company_id, outlet_id, schedule_date,
              shift_start, shift_end, break_duration,
              shift_template_id, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 60, $7, 'scheduled', NOW(), NOW())
            RETURNING id
          `, [r.employee_id, MIMIX, outletId, r.work_date, shift.start, shift.end, shift.templateId]);
          scheduleId = ins.rows[0].id;
          created++;
        }

        // Link schedule to clock record
        await pool.query(`
          UPDATE clock_in_records SET schedule_id = $1, has_schedule = TRUE WHERE id = $2
        `, [scheduleId, r.id]);
        linked++;
      } catch (err) {
        console.error('  ERROR:', r.name, r.work_date, '-', err.message);
      }
    } else {
      created++;
      linked++;
    }
  }

  console.log('\nSchedule creation complete:');
  console.log('  Already had schedule:', alreadyHas);
  console.log('  Schedules created:', created);
  console.log('  Clock records linked:', linked);
  console.log('  Unmatched (skipped):', unmatched);
  console.log('  Shift breakdown - Morning:', summary.morning, '| Afternoon:', summary.afternoon);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  if (dryRun) {
    console.log('*** DRY RUN MODE - Use --apply to make changes ***\n');
  } else {
    console.log('*** APPLYING CHANGES ***\n');
  }

  try {
    await recalculateHours(dryRun);
    await createMimixSchedules(dryRun);
    console.log('\n=== DONE ===');
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
