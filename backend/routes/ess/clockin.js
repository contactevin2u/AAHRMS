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
const {
  isSupervisorOrManager,
  getManagedOutlets,
  isMimixCompany,
  isAAAliveCompany,
  canApproveForOutlet,
  canApproveBasedOnHierarchy
} = require('../../middleware/essPermissions');
const { checkWrongShift } = require('../../utils/attendanceDeduction');
const { getOTApprovalSetting } = require('../../utils/otCalculation');

// Mimix: 7.5 hours = 450 minutes (excluding 1 hour break)
const STANDARD_WORK_MINUTES_MIMIX = 450;
// AA Alive: 9 hours = 540 minutes (break included, no separate break clock)
const STANDARD_WORK_MINUTES_AA_ALIVE = 540;

// Night shift cutoff time (2:00 AM) - actions before this time are treated as previous day
// This applies to companies with night shifts (like Mimix)
const NIGHT_SHIFT_CUTOFF_HOUR = 2;
const NIGHT_SHIFT_CUTOFF_MINUTE = 0;

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
// OT Rules:
// - Minimum 1 hour OT required (less than 1 hour = 0)
// - Round OT to nearest 0.5 hour, rounding DOWN
// - e.g., 0.9h OT = 0 (below min), 1.2h = 1h, 1.7h = 1.5h
function calculateWorkTime(record, companyId) {
  const standardMinutes = isAAAliveCompany(companyId) ? STANDARD_WORK_MINUTES_AA_ALIVE : STANDARD_WORK_MINUTES_MIMIX;
  const { clock_in_1, clock_out_1, clock_in_2, clock_out_2 } = record;

  if (!clock_in_1) return { totalMinutes: 0, otMinutes: 0, rawOtMinutes: 0, totalHours: 0, otHours: 0 };

  let totalMinutes = 0;
  let breakMinutes = 0;

  // Handle overnight: if out time < in time, add 24h (1440 min)
  const timeDiff = (start, end) => end >= start ? end - start : end + 1440 - start;

  // Calculate morning session (clock_in_1 to clock_out_1)
  if (clock_in_1 && clock_out_1) {
    const start1 = timeToMinutes(clock_in_1);
    const end1 = timeToMinutes(clock_out_1);
    totalMinutes += timeDiff(start1, end1);
  }

  // Calculate afternoon session (clock_in_2 to clock_out_2)
  if (clock_in_2 && clock_out_2) {
    const start2 = timeToMinutes(clock_in_2);
    const end2 = timeToMinutes(clock_out_2);
    totalMinutes += timeDiff(start2, end2);
  }

  // If only clock_in_1 and clock_out_2 (no break recorded)
  if (clock_in_1 && clock_out_2 && !clock_out_1 && !clock_in_2) {
    totalMinutes = timeDiff(timeToMinutes(clock_in_1), timeToMinutes(clock_out_2));
  }

  // Calculate break time
  if (clock_out_1 && clock_in_2) {
    breakMinutes = timeDiff(timeToMinutes(clock_out_1), timeToMinutes(clock_in_2));
  }

  // Raw OT minutes (before applying rules)
  const rawOtMinutes = Math.max(0, totalMinutes - standardMinutes);
  const rawOtHours = rawOtMinutes / 60;

  // Apply OT rules:
  // 1. Minimum 1 hour required (60 minutes)
  // 2. Round DOWN to nearest 0.5 hour (30 minutes)
  let otMinutes = 0;
  if (rawOtMinutes >= 60) {
    // Round down to nearest 30 minutes
    otMinutes = Math.floor(rawOtMinutes / 30) * 30;
  }

  return {
    totalMinutes,
    breakMinutes,
    workMinutes: totalMinutes,
    rawOtMinutes,  // Keep raw for reference
    otMinutes,     // Rounded OT (min 1hr, 0.5hr increments)
    totalHours: Math.round(totalMinutes / 60 * 100) / 100,
    otHours: otMinutes / 60  // This will be 0, 1, 1.5, 2, etc.
  };
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function getCurrentTime() {
  // Use Malaysia timezone (UTC+8)
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const malaysiaTime = new Date(now);
  return malaysiaTime.toTimeString().substring(0, 8); // HH:MM:SS
}

function getCurrentDate() {
  // Use Malaysia timezone (UTC+8) for date calculation
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const year = malaysiaTime.getFullYear();
  const month = String(malaysiaTime.getMonth() + 1).padStart(2, '0');
  const day = String(malaysiaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // YYYY-MM-DD
}

/**
 * Get the effective work date considering night shift cutoff
 * If current time is after midnight but before cutoff (e.g., 1:30 AM),
 * return yesterday's date for shift continuation
 */
function getEffectiveWorkDate() {
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const hour = malaysiaTime.getHours();
  const minute = malaysiaTime.getMinutes();

  // Check if we're in the "after midnight but before cutoff" window
  const isBeforeCutoff = hour < NIGHT_SHIFT_CUTOFF_HOUR ||
    (hour === NIGHT_SHIFT_CUTOFF_HOUR && minute < NIGHT_SHIFT_CUTOFF_MINUTE);

  if (isBeforeCutoff) {
    // Return yesterday's date
    malaysiaTime.setDate(malaysiaTime.getDate() - 1);
  }

  const year = malaysiaTime.getFullYear();
  const month = String(malaysiaTime.getMonth() + 1).padStart(2, '0');
  const day = String(malaysiaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if current time is past the night shift cutoff
 */
function isPastCutoff() {
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const hour = malaysiaTime.getHours();
  const minute = malaysiaTime.getMinutes();

  // Past cutoff if hour > cutoff hour, or hour == cutoff hour and minute >= cutoff minute
  return hour > NIGHT_SHIFT_CUTOFF_HOUR ||
    (hour === NIGHT_SHIFT_CUTOFF_HOUR && minute >= NIGHT_SHIFT_CUTOFF_MINUTE);
}

/**
 * Check if there's an open shift from yesterday that needs to be closed
 * Returns the record if found, null otherwise
 */
async function getOpenShiftFromYesterday(employeeId) {
  const malaysiaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  malaysiaTime.setDate(malaysiaTime.getDate() - 1);

  const year = malaysiaTime.getFullYear();
  const month = String(malaysiaTime.getMonth() + 1).padStart(2, '0');
  const day = String(malaysiaTime.getDate()).padStart(2, '0');
  const yesterday = `${year}-${month}-${day}`;

  const result = await pool.query(
    `SELECT * FROM clock_in_records
     WHERE employee_id = $1 AND work_date = $2
     AND (
       (clock_in_1 IS NOT NULL AND clock_out_1 IS NULL) OR
       (clock_out_1 IS NOT NULL AND clock_in_2 IS NULL) OR
       (clock_in_2 IS NOT NULL AND clock_out_2 IS NULL)
     )
     ORDER BY id DESC LIMIT 1`,
    [employeeId, yesterday]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Auto clock-out an open shift at the cutoff time
 * This is called when an employee has an open shift from yesterday and it's past the cutoff
 * The shift will be auto-closed at 1:30 AM with a system note
 */
async function autoClockOutShift(record) {
  const cutoffTime = `${String(NIGHT_SHIFT_CUTOFF_HOUR).padStart(2, '0')}:${String(NIGHT_SHIFT_CUTOFF_MINUTE).padStart(2, '0')}:00`;

  // Determine which field to update based on current state
  let updateField = null;
  if (record.clock_in_1 && !record.clock_out_1) {
    // Was working, never took break - auto clock out at clock_out_2 (end of day)
    updateField = 'clock_out_2';
  } else if (record.clock_out_1 && !record.clock_in_2) {
    // Was on break - auto clock out at clock_out_2
    updateField = 'clock_out_2';
  } else if (record.clock_in_2 && !record.clock_out_2) {
    // Returned from break but didn't clock out - auto clock out at clock_out_2
    updateField = 'clock_out_2';
  }

  if (!updateField) {
    return null; // Nothing to update
  }

  // Calculate work time for the auto clock-out
  const updatedRecord = { ...record };
  updatedRecord[updateField] = cutoffTime;

  // Simple calculation for total work time
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  let totalMinutes = 0;
  const clockIn1 = parseTime(record.clock_in_1);
  const clockOut1 = parseTime(record.clock_out_1);
  const clockIn2 = parseTime(record.clock_in_2);
  const cutoffMinutes = NIGHT_SHIFT_CUTOFF_HOUR * 60 + NIGHT_SHIFT_CUTOFF_MINUTE + (24 * 60); // Add 24 hours since it's next day

  if (clockIn1) {
    if (clockOut1 && clockIn2) {
      // Full shift with break: (clock_out_1 - clock_in_1) + (cutoff - clock_in_2)
      totalMinutes = (clockOut1 - clockIn1) + (cutoffMinutes - (clockIn2 + 24 * 60));
    } else if (clockOut1) {
      // Only morning session
      totalMinutes = clockOut1 - clockIn1;
    } else {
      // No break taken, straight through
      totalMinutes = cutoffMinutes - clockIn1;
    }
  }

  // Cap at reasonable maximum (16 hours = 960 minutes)
  totalMinutes = Math.max(0, Math.min(totalMinutes, 960));

  // OT calculation (over 8.5 hours = 510 minutes)
  const otMinutes = Math.max(0, totalMinutes - 510);

  // Calculate hours in JavaScript to avoid PostgreSQL type inference issues
  const totalWorkHours = Math.round(totalMinutes / 6) / 10;  // Round to 1 decimal
  const otHoursCalc = Math.round(otMinutes / 6) / 10;  // Round to 1 decimal

  // Update the record
  const result = await pool.query(
    `UPDATE clock_in_records SET
       ${updateField} = $1,
       total_work_minutes = $2,
       ot_minutes = $3,
       total_work_hours = $5,
       ot_hours = $6,
       status = 'completed',
       notes = COALESCE(notes, '') || ' [Auto clock-out at cutoff time 01:30 AM]'
     WHERE id = $4
     RETURNING *`,
    [cutoffTime, totalMinutes, otMinutes, record.id, totalWorkHours, otHoursCalc]
  );

  console.log(`Auto clock-out for employee shift ${record.id}: ${updateField} at ${cutoffTime}`);

  return result.rows[0];
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
// Also checks for open shifts from yesterday (for night shift workers)
// AA Alive: 2-action flow (clock_in_1, clock_out_1 = session end, optional clock_in_2/clock_out_2 for 2nd session)
// Mimix: 4-action flow (clock_in_1, clock_out_1 = break, clock_in_2, clock_out_2)
router.get('/status', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;
  const today = getCurrentDate();

  // Get employee's company to determine flow type
  const empCompanyResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [employeeId]
  );
  const companyId = empCompanyResult.rows[0]?.company_id;
  const isAAAlive = isAAAliveCompany(companyId);

  // First, check if there's an open shift from yesterday that needs to be closed
  // This handles night shift workers who clock out after midnight
  let openYesterdayShift = await getOpenShiftFromYesterday(employeeId);

  if (openYesterdayShift) {
    // Check if it's past the cutoff time (1:30 AM)
    // If so, auto clock-out the shift instead of letting them continue
    if (isPastCutoff()) {
      console.log(`Auto clock-out triggered for employee ${employeeId}: past cutoff time`);
      const autoClosedRecord = await autoClockOutShift(openYesterdayShift);

      if (autoClosedRecord) {
        // Shift has been auto-closed, return completed status
        // Now check for today's records or allow new clock-in
        openYesterdayShift = null; // Clear so we continue to check today's records
        console.log(`Shift ${autoClosedRecord.id} auto-closed at cutoff time`);
      }
    } else {
      // Before cutoff - allow them to continue their shift
      let status = 'working';
      let nextAction = null;

      if (openYesterdayShift.clock_in_1 && !openYesterdayShift.clock_out_1) {
        nextAction = 'clock_out_1';
      } else if (openYesterdayShift.clock_out_1 && !openYesterdayShift.clock_in_2) {
        status = 'on_break';
        nextAction = 'clock_in_2';
      } else if (openYesterdayShift.clock_in_2 && !openYesterdayShift.clock_out_2) {
        nextAction = 'clock_out_2';
      }

      return res.json({
        status,
        next_action: nextAction,
        is_yesterday_shift: true,
        record: {
          ...openYesterdayShift,
          total_hours: openYesterdayShift.total_work_minutes ? (openYesterdayShift.total_work_minutes / 60).toFixed(2) : null,
          ot_hours: openYesterdayShift.ot_minutes ? (openYesterdayShift.ot_minutes / 60).toFixed(2) : null
        }
      });
    }
  }

  // No open shift from yesterday, check today's records
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
  let nextActionOptional = false;

  if (record.clock_in_1 && !record.clock_out_1) {
    status = 'working';
    nextAction = 'clock_out_1';
  } else if (record.clock_out_1 && !record.clock_in_2) {
    if (isAAAlive) {
      // AA Alive: clock_out_1 ends the session (no break tracking)
      // Optional clock_in_2 for a second session/job
      status = 'session_ended';
      nextAction = 'clock_in_2';
      nextActionOptional = true;
    } else {
      // Mimix: clock_out_1 is break start
      status = 'on_break';
      nextAction = 'clock_in_2';
    }
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
    next_action_optional: nextActionOptional,
    is_aa_alive: isAAAlive,
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
  let workDate = getCurrentDate(); // Default to today
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

  // Check if there's an open shift from yesterday that needs to be closed
  // This handles night shift workers clocking out after midnight
  const openYesterdayShift = await getOpenShiftFromYesterday(employeeId);
  let useYesterdayShift = false;

  if (openYesterdayShift && action !== 'clock_in_1') {
    // There's an open shift from yesterday and this is not a new clock-in
    // Use yesterday's date for this action
    useYesterdayShift = true;
    workDate = openYesterdayShift.work_date;
    console.log(`Night shift continuation: Using yesterday's shift (${workDate}) for ${action}`);
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

  // Schedule check for outlet-based companies (Mimix)
  // Clock-in is validated against assigned shift - wrong shift = absent
  let hasSchedule = false;
  let scheduleId = null;
  let attendanceStatus = 'present';
  let wrongShiftReason = null;

  if (grouping_type === 'outlet' && action === 'clock_in_1') {
    const scheduleResult = await pool.query(
      `SELECT * FROM schedules
       WHERE employee_id = $1 AND schedule_date = $2 AND status = 'scheduled'`,
      [employeeId, workDate]
    );

    if (scheduleResult.rows.length > 0) {
      const schedule = scheduleResult.rows[0];
      hasSchedule = true;
      scheduleId = schedule.id;

      // Check if clocking in for wrong shift (more than 2 hours from scheduled start)
      const wrongShiftCheck = checkWrongShift(schedule.shift_start, currentTime, 120);

      if (wrongShiftCheck.isWrongShift) {
        // Wrong shift - mark as absent
        attendanceStatus = 'wrong_shift';
        wrongShiftReason = wrongShiftCheck.reason;
        console.log(`Wrong shift detected for employee ${employeeId}: ${wrongShiftReason}`);
      } else {
        // Correct shift
        attendanceStatus = 'present';
      }
    } else {
      // No schedule - still allow clock-in but mark as no_schedule
      hasSchedule = false;
      scheduleId = null;
      attendanceStatus = 'no_schedule';
    }
  }

  // Check existing record for the work date
  let existingRecord = await pool.query(
    'SELECT * FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, workDate]
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

    // Determine record status based on attendance
    const recordStatus = attendanceStatus === 'wrong_shift' ? 'absent' : 'in_progress';

    if (existingRecord.rows.length === 0) {
      // Create new record with schedule tracking
      record = await pool.query(
        `INSERT INTO clock_in_records
         (employee_id, company_id, outlet_id, work_date,
          clock_in_1, photo_in_1, location_in_1, address_in_1, face_detected_in_1, face_confidence_in_1,
          has_schedule, schedule_id, attendance_status, wrong_shift_reason,
          status, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
         RETURNING *`,
        [employeeId, company_id, outlet_id, workDate, currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, hasSchedule, scheduleId, attendanceStatus, wrongShiftReason, recordStatus]
      );
    } else {
      // Update existing record with schedule tracking
      record = await pool.query(
        `UPDATE clock_in_records SET
           clock_in_1 = $1, photo_in_1 = $2, location_in_1 = $3, address_in_1 = $4,
           face_detected_in_1 = $5, face_confidence_in_1 = $6,
           has_schedule = $7, schedule_id = $8, attendance_status = $9, wrong_shift_reason = $10,
           status = $11
         WHERE employee_id = $12 AND work_date = $13
         RETURNING *`,
        [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, hasSchedule, scheduleId, attendanceStatus, wrongShiftReason, recordStatus, employeeId, workDate]
      );
    }

    // Different response based on attendance status
    if (attendanceStatus === 'wrong_shift') {
      res.status(200).json({
        message: 'Warning: You clocked in for the WRONG SHIFT. This will be marked as ABSENT.',
        warning: wrongShiftReason,
        action: 'clock_in_1',
        time: currentTime,
        attendance_status: 'wrong_shift',
        record: record.rows[0]
      });
    } else {
      res.json({
        message: 'Clock-in successful! Have a great day at work.',
        action: 'clock_in_1',
        time: currentTime,
        attendance_status: attendanceStatus,
        record: record.rows[0]
      });
    }

  } else if (action === 'clock_out_1') {
    // AA Alive: Session end (no break tracking)
    // Mimix: Break time
    if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_in_1) {
      throw new ValidationError('You must clock in first');
    }
    if (existingRecord.rows[0].clock_out_1) {
      throw new ValidationError(isAAAliveCompany(company_id) ? 'You have already clocked out for this session' : 'You have already taken your break');
    }

    // Upload photo to Cloudinary
    let photoUrl;
    try {
      photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_out_1');
    } catch (uploadErr) {
      console.error('Clock-out photo upload failed:', uploadErr.message);
      throw new ValidationError('Failed to upload clock-out photo. Please try again.');
    }

    if (isAAAliveCompany(company_id)) {
      // AA Alive: This is session end, calculate work time and OT
      const empWorkTypeResult = await pool.query(
        'SELECT work_type, employment_type FROM employees WHERE id = $1',
        [employeeId]
      );
      const workType = empWorkTypeResult.rows[0]?.work_type || 'full_time';
      const employmentType = empWorkTypeResult.rows[0]?.employment_type || 'confirmed';
      const isPartTime = workType === 'part_time' || employmentType === 'part_time';

      // Calculate work time for this session
      const updatedRecord = {
        ...existingRecord.rows[0],
        clock_out_1: currentTime
      };
      const { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord, company_id);

      // OT flagging (only for full-time, part-time employees have no OT)
      const otFlagged = !isPartTime && otMinutes > 0;
      // Auto-approve OT if company doesn't require approval (configurable)
      const otRequiresApproval = await getOTApprovalSetting(company_id);
      const otAutoApproved = otFlagged && !otRequiresApproval;

      // Calculate hours in JavaScript to avoid PostgreSQL type inference issues
      const totalWorkHours = Math.round(totalMinutes / 6) / 10;  // Round to 1 decimal
      const otHoursCalc = Math.round(otMinutes / 6) / 10;  // Round to 1 decimal

      record = await pool.query(
        `UPDATE clock_in_records SET
           clock_out_1 = $1, photo_out_1 = $2, location_out_1 = $3, address_out_1 = $4,
           face_detected_out_1 = $5, face_confidence_out_1 = $6,
           total_work_minutes = $7, ot_minutes = $8, ot_flagged = $9,
           ot_approved = $10, status = 'session_ended',
           total_work_hours = $13, ot_hours = $14
         WHERE employee_id = $11 AND work_date = $12
         RETURNING *`,
        [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0,
         totalMinutes, otMinutes, otFlagged, otAutoApproved ? true : null, employeeId, workDate, totalWorkHours, otHoursCalc]
      );

      let otMessage = otHours > 0 ? ` (OT: ${otHours}h)` : '';
      res.json({
        message: `Session ended! You worked ${totalHours} hours${otMessage}. You can clock in again if you have another job.`,
        action: 'clock_out_1',
        time: currentTime,
        total_hours: totalHours,
        ot_hours: otHours,
        ot_flagged: otFlagged,
        ot_approved: otAutoApproved || null,
        can_start_new_session: true,
        record: record.rows[0]
      });
    } else {
      // Mimix: This is break start
      record = await pool.query(
        `UPDATE clock_in_records SET
           clock_out_1 = $1, photo_out_1 = $2, location_out_1 = $3, address_out_1 = $4,
           face_detected_out_1 = $5, face_confidence_out_1 = $6
         WHERE employee_id = $7 AND work_date = $8
         RETURNING *`,
        [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, employeeId, workDate]
      );

      res.json({
        message: 'Break started. Enjoy your break!',
        action: 'clock_out_1',
        time: currentTime,
        record: record.rows[0]
      });
    }

  } else if (action === 'clock_in_2') {
    // AA Alive: New session start
    // Mimix: Return from break
    const isAAAlive = isAAAliveCompany(company_id);

    if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_out_1) {
      throw new ValidationError(isAAAlive ? 'You must end your first session first' : 'You must go on break first');
    }
    if (existingRecord.rows[0].clock_in_2) {
      throw new ValidationError(isAAAlive ? 'You have already started a second session' : 'You have already returned from break');
    }

    // Upload photo to Cloudinary
    const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_in_2');

    record = await pool.query(
      `UPDATE clock_in_records SET
         clock_in_2 = $1, photo_in_2 = $2, location_in_2 = $3, address_in_2 = $4,
         face_detected_in_2 = $5, face_confidence_in_2 = $6,
         status = 'in_progress'
       WHERE employee_id = $7 AND work_date = $8
       RETURNING *`,
      [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, employeeId, workDate]
    );

    res.json({
      message: isAAAlive ? 'New session started! Good luck with your work.' : 'Welcome back! Break ended.',
      action: 'clock_in_2',
      time: currentTime,
      is_new_session: isAAAlive,
      record: record.rows[0]
    });

  } else if (action === 'clock_out_2') {
    // End of day / End of second session
    const isAAAlive = isAAAliveCompany(company_id);

    if (existingRecord.rows.length === 0 || !existingRecord.rows[0].clock_in_1) {
      throw new ValidationError('You must clock in first');
    }
    if (existingRecord.rows[0].clock_out_2) {
      throw new ValidationError('You have already clocked out for the day');
    }
    // AA Alive: Must have started second session (clock_in_2) before ending it
    // Mimix: Can clock out after break return (clock_in_2) OR directly after clock_in_1 (no break)
    if (isAAAlive && !existingRecord.rows[0].clock_in_2) {
      throw new ValidationError('You must start a second session (clock in again) before clocking out. If you only worked one session, your day is already complete.');
    }

    // Get employee work_type and employment_type for hours calculation
    const empWorkTypeResult = await pool.query(
      'SELECT work_type, employment_type FROM employees WHERE id = $1',
      [employeeId]
    );
    const workType = empWorkTypeResult.rows[0]?.work_type || 'full_time';
    const employmentType = empWorkTypeResult.rows[0]?.employment_type || 'confirmed';
    const isPartTime = workType === 'part_time' || employmentType === 'part_time';

    // Upload photo to Cloudinary
    let photoUrl;
    try {
      photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_out_2');
    } catch (uploadErr) {
      console.error('Clock-out photo upload failed:', uploadErr.message);
      throw new ValidationError('Failed to upload clock-out photo. Please try again.');
    }

    // Calculate work time
    const updatedRecord = {
      ...existingRecord.rows[0],
      clock_out_2: currentTime
    };
    let { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord, company_id);

    // Apply work type rules for normal clock-out
    // Full Time: Calculate actual hours, OT after 8.5 hrs (510 minutes)
    // Part Time: Calculate actual hours, no OT flagging - salary based on working hours only
    let otFlagged = false;

    if (!isPartTime) {
      // Full Time: OT after 8.5 hours
      otFlagged = otMinutes > 0;
    } else {
      // Part Time: No OT flagging, no OT approval needed - just count actual hours for salary
      otFlagged = false;
      otMinutes = 0; // Part-time has no OT
    }

    // Auto-approve OT if company doesn't require approval (configurable per company)
    const otRequiresApprovalForClockout = await getOTApprovalSetting(company_id);
    const otAutoApproved = otFlagged && !otRequiresApprovalForClockout;

    // Calculate hours in JavaScript to avoid PostgreSQL type inference issues
    const totalWorkHours = Math.round(totalMinutes / 6) / 10;  // Round to 1 decimal
    const otHoursCalc = Math.round(otMinutes / 6) / 10;  // Round to 1 decimal

    try {
      record = await pool.query(
        `UPDATE clock_in_records SET
           clock_out_2 = $1, photo_out_2 = $2, location_out_2 = $3, address_out_2 = $4,
           face_detected_out_2 = $5, face_confidence_out_2 = $6,
           total_work_minutes = $7, ot_minutes = $8, ot_flagged = $9,
           ot_approved = $14, status = 'completed',
           total_work_hours = $12, ot_hours = $13
         WHERE employee_id = $10 AND work_date = $11
         RETURNING *`,
        [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, totalMinutes, otMinutes, otFlagged, employeeId, workDate, totalWorkHours, otHoursCalc, otAutoApproved ? true : null]
      );
    } catch (dbErr) {
      console.error('Clock-out database update failed:', {
        error: dbErr.message,
        code: dbErr.code,
        employeeId,
        workDate,
        totalMinutes,
        otMinutes
      });
      throw dbErr;
    }

    // If OT flagged and company requires approval, create notification for supervisor
    if (otFlagged && otRequiresApprovalForClockout) {
      // Find supervisor for this outlet
      const supervisorResult = await pool.query(
        `SELECT id FROM employees
         WHERE outlet_id = $1 AND employee_role = 'supervisor' AND status = 'active'
         LIMIT 1`,
        [outlet_id]
      );

      if (supervisorResult.rows.length > 0) {
        const supervisorId = supervisorResult.rows[0].id;
        await pool.query(
          `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
           VALUES ($1, 'ot_approval', 'OT Approval Required', $2, 'clock_in_record', $3)`,
          [supervisorId, `${req.employee.name} has ${otHours} hours of overtime on ${workDate}`, record.rows[0].id]
        );
      }
    }

    // Build response message based on company
    let otMessage = '';
    if (otHours > 0) {
      otMessage = otAutoApproved ? ` (OT: ${otHours}h)` : ` (OT: ${otHours}h pending approval)`;
    }

    res.json({
      message: `Day complete! You worked ${totalHours} hours${otMessage}.`,
      action: 'clock_out_2',
      time: currentTime,
      total_hours: totalHours,
      ot_hours: otHours,
      ot_flagged: otFlagged,
      ot_approved: otAutoApproved || null,
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

  // Schedule check for outlet-based companies with wrong shift detection
  let hasSchedule = false;
  let scheduleId = null;
  let attendanceStatus = 'present';
  let wrongShiftReason = null;

  if (grouping_type === 'outlet') {
    const scheduleResult = await pool.query(
      `SELECT * FROM schedules
       WHERE employee_id = $1 AND schedule_date = $2 AND status = 'scheduled'`,
      [employeeId, today]
    );

    if (scheduleResult.rows.length > 0) {
      const schedule = scheduleResult.rows[0];
      hasSchedule = true;
      scheduleId = schedule.id;

      // Check if clocking in for wrong shift
      const wrongShiftCheck = checkWrongShift(schedule.shift_start, currentTime, 120);
      if (wrongShiftCheck.isWrongShift) {
        attendanceStatus = 'wrong_shift';
        wrongShiftReason = wrongShiftCheck.reason;
      } else {
        attendanceStatus = 'present';
      }
    } else {
      hasSchedule = false;
      scheduleId = null;
      attendanceStatus = 'no_schedule';
    }
  }

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

  // Determine record status based on attendance
  const recordStatus = attendanceStatus === 'wrong_shift' ? 'absent' : 'in_progress';

  const record = await pool.query(
    `INSERT INTO clock_in_records
     (employee_id, company_id, outlet_id, work_date,
      clock_in_1, photo_in_1, location_in_1, address_in_1, face_detected_in_1, face_confidence_in_1,
      has_schedule, schedule_id, attendance_status, wrong_shift_reason,
      status, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       clock_in_1 = EXCLUDED.clock_in_1,
       photo_in_1 = EXCLUDED.photo_in_1,
       location_in_1 = EXCLUDED.location_in_1,
       address_in_1 = EXCLUDED.address_in_1,
       face_detected_in_1 = EXCLUDED.face_detected_in_1,
       face_confidence_in_1 = EXCLUDED.face_confidence_in_1,
       has_schedule = EXCLUDED.has_schedule,
       schedule_id = EXCLUDED.schedule_id,
       attendance_status = EXCLUDED.attendance_status,
       wrong_shift_reason = EXCLUDED.wrong_shift_reason,
       status = EXCLUDED.status
     RETURNING *`,
    [employeeId, company_id, outlet_id, today, currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, hasSchedule, scheduleId, attendanceStatus, wrongShiftReason, recordStatus]
  );

  // Different response based on attendance status
  if (attendanceStatus === 'wrong_shift') {
    res.json({
      message: 'Warning: You clocked in for the WRONG SHIFT. This will be marked as ABSENT.',
      warning: wrongShiftReason,
      attendance_status: 'wrong_shift',
      record: record.rows[0]
    });
  } else {
    res.json({
      message: 'Clock-in successful',
      attendance_status: attendanceStatus,
      record: record.rows[0]
    });
  }
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

  // Get company_id, work_type, and employment_type for Cloudinary folder and hours calculation
  const empResult = await pool.query(
    'SELECT company_id, work_type, employment_type FROM employees WHERE id = $1',
    [employeeId]
  );
  const company_id = empResult.rows[0]?.company_id || 0;
  const workType = empResult.rows[0]?.work_type || 'full_time';
  const employmentType = empResult.rows[0]?.employment_type || 'confirmed';
  const isPartTime = workType === 'part_time' || employmentType === 'part_time';

  const locationStr = `${latitude},${longitude}`;

  // Upload photo to Cloudinary
  const photoUrl = await uploadAttendance(photo_base64, company_id, employeeId, 'clock_out_2');

  // Calculate work time
  const updatedRecord = {
    ...existingRecord.rows[0],
    clock_out_2: currentTime
  };
  let { totalMinutes, otMinutes, totalHours, otHours } = calculateWorkTime(updatedRecord, company_id);

  // Apply work type rules for normal clock-out
  // Full Time: OT after 8.5 hrs, Part Time: No OT flagging - salary based on working hours only
  const otFlagged = !isPartTime && otMinutes > 0;
  if (isPartTime) otMinutes = 0; // Part-time has no OT

  // Auto-approve OT if company doesn't require approval (configurable per company)
  const otRequiresApprovalLegacy = await getOTApprovalSetting(company_id);
  const otAutoApproved = otFlagged && !otRequiresApprovalLegacy;

  // Calculate hours in JavaScript to avoid PostgreSQL type inference issues
  const totalWorkHours = Math.round(totalMinutes / 6) / 10;  // Round to 1 decimal
  const otHoursCalc = Math.round(otMinutes / 6) / 10;  // Round to 1 decimal

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
       ot_flagged = $9,
       ot_approved = $14,
       status = 'completed',
       total_work_hours = $12,
       ot_hours = $13
     WHERE employee_id = $10 AND work_date = $11
     RETURNING *`,
    [currentTime, photoUrl, locationStr, address || '', face_detected, face_confidence || 0, totalMinutes, otMinutes, otFlagged, employeeId, today, totalWorkHours, otHoursCalc, otAutoApproved ? true : null]
  );

  res.json({
    message: 'Clock-out successful',
    record: {
      ...record.rows[0],
      hours_worked: totalHours,
      ot_flagged: otFlagged,
      ot_approved: otAutoApproved || null
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

// =====================================================
// SUPERVISOR/MANAGER OT APPROVAL ENDPOINTS (Mimix only)
// =====================================================

/**
 * Get team attendance for supervisor/manager's outlets
 * Shows today's attendance for employees in managed outlets
 */
router.get('/team-attendance', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  // Only for Mimix (outlet-based companies)
  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'Team attendance is only available for outlet-based companies.' });
  }

  // Get outlets this supervisor/manager can view
  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json([]);
  }

  const { date } = req.query;
  const targetDate = date || getCurrentDate();

  // Get attendance for employees in managed outlets
  const result = await pool.query(
    `SELECT cir.*, e.name as employee_name, e.employee_id as emp_code,
            e.outlet_id, o.name as outlet_name
     FROM clock_in_records cir
     JOIN employees e ON cir.employee_id = e.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     WHERE e.outlet_id = ANY($1)
       AND cir.work_date = $2
     ORDER BY cir.clock_in_1 ASC`,
    [outletIds, targetDate]
  );

  // Add calculated hours to each record
  const records = result.rows.map(r => ({
    ...r,
    total_hours: r.total_work_minutes ? (r.total_work_minutes / 60).toFixed(2) : null,
    ot_hours: r.ot_minutes ? (r.ot_minutes / 60).toFixed(2) : null
  }));

  res.json(records);
}));

/**
 * Get pending OT approvals for supervisor/manager
 */
router.get('/pending-ot', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'OT approval is only available for outlet-based companies.' });
  }

  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json([]);
  }

  // Get approver's hierarchy level
  const approverInfoResult = await pool.query(`
    SELECT e.employee_role, e.position, p.role as position_role, p.name as position_name
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    WHERE e.id = $1
  `, [req.employee.id]);

  const approverInfo = approverInfoResult.rows[0] || {};
  const { getHierarchyLevel } = require('../../middleware/essPermissions');
  const approverLevel = getHierarchyLevel(
    approverInfo.employee_role,
    approverInfo.position || approverInfo.position_name,
    approverInfo.position_role
  );

  // Get records with OT flagged but not yet approved/rejected
  // Filter: minimum 1 hour OT (60 minutes), exclude part-time employees
  // Include employee position info for hierarchy filtering
  const result = await pool.query(
    `SELECT cir.*, e.name as employee_name, e.employee_id as emp_code,
            e.outlet_id, e.employee_role, e.position, e.id as emp_id,
            e.work_type,
            o.name as outlet_name,
            p.role as position_role, p.name as position_name
     FROM clock_in_records cir
     JOIN employees e ON cir.employee_id = e.id
     LEFT JOIN outlets o ON e.outlet_id = o.id
     LEFT JOIN positions p ON e.position_id = p.id
     WHERE e.outlet_id = ANY($1)
       AND cir.ot_flagged = TRUE
       AND cir.ot_approved IS NULL
       AND cir.ot_minutes >= 60
       AND COALESCE(e.work_type, 'full_time') != 'part_time'
      AND COALESCE(e.employment_type, 'confirmed') != 'part_time'
     ORDER BY cir.work_date DESC`,
    [outletIds]
  );

  // Filter to only include employees with LOWER hierarchy level than approver
  const records = result.rows
    .filter(r => {
      const empLevel = getHierarchyLevel(r.employee_role, r.position || r.position_name, r.position_role);
      return empLevel < approverLevel; // Only show employees at lower level
    })
    .map(r => ({
      ...r,
      total_hours: r.total_work_minutes ? (r.total_work_minutes / 60).toFixed(2) : null,
      ot_hours: r.ot_minutes ? (r.ot_minutes / 60).toFixed(2) : null
    }));

  res.json(records);
}));

/**
 * Approve OT (supervisor/manager)
 */
router.post('/:id/approve-ot', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  // Get the clock-in record with employee info
  const recordResult = await pool.query(
    `SELECT cir.*, e.outlet_id as employee_outlet_id, e.name as employee_name, e.id as emp_id
     FROM clock_in_records cir
     JOIN employees e ON cir.employee_id = e.id
     WHERE cir.id = $1`,
    [id]
  );

  if (recordResult.rows.length === 0) {
    return res.status(404).json({ error: 'Clock-in record not found' });
  }

  const record = recordResult.rows[0];

  // Verify OT is flagged and pending
  if (!record.ot_flagged) {
    return res.status(400).json({ error: 'This record has no flagged overtime' });
  }
  if (record.ot_approved !== null) {
    return res.status(400).json({ error: 'OT has already been processed' });
  }

  // Verify approver can approve for this outlet
  const canApprove = await canApproveForOutlet(approver, record.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot approve OT for employees outside your outlet' });
  }

  // Check hierarchy - approver must be higher level than the employee
  const hierarchyCheck = await canApproveBasedOnHierarchy(req.employee.id, record.emp_id);
  if (!hierarchyCheck.canApprove) {
    return res.status(403).json({ error: hierarchyCheck.reason || 'You cannot approve OT for employees at the same or higher level than you' });
  }

  // Approve OT
  await pool.query(
    `UPDATE clock_in_records
     SET ot_approved = TRUE, ot_approved_by = $1, ot_approved_at = NOW()
     WHERE id = $2`,
    [req.employee.id, id]
  );

  // Create notification for employee
  const otHours = record.ot_minutes ? (record.ot_minutes / 60).toFixed(2) : 0;
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'ot_approval', 'OT Approved', $2, 'clock_in_record', $3)`,
    [record.emp_id, `Your ${otHours} hours of overtime on ${record.work_date} has been approved.`, id]
  );

  res.json({ message: 'OT approved successfully.' });
}));

/**
 * Reject OT (supervisor/manager)
 */
router.post('/:id/reject-ot', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  // Get the clock-in record with employee info
  const recordResult = await pool.query(
    `SELECT cir.*, e.outlet_id as employee_outlet_id, e.name as employee_name, e.id as emp_id
     FROM clock_in_records cir
     JOIN employees e ON cir.employee_id = e.id
     WHERE cir.id = $1`,
    [id]
  );

  if (recordResult.rows.length === 0) {
    return res.status(404).json({ error: 'Clock-in record not found' });
  }

  const record = recordResult.rows[0];

  // Verify OT is flagged and pending
  if (!record.ot_flagged) {
    return res.status(400).json({ error: 'This record has no flagged overtime' });
  }
  if (record.ot_approved !== null) {
    return res.status(400).json({ error: 'OT has already been processed' });
  }

  // Verify approver can reject for this outlet
  const canApprove = await canApproveForOutlet(approver, record.employee_outlet_id);
  if (!canApprove) {
    return res.status(403).json({ error: 'You cannot reject OT for employees outside your outlet' });
  }

  // Check hierarchy - approver must be higher level than the employee
  const hierarchyCheck = await canApproveBasedOnHierarchy(req.employee.id, record.emp_id);
  if (!hierarchyCheck.canApprove) {
    return res.status(403).json({ error: hierarchyCheck.reason || 'You cannot reject OT for employees at the same or higher level than you' });
  }

  // Reject OT
  await pool.query(
    `UPDATE clock_in_records
     SET ot_approved = FALSE, ot_approved_by = $1, ot_approved_at = NOW(), ot_rejection_reason = $2
     WHERE id = $3`,
    [req.employee.id, reason, id]
  );

  // Create notification for employee
  const otHours = record.ot_minutes ? (record.ot_minutes / 60).toFixed(2) : 0;
  await pool.query(
    `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
     VALUES ($1, 'ot_approval', 'OT Rejected', $2, 'clock_in_record', $3)`,
    [record.emp_id, `Your ${otHours} hours of overtime on ${record.work_date} has been rejected. Reason: ${reason}`, id]
  );

  res.json({ message: 'OT rejected.' });
}));

/**
 * Get count of pending OT approvals for supervisor/manager
 */
router.get('/pending-ot-count', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor or manager
  if (!isSupervisorOrManager(req.employee)) {
    return res.json({ count: 0 });
  }

  // Get employee's full info
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.json({ count: 0 });
  }

  const outletIds = await getManagedOutlets(employee);

  if (outletIds.length === 0) {
    return res.json({ count: 0 });
  }

  // Count only records with minimum 1 hour OT, exclude part-time
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM clock_in_records cir
     JOIN employees e ON cir.employee_id = e.id
     WHERE e.outlet_id = ANY($1)
       AND cir.ot_flagged = TRUE
       AND cir.ot_approved IS NULL
       AND cir.ot_minutes >= 60
       AND COALESCE(e.work_type, 'full_time') != 'part_time'
      AND COALESCE(e.employment_type, 'confirmed') != 'part_time'`,
    [outletIds]
  );

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
