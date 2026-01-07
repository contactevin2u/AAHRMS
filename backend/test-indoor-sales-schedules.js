const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

const API_URL = 'https://hrms-backend-1alt.onrender.com/api';

async function testIndoorSalesSchedules() {
  console.log('Testing Indoor Sales staff schedule access...\n');

  try {
    // Get Indoor Sales department employees
    const result = await pool.query(`
      SELECT e.id, e.name, e.ic_number, e.employee_id, e.status
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      WHERE d.name = 'Indoor Sales'
        AND e.company_id = 3
        AND e.status = 'active'
      ORDER BY e.name
      LIMIT 5
    `);

    console.log(`Found ${result.rows.length} active Indoor Sales employees:\n`);

    for (const emp of result.rows) {
      console.log(`\n--- Testing: ${emp.name} (ID: ${emp.id}) ---`);
      console.log(`IC: ${emp.ic_number}, Employee ID: ${emp.employee_id}`);

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

        console.log(`  SCHEDULE: ${scheduleCount} days found for Jan 2026`);

        if (scheduleCount > 0) {
          const firstDay = Object.keys(schedules)[0];
          console.log(`    Sample: ${firstDay} - ${schedules[firstDay].shift_start || 'N/A'} to ${schedules[firstDay].shift_end || 'N/A'}`);
        }

      } catch (err) {
        if (err.response) {
          console.log(`  ERROR: ${err.response.status} - ${err.response.data?.error || err.message}`);
        } else {
          console.log(`  ERROR: ${err.message}`);
        }
      }
    }

    console.log('\n\nTest complete!');

  } catch (err) {
    console.error('Database error:', err.message);
  } finally {
    await pool.end();
  }
}

testIndoorSalesSchedules();
