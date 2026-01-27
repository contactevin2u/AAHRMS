const pool = require('../db');

async function syncHoursMinutes() {
  // Find all records where total_hours doesn't match total_work_minutes
  const records = await pool.query(`
    SELECT id, employee_id, work_date::text, total_hours, total_work_minutes
    FROM clock_in_records
    WHERE total_hours > 0
      AND (total_work_minutes IS NULL
           OR total_work_minutes = 0
           OR ABS(total_hours * 60 - total_work_minutes) > 5)
    ORDER BY work_date DESC
  `);

  console.log('=== RECORDS WITH MISMATCHED HOURS/MINUTES ===');
  console.log('Total records to sync:', records.rows.length);
  console.log('');

  let fixed = 0;

  for (const r of records.rows) {
    const correctMinutes = Math.round(parseFloat(r.total_hours) * 60);
    const currentMinutes = r.total_work_minutes || 0;

    if (Math.abs(correctMinutes - currentMinutes) > 5) {
      await pool.query(
        'UPDATE clock_in_records SET total_work_minutes = $1 WHERE id = $2',
        [correctMinutes, r.id]
      );

      console.log(`${r.work_date} | hours: ${r.total_hours} | old minutes: ${currentMinutes} -> new: ${correctMinutes}`);
      fixed++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('Records synced:', fixed);

  // Verify ASLIE
  const aslie = await pool.query(`
    SELECT work_date::text, total_hours, total_work_minutes,
           ROUND(total_work_minutes / 60.0, 2) as calculated_hours
    FROM clock_in_records
    WHERE employee_id = 45
    ORDER BY work_date DESC
    LIMIT 15
  `);

  console.log('\n=== ASLIE RECORDS VERIFICATION ===');
  aslie.rows.forEach(r => {
    const match = Math.abs(parseFloat(r.total_hours) - parseFloat(r.calculated_hours)) < 0.1;
    console.log(r.work_date, '| hours:', r.total_hours, '| minutes:', r.total_work_minutes, '| calc:', r.calculated_hours, match ? '✓' : '✗ MISMATCH');
  });

  process.exit(0);
}

syncHoursMinutes().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
