/**
 * ESS Clock-in Routes
 * Handles employee attendance clock-in/out with photo and GPS
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

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

// Clock In
router.post('/in', authenticateEmployee, asyncHandler(async (req, res) => {
  const { photo_base64, latitude, longitude, location_address } = req.body;
  const employeeId = req.employee.id;

  if (!photo_base64) {
    throw new ValidationError('Photo is required for clock-in');
  }

  if (!latitude || !longitude) {
    throw new ValidationError('GPS location is required for clock-in');
  }

  // Check if already clocked in today
  const existingRecord = await pool.query(
    `SELECT id FROM clock_in_records
     WHERE employee_id = $1
     AND DATE(clock_in_time) = CURRENT_DATE
     AND status = 'clocked_in'`,
    [employeeId]
  );

  if (existingRecord.rows.length > 0) {
    throw new ValidationError('You are already clocked in for today');
  }

  // Get employee's company and outlet info
  const empResult = await pool.query(
    'SELECT company_id, outlet_id FROM employees WHERE id = $1',
    [employeeId]
  );

  if (empResult.rows.length === 0) {
    throw new ValidationError('Employee not found');
  }

  const { company_id, outlet_id } = empResult.rows[0];

  // Insert clock-in record
  const result = await pool.query(
    `INSERT INTO clock_in_records
     (employee_id, company_id, outlet_id, clock_in_time, photo_url, latitude, longitude, location_address, status)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, 'clocked_in')
     RETURNING id, clock_in_time, latitude, longitude, location_address`,
    [employeeId, company_id, outlet_id, photo_base64, latitude, longitude, location_address]
  );

  res.json({
    message: 'Clock-in successful',
    record: result.rows[0]
  });
}));

// Clock Out
router.post('/out', authenticateEmployee, asyncHandler(async (req, res) => {
  const { photo_base64, latitude, longitude, location_address } = req.body;
  const employeeId = req.employee.id;

  // Find today's clock-in record
  const existingRecord = await pool.query(
    `SELECT id, clock_in_time FROM clock_in_records
     WHERE employee_id = $1
     AND DATE(clock_in_time) = CURRENT_DATE
     AND status = 'clocked_in'
     ORDER BY clock_in_time DESC
     LIMIT 1`,
    [employeeId]
  );

  if (existingRecord.rows.length === 0) {
    throw new ValidationError('No active clock-in found for today');
  }

  const recordId = existingRecord.rows[0].id;

  // Update with clock-out time
  const result = await pool.query(
    `UPDATE clock_in_records
     SET clock_out_time = NOW(),
         status = 'clocked_out',
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, clock_in_time, clock_out_time,
               EXTRACT(EPOCH FROM (clock_out_time - clock_in_time))/3600 as hours_worked`,
    [recordId]
  );

  res.json({
    message: 'Clock-out successful',
    record: result.rows[0]
  });
}));

// Get today's status
router.get('/status', authenticateEmployee, asyncHandler(async (req, res) => {
  const employeeId = req.employee.id;

  const result = await pool.query(
    `SELECT id, clock_in_time, clock_out_time, status, latitude, longitude, location_address
     FROM clock_in_records
     WHERE employee_id = $1
     AND DATE(clock_in_time) = CURRENT_DATE
     ORDER BY clock_in_time DESC
     LIMIT 1`,
    [employeeId]
  );

  if (result.rows.length === 0) {
    return res.json({
      status: 'not_clocked_in',
      record: null
    });
  }

  res.json({
    status: result.rows[0].status,
    record: result.rows[0]
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
    `SELECT id, clock_in_time, clock_out_time, status, latitude, longitude, location_address,
            EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time))/3600 as hours_worked
     FROM clock_in_records
     WHERE employee_id = $1
     AND EXTRACT(MONTH FROM clock_in_time) = $2
     AND EXTRACT(YEAR FROM clock_in_time) = $3
     ORDER BY clock_in_time DESC`,
    [employeeId, queryMonth, queryYear]
  );

  // Calculate summary
  const totalDays = result.rows.filter(r => r.status === 'clocked_out').length;
  const totalHours = result.rows.reduce((sum, r) => sum + parseFloat(r.hours_worked || 0), 0);

  res.json({
    records: result.rows,
    summary: {
      total_days: totalDays,
      total_hours: totalHours.toFixed(2),
      pending_clockout: result.rows.filter(r => r.status === 'clocked_in').length
    }
  });
}));

module.exports = router;
