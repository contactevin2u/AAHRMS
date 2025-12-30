/**
 * ESS Clock-in Routes
 * Handles employee attendance clock-in/out with 4-action structure.
 *
 * =============================================================================
 * DATA STORAGE MINIMIZATION POLICY
 * =============================================================================
 *
 * WHAT IS STORED (Minimum Required):
 * - employee_id, company_id, outlet_id, date
 * - clock_action_type (clock_in_1, clock_out_1, clock_in_2, clock_out_2)
 * - server_timestamp (UTC) - NEVER client timestamp
 * - total_work_hours, ot_hours (calculated)
 * - status, approved_by, approved_at
 *
 * LOCATION (Minimal):
 * - latitude (decimal)
 * - longitude (decimal)
 * - address (optional, resolved text)
 *
 * SELFIE (Optimized):
 * - One compressed image per clock action (≤200KB)
 * - JPEG format, max 640px, quality 60-70%
 *
 * FACE DETECTION (Not Biometric):
 * - face_detected (boolean)
 * - faces_count (integer, must be 1)
 * - detection_confidence (decimal, optional)
 *
 * WHAT IS NOT STORED:
 * - Full-resolution selfies
 * - Video recordings
 * - GPS traces / movement history
 * - Face recognition / biometric vectors
 * - Facial landmarks / templates
 * - Historical retry images
 * - Client-side timestamps
 *
 * RETENTION POLICY:
 * - Attendance records: 7 years (audit / payroll requirement)
 * - Selfie images: 6-12 months, then auto-delete
 * - Location data: Same as selfie retention
 *
 * =============================================================================
 *
 * Actions:
 * - clock_in_1: Start work
 * - clock_out_1: Break
 * - clock_in_2: Return from break
 * - clock_out_2: End work
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const { uploadAttendance } = require('../../utils/cloudinaryStorage');

// Standard work time: 8.5 hours = 510 minutes
const STANDARD_WORK_MINUTES = 510;

// Maximum allowed photo size (200KB as per storage minimization policy)
const MAX_PHOTO_SIZE_KB = 200;

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

/**
 * Calculate base64 image size in KB
 * @param {string} base64 - Base64 string (with or without data URL prefix)
 * @returns {number} - Size in KB
 */
function getBase64SizeKB(base64) {
  if (!base64) return 0;
  const base64Data = base64.split(',').pop();
  const sizeInBytes = (base64Data.length * 3) / 4;
  return Math.round(sizeInBytes / 1024);
}

/**
 * Validate mandatory clock data
 * ALL clock actions require: photo, GPS location, and face detection
 *
 * STORAGE MINIMIZATION: Photo must be ≤200KB
 */
function validateClockData(data, action) {
  const errors = [];

  // Photo is mandatory for ALL actions
  if (!data.photo_base64) {
    errors.push('Photo is required');
  } else {
    // Validate photo size (storage minimization policy)
    const photoSizeKB = getBase64SizeKB(data.photo_base64);
    if (photoSizeKB > MAX_PHOTO_SIZE_KB) {
      errors.push(`Photo size (${photoSizeKB}KB) exceeds maximum allowed (${MAX_PHOTO_SIZE_KB}KB). Please compress the image.`);
    }
  }

  // GPS location is mandatory for ALL actions
  if (data.latitude === undefined || data.latitude === null) {
    errors.push('GPS latitude is required');
  }
  if (data.longitude === undefined || data.longitude === null) {
    errors.push('GPS longitude is required');
  }

  // Face detection is mandatory for ALL actions
  if (data.face_detected !== true) {
    errors.push('Face detection validation is required. Please retake your photo with your face clearly visible.');
  }

  return errors;
}

// Get today's status (supports 4-action structure)
router.get('/status', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const today = getCurrentDate();

  const result = await pool.query(
    `SELECT id, work_date,
            clock_in_1, clock_out_1, clock_in_2, clock_out_2,
            location_in_1, location_out_1, location_in_2, location_out_2,
            address_in_1, address_out_1, address_in_2, address_out_2,
            photo_in_1, photo_out_1, photo_in_2, photo_out_2,
            face_detected_in_1, face_detected_out_1, face_detected_in_2, face_detected_out_2,
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
// ALL ACTIONS NOW REQUIRE: photo, GPS, face detection
router.post('/action', authenticateEmployee, asyncHandler(async (req, res) => {
  const {
    action,
    photo_base64,
    latitude,
    longitude,
    address,
    face_detected,
    face_confidence,
    timestamp
  } = req.body;

  const employeeId = req.employee.id;
  const today = getCurrentDate();
  const currentTime = getCurrentTime();

  // Validate action type
  if (!['clock_in_1', 'clock_out_1', 'clock_in_2', 'clock_out_2'].includes(action)) {
    throw new ValidationError('Invalid action. Must be one of: clock_in_1, clock_out_1, clock_in_2, clock_out_2');
  }

  // Validate mandatory data for ALL actions
  const validationErrors = validateClockData(req.body, action);
  if (validationErrors.length > 0) {
    throw new ValidationError(validationErrors.join('. '));
  }

  // Get employee info
  const empResult = await pool.query(
    `SELECT e.company_id, e.outlet_id, c.grouping_type
     FROM employees e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.id = $1`,
    [employeeId]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const { company_id, outlet_id, grouping_type } = empResult.rows[0];

  // Schedule-based clock-in enforcement for outlet-based companies (Mimix)
  if (grouping_type === 'outlet' && action === 'clock_in_1') {
    const scheduleResult = await pool.query(
      `SELECT * FROM schedules
       WHERE employee_id = $1 AND schedule_date = $2 AND status = 'scheduled'`,
      [employeeId, today]
    );

    if (scheduleResult.rows.length === 0) {
      throw new ValidationError('No shift scheduled for today. Please request supervisor approval for an extra shift.');
    }

    // Check if within allowed time window (15 min before shift start)
    const schedule = scheduleResult.rows[0];
    const shiftStart = schedule.shift_start.substring(0, 5); // HH:MM
    const shiftStartMinutes = parseInt(shiftStart.split(':')[0]) * 60 + parseInt(shiftStart.split(':')[1]);
    const currentMinutes = parseInt(currentTime.split(':')[0]) * 60 + parseInt(currentTime.split(':')[1]);
    const earlyWindowMinutes = shiftStartMinutes - 15;

    if (currentMinutes < earlyWindowMinutes) {
      throw new ValidationError(`Your shift starts at ${shiftStart}. You can clock in 15 minutes before.`);
    }
  }

  // Check existing record for today
  let existingRecord = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, today]
  );

  let record;
  const locationStr = `${latitude},${longitude}`;

  // Map action to field names
  const actionSuffix = action.split('_').pop(); // '1' or '2'
  const actionType = action.startsWith('clock_in') ? 'in' : 'out';
  const fieldSuffix = `${actionType}_${actionSuffix}`;

  if (action === 'clock_in_1') {
    // First clock-in of the day
    if (existingRecord.rows.length > 0 && existingRecord.rows[0].clock_in_1) {
      throw new ValidationError('You have already clocked in for today');
    }

    // Upload photo to Cloudinary
    const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_in_1');

    if (existingRecord.rows.length === 0) {
      // Create new record
      record = await pool.query(
        `INSERT INTO clock_in_records
         (employee_id, company_id, outlet_id, work_date,
          clock_in_1, photo_in_1, location_in_1, address_in_1, face_detected_in_1, face_confidence_in_1,
          status, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'in_progress', 'pending')
         RETURNING *`,
        [employeeId, company_id, outlet_id, today, currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0]
      );
    } else {
      // Update existing record
      record = await pool.query(
        `UPDATE clock_in_records SET
           clock_in_1 = $1, photo_in_1 = $2, location_in_1 = $3, address_in_1 = $4,
           face_detected_in_1 = $5, face_confidence_in_1 = $6, status = 'in_progress'
         WHERE employee_id = $7 AND work_date = $8
         RETURNING *`,
        [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, employeeId, today]
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

    // Upload photo to Cloudinary
    const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_out_1');

    record = await pool.query(
      `UPDATE clock_in_records SET
         clock_out_1 = $1, photo_out_1 = $2, location_out_1 = $3, address_out_1 = $4,
         face_detected_out_1 = $5, face_confidence_out_1 = $6
       WHERE employee_id = $7 AND work_date = $8
       RETURNING *`,
      [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, employeeId, today]
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

    // Upload photo to Cloudinary
    const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_in_2');

    record = await pool.query(
      `UPDATE clock_in_records SET
         clock_in_2 = $1, photo_in_2 = $2, location_in_2 = $3, address_in_2 = $4,
         face_detected_in_2 = $5, face_confidence_in_2 = $6
       WHERE employee_id = $7 AND work_date = $8
       RETURNING *`,
      [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, employeeId, today]
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

    // Upload photo to Cloudinary
    const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_out_2');

    // Calculate work time
    const updatedRecord = {
      ...existingRecord.rows[0],
      clock_out_2: currentTime
    };
    const { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord);

    record = await pool.query(
      `UPDATE clock_in_records SET
         clock_out_2 = $1, photo_out_2 = $2, location_out_2 = $3, address_out_2 = $4,
         face_detected_out_2 = $5, face_confidence_out_2 = $6,
         total_work_minutes = $7, ot_minutes = $8, status = 'completed'
       WHERE employee_id = $9 AND work_date = $10
       RETURNING *`,
      [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, totalMinutes, otMinutes, employeeId, today]
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

// Legacy clock-in endpoint (backwards compatibility) - now requires all fields
router.post('/in', authenticateEmployee, asyncHandler(async (req, res) => {
  req.body.action = 'clock_in_1';

  // Validate mandatory data
  const validationErrors = validateClockData(req.body, 'clock_in_1');
  if (validationErrors.length > 0) {
    throw new ValidationError(validationErrors.join('. '));
  }

  const { photo_base64, latitude, longitude, address, face_detected, face_confidence } = req.body;
  const employeeId = req.employee.id;
  const today = getCurrentDate();
  const currentTime = getCurrentTime();

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

  // Upload photo to Cloudinary
  const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_in_1');

  const record = await pool.query(
    `INSERT INTO clock_in_records
     (employee_id, company_id, outlet_id, work_date,
      clock_in_1, photo_in_1, location_in_1, address_in_1, face_detected_in_1, face_confidence_in_1,
      status, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'in_progress', 'pending')
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       clock_in_1 = EXCLUDED.clock_in_1,
       photo_in_1 = EXCLUDED.photo_in_1,
       location_in_1 = EXCLUDED.location_in_1,
       address_in_1 = EXCLUDED.address_in_1,
       face_detected_in_1 = EXCLUDED.face_detected_in_1,
       face_confidence_in_1 = EXCLUDED.face_confidence_in_1,
       status = 'in_progress'
     RETURNING *`,
    [employeeId, company_id, outlet_id, today, currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0]
  );

  res.json({
    message: 'Clock-in successful',
    record: record.rows[0]
  });
}));

// Legacy clock-out endpoint (backwards compatibility) - now requires all fields
router.post('/out', authenticateEmployee, asyncHandler(async (req, res) => {
  // Validate mandatory data
  const validationErrors = validateClockData(req.body, 'clock_out_2');
  if (validationErrors.length > 0) {
    throw new ValidationError(validationErrors.join('. '));
  }

  const { photo_base64, latitude, longitude, address, face_detected, face_confidence } = req.body;
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

  // Get company_id for Cloudinary folder
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [employeeId]
  );
  const company_id = empResult.rows[0]?.company_id || 0;

  const locationStr = `${latitude},${longitude}`;

  // Upload photo to Cloudinary
  const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_out_2');

  // Calculate work time
  const updatedRecord = {
    ...existingRecord.rows[0],
    clock_out_2: currentTime
  };
  const { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord);

  const record = await pool.query(
    `UPDATE clock_in_records SET
       clock_out_2 = $1,
       photo_out_2 = $2,
       location_out_2 = $3,
       address_out_2 = $4,
       face_detected_out_2 = $5,
       face_confidence_out_2 = $6,
       total_work_minutes = $7,
       ot_minutes = $8,
       status = 'completed'
     WHERE employee_id = $9 AND work_date = $10
     RETURNING *`,
    [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, totalMinutes, otMinutes, employeeId, today]
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
            location_in_1, location_out_1, location_in_2, location_out_2,
            address_in_1, address_out_1, address_in_2, address_out_2,
            face_detected_in_1, face_detected_out_1, face_detected_in_2, face_detected_out_2,
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
