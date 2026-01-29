/**
 * OrderOps Webhook Endpoint
 * Receives real-time driver attendance data from OrderOps
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');

const AA_ALIVE_COMPANY_ID = 1;
const WEBHOOK_SECRET = process.env.ORDEROPS_WEBHOOK_SECRET;

// Skip list for vehicle IDs and non-driver entries
const SKIP_DRIVERS = ['2 JC 2', '2JC2', 'Self Pick Up'];

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
  'IQZAT': 'IQZAT',
  'oyeng': 'SHUKRI',
  'OYENG': 'SHUKRI'
};

/**
 * Verify webhook secret
 */
function verifyWebhook(req, res, next) {
  const secret = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!WEBHOOK_SECRET) {
    console.error('[Webhook] ORDEROPS_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (secret !== WEBHOOK_SECRET) {
    console.error('[Webhook] Invalid webhook secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * Receive driver clock-in event
 * POST /api/webhooks/orderops/clock-in
 */
router.post('/clock-in', verifyWebhook, async (req, res) => {
  const client = await pool.connect();

  try {
    const { driver_name, clock_in_at_myt, clock_in_location, is_outstation } = req.body;

    console.log(`[Webhook] Clock-in received for: ${driver_name} at ${clock_in_at_myt}`);

    if (!driver_name || !clock_in_at_myt) {
      return res.status(400).json({ error: 'Missing driver_name or clock_in_at_myt' });
    }

    // Skip non-drivers
    if (SKIP_DRIVERS.includes(driver_name)) {
      return res.json({ success: true, skipped: true, reason: 'Not a driver' });
    }

    // Find employee
    const employee = await findEmployee(client, driver_name);
    if (!employee) {
      console.error(`[Webhook] Driver not found: ${driver_name}`);
      return res.status(404).json({ error: `Driver not found: ${driver_name}` });
    }

    // Parse date and time
    const workDate = clock_in_at_myt.split(' ')[0];
    const clockIn = clock_in_at_myt.split(' ')[1];

    // Check existing record
    const existing = await client.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee.id, workDate]
    );

    if (existing.rows.length > 0) {
      return res.json({ success: true, skipped: true, reason: 'Already clocked in' });
    }

    // Create new record
    const notes = is_outstation ? 'From OrderOps (Outstation)' : 'From OrderOps';

    await client.query(`
      INSERT INTO clock_in_records (
        employee_id, company_id, work_date,
        clock_in_1, address_in_1,
        notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'clocked_in', NOW(), NOW())
    `, [employee.id, AA_ALIVE_COMPANY_ID, workDate, clockIn, clock_in_location || null, notes]);

    console.log(`[Webhook] Clock-in recorded for ${employee.employee_id}`);

    res.json({
      success: true,
      employee_id: employee.employee_id,
      name: employee.name,
      work_date: workDate,
      clock_in: clockIn
    });

  } catch (error) {
    console.error('[Webhook] Clock-in error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Receive driver clock-out event
 * POST /api/webhooks/orderops/clock-out
 */
router.post('/clock-out', verifyWebhook, async (req, res) => {
  const client = await pool.connect();

  try {
    const { driver_name, clock_out_at_myt, clock_out_location, total_working_hours } = req.body;

    console.log(`[Webhook] Clock-out received for: ${driver_name} at ${clock_out_at_myt}`);

    if (!driver_name || !clock_out_at_myt) {
      return res.status(400).json({ error: 'Missing driver_name or clock_out_at_myt' });
    }

    // Skip non-drivers
    if (SKIP_DRIVERS.includes(driver_name)) {
      return res.json({ success: true, skipped: true, reason: 'Not a driver' });
    }

    // Find employee
    const employee = await findEmployee(client, driver_name);
    if (!employee) {
      console.error(`[Webhook] Driver not found: ${driver_name}`);
      return res.status(404).json({ error: `Driver not found: ${driver_name}` });
    }

    // Parse date and time
    const workDate = clock_out_at_myt.split(' ')[0];
    const clockOut = clock_out_at_myt.split(' ')[1];

    // Find existing record
    const existing = await client.query(
      'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee.id, workDate]
    );

    if (existing.rows.length === 0) {
      // Create record with clock-out only (driver may have clocked in before webhook was set up)
      const notes = 'From OrderOps (clock-out only)';
      await client.query(`
        INSERT INTO clock_in_records (
          employee_id, company_id, work_date,
          clock_out_1, address_out_1, total_work_hours,
          notes, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), NOW())
      `, [employee.id, AA_ALIVE_COMPANY_ID, workDate, clockOut, clock_out_location || null, total_working_hours || null, notes]);
    } else {
      // Update existing record - AA Alive uses single session (clock_in_1 → clock_out_1)
      await client.query(`
        UPDATE clock_in_records
        SET clock_out_1 = $1, address_out_1 = $2, total_work_hours = $3, status = 'completed', updated_at = NOW()
        WHERE id = $4
      `, [clockOut, clock_out_location || null, total_working_hours || null, existing.rows[0].id]);
    }

    console.log(`[Webhook] Clock-out recorded for ${employee.employee_id}`);

    res.json({
      success: true,
      employee_id: employee.employee_id,
      name: employee.name,
      work_date: workDate,
      clock_out: clockOut
    });

  } catch (error) {
    console.error('[Webhook] Clock-out error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Receive full shift data (clock-in + clock-out)
 * POST /api/webhooks/orderops/shift
 */
router.post('/shift', verifyWebhook, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      driver_name,
      clock_in_at_myt,
      clock_out_at_myt,
      clock_in_location,
      clock_out_location,
      is_outstation,
      total_working_hours,
      status: shiftStatus
    } = req.body;

    console.log(`[Webhook] Shift received for: ${driver_name}`);

    if (!driver_name) {
      return res.status(400).json({ error: 'Missing driver_name' });
    }

    // Skip non-drivers
    if (SKIP_DRIVERS.includes(driver_name)) {
      return res.json({ success: true, skipped: true, reason: 'Not a driver' });
    }

    // Find employee
    const employee = await findEmployee(client, driver_name);
    if (!employee) {
      console.error(`[Webhook] Driver not found: ${driver_name}`);
      return res.status(404).json({ error: `Driver not found: ${driver_name}` });
    }

    // Parse date and time
    const workDate = clock_in_at_myt ? clock_in_at_myt.split(' ')[0] : clock_out_at_myt?.split(' ')[0];
    const clockIn = clock_in_at_myt ? clock_in_at_myt.split(' ')[1] : null;
    const clockOut = clock_out_at_myt ? clock_out_at_myt.split(' ')[1] : null;

    if (!workDate) {
      return res.status(400).json({ error: 'Missing date information' });
    }

    // Check existing record
    const existing = await client.query(
      'SELECT id, clock_in_1, clock_out_1 FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
      [employee.id, workDate]
    );

    const notes = is_outstation ? 'From OrderOps (Outstation)' : 'From OrderOps';
    const status = shiftStatus === 'COMPLETED' ? 'completed' : (clockOut ? 'completed' : 'clocked_in');

    if (existing.rows.length > 0) {
      // Update existing record - AA Alive uses single session (clock_in_1 → clock_out_1)
      await client.query(`
        UPDATE clock_in_records
        SET clock_in_1 = COALESCE($1, clock_in_1),
            clock_out_1 = COALESCE($2, clock_out_1),
            address_in_1 = COALESCE($3, address_in_1),
            address_out_1 = COALESCE($4, address_out_1),
            total_work_hours = COALESCE($5, total_work_hours),
            status = $6,
            updated_at = NOW()
        WHERE id = $7
      `, [clockIn, clockOut, clock_in_location, clock_out_location, total_working_hours, status, existing.rows[0].id]);

      res.json({ success: true, action: 'updated', employee_id: employee.employee_id });
    } else {
      // Create new record - AA Alive uses single session (clock_in_1 → clock_out_1)
      await client.query(`
        INSERT INTO clock_in_records (
          employee_id, company_id, work_date,
          clock_in_1, clock_out_1,
          address_in_1, address_out_1,
          total_work_hours, notes, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      `, [
        employee.id, AA_ALIVE_COMPANY_ID, workDate,
        clockIn, clockOut,
        clock_in_location || null, clock_out_location || null,
        total_working_hours || null, notes, status
      ]);

      res.json({ success: true, action: 'created', employee_id: employee.employee_id });
    }

    console.log(`[Webhook] Shift recorded for ${employee.employee_id}`);

  } catch (error) {
    console.error('[Webhook] Shift error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Health check endpoint
 * GET /api/webhooks/orderops/health
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'orderops-webhook' });
});

/**
 * Find employee by driver name
 */
async function findEmployee(client, driverName) {
  // Method 1: Use driver mapping
  const mappedId = DRIVER_MAPPING[driverName] || DRIVER_MAPPING[driverName.toUpperCase()];
  if (mappedId) {
    const result = await client.query(
      `SELECT id, employee_id, name FROM employees WHERE company_id = $1 AND UPPER(employee_id) = UPPER($2) AND status = 'active'`,
      [AA_ALIVE_COMPANY_ID, mappedId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // Method 2: Direct name match
  const result = await client.query(
    `SELECT id, employee_id, name FROM employees WHERE company_id = $1 AND status = 'active' AND (UPPER(employee_id) = UPPER($2) OR UPPER(name) LIKE UPPER($3)) LIMIT 1`,
    [AA_ALIVE_COMPANY_ID, driverName, `%${driverName}%`]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

module.exports = router;
