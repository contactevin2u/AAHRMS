/**
 * Fix AA Alive driver records:
 * 1. Move clock_out_2 to clock_out_1 where clock_out_1 is null
 * 2. Recalculate hours for all affected records
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });

function timeToMinutes(t) {
  if (!t) return 0;
  const p = t.toString().split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function diff(s, e) {
  return e >= s ? e - s : e + 1440 - s;
}

(async () => {
  try {
    // Step 1: Move clock_out_2 to clock_out_1
    const moved = await pool.query(`
      UPDATE clock_in_records
      SET clock_out_1 = clock_out_2,
          address_out_1 = address_out_2,
          clock_out_2 = NULL,
          address_out_2 = NULL,
          updated_at = NOW()
      WHERE company_id = 1
        AND clock_out_1 IS NULL
        AND clock_out_2 IS NOT NULL
      RETURNING id, employee_id, work_date, clock_out_1
    `);
    console.log('Moved clock_out_2 -> clock_out_1 for', moved.rows.length, 'records');

    // Step 2: Recalculate hours for all AA Alive records with clock_in_1 and clock_out_1
    const records = await pool.query(`
      SELECT id, clock_in_1, clock_out_1, clock_in_2, clock_out_2
      FROM clock_in_records
      WHERE company_id = 1
        AND clock_in_1 IS NOT NULL
        AND clock_out_1 IS NOT NULL
    `);

    let fixed = 0;
    for (const r of records.rows) {
      let totalMinutes = 0;

      // Session 1
      if (r.clock_in_1 && r.clock_out_1) {
        totalMinutes += diff(timeToMinutes(r.clock_in_1), timeToMinutes(r.clock_out_1));
      }

      // Session 2 (if exists)
      if (r.clock_in_2 && r.clock_out_2) {
        totalMinutes += diff(timeToMinutes(r.clock_in_2), timeToMinutes(r.clock_out_2));
      }

      // AA Alive standard: 9 hours (540 min)
      const rawOt = Math.max(0, totalMinutes - 540);
      const otMinutes = rawOt >= 60 ? Math.floor(rawOt / 30) * 30 : 0;
      const totalHours = Math.round(totalMinutes / 60 * 100) / 100;
      const otHours = otMinutes / 60;

      await pool.query(`
        UPDATE clock_in_records
        SET total_work_minutes = $1, ot_minutes = $2, total_hours = $3, ot_hours = $4, updated_at = NOW()
        WHERE id = $5
      `, [totalMinutes, otMinutes, totalHours, otHours, r.id]);
      fixed++;
    }

    console.log('Recalculated hours for', fixed, 'AA Alive records');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
