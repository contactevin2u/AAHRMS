/**
 * Check synced driver attendance records from OrderOps
 */

const pool = require('../db');

async function checkSyncedRecords() {
  const client = await pool.connect();
  try {
    // Get recent synced records for AA Alive (company_id = 1)
    const result = await client.query(`
      SELECT
        e.employee_id,
        e.name,
        c.work_date,
        c.clock_in_1,
        c.clock_out_2,
        c.total_work_hours,
        c.notes,
        c.status
      FROM clock_in_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.company_id = 1
        AND c.notes LIKE '%OrderOps%'
      ORDER BY c.work_date DESC, e.name
      LIMIT 30
    `);

    console.log('Recent synced driver attendance records:');
    console.log('========================================');
    result.rows.forEach(r => {
      const date = r.work_date.toISOString().split('T')[0];
      const empId = r.employee_id.padEnd(10);
      const name = r.name.substring(0,20).padEnd(20);
      const clockIn = r.clock_in_1 || 'N/A';
      const clockOut = r.clock_out_2 || 'N/A';
      console.log(`${date} | ${empId} | ${name} | In: ${clockIn} | Out: ${clockOut} | ${r.status}`);
    });
    console.log(`\nTotal: ${result.rows.length} records`);

  } finally {
    client.release();
    pool.end();
  }
}

checkSyncedRecords().catch(console.error);
