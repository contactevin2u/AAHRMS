const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

const API_URL = 'https://hrms-backend-1alt.onrender.com/api';

async function test() {
  console.log('Testing real Mimix staff ESS access...\n');

  // Test employees
  const employees = [
    { id: 123, name: 'YANG ANTAH AFIQAH', ic: '041011-14-0916' },
    { id: 128, name: 'AMEER ISKANDAR', ic: '000807-14-1219' },
    { id: 141, name: 'NOR FARINA', ic: '000323-10-1130' }
  ];

  // First, let's add some schedules for these employees
  console.log('Adding test schedules for Jan 2026...\n');

  const outlets = await pool.query('SELECT id, name FROM outlets WHERE company_id = 3 LIMIT 1');
  if (outlets.rows.length === 0) {
    console.log('No outlets found for Mimix. Creating one...');
    await pool.query("INSERT INTO outlets (name, company_id) VALUES ('Test Outlet', 3) ON CONFLICT DO NOTHING");
  }
  const outlet = (await pool.query('SELECT id, name FROM outlets WHERE company_id = 3 LIMIT 1')).rows[0];
  console.log('Using outlet:', outlet?.name || 'N/A');

  if (outlet) {
    for (const emp of employees) {
      // Add 5 days of schedule
      for (let day = 6; day <= 10; day++) {
        const date = `2026-01-${String(day).padStart(2, '0')}`;
        await pool.query(`
          INSERT INTO schedules (employee_id, outlet_id, company_id, schedule_date, shift_start, shift_end, status)
          VALUES ($1, $2, 3, $3, '09:00', '18:00', 'scheduled')
          ON CONFLICT (employee_id, schedule_date) DO NOTHING
        `, [emp.id, outlet.id, date]);
      }
      console.log(`Added schedules for ${emp.name}`);
    }
  }

  console.log('\n--- Testing ESS Login & Schedule Access ---\n');

  for (const emp of employees) {
    console.log(`\nTesting: ${emp.name} (ID: ${emp.id})`);

    try {
      // Login
      const loginRes = await axios.post(`${API_URL}/ess/auth/login`, {
        ic_number: emp.ic,
        password: emp.ic
      });

      console.log('  LOGIN: SUCCESS');
      const token = loginRes.data.token;

      // Get schedule
      const schedRes = await axios.get(`${API_URL}/ess/schedule?year=2026&month=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const schedules = schedRes.data.schedules || {};
      const count = Object.keys(schedules).length;
      console.log(`  SCHEDULE: ${count} days found`);

      if (count > 0) {
        Object.entries(schedules).slice(0, 2).forEach(([date, sched]) => {
          console.log(`    ${date}: ${sched.shift_start}-${sched.shift_end} at ${sched.outlet_name || 'N/A'}`);
        });
      }

    } catch (err) {
      console.log(`  ERROR: ${err.response?.status || 'N/A'} - ${err.response?.data?.error || err.message}`);
    }
  }

  console.log('\n=== Test Complete ===');
  await pool.end();
}

test();
