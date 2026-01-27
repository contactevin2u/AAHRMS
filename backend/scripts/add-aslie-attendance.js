const pool = require('../db');

async function addAslieAttendance() {
  // Find ASLIE in AA Alive (company_id = 1)
  const emp = await pool.query(`
    SELECT id, name, company_id FROM employees
    WHERE company_id = 1 AND name ILIKE '%aslie%'
  `);

  console.log('Employees named ASLIE in AA Alive:');
  emp.rows.forEach(e => console.log('ID:', e.id, '| Name:', e.name));

  const aslie = emp.rows.find(e => e.name.includes('ASLIE BIN ABU BAKAR'));
  if (!aslie) {
    console.log('ASLIE BIN ABU BAKAR not found');
    process.exit(1);
  }

  console.log('\nUsing employee:', aslie.name, '(ID:', aslie.id, ')');

  // Attendance records for Jan 2026
  // Format: { date, in, out } - times in 24hr format
  const records = [
    { date: '2026-01-01', in1: '06:29:00', out2: '19:05:00' },
    { date: '2026-01-02', in1: '05:20:00', out2: '19:15:00' },
    { date: '2026-01-03', in1: '06:28:00', out2: '19:18:00' },
    { date: '2026-01-04', in1: '07:06:00', out2: '19:30:00' },
    { date: '2026-01-05', in1: '06:45:00', out2: '20:41:00' },
    { date: '2026-01-06', in1: '04:00:00', out2: '20:02:00' },
    { date: '2026-01-07', in1: '03:59:00', out2: '22:43:00' },
    { date: '2026-01-08', in1: '07:06:00', out2: '18:45:00' },
    { date: '2026-01-09', in1: '07:01:00', out2: '20:13:00' },
    { date: '2026-01-10', in1: '07:03:00', out2: '19:57:00' },
    { date: '2026-01-11', in1: '04:31:00', out2: '19:16:00' },
    { date: '2026-01-12', in1: '04:00:00', out2: '19:32:00' },
    { date: '2026-01-13', in1: '05:10:00', out2: '18:02:00' },
    // 14 - off day
    // 15 - off day
    { date: '2026-01-16', in1: '08:44:00', out2: '19:14:00' },
    { date: '2026-01-17', in1: '07:11:00', out2: '19:21:00' },
    { date: '2026-01-18', in1: '07:00:00', out2: '19:06:00' },
    { date: '2026-01-19', in1: '07:00:00', out2: '22:43:00' },
    { date: '2026-01-20', in1: '06:34:00', out2: '19:19:00' },
    { date: '2026-01-21', in1: '07:15:00', out2: '18:44:00' },
    { date: '2026-01-22', in1: '07:30:00', out2: null }  // no clock out yet
  ];

  for (const r of records) {
    // Check if record already exists
    const existing = await pool.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [aslie.id, r.date]
    );

    if (existing.rows.length > 0) {
      console.log(`${r.date}: Updating existing record (ID: ${existing.rows[0].id})...`);
      await pool.query(`
        UPDATE clock_in_records
        SET clock_in_1 = $1, clock_out_2 = $2,
            status = $3,
            updated_at = NOW()
        WHERE employee_id = $4 AND work_date = $5
      `, [r.in1, r.out2, r.out2 ? 'completed' : 'in_progress', aslie.id, r.date]);
    } else {
      console.log(`${r.date}: Creating new record...`);
      await pool.query(`
        INSERT INTO clock_in_records (employee_id, work_date, clock_in_1, clock_out_2, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `, [aslie.id, r.date, r.in1, r.out2, r.out2 ? 'completed' : 'in_progress']);
    }

    // Calculate total hours
    let totalHours = 0;
    if (r.out2) {
      const inSeconds = parseTime(r.in1);
      let outSeconds = parseTime(r.out2);
      if (outSeconds < inSeconds) {
        outSeconds += 24 * 3600;
      }
      totalHours = ((outSeconds - inSeconds) / 3600).toFixed(2);

      await pool.query(
        'UPDATE clock_in_records SET total_hours = $1 WHERE employee_id = $2 AND work_date = $3',
        [totalHours, aslie.id, r.date]
      );
    }

    console.log(`  In: ${r.in1} | Out: ${r.out2 || 'not yet'} | Hours: ${totalHours || 'N/A'}`);

    // Add/update schedule
    const existingSched = await pool.query(
      'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
      [aslie.id, r.date]
    );

    const shiftEnd = r.out2 || '17:00:00';
    if (existingSched.rows.length > 0) {
      await pool.query(`
        UPDATE schedules SET shift_start = $1, shift_end = $2, updated_at = NOW()
        WHERE employee_id = $3 AND schedule_date = $4
      `, [r.in1, shiftEnd, aslie.id, r.date]);
    } else {
      await pool.query(`
        INSERT INTO schedules (employee_id, company_id, schedule_date, shift_start, shift_end, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW(), NOW())
      `, [aslie.id, aslie.company_id, r.date, r.in1, shiftEnd]);
    }
  }

  console.log('\nDone! Added/updated', records.length, 'attendance records for ASLIE');
  process.exit(0);
}

function parseTime(timeStr) {
  const [h, m, s] = timeStr.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

addAslieAttendance().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
