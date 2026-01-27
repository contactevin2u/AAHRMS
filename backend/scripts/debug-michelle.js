const pool = require('../db');

async function checkDateIssue() {
  const employeeId = 66;

  // Get Malaysia time
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const today = malaysiaTime.getFullYear() + '-' + String(malaysiaTime.getMonth() + 1).padStart(2, '0') + '-' + String(malaysiaTime.getDate()).padStart(2, '0');
  const yesterday = new Date(malaysiaTime);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');

  console.log('Today:', today);
  console.log('Yesterday:', yesterdayStr);

  // Check for open shift from yesterday (same logic as backend)
  const openYesterday = await pool.query(`
    SELECT * FROM clock_in_records
    WHERE employee_id = $1
      AND work_date = $2
      AND status IN ('in_progress', 'working')
      AND clock_in_1 IS NOT NULL
      AND clock_out_2 IS NULL
  `, [employeeId, yesterdayStr]);

  console.log('\nOpen shift from yesterday:', openYesterday.rows.length > 0 ? 'YES' : 'NO');
  if (openYesterday.rows.length > 0) {
    const r = openYesterday.rows[0];
    console.log('  Record ID:', r.id);
    console.log('  clock_in_1:', r.clock_in_1);
    console.log('  clock_out_1:', r.clock_out_1);
    console.log('  status:', r.status);
  }

  // Check today's record
  const todayRec = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );

  console.log('\nToday record found:', todayRec.rows.length > 0 ? 'YES' : 'NO');
  if (todayRec.rows.length > 0) {
    const r = todayRec.rows[0];
    console.log('  Record ID:', r.id);
    console.log('  clock_in_1:', r.clock_in_1);
    console.log('  clock_out_1:', r.clock_out_1);
    console.log('  status:', r.status);
  }

  // Check ALL recent records
  const all = await pool.query(`
    SELECT id, work_date::text, clock_in_1, clock_out_1, clock_out_2, status
    FROM clock_in_records
    WHERE employee_id = $1
    ORDER BY work_date DESC, id DESC
    LIMIT 5
  `, [employeeId]);

  console.log('\nAll recent records:');
  all.rows.forEach(r => {
    console.log(`  ID: ${r.id} | date: ${r.work_date} | in1: ${r.clock_in_1} | out1: ${r.clock_out_1 || 'null'} | out2: ${r.clock_out_2 || 'null'} | status: ${r.status}`);
  });

  process.exit(0);
}

checkDateIssue().catch(e => { console.error(e); process.exit(1); });
