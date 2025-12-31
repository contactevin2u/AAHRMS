/**
 * ESS Claims Routes
 * Handles employee expense claims with supervisor approval
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const { uploadClaim } = require('../../utils/cloudinaryStorage');
const { isSupervisorOrManager, canApproveForEmployee } = require('../../middleware/essPermissions');

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

// =====================================================
// TEAM CLAIMS (Supervisor/Manager)
// =====================================================

// Get pending claims from team members
router.get('/team-pending', authenticateEmployee, asyncHandler(async (req, res) => {
  const employee = req.employee;

  // Check if supervisor/manager
  if (!isSupervisorOrManager(employee)) {
    return res.status(403).json({ error: 'Not authorized to view team claims' });
  }

  let query;
  let params;

  if (employee.employee_role === 'supervisor') {
    // Supervisor: See claims from employees in same outlet
    query = `
      SELECT c.*, e.name as employee_name, e.employee_id as emp_code,
             o.name as outlet_name, d.name as department_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE c.status = 'pending'
        AND e.outlet_id = $1
        AND e.id != $2
        AND e.company_id = $3
      ORDER BY c.created_at DESC
    `;
    params = [employee.outlet_id, employee.id, employee.company_id];
  } else if (employee.employee_role === 'manager') {
    // Manager: See claims from employees in managed outlets
    query = `
      SELECT c.*, e.name as employee_name, e.employee_id as emp_code,
             o.name as outlet_name, d.name as department_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employee_outlets eo ON eo.outlet_id = e.outlet_id AND eo.employee_id = $1
      WHERE c.status = 'pending'
        AND (e.outlet_id = $2 OR eo.employee_id IS NOT NULL)
        AND e.id != $1
        AND e.company_id = $3
      ORDER BY c.created_at DESC
    `;
    params = [employee.id, employee.outlet_id, employee.company_id];
  } else {
    // For AA Alive supervisors: See claims from employees in same department
    query = `
      SELECT c.*, e.name as employee_name, e.employee_id as emp_code,
             d.name as department_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE c.status = 'pending'
        AND e.department_id = $1
        AND e.id != $2
        AND e.company_id = $3
      ORDER BY c.created_at DESC
    `;
    params = [employee.department_id, employee.id, employee.company_id];
  }

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Approve a claim (supervisor/manager)
router.post('/:id/supervisor-approve', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;
  const employee = req.employee;

  // Check if supervisor/manager
  if (!isSupervisorOrManager(employee)) {
    return res.status(403).json({ error: 'Not authorized to approve claims' });
  }

  // Get the claim
  const claimResult = await pool.query(
    `SELECT c.*, e.outlet_id, e.department_id, e.company_id
     FROM claims c
     JOIN employees e ON c.employee_id = e.id
     WHERE c.id = $1`,
    [id]
  );

  if (claimResult.rows.length === 0) {
    return res.status(404).json({ error: 'Claim not found' });
  }

  const claim = claimResult.rows[0];

  // Verify claim is pending
  if (claim.status !== 'pending') {
    return res.status(400).json({ error: 'Claim is not pending' });
  }

  // Verify supervisor can approve this employee's claim
  const canApprove = await canApproveForEmployee(employee, {
    outlet_id: claim.outlet_id,
    department_id: claim.department_id,
    company_id: claim.company_id
  });

  if (!canApprove) {
    return res.status(403).json({ error: 'Not authorized to approve this claim' });
  }

  // Update claim status
  const updateResult = await pool.query(
    `UPDATE claims SET
       status = 'approved',
       supervisor_id = $1,
       supervisor_approved = TRUE,
       supervisor_approved_at = NOW(),
       remarks = COALESCE($2, remarks),
       updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [employee.id, remarks, id]
  );

  res.json({
    message: 'Claim approved successfully',
    claim: updateResult.rows[0]
  });
}));

// Reject a claim (supervisor/manager)
router.post('/:id/supervisor-reject', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;
  const employee = req.employee;

  if (!remarks) {
    throw new ValidationError('Rejection reason is required');
  }

  // Check if supervisor/manager
  if (!isSupervisorOrManager(employee)) {
    return res.status(403).json({ error: 'Not authorized to reject claims' });
  }

  // Get the claim
  const claimResult = await pool.query(
    `SELECT c.*, e.outlet_id, e.department_id, e.company_id
     FROM claims c
     JOIN employees e ON c.employee_id = e.id
     WHERE c.id = $1`,
    [id]
  );

  if (claimResult.rows.length === 0) {
    return res.status(404).json({ error: 'Claim not found' });
  }

  const claim = claimResult.rows[0];

  // Verify claim is pending
  if (claim.status !== 'pending') {
    return res.status(400).json({ error: 'Claim is not pending' });
  }

  // Verify supervisor can approve this employee's claim
  const canApprove = await canApproveForEmployee(employee, {
    outlet_id: claim.outlet_id,
    department_id: claim.department_id,
    company_id: claim.company_id
  });

  if (!canApprove) {
    return res.status(403).json({ error: 'Not authorized to reject this claim' });
  }

  // Update claim status
  const updateResult = await pool.query(
    `UPDATE claims SET
       status = 'rejected',
       supervisor_id = $1,
       supervisor_approved = FALSE,
       supervisor_approved_at = NOW(),
       remarks = $2,
       updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [employee.id, remarks, id]
  );

  res.json({
    message: 'Claim rejected',
    claim: updateResult.rows[0]
  });
}));

module.exports = router;
