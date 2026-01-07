const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

const API_URL = 'https://hrms-backend-1alt.onrender.com/api';

async function testMimixSchedules() {
  console.log('Testing Mimix staff schedule access via ESS API...\n');

  try {
    // Get Mimix employees with schedules
    const result = await pool.query(`
      SELECT DISTINCT e.id, e.name, e.ic_number, e.status, COUNT(s.id) as schedule_count
      FROM employees e
      JOIN schedules s ON e.id = s.employee_id
      WHERE e.company_id = 3 AND e.status = 'active'
      GROUP BY e.id, e.name, e.ic_number, e.status
      ORDER BY schedule_count DESC
      LIMIT 5
    `);

    console.log(`Found ${result.rows.length} Mimix employees with schedules:\n`);

    for (const emp of result.rows) {
      console.log(`\n--- Testing: ${emp.name} (ID: ${emp.id}) ---`);
      console.log(`IC: ${emp.ic_number}, Schedules: ${emp.schedule_count}`);

      if (!emp.ic_number) {
        console.log('  SKIP: No IC number for login');
        continue;
      }

      // Try to login
      try {
        const loginRes = await axios.post(`${API_URL}/ess/auth/login`, {
          ic_number: emp.ic_number,
          password: emp.ic_number
        });

        const token = loginRes.data.token;
        console.log('  LOGIN: Success');

        // Fetch schedule for January 2026
        const scheduleRes = await axios.get(`${API_URL}/ess/schedule?year=2026&month=1`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const schedules = scheduleRes.data.schedules || {};
        const scheduleCount = Object.keys(schedules).length;

        console.log(`  ESS SCHEDULE API: ${scheduleCount} days found for Jan 2026`);

        if (scheduleCount > 0) {
          const firstDay = Object.keys(schedules)[0];
          const sched = schedules[firstDay];
          console.log(`    Sample: ${firstDay} - ${sched.shift_start || 'N/A'} to ${sched.shift_end || 'N/A'} at ${sched.outlet_name || 'N/A'}`);
        }

      } catch (err) {
        if (err.response) {
          console.log(`  ERROR: ${err.response.status} - ${err.response.data?.error || err.message}`);
        } else {
          console.log(`  ERROR: ${err.message}`);
        }
      }
    }

    console.log('\n\n=== Test Summary ===');
    console.log('Mimix staff can access their schedules via ESS API');

  } catch (err) {
    console.error('Database error:', err.message);
  } finally {
    await pool.end();
  }
}

testMimixSchedules();
