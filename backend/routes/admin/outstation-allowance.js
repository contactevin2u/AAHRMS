/**
 * OrderOps Outstation Allowance Report
 * Fetches driver shift/delivery data from OrderOps HRMS API
 * and calculates outstation allowance eligibility (RM100/day).
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../../db');

const API_BASE = process.env.ORDEROPS_API_URL || 'https://orderops-api-v1.onrender.com/_api/external/hrms';
const API_KEY = process.env.ORDEROPS_API_KEY || 'aahrms-orderops-integration-key';

const WAREHOUSES = {
  BATU_CAVES: { lat: 3.2374, lng: 101.6878 },
  KOTA_KINABALU: { lat: 5.9804, lng: 116.0735 }
};

// Defaults - can be overridden by company payroll_config per request
const DEFAULT_ALLOWANCE_PER_DAY = 100;
const DEFAULT_MIN_DISTANCE_KM = 180;
const OVERNIGHT_TOLERANCE_KM = 0.5;
const MIN_DELIVERIES_DAY2 = 3;

// Approximate state bounding boxes
const STATE_BOUNDS = {
  SELANGOR: { latMin: 2.6, latMax: 3.5, lngMin: 101.2, lngMax: 102.0 },
  NEGERI_SEMBILAN: { latMin: 2.4, latMax: 2.9, lngMin: 101.7, lngMax: 102.5 }
};

// --- Helpers ---

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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isInsideStateBounds(lat, lng) {
  for (const bounds of Object.values(STATE_BOUNDS)) {
    if (lat >= bounds.latMin && lat <= bounds.latMax &&
        lng >= bounds.lngMin && lng <= bounds.lngMax) {
      return true;
    }
  }
  return false;
}

async function fetchApi(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${endpoint}${qs ? '?' + qs : ''}`;
  const res = await httpsGet(url, { 'X-API-Key': API_KEY });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OrderOps API ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Route ---

router.get('/report', async (req, res) => {
  try {
    const { start_date, end_date, driver_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
    }

    // Read outstation config from company payroll_config (AA Alive = company 1)
    let allowancePerDay = DEFAULT_ALLOWANCE_PER_DAY;
    let minDistanceKm = DEFAULT_MIN_DISTANCE_KM;
    const companyId = req.companyId || 1;
    try {
      const cfgResult = await pool.query('SELECT payroll_config FROM companies WHERE id = $1', [companyId]);
      if (cfgResult.rows.length > 0 && cfgResult.rows[0].payroll_config) {
        const cfg = cfgResult.rows[0].payroll_config;
        if (cfg.outstation_per_day) allowancePerDay = cfg.outstation_per_day;
        if (cfg.outstation_min_distance_km) minDistanceKm = cfg.outstation_min_distance_km;
      }
    } catch (e) { /* use defaults */ }

    // Fetch shifts from OrderOps
    const shiftParams = { start_date, end_date };
    if (driver_id) shiftParams.driver_id = driver_id;

    const shiftsData = await fetchApi('/shifts', shiftParams);
    const shifts = shiftsData.shifts || shiftsData.data || shiftsData || [];

    // Group shifts by driver
    const driverShifts = {};
    for (const shift of shifts) {
      const id = shift.driver_id;
      if (!driverShifts[id]) {
        driverShifts[id] = {
          driver_id: id,
          driver_name: shift.driver_name || shift.name || `Driver ${id}`,
          base_warehouse: shift.warehouse || 'BATU_CAVES',
          shifts: []
        };
      }
      driverShifts[id].shifts.push(shift);
    }

    const eligibleDrivers = [];

    for (const driver of Object.values(driverShifts)) {
      // Sort shifts by date
      driver.shifts.sort((a, b) => (a.date || a.shift_date || '').localeCompare(b.date || b.shift_date || ''));

      const warehouse = WAREHOUSES[driver.base_warehouse] || WAREHOUSES.BATU_CAVES;
      const qualifyingDays = [];

      for (let i = 0; i < driver.shifts.length - 1; i++) {
        const day1 = driver.shifts[i];
        const day2 = driver.shifts[i + 1];

        const day1Date = day1.date || day1.shift_date;
        const day2Date = day2.date || day2.shift_date;

        // Must be consecutive days
        const d1 = new Date(day1Date);
        const d2 = new Date(day2Date);
        const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
        if (diffDays !== 1) continue;

        const day1ClockOutLat = parseFloat(day1.clock_out_lat || day1.clock_out_latitude);
        const day1ClockOutLng = parseFloat(day1.clock_out_lng || day1.clock_out_longitude);
        const day2ClockInLat = parseFloat(day2.clock_in_lat || day2.clock_in_latitude);
        const day2ClockInLng = parseFloat(day2.clock_in_lng || day2.clock_in_longitude);

        if (isNaN(day1ClockOutLat) || isNaN(day1ClockOutLng) ||
            isNaN(day2ClockInLat) || isNaN(day2ClockInLng)) continue;

        // 1. Distance check: clock_out must be >180km from warehouse
        const distKm = haversineKm(warehouse.lat, warehouse.lng, day1ClockOutLat, day1ClockOutLng);
        if (distKm < minDistanceKm) continue;

        // 2. Location check: is_outstation flag AND outside state bounds
        const day1Outstation = day1.is_outstation === true || day1.is_outstation === 'true';
        const day2Outstation = day2.is_outstation === true || day2.is_outstation === 'true';
        if (!day1Outstation || !day2Outstation) continue;
        if (isInsideStateBounds(day1ClockOutLat, day1ClockOutLng)) continue;
        if (isInsideStateBounds(day2ClockInLat, day2ClockInLng)) continue;

        // 3. Overnight check: clock_out ≈ clock_in next day (within 500m)
        const overnightDist = haversineKm(day1ClockOutLat, day1ClockOutLng, day2ClockInLat, day2ClockInLng);
        if (overnightDist > OVERNIGHT_TOLERANCE_KM) continue;

        // 4. Orders check: Day2 must have >3 successful deliveries
        let ordersDay2 = 0;
        try {
          const deliveries = await fetchApi('/deliveries', {
            driver_id: driver.driver_id,
            date: day2Date
          });
          const deliveryList = deliveries.deliveries || deliveries.data || deliveries || [];
          ordersDay2 = Array.isArray(deliveryList)
            ? deliveryList.filter(d => d.status === 'delivered' || d.status === 'completed' || d.status === 'success').length
            : 0;
        } catch (err) {
          console.error(`Failed to fetch deliveries for driver ${driver.driver_id} on ${day2Date}:`, err.message);
          continue;
        }

        if (ordersDay2 <= MIN_DELIVERIES_DAY2) continue;

        qualifyingDays.push({
          date: day1Date,
          next_date: day2Date,
          distance_km: Math.round(distKm * 10) / 10,
          clock_out_location: day1.clock_out_location || day1.location || 'Unknown',
          clock_in_location: day2.clock_in_location || day2.location || 'Unknown',
          orders_delivered_day2: ordersDay2,
          allowance: allowancePerDay
        });
      }

      if (qualifyingDays.length > 0) {
        eligibleDrivers.push({
          driver_id: driver.driver_id,
          driver_name: driver.driver_name,
          base_warehouse: driver.base_warehouse,
          qualifying_days: qualifyingDays,
          total_allowance: qualifyingDays.length * allowancePerDay
        });
      }
    }

    const totalAllowance = eligibleDrivers.reduce((sum, d) => sum + d.total_allowance, 0);

    res.json({
      period: { start_date, end_date },
      eligible_drivers: eligibleDrivers,
      summary: {
        total_drivers: eligibleDrivers.length,
        total_allowance: totalAllowance
      }
    });
  } catch (err) {
    console.error('Outstation report error:', err);
    res.status(500).json({ error: 'Failed to generate outstation report', details: err.message });
  }
});

module.exports = router;
