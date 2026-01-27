const pool = require('../db');

// Simulate the backend clock_out_1 logic
async function testClockOut() {
  const employeeId = 66; // Michelle
  const action = 'clock_out_1';

  // Get Malaysia date/time
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  let workDate = malaysiaTime.getFullYear() + '-' + String(malaysiaTime.getMonth() + 1).padStart(2, '0') + '-' + String(malaysiaTime.getDate()).padStart(2, '0');
  const currentTime = malaysiaTime.toTimeString().substring(0, 8);

  console.log('=== SIMULATING CLOCK OUT FOR MICHELLE ===');
  console.log('Employee ID:', employeeId);
  console.log('Work Date:', workDate);
  console.log('Current Time:', currentTime);

  // Check for open shift from yesterday
  const yesterday = new Date(malaysiaTime);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');

  const openYesterday = await pool.query(`
    SELECT * FROM clock_in_records
    WHERE employee_id = $1
      AND work_date = $2
      AND status IN ('in_progress', 'working', 'session_ended')
      AND clock_in_1 IS NOT NULL
      AND clock_out_2 IS NULL
  `, [employeeId, yesterdayStr]);

  console.log('\nOpen shift from yesterday?', openYesterday.rows.length > 0 ? 'YES - using yesterday date' : 'NO');

  if (openYesterday.rows.length > 0 && action !== 'clock_in_1') {
    workDate = yesterdayStr;
    console.log('Switched to yesterday date:', workDate);
  }

  // Get company
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [employeeId]
  );
  const companyId = empResult.rows[0].company_id;
  const isAAAlive = companyId === 1;
  console.log('Company:', companyId, '(AA Alive:', isAAAlive, ')');

  // Get existing record (same query as backend)
  const existingRecord = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, workDate]
  );

  console.log('\n=== EXISTING RECORD CHECK ===');
  console.log('Query: employee_id =', employeeId, ', work_date =', workDate);
  console.log('Records found:', existingRecord.rows.length);

  if (existingRecord.rows.length === 0) {
    console.log('\nERROR: No record found - "You must clock in first"');
    process.exit(1);
  }

  const record = existingRecord.rows[0];
  console.log('\nRecord details:');
  console.log('  ID:', record.id);
  console.log('  clock_in_1:', record.clock_in_1);
  console.log('  clock_out_1:', record.clock_out_1);
  console.log('  clock_in_2:', record.clock_in_2);
  console.log('  clock_out_2:', record.clock_out_2);
  console.log('  status:', record.status);

  // Check conditions
  if (!record.clock_in_1) {
    console.log('\nERROR: "You must clock in first"');
  } else if (record.clock_out_1) {
    console.log('\nERROR: "You have already clocked out for this session"');
    console.log('clock_out_1 value:', JSON.stringify(record.clock_out_1));
  } else {
    console.log('\n✓ ALL CHECKS PASSED - Clock out should work!');
  }

  process.exit(0);
}

testClockOut().catch(e => { console.error(e); process.exit(1); });
