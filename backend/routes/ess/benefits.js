/**
 * ESS Benefits In Kind Routes
 * Read-only access to employee's assigned benefits
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * GET /api/ess/benefits
 * Get employee's active benefits in kind (read-only)
 */
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if feature is enabled for this company
  if (!req.features.benefitsInKind) {
    return res.status(403).json({
      error: 'Benefits in Kind feature is not available for your company'
    });
  }

  const result = await pool.query(`
    SELECT
      b.id,
      b.benefit_name,
      b.benefit_type,
      b.description,
      b.annual_value,
      b.monthly_value,
      b.assigned_date,
      b.serial_number,
      b.asset_tag,
      b.condition,
      b.status,
      b.notes,
      bt.name as type_name,
      bt.category,
      bt.taxable
    FROM benefits_in_kind b
    LEFT JOIN benefit_types bt ON b.benefit_type = bt.code
    WHERE b.employee_id = $1
      AND b.company_id = $2
      AND b.status = 'active'
    ORDER BY b.assigned_date DESC
  `, [req.employee.id, req.companyId]);

  // Calculate totals
  const benefits = result.rows;
  const annualTotal = benefits.reduce(
    (sum, b) => sum + parseFloat(b.annual_value || 0),
    0
  );
  const monthlyTotal = benefits.reduce(
    (sum, b) => sum + parseFloat(b.monthly_value || 0),
    0
  );

  // Group by taxable vs non-taxable
  const taxableBenefits = benefits.filter(b => b.taxable);
  const nonTaxableBenefits = benefits.filter(b => !b.taxable);

  res.json({
    benefits,
    summary: {
      total_active: benefits.length,
      annual_value: Math.round(annualTotal * 100) / 100,
      monthly_value: Math.round(monthlyTotal * 100) / 100,
      taxable_count: taxableBenefits.length,
      non_taxable_count: nonTaxableBenefits.length,
      taxable_annual: Math.round(
        taxableBenefits.reduce((sum, b) => sum + parseFloat(b.annual_value || 0), 0) * 100
      ) / 100
    }
  });
}));

/**
 * GET /api/ess/benefits/history
 * Get employee's benefit history (including returned benefits)
 */
router.get('/history', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if feature is enabled for this company
  if (!req.features.benefitsInKind) {
    return res.status(403).json({
      error: 'Benefits in Kind feature is not available for your company'
    });
  }

  const { year } = req.query;

  let query = `
    SELECT
      b.id,
      b.benefit_name,
      b.benefit_type,
      b.description,
      b.annual_value,
      b.monthly_value,
      b.assigned_date,
      b.return_date,
      b.serial_number,
      b.asset_tag,
      b.condition,
      b.status,
      bt.name as type_name,
      bt.category,
      bt.taxable
    FROM benefits_in_kind b
    LEFT JOIN benefit_types bt ON b.benefit_type = bt.code
    WHERE b.employee_id = $1
      AND b.company_id = $2
  `;

  const params = [req.employee.id, req.companyId];

  if (year) {
    query += ` AND EXTRACT(YEAR FROM b.assigned_date) = $3`;
    params.push(parseInt(year));
  }

  query += ` ORDER BY b.assigned_date DESC`;

  const result = await pool.query(query, params);

  res.json({
    benefits: result.rows,
    total: result.rows.length
  });
}));

module.exports = router;
