require('dotenv').config();
const pool = require('../db');

const records = [
  // ASLIE (id:45) - Jan 22-31
  { eid: 45, date: '2026-01-22', in: '07:30', out: '18:42' },
  { eid: 45, date: '2026-01-23', in: '07:19', out: '22:26' },
  { eid: 45, date: '2026-01-24', in: '06:01', out: '12:05' },
  { eid: 45, date: '2026-01-25', in: '06:26', out: '12:56' },
  { eid: 45, date: '2026-01-26', in: '08:44', out: '19:04' },
  { eid: 45, date: '2026-01-27', in: '07:37', out: '19:02' },
  { eid: 45, date: '2026-01-28', in: '06:50', out: '23:24' },
  { eid: 45, date: '2026-01-29', in: '05:12', out: '23:20' },
  { eid: 45, date: '2026-01-30', in: '07:52', out: '21:02' },
  { eid: 45, date: '2026-01-31', in: '07:03', out: '18:57' },

  // MAHADI (id:343) - Jan 1-31
  { eid: 343, date: '2026-01-01', in: '08:44', out: '19:06' },
  { eid: 343, date: '2026-01-02', in: '05:14', out: '21:02' },
  { eid: 343, date: '2026-01-03', in: '07:03', out: '19:21' },
  { eid: 343, date: '2026-01-04', in: '07:07', out: '20:16' },
  { eid: 343, date: '2026-01-05', in: '08:44', out: '19:32' },
  { eid: 343, date: '2026-01-06', in: '08:09', out: '18:44' },
  { eid: 343, date: '2026-01-07', in: '08:24', out: '19:58' },
  { eid: 343, date: '2026-01-08', in: '07:39', out: '18:42' },
  { eid: 343, date: '2026-01-09', in: '08:50', out: '21:18' },
  { eid: 343, date: '2026-01-10', in: '07:53', out: '19:09' },
  { eid: 343, date: '2026-01-11', in: '06:00', out: '20:15' },
  { eid: 343, date: '2026-01-12', in: '04:00', out: '20:33' },
  { eid: 343, date: '2026-01-13', in: '05:12', out: '18:58' },
  { eid: 343, date: '2026-01-14', in: '07:06', out: '19:22' },
  { eid: 343, date: '2026-01-15', in: '07:19', out: '19:15' },
  { eid: 343, date: '2026-01-16', in: '12:51', out: '19:15' },
  { eid: 343, date: '2026-01-17', in: '07:36', out: '21:02' },
  { eid: 343, date: '2026-01-18', in: '07:16', out: '20:05' },
  { eid: 343, date: '2026-01-19', in: '07:28', out: '19:27' },
  { eid: 343, date: '2026-01-20', in: '03:06', out: '21:19' },
  { eid: 343, date: '2026-01-21', in: '06:31', out: '19:09' },
  { eid: 343, date: '2026-01-22', in: '07:47', out: '18:33' },
  { eid: 343, date: '2026-01-23', in: '07:17', out: '18:44' },  // +3 jam OT noted
  { eid: 343, date: '2026-01-24', in: '07:42', out: '19:35' },
  { eid: 343, date: '2026-01-25', in: '08:06', out: '20:37' },
  { eid: 343, date: '2026-01-26', in: '08:44', out: '19:22' },
  { eid: 343, date: '2026-01-27', in: '04:45', out: '20:33' },
  { eid: 343, date: '2026-01-28', in: '06:50', out: '23:23' },
  { eid: 343, date: '2026-01-29', in: '05:30', out: '20:29' },
  { eid: 343, date: '2026-01-30', in: '07:11', out: '21:58' },
  { eid: 343, date: '2026-01-31', in: '07:03', out: '18:57' },

  // AR ADAM MIRZA (id:41) - Jan 1-31
  { eid: 41, date: '2026-01-01', in: '07:35', out: '18:38' },
  { eid: 41, date: '2026-01-02', in: '06:52', out: '19:12' },
  { eid: 41, date: '2026-01-03', in: '06:51', out: '19:18' },
  { eid: 41, date: '2026-01-04', in: '06:58', out: '19:27' },
  { eid: 41, date: '2026-01-05', in: '06:04', out: '19:59' },
  { eid: 41, date: '2026-01-06', in: '04:17', out: '20:01' },
  { eid: 41, date: '2026-01-07', in: '03:59', out: '21:57' },
  { eid: 41, date: '2026-01-08', in: '08:19', out: '18:20' },
  { eid: 41, date: '2026-01-09', in: '07:30', out: '20:12' },
  { eid: 41, date: '2026-01-10', in: '07:29', out: '19:51' },
  // Jan 11 - cuti (skip)
  { eid: 41, date: '2026-01-12', in: '07:59', out: '18:58' },
  { eid: 41, date: '2026-01-13', in: '07:53', out: '18:38' },
  { eid: 41, date: '2026-01-14', in: '07:33', out: '18:04' },
  // Jan 15 - cuti (skip)
  { eid: 41, date: '2026-01-16', in: '07:52', out: '19:15' },
  { eid: 41, date: '2026-01-17', in: '07:50', out: '18:04' },
  { eid: 41, date: '2026-01-18', in: '07:34', out: '18:52' },
  { eid: 41, date: '2026-01-19', in: '08:09', out: '19:46' },
  { eid: 41, date: '2026-01-20', in: '07:23', out: '19:47' },
  { eid: 41, date: '2026-01-21', in: '08:05', out: '19:26' },
  { eid: 41, date: '2026-01-22', in: '07:46', out: '18:30' },
  { eid: 41, date: '2026-01-23', in: '08:18', out: '18:38' },
  { eid: 41, date: '2026-01-24', in: '07:39', out: '00:01' },  // next day
  { eid: 41, date: '2026-01-25', in: '05:56', out: '00:33' },  // next day
  { eid: 41, date: '2026-01-26', in: '07:32', out: '19:04' },
  { eid: 41, date: '2026-01-27', in: '07:38', out: '18:51' },
  { eid: 41, date: '2026-01-28', in: '07:46', out: '19:25' },
  { eid: 41, date: '2026-01-29', in: '07:36', out: '22:43' },
  { eid: 41, date: '2026-01-30', in: '07:50', out: '19:21' },
  { eid: 41, date: '2026-01-31', in: '08:27', out: '18:55' },

  // ZAINAL (id:326) - Jan 1-31
  { eid: 326, date: '2026-01-01', in: '08:42', out: '19:01' },
  { eid: 326, date: '2026-01-02', in: '05:00', out: '21:01' },
  { eid: 326, date: '2026-01-03', in: '07:08', out: '19:19' },
  { eid: 326, date: '2026-01-04', in: '08:14', out: '20:27' },
  { eid: 326, date: '2026-01-05', in: '07:20', out: '19:32' },
  { eid: 326, date: '2026-01-06', in: '09:06', out: '18:19' },
  { eid: 326, date: '2026-01-07', in: '08:24', out: '19:57' },
  { eid: 326, date: '2026-01-08', in: '07:59', out: '19:42' },
  { eid: 326, date: '2026-01-09', in: '08:08', out: '21:17' },
  { eid: 326, date: '2026-01-10', in: '07:33', out: '19:13' },
  { eid: 326, date: '2026-01-11', in: '07:53', out: '19:51' },
  { eid: 326, date: '2026-01-12', in: '07:59', out: '19:02' },
  { eid: 326, date: '2026-01-13', in: '06:23', out: '19:01' },
  { eid: 326, date: '2026-01-14', in: '07:05', out: '19:20' },
  { eid: 326, date: '2026-01-15', in: '07:00', out: '19:15' },
  { eid: 326, date: '2026-01-16', in: '07:12', out: '19:18' },
  { eid: 326, date: '2026-01-17', in: '07:37', out: '21:02' },
  { eid: 326, date: '2026-01-18', in: '07:01', out: '19:57' },
  { eid: 326, date: '2026-01-19', in: '07:07', out: '19:27' },
  { eid: 326, date: '2026-01-20', in: '03:06', out: '21:18' },
  { eid: 326, date: '2026-01-21', in: '06:31', out: '19:03' },
  { eid: 326, date: '2026-01-22', in: '09:06', out: '18:31' },
  { eid: 326, date: '2026-01-23', in: '07:27', out: '19:17' },
  { eid: 326, date: '2026-01-24', in: '07:38', out: '19:35' },
  { eid: 326, date: '2026-01-25', in: '08:00', out: '20:40' },
  { eid: 326, date: '2026-01-26', in: '07:50', out: '19:20' },
  { eid: 326, date: '2026-01-27', in: '04:42', out: '20:30' },
  { eid: 326, date: '2026-01-28', in: '06:50', out: '23:23' },
  { eid: 326, date: '2026-01-29', in: '05:28', out: '20:25' },
  { eid: 326, date: '2026-01-30', in: '07:08', out: '21:42' },
  { eid: 326, date: '2026-01-31', in: '07:28', out: '19:03' },
];

function calcMinutes(inTime, outTime) {
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  let inMin = ih * 60 + im;
  let outMin = oh * 60 + om;
  if (outMin <= inMin) outMin += 24 * 60; // overnight
  return outMin - inMin;
}

async function run() {
  let inserted = 0, updated = 0;

  for (const r of records) {
    const totalMin = calcMinutes(r.in, r.out);
    const totalHrs = (totalMin / 60).toFixed(2);
    // OT = anything over 450 min (7.5 hrs)
    const otMin = Math.max(0, totalMin - 450);
    const otHrs = (otMin / 60).toFixed(2);

    // Check if record exists
    const existing = await pool.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [r.eid, r.date]
    );

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE clock_in_records SET
          clock_in_1 = $1, clock_out_1 = $2,
          total_work_minutes = $3, total_hours = $4, total_work_hours = $4,
          ot_minutes = $5, ot_hours = $6,
          status = 'completed', attendance_status = 'present',
          updated_at = NOW()
        WHERE employee_id = $7 AND work_date = $8`,
        [r.in, r.out, totalMin, totalHrs, otMin, otHrs, r.eid, r.date]
      );
      updated++;
    } else {
      await pool.query(`
        INSERT INTO clock_in_records
          (employee_id, company_id, work_date, clock_in_1, clock_out_1,
           total_work_minutes, total_hours, total_work_hours,
           ot_minutes, ot_hours, status, attendance_status, created_at, updated_at)
        VALUES ($1, 1, $2, $3, $4, $5, $6, $6, $7, $8, 'completed', 'present', NOW(), NOW())`,
        [r.eid, r.date, r.in, r.out, totalMin, totalHrs, otMin, otHrs]
      );
      inserted++;
    }
  }

  console.log(`Done: ${inserted} inserted, ${updated} updated (${records.length} total)`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
