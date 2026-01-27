const pool = require('../db');

async function addMissingSchedules() {
  // Find clock records before 27 Jan without schedules
  const missing = await pool.query(`
    SELECT c.id as clock_id, c.employee_id, c.work_date, e.name, e.company_id,
           c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2, c.outlet_id
    FROM clock_in_records c
    JOIN employees e ON c.employee_id = e.id
    LEFT JOIN schedules s ON c.employee_id = s.employee_id AND c.work_date = s.schedule_date
    WHERE c.work_date < '2026-01-27'
      AND s.id IS NULL
      AND c.clock_in_1 IS NOT NULL
    ORDER BY c.work_date, e.name
  `);

  console.log('=== ADDING MISSING SCHEDULES ===');
  console.log('Total records to process:', missing.rows.length);
  console.log('');

  let created = 0;
  let errors = 0;

  for (const r of missing.rows) {
    try {
      // Determine shift start and end based on clock times
      const shiftStart = r.clock_in_1;

      // Use the last clock out time as shift end
      let shiftEnd = r.clock_out_2 || r.clock_out_1;

      // If no clock out, estimate 8 hours from clock in
      if (!shiftEnd) {
        // Parse clock_in_1 time and add 8 hours
        const [hours, minutes, seconds] = r.clock_in_1.split(':').map(Number);
        let endHours = hours + 8;
        if (endHours >= 24) endHours -= 24;
        shiftEnd = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      }

      // Default break duration (1 hour for Mimix with break, 0 for AA Alive)
      const breakDuration = r.clock_in_2 ? 60 : 0;

      // Insert schedule
      await pool.query(`
        INSERT INTO schedules (employee_id, company_id, outlet_id, schedule_date, shift_start, shift_end, break_duration, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', NOW(), NOW())
      `, [r.employee_id, r.company_id, r.outlet_id, r.work_date, shiftStart, shiftEnd, breakDuration]);

      created++;
      console.log(`✓ ${r.work_date} | ${r.name} | ${shiftStart} - ${shiftEnd}`);
    } catch (err) {
      errors++;
      console.log(`✗ ${r.work_date} | ${r.name} | Error: ${err.message}`);
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log('Schedules created:', created);
  console.log('Errors:', errors);

  process.exit(0);
}

addMissingSchedules().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
