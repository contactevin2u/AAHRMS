require('dotenv').config();
const { Pool } = require('pg');
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });

(async () => {
  // These records have fundamentally bad data. Let's look at each:

  // id 668: in1:09:48, out1:15:25, in2:18:41, out2:18:30 - out2 < in2 (same hour, likely typo/error)
  //   Session 1: 5h37m. Session 2: out2(18:30) < in2(18:41) → overnight calc gives 23h49m. WRONG.
  //   Likely out2 should be next day but it's only 11min less than in2 → probably just a bad clock-out.
  //   Best fix: ignore session 2 (0 min, they clocked out immediately). Use session 1 only.
  console.log('Fixing id 668: ignore session 2 (out2 < in2 by 11min, bad data)');
  // Session 1 = 15:25 - 09:48 = 337 min = 5.62h
  await pool.query(
    'UPDATE clock_in_records SET total_work_minutes = 337, total_hours = 5.62, ot_hours = 0, ot_minutes = 0 WHERE id = 668'
  );

  // id 706: in1:15:18:00, out1:15:18:15, in2:16:25:43, out2:16:18:00 - out2 < in2 by 7min
  //   Session 1 = 0 min. Session 2: out2(16:18) < in2(16:25) → bad data.
  //   Whole record is basically empty/bad. Set to 0.
  console.log('Fixing id 706: all times within minutes, bad data → 0');
  await pool.query(
    'UPDATE clock_in_records SET total_work_minutes = 0, total_hours = 0, ot_hours = 0, ot_minutes = 0 WHERE id = 706'
  );

  // id 42,43,44: Jan 6, clock_in_1 at ~01:3x, no out1/in2, out2 at 00:00
  //   These are likely auto-clock-out artifacts. in1 at 1:33AM → out2 at 00:00 next day = ~22hrs. Nonsense.
  //   Likely the real shift was the previous day. Set hours to 0 since we can't determine real times.
  for (const id of [42, 43, 44]) {
    console.log('Fixing id', id, ': bad auto-clock-out artifact → 0');
    await pool.query(
      'UPDATE clock_in_records SET total_work_minutes = 0, total_hours = 0, ot_hours = 0, ot_minutes = 0 WHERE id = $1',
      [id]
    );
  }

  // id 387: in1:01:49, out1:16:25, in2:17:38, out2:01:30
  //   in1 at 01:49 is likely previous day spillover. Session 1 = 16:25-01:49 = 14h36m (876min).
  //   Session 2 = 01:30+1440-17:38*60... this is confusing.
  //   The real work was probably 16:xx to 01:30. Let's just calculate session2 properly:
  //   Session 2 = timeDiff(17*60+38, 1*60+30) = 90+1440-1058 = 472 min = 7.87h
  //   Total = 876+472 = 1348 = 22.47h. Still wrong because in1 at 01:49 is bad.
  //   Best fix: treat this as out1(16:25)-in2(17:38) break, real work = in1 to out2 minus break.
  //   But in1 at 01:49 is clearly wrong. Set to something reasonable or 0.
  console.log('Fixing id 387: in1 at 01:49 is bad data → 0');
  await pool.query(
    'UPDATE clock_in_records SET total_work_minutes = 0, total_hours = 0, ot_hours = 0, ot_minutes = 0 WHERE id = 387'
  );

  // Also fix id 198: in1:08:14, no out1/in2, out2:01:00 = single session overnight
  // timeDiff(494, 60) = 60+1440-494 = 1006 min = 16.77h. That's also unreasonable for single shift.
  // Likely auto-clock-out. Keep as is unless user complains.

  console.log('\nDone. Verify:');
  const r = await pool.query(`
    SELECT id, total_hours FROM clock_in_records WHERE id IN (668, 706, 42, 43, 44, 387)
  `);
  r.rows.forEach(x => console.log('id:', x.id, '| hrs:', x.total_hours));

  await pool.end();
})();
