/**
 * ESS OT Batch Approval Routes
 *
 * Provides batch OT approval/rejection functionality for supervisors and managers.
 * Supports approving or rejecting multiple OT records in a single request.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const {
  isSupervisorOrManager,
  isBossOrDirector,
  getManagedOutlets,
  isMimixCompany,
  canApproveForOutlet,
  canApproveBasedOnHierarchy,
  getHierarchyLevel
} = require('../../middleware/essPermissions');

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

/**
 * Check if employee can approve OT (supervisor, manager, boss, or director)
 */
const canApproveOT = (employee) => {
  return isSupervisorOrManager(employee) || isBossOrDirector(employee);
};

/**
 * GET /api/ess/ot-approvals/pending
 * Get all pending OT records for supervisor's outlets with enhanced filtering
 */
router.get('/pending', authenticateEmployee, asyncHandler(async (req, res) => {
  // Check if user is supervisor, manager, boss, or director
  if (!canApproveOT(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor, Manager, or Director role required.' });
  }

  // Get employee's full info including position
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.status(403).json({ error: 'OT approval is only available for outlet-based companies.' });
  }

  // Boss/Director can see ALL outlets in the company
  let outletIds;
  if (isBossOrDirector(employee)) {
    const allOutletsResult = await pool.query(
      'SELECT id FROM outlets WHERE company_id = $1',
      [employee.company_id]
    );
    outletIds = allOutletsResult.rows.map(r => r.id);
  } else {
    outletIds = await getManagedOutlets(employee);
  }

  if (outletIds.length === 0) {
    return res.json({ records: [], summary: { total: 0, total_hours: 0 } });
  }

  // Query parameters for filtering
  const { start_date, end_date, outlet_id, employee_id } = req.query;

  // Build query with optional filters
  let query = `
    SELECT cir.*, e.name as employee_name, e.employee_id as emp_code,
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
  `;
  const params = [outletIds];
  let paramIndex = 2;

  if (start_date) {
    query += ` AND cir.work_date >= $${paramIndex}::date`;
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    query += ` AND cir.work_date <= $${paramIndex}::date`;
    params.push(end_date);
    paramIndex++;
  }

  if (outlet_id) {
    query += ` AND e.outlet_id = $${paramIndex}`;
    params.push(parseInt(outlet_id));
    paramIndex++;
  }

  if (employee_id) {
    query += ` AND e.id = $${paramIndex}`;
    params.push(parseInt(employee_id));
    paramIndex++;
  }

  query += ' ORDER BY cir.work_date DESC';

  const result = await pool.query(query, params);

  // Get approver's hierarchy level
  const approverInfoResult = await pool.query(`
    SELECT e.employee_role, e.position, p.role as position_role, p.name as position_name
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    WHERE e.id = $1
  `, [req.employee.id]);

  const approverInfo = approverInfoResult.rows[0] || {};
  const approverLevel = getHierarchyLevel(
    approverInfo.employee_role,
    approverInfo.position || approverInfo.position_name,
    approverInfo.position_role
  );

  // Filter to only include employees with LOWER hierarchy level than approver
  const records = result.rows
    .filter(r => {
      const empLevel = getHierarchyLevel(r.employee_role, r.position || r.position_name, r.position_role);
      return empLevel < approverLevel;
    })
    .map(r => ({
      ...r,
      total_hours: r.total_work_minutes ? (r.total_work_minutes / 60).toFixed(2) : null,
      ot_hours: r.ot_minutes ? (r.ot_minutes / 60).toFixed(2) : null
    }));

  // Calculate summary
  const totalOtMinutes = records.reduce((sum, r) => sum + (r.ot_minutes || 0), 0);

  res.json({
    records,
    summary: {
      total: records.length,
      total_hours: (totalOtMinutes / 60).toFixed(2)
    }
  });
}));

/**
 * POST /api/ess/ot-approvals/batch
 * Approve or reject multiple OT records at once
 *
 * Request body:
 * {
 *   record_ids: [1, 2, 3],
 *   action: 'approve' | 'reject',
 *   reason?: string  // Required for rejection
 * }
 */
router.post('/batch', authenticateEmployee, asyncHandler(async (req, res) => {
  const { record_ids, action, reason } = req.body;

  // Validate input
  if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
    throw new ValidationError('record_ids must be a non-empty array');
  }

  if (!['approve', 'reject'].includes(action)) {
    throw new ValidationError('action must be either "approve" or "reject"');
  }

  if (action === 'reject' && !reason) {
    throw new ValidationError('reason is required when rejecting OT');
  }

  // Check if user is supervisor, manager, boss, or director
  if (!canApproveOT(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor, Manager, or Director role required.' });
  }

  // Get employee's full info including position
  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const approver = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(approver.company_id)) {
    return res.status(403).json({ error: 'Batch OT approval is only available for outlet-based companies.' });
  }

  // Boss/Director can approve for ALL outlets
  let outletIds;
  if (isBossOrDirector(approver)) {
    const allOutletsResult = await pool.query(
      'SELECT id FROM outlets WHERE company_id = $1',
      [approver.company_id]
    );
    outletIds = allOutletsResult.rows.map(r => r.id);
  } else {
    outletIds = await getManagedOutlets(approver);
  }

  // Get all records to process
  const recordsResult = await pool.query(`
    SELECT cir.*, e.outlet_id as employee_outlet_id, e.name as employee_name, e.id as emp_id
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    WHERE cir.id = ANY($1)
  `, [record_ids]);

  const results = {
    processed: 0,
    approved: 0,
    rejected: 0,
    skipped: [],
    errors: []
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const record of recordsResult.rows) {
      // Check if record has flagged OT and is pending
      if (!record.ot_flagged) {
        results.skipped.push({ id: record.id, reason: 'No flagged overtime' });
        continue;
      }

      if (record.ot_approved !== null) {
        results.skipped.push({ id: record.id, reason: 'Already processed' });
        continue;
      }

      // Check if approver can approve for this outlet
      // Boss/Director can approve for any outlet
      const canApprove = isBossOrDirector(approver) || await canApproveForOutlet(approver, record.employee_outlet_id);
      if (!canApprove) {
        results.skipped.push({ id: record.id, reason: 'No permission for this outlet' });
        continue;
      }

      // Check hierarchy
      const hierarchyCheck = await canApproveBasedOnHierarchy(req.employee.id, record.emp_id);
      if (!hierarchyCheck.canApprove) {
        results.skipped.push({ id: record.id, reason: hierarchyCheck.reason || 'Hierarchy restriction' });
        continue;
      }

      // Process the record
      if (action === 'approve') {
        await client.query(
          `UPDATE clock_in_records
           SET ot_approved = TRUE, ot_approved_by = $1, ot_approved_at = NOW()
           WHERE id = $2`,
          [req.employee.id, record.id]
        );
        results.approved++;

        // Create notification for employee
        const otHours = record.ot_minutes ? (record.ot_minutes / 60).toFixed(2) : 0;
        await client.query(
          `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
           VALUES ($1, 'ot_approval', 'OT Approved', $2, 'clock_in_record', $3)`,
          [record.emp_id, `Your ${otHours} hours of overtime on ${record.work_date} has been approved.`, record.id]
        );
      } else {
        await client.query(
          `UPDATE clock_in_records
           SET ot_approved = FALSE, ot_approved_by = $1, ot_approved_at = NOW(), ot_rejection_reason = $2
           WHERE id = $3`,
          [req.employee.id, reason, record.id]
        );
        results.rejected++;

        // Create notification for employee
        const otHours = record.ot_minutes ? (record.ot_minutes / 60).toFixed(2) : 0;
        await client.query(
          `INSERT INTO notifications (employee_id, type, title, message, reference_type, reference_id)
           VALUES ($1, 'ot_approval', 'OT Rejected', $2, 'clock_in_record', $3)`,
          [record.emp_id, `Your ${otHours} hours of overtime on ${record.work_date} has been rejected. Reason: ${reason}`, record.id]
        );
      }

      results.processed++;
    }

    await client.query('COMMIT');

    res.json({
      message: `Batch ${action} completed`,
      results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/ess/ot-approvals/summary
 * Get OT approval summary for the current period
 */
router.get('/summary', authenticateEmployee, asyncHandler(async (req, res) => {
  if (!canApproveOT(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor, Manager, or Director role required.' });
  }

  const empResult = await pool.query(
    'SELECT employee_role, company_id, outlet_id, position FROM employees WHERE id = $1',
    [req.employee.id]
  );
  const employee = { ...req.employee, ...empResult.rows[0] };

  if (!isMimixCompany(employee.company_id)) {
    return res.json({
      pending_count: 0,
      pending_hours: 0,
      approved_this_month: 0,
      rejected_this_month: 0
    });
  }

  // Boss/Director can see ALL outlets
  let outletIds;
  if (isBossOrDirector(employee)) {
    const allOutletsResult = await pool.query(
      'SELECT id FROM outlets WHERE company_id = $1',
      [employee.company_id]
    );
    outletIds = allOutletsResult.rows.map(r => r.id);
  } else {
    outletIds = await getManagedOutlets(employee);
  }

  if (outletIds.length === 0) {
    return res.json({
      pending_count: 0,
      pending_hours: 0,
      approved_this_month: 0,
      rejected_this_month: 0
    });
  }

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // Get pending OT count
  const pendingResult = await pool.query(`
    SELECT COUNT(*) as count, COALESCE(SUM(ot_minutes), 0) as total_minutes
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    WHERE e.outlet_id = ANY($1)
      AND cir.ot_flagged = TRUE
      AND cir.ot_approved IS NULL
      AND cir.ot_minutes >= 60
      AND COALESCE(e.work_type, 'full_time') != 'part_time'
  `, [outletIds]);

  // Get approved/rejected this month
  const thisMonthResult = await pool.query(`
    SELECT
      COUNT(CASE WHEN ot_approved = TRUE THEN 1 END) as approved_count,
      COUNT(CASE WHEN ot_approved = FALSE THEN 1 END) as rejected_count
    FROM clock_in_records cir
    JOIN employees e ON cir.employee_id = e.id
    WHERE e.outlet_id = ANY($1)
      AND cir.ot_approved IS NOT NULL
      AND EXTRACT(MONTH FROM cir.ot_approved_at) = $2
      AND EXTRACT(YEAR FROM cir.ot_approved_at) = $3
  `, [outletIds, currentMonth, currentYear]);

  res.json({
    pending_count: parseInt(pendingResult.rows[0].count),
    pending_hours: (parseInt(pendingResult.rows[0].total_minutes) / 60).toFixed(2),
    approved_this_month: parseInt(thisMonthResult.rows[0].approved_count),
    rejected_this_month: parseInt(thisMonthResult.rows[0].rejected_count)
  });
}));

module.exports = router;
