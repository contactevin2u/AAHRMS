/**
 * AA Alive Driver Attendance Sync Routes
 * Syncs driver shifts from AA Alive external API to HRMS attendance
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../../db');

const API_URL = process.env.AAALIVE_API_URL || 'https://aaalive.my/_api/external';
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

// Driver ID mapping: Aalyx Driver ID -> HRMS Employee ID
// Update this after checking the Aalyx driver list
const DRIVER_MAPPING = {
  // Format: 'aalyx_driver_id': 'HRMS_employee_id'
  // Example: '123': 'HAFIZ'
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

    const response = await httpsGet(`${API_URL}/shifts?date=${testDate}`, {
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
      url = `${API_URL}/shifts/range?start=${start}&end=${end}`;
    } else {
      const queryDate = date || new Date().toISOString().split('T')[0];
      url = `${API_URL}/shifts?date=${queryDate}`;
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
      url = `${API_URL}/shifts/range?start=${start}&end=${end}`;
    } else {
      const queryDate = date || new Date().toISOString().split('T')[0];
      url = `${API_URL}/shifts?date=${queryDate}`;
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
        // Extract fields from Aalyx response
        // Adjust these field names based on actual Aalyx response
        const driverId = shift.driver_id || shift.driverId || shift.id;
        const driverName = shift.driver_name || shift.driverName || shift.name;
        const icNumber = shift.ic_number || shift.icNumber || shift.ic;
        const workDate = shift.date || shift.work_date || shift.shiftDate;
        const clockIn = shift.clock_in || shift.clockIn || shift.start_time || shift.startTime;
        const clockOut = shift.clock_out || shift.clockOut || shift.end_time || shift.endTime;
        const location = shift.location || shift.outlet || shift.branch;

        // Find employee
        let employee = null;

        // Method 1: IC number
        if (icNumber) {
          const cleanIC = String(icNumber).replace(/[-\s]/g, '');
          const icResult = await client.query(`
            SELECT id, employee_id, name FROM employees
            WHERE company_id = $1 AND REPLACE(ic_number, '-', '') = $2 AND status = 'active'
          `, [AA_ALIVE_COMPANY_ID, cleanIC]);
          if (icResult.rows.length > 0) employee = icResult.rows[0];
        }

        // Method 2: Driver ID mapping
        if (!employee && driverId && DRIVER_MAPPING[driverId]) {
          const mapResult = await client.query(`
            SELECT id, employee_id, name FROM employees
            WHERE company_id = $1 AND employee_id = $2 AND status = 'active'
          `, [AA_ALIVE_COMPANY_ID, DRIVER_MAPPING[driverId]]);
          if (mapResult.rows.length > 0) employee = mapResult.rows[0];
        }

        // Method 3: Name match
        if (!employee && driverName) {
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
            error: `Driver not found: ${driverName || driverId || icNumber}`
          });
          continue;
        }

        // Check existing record
        const existingResult = await client.query(`
          SELECT id, clock_in_1, clock_out_2 FROM clock_in_records
          WHERE employee_id = $1 AND work_date = $2
        `, [employee.id, workDate]);

        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];

          // Update if missing clock out
          if (clockOut && !existing.clock_out_2) {
            await client.query(`
              UPDATE clock_in_records SET clock_out_2 = $1, status = 'completed', updated_at = NOW()
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
          await client.query(`
            INSERT INTO clock_in_records (
              employee_id, company_id, work_date,
              clock_in_1, clock_out_2,
              address_in_1, notes, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          `, [
            employee.id,
            AA_ALIVE_COMPANY_ID,
            workDate,
            clockIn || null,
            clockOut || null,
            location || null,
            'Synced from Aalyx',
            clockOut ? 'completed' : 'clocked_in'
          ]);

          results.success.push({
            employee_id: employee.employee_id,
            name: employee.name,
            date: workDate,
            action: 'created'
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
