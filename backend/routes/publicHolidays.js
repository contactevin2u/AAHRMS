/**
 * Public Holidays API Routes
 * Manage Malaysia public holidays with extra pay settings
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all public holidays for a company
 * GET /api/public-holidays?company_id=1&year=2025
 */
router.get('/', asyncHandler(async (req, res) => {
  const { company_id, year } = req.query;

  let query = `
    SELECT ph.*, c.name as company_name
    FROM public_holidays ph
    LEFT JOIN companies c ON ph.company_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (company_id) {
    params.push(company_id);
    query += ` AND ph.company_id = $${params.length}`;
  }

  if (year) {
    params.push(year);
    query += ` AND ph.year = $${params.length}`;
  }

  query += ' ORDER BY ph.date ASC';

  const result = await pool.query(query, params);

  res.json(result.rows);
}));

/**
 * Get public holidays grouped by year
 * GET /api/public-holidays/by-year?company_id=1
 */
router.get('/by-year', asyncHandler(async (req, res) => {
  const { company_id } = req.query;

  if (!company_id) {
    return res.status(400).json({ error: 'company_id is required' });
  }

  const result = await pool.query(`
    SELECT year, COUNT(*) as count,
           COUNT(*) FILTER (WHERE extra_pay = true) as extra_pay_count
    FROM public_holidays
    WHERE company_id = $1
    GROUP BY year
    ORDER BY year DESC
  `, [company_id]);

  res.json(result.rows);
}));

/**
 * Add a new public holiday
 * POST /api/public-holidays
 */
router.post('/', asyncHandler(async (req, res) => {
  const { company_id, name, date, description, extra_pay } = req.body;

  if (!company_id || !name || !date) {
    return res.status(400).json({ error: 'company_id, name, and date are required' });
  }

  const year = new Date(date).getFullYear();

  // Check if already exists
  const existing = await pool.query(
    'SELECT id FROM public_holidays WHERE company_id = $1 AND date = $2',
    [company_id, date]
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'Holiday already exists for this date' });
  }

  const result = await pool.query(`
    INSERT INTO public_holidays (company_id, name, date, year, description, extra_pay)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [company_id, name, date, year, description || null, extra_pay !== false]);

  res.status(201).json(result.rows[0]);
}));

/**
 * Update a public holiday
 * PUT /api/public-holidays/:id
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, date, description, extra_pay } = req.body;

  const year = date ? new Date(date).getFullYear() : null;

  const result = await pool.query(`
    UPDATE public_holidays
    SET name = COALESCE($1, name),
        date = COALESCE($2, date),
        year = COALESCE($3, year),
        description = COALESCE($4, description),
        extra_pay = COALESCE($5, extra_pay)
    WHERE id = $6
    RETURNING *
  `, [name, date, year, description, extra_pay, id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Holiday not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * Toggle extra pay for a holiday
 * PATCH /api/public-holidays/:id/toggle-extra-pay
 */
router.patch('/:id/toggle-extra-pay', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    UPDATE public_holidays
    SET extra_pay = NOT extra_pay
    WHERE id = $1
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Holiday not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * Bulk update extra pay for multiple holidays
 * PATCH /api/public-holidays/bulk-extra-pay
 */
router.patch('/bulk-extra-pay', asyncHandler(async (req, res) => {
  const { holiday_ids, extra_pay } = req.body;

  if (!Array.isArray(holiday_ids) || holiday_ids.length === 0) {
    return res.status(400).json({ error: 'holiday_ids array is required' });
  }

  const result = await pool.query(`
    UPDATE public_holidays
    SET extra_pay = $1
    WHERE id = ANY($2)
    RETURNING *
  `, [extra_pay, holiday_ids]);

  res.json({
    updated: result.rows.length,
    holidays: result.rows
  });
}));

/**
 * Delete a public holiday
 * DELETE /api/public-holidays/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM public_holidays WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Holiday not found' });
  }

  res.json({ message: 'Holiday deleted', holiday: result.rows[0] });
}));

/**
 * Import Malaysia federal holidays for a year
 * POST /api/public-holidays/import-malaysia
 */
router.post('/import-malaysia', asyncHandler(async (req, res) => {
  const { company_id, year } = req.body;

  if (!company_id || !year) {
    return res.status(400).json({ error: 'company_id and year are required' });
  }

  // Malaysia Federal Public Holidays template
  const holidayTemplates = {
    2025: [
      { date: '2025-01-01', name: 'New Year\'s Day' },
      { date: '2025-01-29', name: 'Chinese New Year' },
      { date: '2025-01-30', name: 'Chinese New Year (Day 2)' },
      { date: '2025-03-31', name: 'Hari Raya Aidilfitri' },
      { date: '2025-04-01', name: 'Hari Raya Aidilfitri (Day 2)' },
      { date: '2025-05-01', name: 'Labour Day' },
      { date: '2025-05-12', name: 'Wesak Day' },
      { date: '2025-06-02', name: 'Yang di-Pertuan Agong Birthday' },
      { date: '2025-06-07', name: 'Hari Raya Haji' },
      { date: '2025-06-27', name: 'Awal Muharram' },
      { date: '2025-08-31', name: 'Merdeka Day (National Day)' },
      { date: '2025-09-05', name: 'Maulidur Rasul' },
      { date: '2025-09-16', name: 'Malaysia Day' },
      { date: '2025-10-20', name: 'Deepavali' },
      { date: '2025-12-25', name: 'Christmas Day' },
    ],
    2026: [
      { date: '2026-01-01', name: 'New Year\'s Day' },
      { date: '2026-02-17', name: 'Chinese New Year' },
      { date: '2026-02-18', name: 'Chinese New Year (Day 2)' },
      { date: '2026-03-21', name: 'Hari Raya Aidilfitri' },
      { date: '2026-03-22', name: 'Hari Raya Aidilfitri (Day 2)' },
      { date: '2026-05-01', name: 'Labour Day' },
      { date: '2026-05-27', name: 'Hari Raya Haji' },
      { date: '2026-05-31', name: 'Wesak Day' },
      { date: '2026-06-01', name: 'Yang di-Pertuan Agong Birthday' },
      { date: '2026-06-17', name: 'Awal Muharram' },
      { date: '2026-08-25', name: 'Maulidur Rasul' },
      { date: '2026-08-31', name: 'Merdeka Day (National Day)' },
      { date: '2026-09-16', name: 'Malaysia Day' },
      { date: '2026-11-08', name: 'Deepavali' },
      { date: '2026-12-25', name: 'Christmas Day' },
    ],
  };

  const holidays = holidayTemplates[year];
  if (!holidays) {
    return res.status(400).json({ error: 'Holiday data not available for year ' + year });
  }

  let inserted = 0;
  let skipped = 0;

  for (const holiday of holidays) {
    const existing = await pool.query(
      'SELECT id FROM public_holidays WHERE company_id = $1 AND date = $2',
      [company_id, holiday.date]
    );

    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO public_holidays (company_id, name, date, year, extra_pay)
        VALUES ($1, $2, $3, $4, TRUE)
      `, [company_id, holiday.name, holiday.date, year]);
      inserted++;
    } else {
      skipped++;
    }
  }

  res.json({
    message: `Imported ${inserted} holidays for ${year}`,
    inserted,
    skipped
  });
}));

module.exports = router;
