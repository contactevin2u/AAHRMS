const pool = require('../db');

async function updateAslieClockIn() {
  try {
    // Find Aslie employee
    const empResult = await pool.query(`
      SELECT id, name, employee_id, company_id
      FROM employees
      WHERE LOWER(name) LIKE '%aslie%' OR LOWER(employee_id) LIKE '%aslie%'
    `);

    if (empResult.rows.length === 0) {
      console.log('Employee Aslie not found');
      process.exit(1);
    }

    const employee = empResult.rows[0];
    console.log(`Found employee: ${employee.name} (ID: ${employee.id})`);

    // Attendance data from thumbprint records
    const attendanceData = [
      { date: '2026-01-22', clock_in: '07:30', clock_out: '18:42' },
      { date: '2026-01-23', clock_in: '07:19', clock_out: '22:26' },
      { date: '2026-01-24', clock_in: '06:01', clock_out: '12:05' },
      { date: '2026-01-25', clock_in: '06:26', clock_out: '12:56' },
      { date: '2026-01-26', clock_in: '08:44', clock_out: '19:04' },
      { date: '2026-01-27', clock_in: '07:37', clock_out: '19:02' },
      { date: '2026-01-28', clock_in: '06:50', clock_out: '23:24' },
      { date: '2026-01-29', clock_in: '05:12', clock_out: '23:20' },
      { date: '2026-01-30', clock_in: '07:52', clock_out: '21:02' },
      { date: '2026-01-31', clock_in: '07:03', clock_out: '18:57' },
    ];

    for (const record of attendanceData) {
      // Calculate work hours
      const [inH, inM] = record.clock_in.split(':').map(Number);
      const [outH, outM] = record.clock_out.split(':').map(Number);
      const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
      const totalHours = totalMinutes / 60;

      // Check if record exists
      const existingResult = await pool.query(`
        SELECT id FROM clock_in_records
        WHERE employee_id = $1 AND work_date = $2
      `, [employee.id, record.date]);

      if (existingResult.rows.length > 0) {
        // Update existing record
        await pool.query(`
          UPDATE clock_in_records SET
            clock_in_1 = $1,
            clock_out_1 = $2,
            total_work_minutes = $3,
            total_work_hours = $4,
            status = 'completed',
            updated_at = NOW()
          WHERE employee_id = $5 AND work_date = $6
        `, [
          record.clock_in + ':00',
          record.clock_out + ':00',
          totalMinutes,
          totalHours,
          employee.id,
          record.date
        ]);
        console.log(`Updated: ${record.date} - ${record.clock_in} to ${record.clock_out} (${totalHours.toFixed(2)} hrs)`);
      } else {
        // Insert new record
        await pool.query(`
          INSERT INTO clock_in_records (
            employee_id, company_id, work_date,
            clock_in_1, clock_out_1,
            total_work_minutes, total_work_hours,
            status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), NOW())
        `, [
          employee.id,
          employee.company_id,
          record.date,
          record.clock_in + ':00',
          record.clock_out + ':00',
          totalMinutes,
          totalHours
        ]);
        console.log(`Inserted: ${record.date} - ${record.clock_in} to ${record.clock_out} (${totalHours.toFixed(2)} hrs)`);
      }
    }

    console.log('\nDone! Updated Aslie clock-in records for Jan 22-31, 2026');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateAslieClockIn();
