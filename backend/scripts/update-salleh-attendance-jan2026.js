/**
 * Update Salleh attendance for January 2026
 * Override existing records if they exist
 */

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const EMPLOYEE_ID = 344; // SALLEH BIN YAAKOB @ ALIAS
const COMPANY_ID = 1;    // AA Alive

const records = [
  { date: '2026-01-03', clock_in: '10:12', clock_out: '25:31' }, // 1:31am next day
  { date: '2026-01-04', clock_in: '11:36', clock_out: '27:00' }, // 3:00am next day
  { date: '2026-01-15', clock_in: '09:02', clock_out: '24:03' }, // 00:03 next day
  { date: '2026-01-26', clock_in: '09:25', clock_out: '29:48' }, // 5:48am next day
];

function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  if (h >= 24) {
    const normalHour = h - 24;
    return { time: `${String(normalHour).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, overnight: true };
  }
  return { time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, overnight: false };
}

function calcWorkMinutes(clockIn, clockOut) {
  const [ih, im] = clockIn.split(':').map(Number);
  const [oh, om] = clockOut.split(':').map(Number);
  let inMin = ih * 60 + im;
  let outMin = oh * 60 + om;
  if (outMin <= inMin) {
    outMin += 24 * 60;
  }
  return outMin - inMin;
}

async function updateSallehAttendance() {
  const client = await pool.connect();

  try {
    console.log('Updating Salleh attendance for January 2026...\n');

    let totalUpdated = 0;
    let totalInserted = 0;

    for (const record of records) {
      const clockInParsed = parseTime(record.clock_in);
      const clockOutParsed = parseTime(record.clock_out);
      const workMinutes = calcWorkMinutes(record.clock_in, record.clock_out);
      const workHours = (workMinutes / 60).toFixed(2);
      const otMinutes = Math.max(0, workMinutes - 540); // OT after 9 hours
      const otHours = (otMinutes / 60).toFixed(2);

      // Check if record exists
      const existing = await client.query(
        'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
        [EMPLOYEE_ID, record.date]
      );

      if (existing.rows.length > 0) {
        await client.query(`
          UPDATE clock_in_records SET
            clock_in_1 = $1, clock_out_1 = $2,
            total_work_minutes = $3, total_work_hours = $4, total_hours = $4,
            ot_minutes = $5, ot_hours = $6,
            status = 'completed', updated_at = NOW()
          WHERE employee_id = $7 AND work_date = $8
        `, [clockInParsed.time, clockOutParsed.time, workMinutes, workHours, otMinutes, otHours, EMPLOYEE_ID, record.date]);
        console.log(`  UPDATED ${record.date}: ${record.clock_in} - ${record.clock_out} (${workMinutes} mins, OT: ${otMinutes} mins)`);
        totalUpdated++;
      } else {
        await client.query(`
          INSERT INTO clock_in_records (
            employee_id, company_id, work_date,
            clock_in_1, clock_out_1,
            total_work_minutes, total_work_hours, total_hours,
            ot_minutes, ot_hours,
            attendance_status, notes, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, 'present', 'Manual override', 'completed', NOW(), NOW())
        `, [EMPLOYEE_ID, COMPANY_ID, record.date, clockInParsed.time, clockOutParsed.time, workMinutes, workHours, otMinutes, otHours]);
        console.log(`  INSERTED ${record.date}: ${record.clock_in} - ${record.clock_out} (${workMinutes} mins, OT: ${otMinutes} mins)`);
        totalInserted++;
      }
    }

    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Records updated: ${totalUpdated}`);
    console.log(`Records inserted: ${totalInserted}`);
    console.log('\nDone!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

updateSallehAttendance();
