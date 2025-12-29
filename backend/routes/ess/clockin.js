/**
 * ESS Clock-in Routes
 * Handles employee attendance clock-in/out with 4-action structure:
 * - clock_in_1: Start work (requires photo + GPS)
 * - clock_out_1: Break (optional)
 * - clock_in_2: Return from break (optional)
 * - clock_out_2: End work (optional photo + GPS)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

// Standard work time: 8.5 hours = 510 minutes
const STANDARD_WORK_MINUTES = 510;

// Middleware to verify employee token
const authenticateEmployee = async (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'employee') {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.employee = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Calculate work time from a record
function calculateWorkTime(record) {
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;

  if (!clock_in_1) return { totalMinutes: 0, otMinutes: 0, totalHours: 0, otHours: 0 };

  let totalMinutes = 0;
  let breakMinutes = 0;

  // Calculate morning session (clock_in_1 to clock_out_1)
  if (clock_in_1 && clock_out_1) {
    const start1 = timeToMinutes(clock_in_1);
    const end1 = timeToMinutes(clock_out_1);
    totalMinutes += Math.max(0, end1 - start1);
  }

  // Calculate afternoon session (clock_in_2 to clock_out_2)
  if (clock_in_2 && clock_out_2) {
    const start2 = timeToMinutes(clock_in_2);
    const end2 = timeToMinutes(clock_out_2);
    totalMinutes += Math.max(0, end2 - start2);
  }

  // If only clock_in_1 and clock_out_2 (no break recorded)
  if (clock_in_1 && clock_out_2 && !clock_out_1 && !clock_in_2) {
    totalMinutes = timeToMinutes(clock_out_2) - timeToMinutes(clock_in_1);
  }

  // Calculate break time
  if (clock_out_1 && clock_in_2) {
    breakMinutes = timeToMinutes(clock_in_2) - timeToMinutes(clock_out_1);
  }

  const otMinutes = Math.max(0, totalMinutes - STANDARD_WORK_MINUTES);

  return {
    totalMinutes,
    breakMinutes,
    workMinutes: totalMinutes,
    otMinutes,
    totalHours: Math.round(totalMinutes / 60 * 100) / 100,
    otHours: Math.round(otMinutes / 60 * 100) / 100
  };
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function getCurrentTime() {
  const now = new Date();
  return now.toTimeString().substring(0, 8); // HH:MM:SS
}

function getCurrentDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// Get today's status (supports 4-action structure)
router.get('/status', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const today = getCurrentDate();

  const result = await pool.query(
    `SELECT id, work_date,
            clock_in_1, clock_out_1, clock_in_2, clock_out_2,
            location_in_1, location_out_2,
            photo_in_1, photo_out_2,
            total_work_minutes, ot_minutes, ot_rate,
            status, approval_status
     FROM clock_in_records
     WHERE employee_id = $1 AND work_date = $2
     ORDER BY id DESC LIMIT 1`,
    [employeeId, today]
  );

  if (result.rows.length === 0) {
    return res.json({
      status: 'not_started',
      next_action: 'clock_in_1',
      record: null
    });
  }

  const record = result.rows[0];
  let status = 'not_started';
  let nextAction = 'clock_in_1';

  if (record.clock_in_1 && !record.clock_out_1) {
    status = 'working';
    nextAction = 'clock_out_1';
  } else if (record.clock_out_1 && !record.clock_in_2) {
    status = 'on_break';
    nextAction = 'clock_in_2';
  } else if (record.clock_in_2 && !record.clock_out_2) {
    status = 'working';
    nextAction = 'clock_out_2';
  } else if (record.clock_out_2) {
    status = 'completed';
    nextAction = null;
  }

  res.json({
    status,
    next_action: nextAction,
    record: {
      ...record,
      total_hours: record.total_work_minutes ? (record.total_work_minutes / 60).toFixed(2) : null,
      ot_hours: record.ot_minutes ? (record.ot_minutes / 60).toFixed(2) : null
    }
  });
}));

// Clock action (unified endpoint for all 4 actions)
router.post('/action', authenticateEmployee, asyncHandler(async (req, res) => {
  const { action, photo_base64, latitude, longitude } = req.body;
  const employeeId = req.employee.id;
  const today = getCurrentDate();
  const currentTime = getCurrentTime();

  if (!['clock_in_1', 'clock_out_1', 'clock_in_2', 'clock_out_2'].includes(action)) {
    throw new ValidationError('Invalid action. Must be one of: clock_in_1, clock_out_1, clock_in_2, clock_out_2');
  }

  // Get employee info
  const empResult = await pool.query(
    'SELECT company_id, outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const { company_id, outlet_id } = empResult.rows[0];

  // Check existing record for today
  let existingRecord = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );

  let record;

  if (action === 'clock_in_1') {
    // First clock-in of the day - requires photo and GPS
    if (!photo_base64) {
      throw new ValidationError('Photo is required for clock-in');
    }
    if (!latitude || !longitude) {
      throw new ValidationError('GPS location is required for clock-in');
    }

    if (existingRecord.rows.length > 0 && existingRecord.rows[0].clock_in_1) {
      throw new ValidationError('You have already clocked in for today');
    }

    const locationStr = `${latitude},${longitude}`;

    if (existingRecord.rows.length === 0) {
      // Create new record
      record = await pool.query(
        `INSERT INTO clock_in_records
         (employee_id, company_id, outlet_id, work_date, clock_in_1, photo_in_1, location_in_1, status, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_progress', 'pending')
         RETURNING *`,
        [employeeId, company_id, outlet_id, today, currentTime, photo_base64, locationStr]
      );
    } else {
      // Update existing record
      record = await pool.query(
        `UPDATE clock_in_records SET
           clock_in_1 = $1, photo_in_1 = $2, location_in_1 = $3, status = 'in_progress'
         WHERE employee_id = $4 AND work_date = $5
         RETURNING *`,
        [currentTime, photo_base64, locationStr, employeeId, today]
      );
    }

    res.json({
      message: 'Clock-in successful! Have a great day at work.',
      action: 'clock_in_1',
      time: currentTime,
      record: record.rows[0]
    });

  } else if (action === 'clock_out_1') {
    // Break time
    if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_in_1) {
      throw new ValidationError('You must clock in first');
    }
    if (existingRecord.rows[0].clock_out_1) {
      throw new ValidationError('You have already taken your break');
    }

    record = await pool.query(
      `UPDATE clock_in_records SET clock_out_1 = $1
       WHERE employee_id = $2 AND work_date = $3
       RETURNING *`,
      [currentTime, employeeId, today]
    );

    res.json({
      message: 'Break started. Enjoy your break!',
      action: 'clock_out_1',
      time: currentTime,
      record: record.rows[0]
    });

  } else if (action === 'clock_in_2') {
    // Return from break
    if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_out_1) {
      throw new ValidationError('You must go on break first');
    }
    if (existingRecord.rows[0].clock_in_2) {
      throw new ValidationError('You have already returned from break');
    }

    record = await pool.query(
      `UPDATE clock_in_records SET clock_in_2 = $1
       WHERE employee_id = $2 AND work_date = $3
       RETURNING *`,
      [currentTime, employeeId, today]
    );

    res.json({
      message: 'Welcome back! Break ended.',
      action: 'clock_in_2',
      time: currentTime,
      record: record.rows[0]
    });

  } else if (action === 'clock_out_2') {
    // End of day
    if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_in_1) {
      throw new ValidationError('You must clock in first');
    }
    if (existingRecord.rows[0].clock_out_2) {
      throw new ValidationError('You have already clocked out for the day');
    }

    const locationStr = (latitude && longitude) ? `${latitude},${longitude}` : null;

    // Calculate work time
    const updatedRecord = {
      ...existingRecord.rows[0],
      clock_out_2: currentTime
    };
    const { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord);

    record = await pool.query(
      `UPDATE clock_in_records SET
         clock_out_2 = $1,
         photo_out_2 = $2,
         location_out_2 = $3,
         total_work_minutes = $4,
         ot_minutes = $5,
         status = 'completed'
       WHERE employee_id = $6 AND work_date = $7
       RETURNING *`,
      [currentTime, photo_base64 || null, locationStr, totalMinutes, otMinutes, employeeId, today]
    );

    res.json({
      message: `Day complete! You worked ${totalHours} hours${otHours > 0 ? ` (OT: ${otHours}h)` : ''}.`,
      action: 'clock_out_2',
      time: currentTime,
      total_hours: totalHours,
      ot_hours: otHours,
      record: record.rows[0]
    });
  }
}));

// Legacy clock-in endpoint (backwards compatibility)
router.post('/in', authenticateEmployee, asyncHandler(async (req, res) => {
  req.body.action = 'clock_in_1';
  // Forward to the action endpoint
  const { photo_base64, latitude, longitude } = req.body;
  const employeeId = req.employee.id;
  const today = getCurrentDate();
  const currentTime = getCurrentTime();

  if (!photo_base64) {
    throw new ValidationError('Photo is required for clock-in');
  }
  if (!latitude || !longitude) {
    throw new ValidationError('GPS location is required for clock-in');
  }

  const empResult = await pool.query(
    'SELECT company_id, outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const { company_id, outlet_id } = empResult.rows[0];

  // Check existing record
  const existingRecord = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );

  if (existingRecord.rows.length > 0 && existingRecord.rows[0].clock_in_1) {
    throw new ValidationError('You have already clocked in for today');
  }

  const locationStr = `${latitude},${longitude}`;

  const record = await pool.query(
    `INSERT INTO clock_in_records
     (employee_id, company_id, outlet_id, work_date, clock_in_1, photo_in_1, location_in_1, status, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_progress', 'pending')
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       clock_in_1 = EXCLUDED.clock_in_1,
       photo_in_1 = EXCLUDED.photo_in_1,
       location_in_1 = EXCLUDED.location_in_1,
       status = 'in_progress'
     RETURNING *`,
    [employeeId, company_id, outlet_id, today, currentTime, photo_base64, locationStr]
  );

  res.json({
    message: 'Clock-in successful',
    record: record.rows[0]
  });
}));

// Legacy clock-out endpoint (backwards compatibility)
router.post('/out', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const today = getCurrentDate();
  const currentTime = getCurrentTime();

  const existingRecord = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );

  if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_in_1) {
    throw new ValidationError('No active clock-in found for today');
  }

  if (existingRecord.rows[0].clock_out_2) {
    throw new ValidationError('You have already clocked out for the day');
  }

  // Calculate work time
  const updatedRecord = {
    ...existingRecord.rows[0],
    clock_out_2: currentTime
  };
  const { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord);

  const record = await pool.query(
    `UPDATE clock_in_records SET
       clock_out_2 = $1,
       total_work_minutes = $2,
       ot_minutes = $3,
       status = 'completed'
     WHERE employee_id = $4 AND work_date = $5
     RETURNING *`,
    [currentTime, totalMinutes, otMinutes, employeeId, today]
  );

  res.json({
    message: 'Clock-out successful',
    record: {
      ...record.rows[0],
      hours_worked: totalHours
    }
  });
}));

// Get clock-in history
router.get('/history', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const { month, year } = req.query;

  const currentDate = new Date();
  const queryMonth = month || (currentDate.getMonth() + 1);
  const queryYear = year || currentDate.getFullYear();

  const result = await pool.query(
    `SELECT id, work_date,
            clock_in_1, clock_out_1, clock_in_2, clock_out_2,
            total_work_minutes, ot_minutes,
            status, approval_status
     FROM clock_in_records
     WHERE employee_id = $1
     AND EXTRACT(MONTH FROM work_date) = $2
     AND EXTRACT(YEAR FROM work_date) = $3
     ORDER BY work_date DESC`,
    [employeeId, queryMonth, queryYear]
  );

  // Calculate summary
  const completedDays = result.rows.filter(r => r.status === 'completed').length;
  const totalMinutes = result.rows.reduce((sum, r) => sum + (r.total_work_minutes || 0), 0);
  const totalOtMinutes = result.rows.reduce((sum, r) => sum + (r.ot_minutes || 0), 0);

  res.json({
    records: result.rows.map(r => ({
      ...r,
      total_hours: r.total_work_minutes ? (r.total_work_minutes / 60).toFixed(2) : null,
      ot_hours: r.ot_minutes ? (r.ot_minutes / 60).toFixed(2) : null
    })),
    summary: {
      total_days: completedDays,
      total_hours: (totalMinutes / 60).toFixed(2),
      total_ot_hours: (totalOtMinutes / 60).toFixed(2),
      pending_completion: result.rows.filter(r => r.status === 'in_progress').length
    }
  });
}));

module.exports = router;
