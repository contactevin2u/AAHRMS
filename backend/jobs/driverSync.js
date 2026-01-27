/**
 * Driver Attendance Sync Job
 * Syncs driver attendance from OrderOps to HRMS
 */

const https = require('https');
const pool = require('../db');

const API_URL = process.env.AAALIVE_API_URL || 'https://orderops-api-v1.onrender.com/_api/external';
const API_KEY = process.env.AAALIVE_API_KEY;
const AA_ALIVE_COMPANY_ID = 1;

// Skip list for vehicle IDs (not actual drivers)
const SKIP_DRIVERS = ['2 JC 2', '2JC2'];

// Driver name mapping: OrderOps driver_name -> HRMS employee_id
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

// Helper function to make HTTPS requests
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

/**
 * Sync driver attendance for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to yesterday)
 */
async function syncDriverAttendance(date = null) {
  const client = await pool.connect();

  try {
    // Default to yesterday if no date provided
    const syncDate = date || new Date(Date.now() - 86400000).toISOString().split('T')[0];

    console.log(`[DriverSync] Syncing attendance for ${syncDate}`);

    if (!API_KEY) {
      console.error('[DriverSync] AAALIVE_API_KEY not configured');
      return { success: false, error: 'API key not configured' };
    }

    // Fetch from OrderOps
    const url = `${API_URL}/shifts?shift_date=${syncDate}`;
    const response = await httpsGet(url, { 'X-API-Key': API_KEY });

    if (!response.ok) {
      const text = await response.text();
      console.error('[DriverSync] API error:', text);
      return { success: false, error: text };
    }

    const data = await response.json();
    const shifts = data.shifts || [];

    if (shifts.length === 0) {
      console.log('[DriverSync] No shifts to sync');
      return { success: true, synced: 0, skipped: 0, failed: 0 };
    }

    console.log(`[DriverSync] Found ${shifts.length} shifts`);

    const results = { success: [], failed: [], skipped: [] };

    await client.query('BEGIN');

    for (const shift of shifts) {
      try {
        const driverName = shift.driver_name;
        const clockInMyt = shift.clock_in_at_myt;
        const clockOutMyt = shift.clock_out_at_myt;
        const clockInLocation = shift.clock_in_location;
        const clockOutLocation = shift.clock_out_location;
        const isOutstation = shift.is_outstation;
        const totalWorkingHours = shift.total_working_hours;
        const shiftStatus = shift.status;

        const workDate = clockInMyt ? clockInMyt.split(' ')[0] : null;
        const clockIn = clockInMyt ? clockInMyt.split(' ')[1] : null;
        const clockOut = clockOutMyt ? clockOutMyt.split(' ')[1] : null;

        if (!driverName || !workDate) {
          results.failed.push({ driver_name: driverName, error: 'Missing data' });
          continue;
        }

        // Skip vehicle IDs
        if (SKIP_DRIVERS.includes(driverName)) {
          results.skipped.push({ driver_name: driverName, reason: 'Vehicle ID' });
          continue;
        }

        // Find employee
        let employee = null;

        const mappedEmployeeId = DRIVER_MAPPING[driverName] || DRIVER_MAPPING[driverName.toUpperCase()];
        if (mappedEmployeeId) {
          const mapResult = await client.query(`
            SELECT id, employee_id, name FROM employees
            WHERE company_id = $1 AND UPPER(employee_id) = UPPER($2) AND status = 'active'
          `, [AA_ALIVE_COMPANY_ID, mappedEmployeeId]);
          if (mapResult.rows.length > 0) employee = mapResult.rows[0];
        }

        if (!employee) {
          const nameResult = await client.query(`
            SELECT id, employee_id, name FROM employees
            WHERE company_id = $1 AND status = 'active'
              AND (UPPER(employee_id) = UPPER($2) OR UPPER(name) LIKE UPPER($3))
            LIMIT 1
          `, [AA_ALIVE_COMPANY_ID, driverName, `%${driverName}%`]);
          if (nameResult.rows.length > 0) employee = nameResult.rows[0];
        }

        if (!employee) {
          results.failed.push({ driver_name: driverName, error: 'Driver not found' });
          continue;
        }

        // Check existing record
        const existingResult = await client.query(`
          SELECT id, clock_in_1, clock_out_2 FROM clock_in_records
          WHERE employee_id = $1 AND work_date = $2
        `, [employee.id, workDate]);

        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];

          if (clockOut && !existing.clock_out_2) {
            await client.query(`
              UPDATE clock_in_records SET clock_out_2 = $1, status = 'completed', updated_at = NOW()
              WHERE id = $2
            `, [clockOut, existing.id]);

            results.success.push({ employee_id: employee.employee_id, action: 'updated' });
          } else {
            results.skipped.push({ employee_id: employee.employee_id, reason: 'Already exists' });
          }
        } else {
          const notes = isOutstation ? 'Synced from OrderOps (Outstation)' : 'Synced from OrderOps';

          await client.query(`
            INSERT INTO clock_in_records (
              employee_id, company_id, work_date,
              clock_in_1, clock_out_2,
              address_in_1, address_out_2,
              total_work_hours,
              notes, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          `, [
            employee.id,
            AA_ALIVE_COMPANY_ID,
            workDate,
            clockIn || null,
            clockOut || null,
            clockInLocation || null,
            clockOutLocation || null,
            totalWorkingHours || null,
            notes,
            shiftStatus === 'COMPLETED' ? 'completed' : 'clocked_in'
          ]);

          results.success.push({ employee_id: employee.employee_id, action: 'created' });
        }
      } catch (err) {
        results.failed.push({ shift, error: err.message });
      }
    }

    await client.query('COMMIT');

    const summary = {
      success: true,
      date: syncDate,
      synced: results.success.length,
      skipped: results.skipped.length,
      failed: results.failed.length
    };

    console.log(`[DriverSync] Complete: ${summary.synced} synced, ${summary.skipped} skipped, ${summary.failed} failed`);

    return summary;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DriverSync] Error:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Run the driver sync job (syncs yesterday's data)
 */
async function runDriverSync() {
  console.log('[DriverSync] Starting scheduled sync...');

  // Sync yesterday's data
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const result = await syncDriverAttendance(yesterday);

  // Also sync today's data (for any completed shifts)
  const today = new Date().toISOString().split('T')[0];
  const todayResult = await syncDriverAttendance(today);

  return {
    yesterday: result,
    today: todayResult
  };
}

module.exports = {
  runDriverSync,
  syncDriverAttendance
};
