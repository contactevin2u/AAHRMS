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
const { verifyReceipt, generateReceiptHash, extractReceiptData } = require('../../utils/receiptAI');
const { getEmployeeMealAllowance } = require('../../utils/claimsAutomation');

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

// =====================================================
// AI RECEIPT VERIFICATION
// =====================================================

// Verify receipt before submission (AI-powered)
// NOTE: AI verification is only enabled for AA Alive (company_id = 1)
router.post('/verify-receipt', authenticateEmployee, asyncHandler(async (req, res) => {
  const { receipt_base64, amount } = req.body;

  if (!receipt_base64) {
    throw new ValidationError('Receipt image is required');
  }

  if (!amount || isNaN(parseFloat(amount))) {
    throw new ValidationError('Valid amount is required');
  }

  // Get employee's company_id
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const companyId = empResult.rows[0]?.company_id;

  if (!companyId) {
    throw new ValidationError('Employee company not found');
  }

  // AI verification is only enabled for AA Alive (company_id = 1)
  // For other companies (e.g., Mimix), skip AI and require manual approval
  if (companyId !== 1) {
    return res.json({
      success: true,
      verification: {
        canAutoApprove: false,
        requiresManualApproval: true,
        isRejected: false,
        rejectionReason: null,
        amountMatch: true,
        amountDifference: null,
        warnings: [],
        duplicateInfo: null,
        aiData: null,
        aiDisabled: true,
        message: 'AI verification not enabled for this company'
      }
    });
  }

  // Run AI verification (AA Alive only)
  const verification = await verifyReceipt(receipt_base64, parseFloat(amount), companyId);

  res.json({
    success: true,
    verification: {
      canAutoApprove: verification.canAutoApprove,
      requiresManualApproval: verification.requiresManualApproval,
      isRejected: verification.isRejected,
      rejectionReason: verification.rejectionReason,
      amountMatch: verification.amountMatch,
      amountDifference: verification.amountDifference,
      warnings: verification.warnings,
      duplicateInfo: verification.duplicateInfo,
      aiData: verification.aiData ? {
        amount: verification.aiData.amount,
        merchant: verification.aiData.merchant,
        date: verification.aiData.date,
        confidence: verification.aiData.confidence
      } : null
    }
  });
}));

// Submit a claim
router.post('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const {
    claim_date,
    category,
    description,
    amount,
    receipt_url,
    receipt_base64,
    // AI verification data from frontend
    amount_mismatch_ignored,
    ai_verification
  } = req.body;

  if (!claim_date || !category || !amount) {
    throw new ValidationError('Claim date, category, and amount are required');
  }

  if (!receipt_base64 && !receipt_url) {
    throw new ValidationError('Receipt is required');
  }

  // Get employee's company_id for Cloudinary folder organization
  const empResult = await pool.query(
    'SELECT company_id FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const companyId = empResult.rows[0]?.company_id || 0;

  // Get the base64 data for AI processing
  const receiptData = receipt_base64 || receipt_url;

  // Run AI verification if not already done on frontend
  // NOTE: AI verification is only enabled for AA Alive (company_id = 1)
  let verification = ai_verification;
  if (companyId === 1 && !verification && receiptData && receiptData.startsWith('data:')) {
    verification = await verifyReceipt(receiptData, parseFloat(amount), companyId);
  }

  // Check if this is a duplicate - auto reject
  if (verification && verification.isRejected) {
    return res.status(400).json({
      error: 'Claim rejected',
      reason: verification.rejectionReason,
      duplicateInfo: verification.duplicateInfo,
      autoRejected: true
    });
  }

  // Upload receipt to Cloudinary
  let finalReceiptUrl = null;
  if (receiptData && receiptData.startsWith('data:')) {
    const timestamp = Date.now();
    finalReceiptUrl = await uploadClaim(receiptData, companyId, req.employee.id, timestamp);
  }

  // Determine claim status based on AI verification or outstation meal allowance
  let claimStatus = 'pending';
  let autoApproved = false;
  let approvedAt = null;
  let autoApprovalReason = null;

  // Check for outstation meal allowance (RM20/day policy)
  const upperCategory = (category || '').toUpperCase();
  if (upperCategory === 'MEAL' || upperCategory === 'FOOD' || upperCategory === 'MAKAN') {
    const mealAllowance = await getEmployeeMealAllowance(req.employee.id);
    if (mealAllowance && parseFloat(amount) <= parseFloat(mealAllowance)) {
      claimStatus = 'approved';
      autoApproved = true;
      approvedAt = new Date();
      autoApprovalReason = `Outstation meal allowance: RM${amount} within RM${mealAllowance} limit`;
    }
  }

  // If not already auto-approved by meal allowance, check AI verification (AA Alive only)
  if (!autoApproved && companyId === 1 && verification && verification.canAutoApprove && !amount_mismatch_ignored) {
    claimStatus = 'approved';
    autoApproved = true;
    approvedAt = new Date();
    autoApprovalReason = 'AI verification passed';
  }

  // Insert claim with AI data
  const result = await pool.query(
    `INSERT INTO claims (
      employee_id, claim_date, category, description, amount, receipt_url, status,
      receipt_hash, ai_extracted_amount, ai_extracted_merchant, ai_extracted_date,
      ai_confidence, amount_mismatch_ignored, auto_approved, approved_at, auto_approval_reason
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      req.employee.id,
      claim_date,
      category,
      description,
      amount,
      finalReceiptUrl,
      claimStatus,
      verification?.receiptHash || null,
      verification?.aiData?.amount || null,
      verification?.aiData?.merchant || null,
      verification?.aiData?.date || null,
      verification?.aiData?.confidence || null,
      amount_mismatch_ignored || false,
      autoApproved,
      approvedAt,
      autoApprovalReason
    ]
  );

  const claim = result.rows[0];

  res.status(201).json({
    ...claim,
    autoApproved,
    autoApprovalReason,
    verificationResult: verification ? {
      amountMatch: verification.amountMatch,
      warnings: verification.warnings,
      aiData: verification.aiData
    } : null
  });
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
