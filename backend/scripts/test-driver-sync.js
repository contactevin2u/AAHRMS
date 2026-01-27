/**
 * Test driver sync from OrderOps API
 */

require('dotenv').config();
const { syncDriverAttendance, runDriverSync } = require('../jobs/driverSync');

async function testSync() {
  console.log('Testing driver sync...');
  console.log('API URL:', process.env.AAALIVE_API_URL);
  console.log('API Key configured:', !!process.env.AALALIVE_API_KEY);

  // Test sync for January 2026
  const testDates = ['2026-01-26', '2026-01-27'];

  for (const date of testDates) {
    console.log(`\n--- Syncing ${date} ---`);
    const result = await syncDriverAttendance(date);
    console.log('Result:', JSON.stringify(result, null, 2));
  }

  process.exit(0);
}

testSync().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
