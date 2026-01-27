const pool = require('../db');

async function fixTotalWorkMinutes() {
  // Find all records where total_hours has value but total_work_minutes is null/0
  const records = await pool.query(`
    SELECT id, employee_id, work_date::text, clock_in_1, clock_out_1, clock_in_2, clock_out_2,
           total_hours, total_work_minutes
    FROM clock_in_records
    WHERE total_hours > 0 AND (total_work_minutes IS NULL OR total_work_minutes = 0)
    ORDER BY work_date DESC
  `);

  console.log('=== RECORDS WITH HOURS BUT NO WORK MINUTES ===');
  console.log('Total records to fix:', records.rows.length);
  console.log('');

  let fixed = 0;

  for (const r of records.rows) {
    // Convert total_hours to total_work_minutes
    const totalMinutes = Math.round(parseFloat(r.total_hours) * 60);

    await pool.query(
      'UPDATE clock_in_records SET total_work_minutes = $1 WHERE id = $2',
      [totalMinutes, r.id]
    );

    console.log(`${r.work_date} | hours: ${r.total_hours} -> minutes: ${totalMinutes}`);
    fixed++;
  }

  console.log('\n=== SUMMARY ===');
  console.log('Records fixed:', fixed);

  // Verify - check ASLIE specifically
  const aslie = await pool.query(`
    SELECT work_date::text, clock_in_1, clock_out_2, total_hours, total_work_minutes
    FROM clock_in_records
    WHERE employee_id = 45
    ORDER BY work_date DESC
    LIMIT 10
  `);

  console.log('\n=== ASLIE RECORDS AFTER FIX ===');
  aslie.rows.forEach(r => {
    console.log(r.work_date, '| hours:', r.total_hours, '| minutes:', r.total_work_minutes);
  });

  process.exit(0);
}

fixTotalWorkMinutes().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
