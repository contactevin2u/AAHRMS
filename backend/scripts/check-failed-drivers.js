/**
 * Check which drivers are failing to sync
 */

require('dotenv').config();
const https = require('https');
const pool = require('../db');

const API_URL = process.env.AAALIVE_API_URL || 'https://orderops-api-v1.onrender.com/_api/external';
const API_KEY = process.env.AAALIVE_API_KEY;
const AA_ALIVE_COMPANY_ID = 1;

const DRIVER_MAPPING = {
  'IZWAN': 'IZUWAN',
  'AIMAN': 'AIMAN',
  'ALIF': 'ALIFF',
  'ALIFF': 'ALIFF',
  'IZUL': 'IZZUL',
  'IZZUL': 'IZZUL',
  'HAFIZ': 'HAFIZ',
  'SALLEH': 'SALLEH',
  'Salleh': 'SALLEH',
  'DIN': 'ADIN',
  'ADIN': 'ADIN',
  'ADAM': 'ADAM',
  'ASLIE': 'ASLIE',
  'SAIFUL': 'SAIFUL',
  'FAKHRUL': 'FAKHRUL',
  'MAHADI': 'MAHADI',
  'ASRI': 'ASRI',
  'FAIQ': 'FAIQ',
  'PIAN': 'PIAN',
  'SHUKRI': 'SHUKRI',
  'SYUKRI': 'SYUKRI',
  'SABAH': 'SABAH',
  'IQZAT': 'IQZAT'
};

const SKIP_DRIVERS = ['2 JC 2', '2JC2'];

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function checkFailedDrivers() {
  const client = await pool.connect();
  try {
    // Fetch from OrderOps
    const date = '2026-01-27';
    const url = `${API_URL}/shifts?shift_date=${date}`;
    console.log(`Fetching shifts from: ${url}`);

    const response = await httpsGet(url, { 'X-API-Key': API_KEY });
    const data = await response.json();
    const shifts = data.shifts || [];

    console.log(`\nFound ${shifts.length} shifts for ${date}`);
    console.log('\nDriver Analysis:');
    console.log('================');

    for (const shift of shifts) {
      const driverName = shift.driver_name;

      // Skip vehicle IDs
      if (SKIP_DRIVERS.includes(driverName)) {
        console.log(`SKIP: ${driverName} (Vehicle ID)`);
        continue;
      }

      const mappedId = DRIVER_MAPPING[driverName] || DRIVER_MAPPING[driverName.toUpperCase()];

      // Try to find in database
      let employee = null;

      if (mappedId) {
        const result = await client.query(`
          SELECT id, employee_id, name FROM employees
          WHERE company_id = $1 AND UPPER(employee_id) = UPPER($2) AND status = 'active'
        `, [AA_ALIVE_COMPANY_ID, mappedId]);
        if (result.rows.length > 0) employee = result.rows[0];
      }

      if (!employee) {
        const result = await client.query(`
          SELECT id, employee_id, name FROM employees
          WHERE company_id = $1 AND status = 'active'
            AND (UPPER(employee_id) = UPPER($2) OR UPPER(name) LIKE UPPER($3))
          LIMIT 1
        `, [AA_ALIVE_COMPANY_ID, driverName, `%${driverName}%`]);
        if (result.rows.length > 0) employee = result.rows[0];
      }

      if (employee) {
        console.log(`OK: ${driverName} -> ${employee.employee_id} (${employee.name})`);
      } else {
        console.log(`FAILED: ${driverName} - NOT FOUND (mapped to: ${mappedId || 'none'})`);
      }
    }

  } finally {
    client.release();
    pool.end();
  }
}

checkFailedDrivers().catch(console.error);
