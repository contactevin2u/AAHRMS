/**
 * Test AA Alive Driver Shifts API
 * Run: node scripts/test-aaalive-api.js
 */

require('dotenv').config();

const API_URL = process.env.AAALIVE_API_URL || 'https://aaalive.my/_api/external';
const API_KEY = process.env.AAALIVE_API_KEY;

async function testAPI() {
  console.log('='.repeat(60));
  console.log('Testing AA Alive Driver Shifts API');
  console.log('='.repeat(60));
  console.log('API URL:', API_URL);
  console.log('API Key:', API_KEY ? API_KEY.substring(0, 10) + '...' : 'NOT SET');
  console.log('');

  if (!API_KEY) {
    console.error('ERROR: AAALIVE_API_KEY not set in environment');
    return;
  }

  // Test 1: Get shifts for today
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n--- Test 1: Get shifts for ${today} ---`);

  try {
    const response = await fetch(`${API_URL}/shifts?date=${today}`, {
      headers: { 'X-API-Key': API_KEY }
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 2000));

      if (Array.isArray(data)) {
        console.log(`\nFound ${data.length} shifts`);
        if (data.length > 0) {
          console.log('\nFirst shift fields:', Object.keys(data[0]));
        }
      } else if (data.shifts) {
        console.log(`\nFound ${data.shifts.length} shifts`);
        if (data.shifts.length > 0) {
          console.log('\nFirst shift fields:', Object.keys(data.shifts[0]));
        }
      }
    } else {
      const text = await response.text();
      console.log('Error response:', text);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: Get shifts for yesterday
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  console.log(`\n--- Test 2: Get shifts for ${yesterday} ---`);

  try {
    const response = await fetch(`${API_URL}/shifts?date=${yesterday}`, {
      headers: { 'X-API-Key': API_KEY }
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        console.log(`Found ${data.length} shifts`);
        console.log('\nSample shift:');
        console.log(JSON.stringify(data[0], null, 2));
      } else if (data.shifts && data.shifts.length > 0) {
        console.log(`Found ${data.shifts.length} shifts`);
        console.log('\nSample shift:');
        console.log(JSON.stringify(data.shifts[0], null, 2));
      } else {
        console.log('No shifts found for this date');
        console.log('Response:', JSON.stringify(data, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
}

testAPI();
