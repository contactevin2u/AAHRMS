const pool = require('../db');

async function addAdamAttendance() {
  // Find ADAM in AA Alive (company_id = 1)
  const emp = await pool.query(`
    SELECT id, name, company_id FROM employees
    WHERE company_id = 1 AND name ILIKE '%adam%'
  `);

  console.log('Employees named ADAM in AA Alive:');
  emp.rows.forEach(e => console.log('ID:', e.id, '| Name:', e.name));

  if (emp.rows.length === 0) {
    console.log('No employee found');
    process.exit(1);
  }

  // Use AR ADAM MIRZA BIN ARAZMI (the driver)
  const adam = emp.rows.find(e => e.name.includes('AR ADAM') || e.name.includes('ADAM'));
  if (!adam) {
    console.log('ADAM not found');
    process.exit(1);
  }

  console.log('\nUsing employee:', adam.name, '(ID:', adam.id, ')');

  // Attendance records to add
  // For AA Alive: clock_in_1 = in, clock_out_2 = out (clock_out_1 ends first session, clock_in_2 starts new optional session)
  const records = [
    { date: '2026-01-22', in1: '07:46:00', out2: '18:30:00' },
    { date: '2026-01-23', in1: '08:18:00', out2: '18:38:00' },
    { date: '2026-01-24', in1: '07:39:00', out2: '00:01:00' }, // out is 12:01am next day
    { date: '2026-01-25', in1: '05:56:00', out2: '00:33:00' }, // out is 12:33am next day
    { date: '2026-01-26', in1: '07:32:00', out2: null }  // no clock out yet
  ];

  for (const r of records) {
    // Check if record already exists
    const existing = await pool.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [adam.id, r.date]
    );

    if (existing.rows.length > 0) {
      console.log(`\n${r.date}: Record already exists (ID: ${existing.rows[0].id}), updating...`);
      // Update the existing record
      await pool.query(`
        UPDATE clock_in_records
        SET clock_in_1 = $1, clock_out_2 = $2,
            status = $3,
            updated_at = NOW()
        WHERE employee_id = $4 AND work_date = $5
      `, [r.in1, r.out2, r.out2 ? 'completed' : 'in_progress', adam.id, r.date]);
    } else {
      console.log(`\n${r.date}: Creating new record...`);
      // Insert new record
      await pool.query(`
        INSERT INTO clock_in_records (employee_id, work_date, clock_in_1, clock_out_2, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `, [adam.id, r.date, r.in1, r.out2, r.out2 ? 'completed' : 'in_progress']);
    }

    // Calculate total hours
    let totalHours = 0;
    if (r.out2) {
      const inSeconds = parseTime(r.in1);
      let outSeconds = parseTime(r.out2);
      // If out time is before in time, it's next day
      if (outSeconds < inSeconds) {
        outSeconds += 24 * 3600;
      }
      totalHours = ((outSeconds - inSeconds) / 3600).toFixed(2);
    }

    // Update total hours
    if (r.out2) {
      await pool.query(
        'UPDATE clock_in_records SET total_hours = $1 WHERE employee_id = $2 AND work_date = $3',
        [totalHours, adam.id, r.date]
      );
    }

    console.log(`  In: ${r.in1} | Out: ${r.out2 || 'not yet'} | Hours: ${totalHours || 'N/A'}`);

    // Also add/update schedule
    const existingSched = await pool.query(
      'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [adam.id, r.date]
    );

    const shiftEnd = r.out2 || '17:00:00'; // Default end time if not clocked out
    if (existingSched.rows.length > 0) {
      await pool.query(`
        UPDATE schedules SET shift_start = $1, shift_end = $2, updated_at = NOW()
        WHERE employee_id = $3 AND schedule_date = $4
      `, [r.in1, shiftEnd, adam.id, r.date]);
    } else {
      await pool.query(`
        INSERT INTO schedules (employee_id, company_id, schedule_date, shift_start, shift_end, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW(), NOW())
      `, [adam.id, adam.company_id, r.date, r.in1, shiftEnd]);
    }
    console.log(`  Schedule: ${r.in1} - ${shiftEnd}`);
  }

  console.log('\nDone!');
  process.exit(0);
}

function parseTime(timeStr) {
  const [h, m, s] = timeStr.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

addAdamAttendance().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
