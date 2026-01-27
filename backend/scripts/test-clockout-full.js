require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testFullClockOut() {
  try {
    console.log('Testing clock-out database operations...\n');

    // Find an open shift that needs clock_out_2
    const openShift = await pool.query(`
      SELECT c.id, c.employee_id, e.name, c.work_date, c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2,
             c.status, e.company_id, e.outlet_id, e.work_type, e.employment_type
      FROM clock_in_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.work_date = CURRENT_DATE
        AND c.clock_in_1 IS NOT NULL
        AND c.clock_out_1 IS NOT NULL
        AND c.clock_in_2 IS NOT NULL
        AND c.clock_out_2 IS NULL
        AND c.status = 'in_progress'
      LIMIT 1
    `);

    if (openShift.rows.length === 0) {
      console.log('No open shifts needing clock_out_2 found.');

      // List all in-progress records for today
      const allInProgress = await pool.query(`
        SELECT c.id, e.name, c.clock_in_1, c.clock_out_1, c.clock_in_2, c.clock_out_2
        FROM clock_in_records c
        JOIN employees e ON c.employee_id = e.id
        WHERE c.work_date = CURRENT_DATE AND c.status = 'in_progress'
      `);
      console.log('\nAll in-progress records today:');
      allInProgress.rows.forEach(r => {
        console.log(`  ${r.name}: in1=${r.clock_in_1} out1=${r.clock_out_1} in2=${r.clock_in_2} out2=${r.clock_out_2}`);
      });

      process.exit(0);
    }

    const shift = openShift.rows[0];
    console.log('Found open shift:', shift.name);
    console.log('  Employee ID:', shift.employee_id);
    console.log('  Company ID:', shift.company_id);
    console.log('  Outlet ID:', shift.outlet_id);
    console.log('  Work Type:', shift.work_type);
    console.log('  Employment Type:', shift.employment_type);
    console.log('  Clock times: in1=' + shift.clock_in_1, 'out1=' + shift.clock_out_1, 'in2=' + shift.clock_in_2);

    // Simulate the exact UPDATE that the API does
    const testTime = '21:00:00';
    const testPhotoUrl = 'https://res.cloudinary.com/test/test.jpg';
    const testLocation = '3.123,101.456';
    const testAddress = 'Test Address';
    const faceDetected = true;
    const faceConfidence = 0.95;
    const totalMinutes = 480;  // 8 hours
    const otMinutes = 30;
    const otFlagged = true;
    const otAutoApproved = null;  // Mimix needs approval

    console.log('\nTesting UPDATE with parameters:');
    console.log('  clock_out_2:', testTime);
    console.log('  photo_out_2:', testPhotoUrl);
    console.log('  location_out_2:', testLocation);
    console.log('  total_work_minutes:', totalMinutes);
    console.log('  ot_minutes:', otMinutes);

    // Calculate hours in JavaScript (same as the fix)
    const totalWorkHours = Math.round(totalMinutes / 6) / 10;
    const otHoursCalc = Math.round(otMinutes / 6) / 10;

    const result = await pool.query(`
      UPDATE clock_in_records SET
        clock_out_2 = $1, photo_out_2 = $2, location_out_2 = $3, address_out_2 = $4,
        face_detected_out_2 = $5, face_confidence_out_2 = $6,
        total_work_minutes = $7, ot_minutes = $8, ot_flagged = $9,
        ot_approved = $14, status = 'completed',
        total_work_hours = $12, ot_hours = $13
      WHERE employee_id = $10 AND work_date = $11
      RETURNING *
    `, [testTime, testPhotoUrl, testLocation, testAddress, faceDetected, faceConfidence, totalMinutes, otMinutes, otFlagged, shift.employee_id, shift.work_date, totalWorkHours, otHoursCalc, otAutoApproved]);

    console.log('\nUPDATE SUCCESS!');
    console.log('Updated record:', result.rows[0].id);

    // ROLLBACK - restore original state
    await pool.query(`
      UPDATE clock_in_records SET
        clock_out_2 = NULL, photo_out_2 = NULL, location_out_2 = NULL, address_out_2 = NULL,
        face_detected_out_2 = NULL, face_confidence_out_2 = NULL,
        total_work_minutes = NULL, ot_minutes = NULL, ot_flagged = NULL,
        ot_approved = NULL, status = 'in_progress',
        total_work_hours = NULL, ot_hours = NULL
      WHERE id = $1
    `, [shift.id]);

    console.log('Rolled back to original state.');
    console.log('\nDatabase clock-out operation works correctly!');

    process.exit(0);
  } catch (e) {
    console.error('\nERROR OCCURRED:');
    console.error('Message:', e.message);
    console.error('Code:', e.code);
    console.error('Detail:', e.detail);
    console.error('Hint:', e.hint);
    console.error('Position:', e.position);
    console.error('Full error:', e);
    process.exit(1);
  }
}

testFullClockOut();
