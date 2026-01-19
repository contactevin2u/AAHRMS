/**
 * Script to fix midnight clock-ins that should be clock-outs for the previous day
 *
 * Problem: Night shift workers clocking out after midnight creates a new record
 * for the next day instead of closing the previous day's shift.
 *
 * Solution: Find all clock_in_1 times between 00:00 and 01:30 where the previous
 * day has an open shift, then move that time to be clock_out_2 of the previous day.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// OT Rules
const STANDARD_WORK_MINUTES = 450; // 7.5 hours

function calculateWorkTime(record) {
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;

  if (!clock_in_1) return { totalMinutes: 0, otMinutes: 0 };

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  let totalMinutes = 0;

  // Calculate work sessions
  if (clock_in_1 && clock_out_1) {
    totalMinutes += Math.max(0, timeToMinutes(clock_out_1) - timeToMinutes(clock_in_1));
  }

  if (clock_in_2 && clock_out_2) {
    let end2 = timeToMinutes(clock_out_2);
    const start2 = timeToMinutes(clock_in_2);
    // If clock_out_2 is after midnight (less than clock_in_2), add 24 hours
    if (end2 < start2) {
      end2 += 24 * 60;
    }
    totalMinutes += Math.max(0, end2 - start2);
  }

  // If only clock_in_1 and clock_out_2 (no break recorded)
  if (clock_in_1 && clock_out_2 && !clock_out_1 && !clock_in_2) {
    let end = timeToMinutes(clock_out_2);
    const start = timeToMinutes(clock_in_1);
    if (end < start) {
      end += 24 * 60;
    }
    totalMinutes = end - start;
  }

  // OT calculation
  const rawOtMinutes = Math.max(0, totalMinutes - STANDARD_WORK_MINUTES);
  let otMinutes = 0;
  if (rawOtMinutes >= 60) {
    otMinutes = Math.floor(rawOtMinutes / 30) * 30;
  }

  return { totalMinutes, otMinutes };
}

async function findAndFixMidnightClockIns(dryRun = true) {
  console.log(dryRun ? '=== DRY RUN MODE ===' : '=== FIXING RECORDS ===');
  console.log();

  // Find all clock-in records where clock_in_1 is between 00:00 and 01:30
  const result = await pool.query(`
    SELECT cir.id, cir.employee_id,
           TO_CHAR(cir.work_date, 'YYYY-MM-DD') as work_date,
           cir.clock_in_1, cir.clock_out_1, cir.clock_in_2, cir.clock_out_2,
           cir.photo_in_1, cir.location_in_1, cir.address_in_1,
           cir.face_detected_in_1, cir.face_confidence_in_1,
           cir.status, e.name as employee_name, e.employee_id as emp_code
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    WHERE cir.clock_in_1 IS NOT NULL
      AND cir.clock_in_1::time < '01:30:00'::time
    ORDER BY cir.work_date DESC
  `);

  console.log('Found', result.rows.length, 'records with clock_in before 1:30 AM');
  console.log();

  const toFix = [];

  for (const row of result.rows) {
    // Get previous day - parse YYYY-MM-DD directly to avoid timezone issues
    const [year, month, day] = row.work_date.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day); // month is 0-indexed
    currentDate.setDate(currentDate.getDate() - 1);
    const prevDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

    // Check if previous day has an open shift
    const prevResult = await pool.query(`
      SELECT id, clock_in_1, clock_out_1, clock_in_2, clock_out_2, status
      FROM clock_in_records
      WHERE employee_id = $1
        AND TO_CHAR(work_date, 'YYYY-MM-DD') = $2
    `, [row.employee_id, prevDateStr]);

    if (prevResult.rows.length > 0) {
      const prev = prevResult.rows[0];
      // Check if previous day is missing clock_out_2
      if (prev.clock_in_1 && !prev.clock_out_2) {
        console.log('NEEDS FIX:', row.employee_name, '(' + row.emp_code + ')');
        console.log('  Current record (ID:', row.id + '):', row.work_date, 'clock_in_1=' + row.clock_in_1);
        console.log('  Previous record (ID:', prev.id + '):', prevDateStr);
        console.log('    clock_in_1=' + prev.clock_in_1);
        console.log('    clock_out_1=' + (prev.clock_out_1 || '-'));
        console.log('    clock_in_2=' + (prev.clock_in_2 || '-'));
        console.log('    clock_out_2=' + (prev.clock_out_2 || 'MISSING'));
        console.log('  --> Move', row.clock_in_1, 'to previous day clock_out_2');
        console.log();

        toFix.push({
          currentId: row.id,
          currentDate: row.work_date,
          currentClockIn: row.clock_in_1,
          currentHasOtherData: !!(row.clock_out_1 || row.clock_in_2 || row.clock_out_2),
          currentPhoto: row.photo_in_1,
          currentLocation: row.location_in_1,
          currentAddress: row.address_in_1,
          currentFaceDetected: row.face_detected_in_1,
          currentFaceConfidence: row.face_confidence_in_1,
          prevId: prev.id,
          prevDate: prevDateStr,
          prevClockIn1: prev.clock_in_1,
          prevClockOut1: prev.clock_out_1,
          prevClockIn2: prev.clock_in_2,
          employeeName: row.employee_name,
          employeeId: row.employee_id
        });
      }
    }
  }

  console.log('=== TOTAL TO FIX:', toFix.length, '===');
  console.log();

  if (!dryRun && toFix.length > 0) {
    console.log('Applying fixes...');
    console.log();

    for (const fix of toFix) {
      try {
        // 1. Update the previous day's record with the clock_out_2
        const prevRecord = {
          clock_in_1: fix.prevClockIn1,
          clock_out_1: fix.prevClockOut1,
          clock_in_2: fix.prevClockIn2,
          clock_out_2: fix.currentClockIn
        };
        const { totalMinutes, otMinutes } = calculateWorkTime(prevRecord);

        await pool.query(`
          UPDATE clock_in_records SET
            clock_out_2 = $1,
            photo_out_2 = $2,
            location_out_2 = $3,
            address_out_2 = $4,
            face_detected_out_2 = $5,
            face_confidence_out_2 = $6,
            total_work_minutes = $7,
            ot_minutes = $8,
            status = 'completed'
          WHERE id = $9
        `, [
          fix.currentClockIn,
          fix.currentPhoto,
          fix.currentLocation,
          fix.currentAddress,
          fix.currentFaceDetected,
          fix.currentFaceConfidence,
          totalMinutes,
          otMinutes,
          fix.prevId
        ]);

        console.log('  Updated previous day record (ID:', fix.prevId + ') with clock_out_2=' + fix.currentClockIn);
        console.log('  Total work minutes:', totalMinutes, '| OT minutes:', otMinutes);

        // 2. Delete or clear the current day's record
        if (fix.currentHasOtherData) {
          // Has other data, just clear the clock_in_1
          console.log('  WARNING: Current record has other data, skipping deletion');
        } else {
          // No other data, safe to delete
          await pool.query('DELETE FROM clock_in_records WHERE id = $1', [fix.currentId]);
          console.log('  Deleted current day record (ID:', fix.currentId + ')');
        }

        console.log('  FIXED:', fix.employeeName);
        console.log();
      } catch (err) {
        console.error('  ERROR fixing', fix.employeeName + ':', err.message);
      }
    }
  }

  return toFix;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--fix');

  if (dryRun) {
    console.log('Running in DRY RUN mode. Use --fix to apply changes.');
    console.log();
  }

  try {
    await findAndFixMidnightClockIns(dryRun);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
