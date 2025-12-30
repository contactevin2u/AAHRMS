/**
 * ESS Claims Routes
 * Handles employee expense claims
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const { uploadClaim } = require('../../utils/cloudinaryStorage');

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
  const { claim_date, category, description, amount, receipt_url, receipt_base64 } = req.body;

  if (!claim_date || !category || !amount) {
    throw new ValidationError('Claim date, category, and amount are required');
  }

  // Get employee's company_id for Cloudinary folder organization
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const companyId = empResult.rows[0]?.company_id || 0;

  let finalReceiptUrl = receipt_url || null;

  // Check if receipt is base64 data and upload to Cloudinary
  if (receipt_base64 && receipt_base64.startsWith('data:')) {
    const timestamp = Date.now();
    finalReceiptUrl = await uploadClaim(receipt_base64, companyId, req.employee.id, timestamp);
  } else if (receipt_url && receipt_url.startsWith('data:')) {
    // Legacy: receipt_url might contain base64 data
    const timestamp = Date.now();
    finalReceiptUrl = await uploadClaim(receipt_url, companyId, req.employee.id, timestamp);
  }

  const result = await pool.query(
    `INSERT INTO claims (employee_id, claim_date, category, description, amount, receipt_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [req.employee.id, claim_date, category, description, amount, finalReceiptUrl]
  );

  res.status(201).json(result.rows[0]);
}));

module.exports = router;
