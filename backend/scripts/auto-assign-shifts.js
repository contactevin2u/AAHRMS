/**
 * Auto-assign shifts to past clock-in records
 *
 * Logic:
 * - Clock in 07:00-11:00 → Morning "Work" shift (09:00-18:00), template ID 1
 * - Clock in 14:00-16:30 → Afternoon Shift (15:00-23:30), template ID 5
 *
 * OT is flagged for supervisor approval (not auto-approved)
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Shift templates
const SHIFTS = {
  MORNING: { templateId: 1, name: 'Work', start: '09:00:00', end: '18:00:00', standardMins: 450 },
  AFTERNOON: { templateId: 5, name: 'Afternoon Shift', start: '15:00:00', end: '23:30:00', standardMins: 450 }
};

// Standard work minutes (7.5 hours)
const STANDARD_WORK_MINUTES = 450;

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function determineShift(clockIn) {
  const mins = timeToMinutes(clockIn);

  // Morning: clock in between 07:00 (420) and 11:00 (660)
  if (mins >= 420 && mins <= 660) {
    return SHIFTS.MORNING;
  }

  // Afternoon: clock in between 14:00 (840) and 16:30 (990)
  if (mins >= 840 && mins <= 990) {
    return SHIFTS.AFTERNOON;
  }

  return null;
}

function calculateOT(totalWorkMinutes) {
  if (!totalWorkMinutes) return { otMinutes: 0, hasOT: false };

  const rawOT = Math.max(0, totalWorkMinutes - STANDARD_WORK_MINUTES);

  // OT rules: minimum 1 hour, round down to nearest 30 mins
  let otMinutes = 0;
  if (rawOT >= 60) {
    otMinutes = Math.floor(rawOT / 30) * 30;
  }

  return { otMinutes, hasOT: otMinutes >= 60 };
}

async function autoAssignShifts(dryRun = true) {
  console.log(dryRun ? '=== DRY RUN MODE ===' : '=== APPLYING CHANGES ===');
  console.log();

  // Get all clock-in records without schedule (Jan 19 and before)
  const result = await pool.query(`
    SELECT cir.id, cir.employee_id, cir.company_id, cir.outlet_id,
           TO_CHAR(cir.work_date, 'YYYY-MM-DD') as work_date,
           cir.clock_in_1, cir.clock_out_1, cir.clock_in_2, cir.clock_out_2,
           cir.total_work_minutes, cir.ot_minutes, cir.ot_flagged,
           cir.status,
           e.name, e.employee_id as emp_code, e.work_type
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    WHERE cir.work_date <= '2026-01-19'
      AND cir.schedule_id IS NULL
      AND cir.clock_in_1 IS NOT NULL
    ORDER BY cir.work_date DESC
  `);

  console.log('Found', result.rows.length, 'records without schedule');
  console.log();

  let processed = 0;
  let skipped = 0;
  let otFlagged = 0;
  const summary = { morning: 0, afternoon: 0, unmatched: 0 };

  for (const r of result.rows) {
    const shift = determineShift(r.clock_in_1);

    if (!shift) {
      skipped++;
      summary.unmatched++;
      if (!dryRun) {
        console.log('SKIP:', r.name, '| Clock in:', r.clock_in_1, '(no matching shift)');
      }
      continue;
    }

    // Calculate OT
    const { otMinutes, hasOT } = calculateOT(r.total_work_minutes);

    // Only flag OT for full-time employees
    const shouldFlagOT = hasOT && r.work_type !== 'part_time';

    if (shift.templateId === 1) summary.morning++;
    else summary.afternoon++;

    if (!dryRun) {
      try {
        // 1. Check if schedule already exists
        const existingSchedule = await pool.query(`
          SELECT id FROM schedules
          WHERE employee_id = $1 AND TO_CHAR(schedule_date, 'YYYY-MM-DD') = $2
        `, [r.employee_id, r.work_date]);

        let scheduleId;

        if (existingSchedule.rows.length > 0) {
          // Use existing schedule
          scheduleId = existingSchedule.rows[0].id;
        } else {
          // 2. Create schedule record
          const scheduleResult = await pool.query(`
            INSERT INTO schedules (
              employee_id, company_id, outlet_id, schedule_date,
              shift_start, shift_end, break_duration,
              shift_template_id, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 60, $7, 'scheduled', NOW(), NOW())
            RETURNING id
          `, [
            r.employee_id, r.company_id, r.outlet_id, r.work_date,
            shift.start, shift.end, shift.templateId
          ]);
          scheduleId = scheduleResult.rows[0].id;
        }

        // 3. Update clock-in record with schedule_id and OT flag
        await pool.query(`
          UPDATE clock_in_records SET
            schedule_id = $1,
            has_schedule = TRUE,
            ot_minutes = $2,
            ot_flagged = $3,
            ot_approved = NULL
          WHERE id = $4
        `, [scheduleId, otMinutes, shouldFlagOT, r.id]);

        processed++;
        if (shouldFlagOT) otFlagged++;

        // Log every 50 records
        if (processed % 50 === 0) {
          console.log('Processed', processed, 'records...');
        }
      } catch (err) {
        console.error('ERROR processing', r.name, r.work_date + ':', err.message);
      }
    } else {
      processed++;
      if (shouldFlagOT) otFlagged++;
    }
  }

  console.log();
  console.log('=== SUMMARY ===');
  console.log('Total records:', result.rows.length);
  console.log('Processed:', processed);
  console.log('Skipped (no matching shift):', skipped);
  console.log();
  console.log('Shift breakdown:');
  console.log('  Morning (09:00-18:00):', summary.morning);
  console.log('  Afternoon (15:00-23:30):', summary.afternoon);
  console.log('  Unmatched:', summary.unmatched);
  console.log();
  console.log('OT flagged for approval:', otFlagged);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  if (dryRun) {
    console.log('Running in DRY RUN mode. Use --apply to make changes.');
    console.log();
  }

  try {
    await autoAssignShifts(dryRun);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
