require('dotenv').config();
const pool = require('../db');

// AA Alive drivers - Jan 2026 attendance from GPS screenshots
// OT threshold: 9 hours (540 min) for AA Alive (company_id=1)
const OT_THRESHOLD = 540;

const records = [
  // AIMAN (id:43)
  { eid: 43, date: '2026-01-01', in: '09:20', out: '18:37' },
  { eid: 43, date: '2026-01-02', in: '09:31', out: '03:39' },  // overnight
  { eid: 43, date: '2026-01-04', in: '09:28', out: '19:28' },
  { eid: 43, date: '2026-01-05', in: '09:31', out: '18:33' },
  { eid: 43, date: '2026-01-06', in: '09:37', out: '20:12' },
  { eid: 43, date: '2026-01-10', in: '08:51', out: '21:31' },
  { eid: 43, date: '2026-01-11', in: '10:08', out: '20:26' },
  { eid: 43, date: '2026-01-12', in: '09:19', out: '23:13' },
  { eid: 43, date: '2026-01-13', in: '09:37', out: '01:44' },  // overnight
  { eid: 43, date: '2026-01-14', in: '12:03', out: '21:41' },
  { eid: 43, date: '2026-01-17', in: '09:28', out: '00:10' },  // overnight
  { eid: 43, date: '2026-01-18', in: '09:54', out: '22:36' },
  { eid: 43, date: '2026-01-19', in: '09:28', out: '21:22' },
  { eid: 43, date: '2026-01-20', in: '09:10', out: '00:11' },  // overnight
  { eid: 43, date: '2026-01-21', in: '08:59', out: '01:14' },  // overnight

  // ALIFF (id:44)
  { eid: 44, date: '2026-01-03', in: '09:42', out: '19:21' },
  { eid: 44, date: '2026-01-04', in: '08:56', out: '01:54' },  // overnight
  { eid: 44, date: '2026-01-05', in: '11:01', out: '05:21' },  // overnight
  { eid: 44, date: '2026-01-06', in: '14:11', out: '00:57' },  // overnight
  { eid: 44, date: '2026-01-07', in: '10:54', out: '23:44' },
  { eid: 44, date: '2026-01-08', in: '09:27', out: '01:36' },  // overnight
  { eid: 44, date: '2026-01-09', in: '14:51', out: '22:34' },
  { eid: 44, date: '2026-01-11', in: '09:45', out: '00:15' },  // overnight
  { eid: 44, date: '2026-01-13', in: '09:36', out: '21:48' },
  { eid: 44, date: '2026-01-15', in: '10:19', out: '22:04' },
  { eid: 44, date: '2026-01-16', in: '10:25', out: '02:43' },  // overnight
  { eid: 44, date: '2026-01-17', in: '10:55', out: '01:51' },  // overnight
  { eid: 44, date: '2026-01-18', in: '13:07', out: '18:16' },
  { eid: 44, date: '2026-01-19', in: '08:46', out: '22:08' },
  { eid: 44, date: '2026-01-22', in: '08:16', out: '01:47' },  // overnight

  // ASRI (id:46)
  { eid: 46, date: '2026-01-01', in: '09:55', out: '19:26' },
  { eid: 46, date: '2026-01-02', in: '08:50', out: '18:28' },
  { eid: 46, date: '2026-01-05', in: '08:34', out: '00:15' },  // overnight
  { eid: 46, date: '2026-01-06', in: '10:54', out: '20:27' },
  { eid: 46, date: '2026-01-07', in: '09:20', out: '22:12' },
  { eid: 46, date: '2026-01-08', in: '09:52', out: '23:27' },
  { eid: 46, date: '2026-01-09', in: '09:57', out: '02:25' },  // overnight
  { eid: 46, date: '2026-01-12', in: '09:38', out: '03:15' },  // overnight
  { eid: 46, date: '2026-01-13', in: '13:45', out: '00:51' },  // overnight
  { eid: 46, date: '2026-01-15', in: '09:44', out: '18:55' },
  { eid: 46, date: '2026-01-16', in: '10:51', out: '19:52' },
  { eid: 46, date: '2026-01-17', in: '08:59', out: '22:07' },
  { eid: 46, date: '2026-01-18', in: '08:49', out: '23:15' },
  { eid: 46, date: '2026-01-19', in: '11:14', out: '01:56' },  // overnight
  { eid: 46, date: '2026-01-20', in: '13:58', out: '22:38' },
  { eid: 46, date: '2026-01-22', in: '09:05', out: '01:03' },  // overnight

  // DIN / HABER (id:42)
  { eid: 42, date: '2026-01-01', in: '09:24', out: '18:06' },
  { eid: 42, date: '2026-01-03', in: '09:11', out: '00:01' },  // overnight
  { eid: 42, date: '2026-01-05', in: '08:53', out: '00:18' },  // overnight
  { eid: 42, date: '2026-01-06', in: '09:33', out: '23:58' },
  { eid: 42, date: '2026-01-07', in: '09:40', out: '23:38' },
  { eid: 42, date: '2026-01-09', in: '09:33', out: '02:28' },  // overnight
  { eid: 42, date: '2026-01-11', in: '09:51', out: '20:53' },
  { eid: 42, date: '2026-01-12', in: '09:04', out: '00:18' },  // overnight
  { eid: 42, date: '2026-01-14', in: '09:22', out: '01:44' },  // overnight
  { eid: 42, date: '2026-01-15', in: '09:51', out: '21:24' },
  { eid: 42, date: '2026-01-16', in: '09:17', out: '22:53' },
  { eid: 42, date: '2026-01-17', in: '09:10', out: '21:02' },
  { eid: 42, date: '2026-01-19', in: '09:17', out: '00:38' },  // overnight
  { eid: 42, date: '2026-01-20', in: '09:26', out: '21:25' },
  { eid: 42, date: '2026-01-22', in: '09:32', out: '23:31' },
  { eid: 42, date: '2026-01-23', in: '08:56', out: '01:50' },  // overnight

  // FAKHRUL (id:48)
  { eid: 48, date: '2026-01-01', in: '10:12', out: '20:25' },
  { eid: 48, date: '2026-01-02', in: '10:11', out: '03:40' },  // overnight
  { eid: 48, date: '2026-01-04', in: '09:25', out: '18:44' },
  { eid: 48, date: '2026-01-05', in: '10:10', out: '22:36' },
  { eid: 48, date: '2026-01-07', in: '10:06', out: '02:25' },  // overnight
  { eid: 48, date: '2026-01-10', in: '11:36', out: '01:11' },  // overnight
  { eid: 48, date: '2026-01-11', in: '10:34', out: '23:59' },
  { eid: 48, date: '2026-01-12', in: '11:10', out: '01:07' },  // overnight
  { eid: 48, date: '2026-01-14', in: '09:38', out: '01:07' },  // overnight
  { eid: 48, date: '2026-01-15', in: '11:38', out: '21:54' },
  { eid: 48, date: '2026-01-16', in: '12:04', out: '19:15' },  // corrected per filename
  { eid: 48, date: '2026-01-18', in: '11:02', out: '18:57' },
  { eid: 48, date: '2026-01-20', in: '09:21', out: '01:23' },  // overnight
  { eid: 48, date: '2026-01-22', in: '11:32', out: '01:42' },  // overnight

  // HAFIZ (id:49)
  { eid: 49, date: '2026-01-01', in: '09:33', out: '18:13' },
  { eid: 49, date: '2026-01-02', in: '09:39', out: '02:14' },  // overnight
  { eid: 49, date: '2026-01-04', in: '09:27', out: '19:38' },
  { eid: 49, date: '2026-01-05', in: '09:34', out: '18:40' },
  { eid: 49, date: '2026-01-06', in: '09:25', out: '21:14' },
  { eid: 49, date: '2026-01-10', in: '09:29', out: '02:52' },  // overnight
  { eid: 49, date: '2026-01-11', in: '10:15', out: '02:18' },  // overnight
  { eid: 49, date: '2026-01-12', in: '09:50', out: '23:06' },
  { eid: 49, date: '2026-01-13', in: '09:57', out: '18:16' },
  { eid: 49, date: '2026-01-14', in: '09:34', out: '19:20' },
  { eid: 49, date: '2026-01-16', in: '09:47', out: '01:44' },  // overnight
  { eid: 49, date: '2026-01-20', in: '08:38', out: '01:14' },  // overnight
  { eid: 49, date: '2026-01-21', in: '10:06', out: '21:08' },
  { eid: 49, date: '2026-01-22', in: '09:29', out: '18:45' },
  { eid: 49, date: '2026-01-23', in: '08:32', out: '22:22' },

  // IQZAT (id:50)
  { eid: 50, date: '2026-01-04', in: '09:43', out: '18:49' },
  { eid: 50, date: '2026-01-05', in: '09:45', out: '01:05' },  // overnight
  { eid: 50, date: '2026-01-06', in: '10:51', out: '03:14' },  // overnight
  { eid: 50, date: '2026-01-08', in: '09:55', out: '01:50' },  // overnight
  { eid: 50, date: '2026-01-09', in: '12:18', out: '22:29' },
  { eid: 50, date: '2026-01-10', in: '09:45', out: '18:00' },
  { eid: 50, date: '2026-01-12', in: '09:54', out: '03:53' },  // overnight
  { eid: 50, date: '2026-01-13', in: '09:50', out: '22:31' },
  { eid: 50, date: '2026-01-17', in: '09:58', out: '00:19' },  // overnight
  { eid: 50, date: '2026-01-18', in: '10:10', out: '22:36' },
  { eid: 50, date: '2026-01-20', in: '07:16', out: '23:13' },
  { eid: 50, date: '2026-01-21', in: '09:10', out: '22:12' },
  { eid: 50, date: '2026-01-22', in: '09:44', out: '01:44' },  // overnight

  // IZUL (id:52) - only dates with clear in+out
  { eid: 52, date: '2026-01-02', in: '09:44', out: '21:50' },
  { eid: 52, date: '2026-01-03', in: '10:39', out: '23:33' },
  { eid: 52, date: '2026-01-12', in: '13:57', out: '23:00' },
  { eid: 52, date: '2026-01-13', in: '09:11', out: '21:52' },
  { eid: 52, date: '2026-01-15', in: '09:41', out: '18:02' },
  { eid: 52, date: '2026-01-18', in: '08:49', out: '19:35' },

  // IZUWAN (id:51)
  { eid: 51, date: '2026-01-01', in: '11:11', out: '18:02' },
  { eid: 51, date: '2026-01-02', in: '09:39', out: '02:51' },  // overnight
  { eid: 51, date: '2026-01-03', in: '09:20', out: '06:48' },  // overnight (long shift)
  { eid: 51, date: '2026-01-05', in: '09:18', out: '22:32' },
  { eid: 51, date: '2026-01-07', in: '09:15', out: '15:33' },
  { eid: 51, date: '2026-01-08', in: '10:29', out: '02:09' },  // overnight
  { eid: 51, date: '2026-01-09', in: '11:19', out: '18:02' },
  { eid: 51, date: '2026-01-10', in: '08:59', out: '02:40' },  // overnight
  { eid: 51, date: '2026-01-11', in: '09:57', out: '21:48' },
  { eid: 51, date: '2026-01-15', in: '08:51', out: '20:15' },
  { eid: 51, date: '2026-01-16', in: '09:07', out: '22:48' },
  { eid: 51, date: '2026-01-17', in: '09:09', out: '01:51' },  // overnight
  { eid: 51, date: '2026-01-18', in: '11:00', out: '18:01' },
  { eid: 51, date: '2026-01-19', in: '09:47', out: '20:01' },
  { eid: 51, date: '2026-01-22', in: '08:46', out: '04:18' },  // overnight
  { eid: 51, date: '2026-01-23', in: '14:45', out: '22:02' },

  // PIAN / SAFIAN (id:53)
  { eid: 53, date: '2026-01-01', in: '09:21', out: '18:10' },
  { eid: 53, date: '2026-01-02', in: '09:11', out: '01:28' },  // overnight
  { eid: 53, date: '2026-01-03', in: '08:26', out: '00:58' },  // overnight
  { eid: 53, date: '2026-01-06', in: '09:19', out: '20:14' },
  { eid: 53, date: '2026-01-07', in: '09:24', out: '23:35' },
  { eid: 53, date: '2026-01-08', in: '08:57', out: '22:23' },
  { eid: 53, date: '2026-01-10', in: '08:53', out: '21:05' },
  { eid: 53, date: '2026-01-11', in: '09:18', out: '18:18' },
  { eid: 53, date: '2026-01-13', in: '08:57', out: '17:53' },
  { eid: 53, date: '2026-01-14', in: '09:06', out: '19:34' },
  { eid: 53, date: '2026-01-16', in: '09:03', out: '01:34' },  // overnight
  { eid: 53, date: '2026-01-17', in: '09:04', out: '23:15' },
  { eid: 53, date: '2026-01-19', in: '09:29', out: '21:11' },
  { eid: 53, date: '2026-01-20', in: '09:31', out: '23:44' },
  { eid: 53, date: '2026-01-21', in: '09:34', out: '19:41' },
  { eid: 53, date: '2026-01-23', in: '09:23', out: '23:14' },

  // SALLEH (id:344)
  { eid: 344, date: '2026-01-02', in: '09:40', out: '01:52' },  // overnight
  { eid: 344, date: '2026-01-03', in: '10:12', out: '01:31' },  // overnight
  { eid: 344, date: '2026-01-04', in: '11:36', out: '03:00' },  // overnight
  { eid: 344, date: '2026-01-08', in: '09:11', out: '01:08' },  // overnight
  { eid: 344, date: '2026-01-09', in: '08:01', out: '04:10' },  // overnight
  { eid: 344, date: '2026-01-10', in: '12:44', out: '00:13' },  // overnight
  { eid: 344, date: '2026-01-11', in: '10:54', out: '23:42' },
  { eid: 344, date: '2026-01-12', in: '10:38', out: '03:01' },  // overnight
  { eid: 344, date: '2026-01-14', in: '09:11', out: '03:02' },  // overnight
  { eid: 344, date: '2026-01-15', in: '09:02', out: '00:03' },  // overnight
  { eid: 344, date: '2026-01-16', in: '09:21', out: '18:06' },
  { eid: 344, date: '2026-01-18', in: '08:59', out: '19:51' },
  { eid: 344, date: '2026-01-19', in: '09:15', out: '23:32' },
  { eid: 344, date: '2026-01-21', in: '09:08', out: '01:06' },  // overnight
  { eid: 344, date: '2026-01-22', in: '07:33', out: '01:09' },  // overnight

  // SYUKRI (id:341)
  { eid: 341, date: '2026-01-20', in: '07:41', out: '22:54' },
  { eid: 341, date: '2026-01-21', in: '07:52', out: '22:52' },
  { eid: 341, date: '2026-01-22', in: '08:31', out: '23:03' },
  { eid: 341, date: '2026-01-23', in: '08:33', out: '00:49' },  // overnight
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
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of records) {
    const totalMin = calcMinutes(r.in, r.out);
    const totalHrs = (totalMin / 60).toFixed(2);
    const otMin = Math.max(0, totalMin - OT_THRESHOLD);
    const otHrs = (otMin / 60).toFixed(2);

    // Check if record already exists
    const existing = await pool.query(
      'SELECT id, clock_in_1, clock_out_1 FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [r.eid, r.date]
    );

    if (existing.rows.length > 0) {
      const ex = existing.rows[0];
      // Only update if no clock data exists (placeholder from OrderOps with no times)
      if (ex.clock_in_1 && ex.clock_out_1) {
        skipped++;
        continue;
      }
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

  console.log(`Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped (already had data). Total: ${records.length}`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
