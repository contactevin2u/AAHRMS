/**
 * AA Alive Driver Attendance Sync Routes
 * Syncs driver shifts from AA Alive external API to HRMS attendance
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../../db');

const API_URL = process.env.AAALIVE_API_URL || 'https://orderops-api-v1.onrender.com/_api/external';
const API_KEY = process.env.AAALIVE_API_KEY;
const AA_ALIVE_COMPANY_ID = 1;

// Helper function to make HTTPS requests (compatible with all Node versions)
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
          statusText: res.statusMessage,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Skip list for vehicle IDs and non-driver entries
const SKIP_DRIVERS = ['2 JC 2', '2JC2', 'Self Pick Up'];

// Driver name mapping: OrderOps driver_name -> HRMS employee_id
// Maps OrderOps names to HRMS employee IDs for matching
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
  'IQZAT': 'IQZAT',
  'oyeng': 'SHUKRI',
  'OYENG': 'SHUKRI'
};

/**
 * Test API connection
 * GET /api/admin/aaalive/test
 */
router.get('/test', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'AAALIVE_API_KEY not configured' });
    }

    const testDate = req.query.date || new Date().toISOString().split('T')[0];

    console.log(`Testing AA Alive API for date: ${testDate}`);

    const response = await httpsGet(`${API_URL}/shifts?shift_date=${testDate}`, {
      'X-API-Key': API_KEY
    });

    const status = response.status;
    const statusText = response.statusText;

    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        status,
        statusText,
        date: testDate,
        shiftsCount: Array.isArray(data) ? data.length : (data.shifts?.length || 0),
        sample: Array.isArray(data) ? data[0] : data.shifts?.[0],
        fields: Array.isArray(data) && data[0] ? Object.keys(data[0]) : (data.shifts?.[0] ? Object.keys(data.shifts[0]) : []),
        rawResponse: data
      });
    } else {
      const text = await response.text();
      res.status(status).json({
        success: false,
        status,
        statusText,
        error: text
      });
    }
  } catch (error) {
    console.error('AA Alive API test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get shifts from AA Alive API
 * GET /api/admin/aaalive/shifts?date=2026-01-27
 */
router.get('/shifts', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'AAALIVE_API_KEY not configured' });
    }

    const { date, start, end } = req.query;

    let url;
    if (start && end) {
      url = `${API_URL}/shifts/range?start_date=${start}&end_date=${end}`;
    } else {
      const queryDate = date || new Date().toISOString().split('T')[0];
      url = `${API_URL}/shifts?shift_date=${queryDate}`;
    }

    console.log(`Fetching shifts from: ${url}`);

    const response = await httpsGet(url, { 'X-API-Key': API_KEY });

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      const text = await response.text();
      res.status(response.status).json({ error: text });
    }
  } catch (error) {
    console.error('AA Alive API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get driver employees from HRMS
 * GET /api/admin/aaalive/drivers
 */
router.get('/drivers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.employee_id, e.name, e.ic_number, d.name as department
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
        AND e.status = 'active'
        AND (UPPER(d.name) LIKE '%DRIVER%' OR UPPER(e.position) LIKE '%DRIVER%')
      ORDER BY e.name
    `, [AA_ALIVE_COMPANY_ID]);

    res.json({
      count: result.rows.length,
      drivers: result.rows
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync driver attendance from Aalyx to HRMS
 * POST /api/admin/aaalive/sync
 * Body: { date: "2026-01-27" } or { start: "2026-01-01", end: "2026-01-31" }
 */
router.post('/sync', async (req, res) => {
  const client = await pool.connect();

  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'AAALIVE_API_KEY not configured' });
    }

    const { date, start, end } = req.body;

    // Build API URL
    let url;
    if (start && end) {
      url = `${API_URL}/shifts/range?start_date=${start}&end_date=${end}`;
    } else {
      const queryDate = date || new Date().toISOString().split('T')[0];
      url = `${API_URL}/shifts?shift_date=${queryDate}`;
    }

    console.log(`Syncing from Aalyx: ${url}`);

    // Fetch from Aalyx
    const response = await httpsGet(url, { 'X-API-Key': API_KEY });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Aalyx API error: ${text}` });
    }

    const data = await response.json();

    // Handle different response formats
    const shifts = Array.isArray(data) ? data : (data.shifts || data.data || []);

    if (shifts.length === 0) {
      return res.json({ success: true, message: 'No shifts to sync', synced: 0 });
    }

    console.log(`Found ${shifts.length} shifts to sync`);

    const results = { success: [], failed: [], skipped: [] };

    await client.query('BEGIN');

    for (const shift of shifts) {
      try {
        // Extract fields from OrderOps response
        const driverName = shift.driver_name;
        const clockInMyt = shift.clock_in_at_myt;  // "2026-01-26 08:43:10"
        const clockOutMyt = shift.clock_out_at_myt;
        const clockInLocation = shift.clock_in_location;
        const clockOutLocation = shift.clock_out_location;
        const isOutstation = shift.is_outstation;
        const totalWorkingHours = shift.total_working_hours;
        const shiftStatus = shift.status;

        // Extract date and time from MYT format
        const workDate = clockInMyt ? clockInMyt.split(' ')[0] : null;  // "2026-01-26"
        const clockIn = clockInMyt ? clockInMyt.split(' ')[1] : null;   // "08:43:10"
        const clockOut = clockOutMyt ? clockOutMyt.split(' ')[1] : null;

        if (!driverName || !workDate) {
          results.failed.push({ shift, error: 'Missing driver_name or date' });
          continue;
        }

        // Skip vehicle IDs
        if (SKIP_DRIVERS.includes(driverName)) {
          results.skipped.push({ driver_name: driverName, reason: 'Vehicle ID, not a driver' });
          continue;
        }

        // Find employee
        let employee = null;

        // Method 1: Use driver mapping
        const mappedEmployeeId = DRIVER_MAPPING[driverName] || DRIVER_MAPPING[driverName.toUpperCase()];
        if (mappedEmployeeId) {
          const mapResult = await client.query(`
            SELECT id, employee_id, name FROM employees
            WHERE company_id = $1 AND UPPER(employee_id) = UPPER($2) AND status = 'active'
          `, [AA_ALIVE_COMPANY_ID, mappedEmployeeId]);
          if (mapResult.rows.length > 0) employee = mapResult.rows[0];
        }

        // Method 2: Direct name match (fallback)
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
          results.failed.push({
            shift,
            error: `Driver not found: ${driverName}`
          });
          continue;
        }

        // Check existing record
        const existingResult = await client.query(`
          SELECT id, clock_in_1, clock_out_1 FROM clock_in_records
          WHERE employee_id = $1 AND work_date = $2
        `, [employee.id, workDate]);

        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];

          // Update if missing clock out - AA Alive uses single session (clock_in_1 → clock_out_1)
          if (clockOut && !existing.clock_out_1) {
            await client.query(`
              UPDATE clock_in_records SET clock_out_1 = $1, status = 'completed', updated_at = NOW()
              WHERE id = $2
            `, [clockOut, existing.id]);

            results.success.push({
              employee_id: employee.employee_id,
              name: employee.name,
              date: workDate,
              action: 'updated'
            });
          } else {
            results.skipped.push({
              employee_id: employee.employee_id,
              date: workDate,
              reason: 'Already exists'
            });
          }
        } else {
          // Create new record
          const notes = isOutstation ? 'Synced from OrderOps (Outstation)' : 'Synced from OrderOps';

          await client.query(`
            INSERT INTO clock_in_records (
              employee_id, company_id, work_date,
              clock_in_1, clock_out_1,
              address_in_1, address_out_1,
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

          results.success.push({
            employee_id: employee.employee_id,
            name: employee.name,
            date: workDate,
            action: 'created',
            outstation: isOutstation
          });
        }
      } catch (err) {
        results.failed.push({ shift, error: err.message });
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      summary: {
        total: shifts.length,
        synced: results.success.length,
        skipped: results.skipped.length,
        failed: results.failed.length
      },
      details: results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Aalyx sync error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
