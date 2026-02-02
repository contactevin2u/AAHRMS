require('dotenv').config();
const pool = require('../db');

async function run() {
  // Fix AA Alive (company_id=1) records just inserted: OT after 9hrs (540 min)
  const r = await pool.query(`
    UPDATE clock_in_records SET
      ot_minutes = GREATEST(0, total_work_minutes - 540),
      ot_hours = ROUND(GREATEST(0, total_work_minutes - 540) / 60.0, 2)
    WHERE employee_id IN (45, 343, 41, 326)
      AND work_date >= '2026-01-01' AND work_date <= '2026-01-31'
      AND total_work_minutes IS NOT NULL
    RETURNING employee_id, work_date, total_work_minutes, ot_minutes, ot_hours
  `);
  console.log(`Updated ${r.rowCount} AA Alive records (OT after 9hrs)`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
