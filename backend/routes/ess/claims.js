/**
 * ESS Claims Routes
 * Handles employee expense claims
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

// Get claims history
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const { status, year } = req.query;

  let query = `
    SELECT * FROM claims
    WHERE employee_id = $1
  `;
  const params = [req.employee.id];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` AND status = $${paramCount}`;
    params.push(status);
  }

  if (year) {
    paramCount++;
    query += ` AND EXTRACT(YEAR FROM claim_date) = $${paramCount}`;
    params.push(year);
  }

  query += ' ORDER BY created_at DESC';

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Submit a claim
router.post('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const { claim_date, category, description, amount, receipt_url } = req.body;

  if (!claim_date || !category || !amount) {
    throw new ValidationError('Claim date, category, and amount are required');
  }

  const result = await pool.query(
    `INSERT INTO claims (employee_id, claim_date, category, description, amount, receipt_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [req.employee.id, claim_date, category, description, amount, receipt_url]
  );

  res.status(201).json(result.rows[0]);
}));

module.exports = router;
