const pool = require('../db');

async function checkResignations() {
  const today = new Date().toISOString().slice(0, 10);

  console.log('='.repeat(70));
  console.log(`RESIGNATION REMINDER - ${today}`);
  console.log('='.repeat(70));

  // Get pending resignations (cast date to text to avoid timezone issues)
  const result = await pool.query(`
    SELECT r.id, r.last_working_day::text as last_working_day, r.notice_date, r.status,
           e.id as employee_id, e.name, e.status as emp_status,
           o.name as outlet_name
    FROM resignations r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN outlets o ON e.outlet_id = o.id
    WHERE r.status = 'pending'
    ORDER BY r.last_working_day
  `);

  if (result.rows.length === 0) {
    console.log('\nNo pending resignations to process.');
    process.exit(0);
  }

  const toProcess = [];
  const upcoming = [];

  for (const r of result.rows) {
    const lastDay = r.last_working_day; // Already a string from ::text cast
    const lwdDate = new Date(lastDay + 'T00:00:00');
    const todayDate = new Date(today + 'T00:00:00');
    const daysLeft = Math.round((lwdDate - todayDate) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      toProcess.push({ ...r, lastDay, daysLeft: Math.abs(daysLeft), overdue: true });
    } else if (daysLeft === 0) {
      toProcess.push({ ...r, lastDay, daysLeft: 0, overdue: false });
    } else {
      upcoming.push({ ...r, lastDay, daysLeft });
    }
  }

  // Show resignations ready to process
  if (toProcess.length > 0) {
    console.log('\n*** ACTION REQUIRED - READY TO PROCESS ***');
    console.log('-'.repeat(70));
    for (const r of toProcess) {
      const urgency = r.overdue ? `OVERDUE by ${r.daysLeft} day(s)` : 'TODAY is last day';
      console.log(`\n  [Resignation #${r.id}] ${r.name}`);
      console.log(`    Outlet: ${r.outlet_name}`);
      console.log(`    Last Working Day: ${r.lastDay}`);
      console.log(`    Status: ${urgency}`);
      console.log(`    Command: node scripts/process-resignation.js ${r.id}`);
    }
  }

  // Show upcoming resignations
  if (upcoming.length > 0) {
    console.log('\n\n--- UPCOMING RESIGNATIONS ---');
    console.log('-'.repeat(70));
    for (const r of upcoming) {
      console.log(`\n  [Resignation #${r.id}] ${r.name}`);
      console.log(`    Outlet: ${r.outlet_name}`);
      console.log(`    Last Working Day: ${r.lastDay} (${r.daysLeft} day(s) remaining)`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Summary: ${toProcess.length} to process, ${upcoming.length} upcoming`);
  console.log('='.repeat(70));

  process.exit(0);
}

checkResignations().catch(e => { console.error(e); process.exit(1); });
