const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter, buildCompanyFilter } = require('../middleware/tenant');
const { calculateFinalSettlement, saveFinalSettlement } = require('../utils/finalSettlement');
const { calculateDetailedLeaveEntitlement } = require('../utils/leaveProration');

/**
 * Calculate required notice period based on Malaysian Employment Act 1955
 * Section 12(2): Less than 2 years = 4 weeks, 2-5 years = 6 weeks, 5+ years = 8 weeks
 */
function calculateNoticePeriod(joinDate) {
  const join = new Date(joinDate);
  const now = new Date();
  const serviceMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  if (serviceMonths < 24) return 28;  // 4 weeks
  if (serviceMonths < 60) return 42;  // 6 weeks
  return 56;                           // 8 weeks
}

// Get all resignations
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { status, outlet_id } = req.query;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT r.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.default_basic_salary,
             e.outlet_id,
             e.join_date,
             e.last_working_day as emp_last_working_day,
             d.name as department_name,
             o.name as outlet_name,
             (SELECT COUNT(*) FROM exit_clearance ec WHERE ec.resignation_id = r.id) as clearance_total,
             (SELECT COUNT(*) FROM exit_clearance ec WHERE ec.resignation_id = r.id AND ec.is_completed = true) as clearance_done
      FROM resignations r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (companyId) {
      params.push(companyId);
      query += ` AND r.company_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }

    if (outlet_id) {
      params.push(outlet_id);
      query += ` AND e.outlet_id = $${params.length}`;
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching resignations:', error);
    res.status(500).json({ error: 'Failed to fetch resignations' });
  }
});

// Get clearance templates for a company (must be before /:id to avoid param conflict)
router.get('/clearance-templates', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req) || 1;
    const result = await pool.query(
      'SELECT * FROM exit_clearance_templates WHERE company_id = $1 ORDER BY sort_order',
      [companyId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clearance templates:', error);
    res.status(500).json({ error: 'Failed to fetch clearance templates' });
  }
});

// Get single resignation with details
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT r.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.default_basic_salary,
             e.join_date,
             e.employment_status,
             e.last_working_day as emp_last_working_day,
             d.name as department_name,
             o.name as outlet_name,
             a.name as approved_by_name
      FROM resignations r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      LEFT JOIN admin_users a ON r.approved_by = a.id
      WHERE r.id = $1
    `;
    const params = [id];

    if (companyId) {
      params.push(companyId);
      query += ` AND r.company_id = $${params.length}`;
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found' });
    }

    // Get leave balances for encashment calculation
    const currentYear = new Date().getFullYear();
    const leaveBalances = await pool.query(`
      SELECT lb.*, lt.code, lt.name as leave_type_name
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2 AND lt.is_paid = true
    `, [result.rows[0].employee_id, currentYear]);

    // Get clearance items
    const clearanceItems = await pool.query(`
      SELECT ec.*, au.name as completed_by_name
      FROM exit_clearance ec
      LEFT JOIN admin_users au ON ec.completed_by = au.id
      WHERE ec.resignation_id = $1
      ORDER BY ec.sort_order, ec.category
    `, [id]);

    res.json({
      ...result.rows[0],
      leave_balances: leaveBalances.rows,
      clearance_items: clearanceItems.rows
    });
  } catch (error) {
    console.error('Error fetching resignation:', error);
    res.status(500).json({ error: 'Failed to fetch resignation' });
  }
});

// Create resignation record
router.post('/', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { employee_id, notice_date, last_working_day, reason, remarks } = req.body;

    if (!employee_id || !notice_date || !last_working_day) {
      return res.status(400).json({ error: 'Employee, notice date, and last working day are required' });
    }

    await client.query('BEGIN');

    // Check if resignation already exists for this employee
    const existing = await client.query(
      "SELECT id FROM resignations WHERE employee_id = $1 AND status NOT IN ('cancelled', 'withdrawn', 'rejected')",
      [employee_id]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Active resignation already exists for this employee' });
    }

    // Get employee details for calculations
    const empResult = await client.query(
      'SELECT default_basic_salary, join_date, company_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];
    const basicSalary = parseFloat(emp.default_basic_salary) || 0;
    const companyId = emp.company_id;

    // Auto-calculate notice period from service length (EA 1955 rules)
    const requiredNoticeDays = calculateNoticePeriod(emp.join_date);
    const actualNoticeDays = Math.ceil((new Date(last_working_day) - new Date(notice_date)) / (1000 * 60 * 60 * 24));

    // Calculate leave encashment (Annual Leave only typically)
    const currentYear = new Date().getFullYear();
    const leaveBalance = await client.query(`
      SELECT lb.entitled_days, lb.used_days
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2 AND lt.code = 'AL'
    `, [employee_id, currentYear]);

    let encashmentDays = 0;
    let encashmentAmount = 0;

    if (leaveBalance.rows.length > 0) {
      const remaining = leaveBalance.rows[0].entitled_days - leaveBalance.rows[0].used_days;
      encashmentDays = Math.max(0, remaining);
      encashmentAmount = (basicSalary / 26) * encashmentDays;
    }

    // Create resignation record
    const result = await client.query(`
      INSERT INTO resignations (
        employee_id, company_id, notice_date, last_working_day, reason, remarks,
        leave_encashment_days, leave_encashment_amount,
        required_notice_days, actual_notice_days, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING *
    `, [employee_id, companyId, notice_date, last_working_day, reason, remarks,
        encashmentDays, encashmentAmount, requiredNoticeDays, actualNoticeDays]);

    await client.query('COMMIT');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating resignation:', error);
    res.status(500).json({ error: 'Failed to create resignation' });
  } finally {
    client.release();
  }
});

// Update resignation
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notice_date, last_working_day, reason, remarks, leave_encashment_days, leave_encashment_amount } = req.body;

    const result = await pool.query(`
      UPDATE resignations SET
        notice_date = $1, last_working_day = $2, reason = $3, remarks = $4,
        leave_encashment_days = $5, leave_encashment_amount = $6, updated_at = NOW()
      WHERE id = $7 AND status = 'pending'
      RETURNING *
    `, [notice_date, last_working_day, reason, remarks, leave_encashment_days, leave_encashment_amount, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or not pending' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating resignation:', error);
    res.status(500).json({ error: 'Failed to update resignation' });
  }
});

// =====================================================
// APPROVAL WORKFLOW
// =====================================================

// Approve resignation → status = clearing, generate clearance, update employee to notice
router.post('/:id/approve', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const adminId = req.admin.id;

    await client.query('BEGIN');

    // Get resignation
    const resignation = await client.query(
      "SELECT r.*, e.company_id, e.join_date FROM resignations r JOIN employees e ON r.employee_id = e.id WHERE r.id = $1 AND r.status = 'pending'",
      [id]
    );

    if (resignation.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resignation not found or not pending' });
    }

    const r = resignation.rows[0];

    // Update resignation to clearing status
    await client.query(`
      UPDATE resignations SET
        status = 'clearing',
        approved_by = $1,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `, [adminId, id]);

    // Update employee status to notice
    await client.query(`
      UPDATE employees SET
        employment_status = 'notice',
        last_working_day = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [r.last_working_day, r.employee_id]);

    // Generate clearance items from template
    const companyId = r.company_id;
    const templates = await client.query(
      'SELECT * FROM exit_clearance_templates WHERE company_id = $1 AND is_active = true ORDER BY sort_order',
      [companyId]
    );

    // If no company-specific templates, fall back to default company (1)
    let templateRows = templates.rows;
    if (templateRows.length === 0) {
      const defaultTemplates = await client.query(
        'SELECT * FROM exit_clearance_templates WHERE company_id = 1 AND is_active = true ORDER BY sort_order'
      );
      templateRows = defaultTemplates.rows;
    }

    for (const tmpl of templateRows) {
      await client.query(`
        INSERT INTO exit_clearance (resignation_id, employee_id, company_id, category, item_name, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, r.employee_id, companyId, tmpl.category, tmpl.item_name, tmpl.sort_order]);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Resignation approved. Exit clearance checklist generated.',
      clearance_items: templateRows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving resignation:', error);
    res.status(500).json({ error: 'Failed to approve resignation' });
  } finally {
    client.release();
  }
});

// Reject resignation
router.post('/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await pool.query(`
      UPDATE resignations SET
        status = 'rejected',
        rejection_reason = $1,
        approved_by = $2,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $3 AND status = 'pending'
      RETURNING *
    `, [rejection_reason, req.admin.id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or not pending' });
    }

    res.json({ message: 'Resignation rejected', resignation: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting resignation:', error);
    res.status(500).json({ error: 'Failed to reject resignation' });
  }
});

// Withdraw resignation (employee/admin can withdraw if still pending)
router.post('/:id/withdraw', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE resignations SET status = 'withdrawn', updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or not pending' });
    }

    res.json({ message: 'Resignation withdrawn' });
  } catch (error) {
    console.error('Error withdrawing resignation:', error);
    res.status(500).json({ error: 'Failed to withdraw resignation' });
  }
});

// =====================================================
// EXIT CLEARANCE
// =====================================================

// Get clearance items grouped by category
router.get('/:id/clearance', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const items = await pool.query(`
      SELECT ec.*, au.name as completed_by_name
      FROM exit_clearance ec
      LEFT JOIN admin_users au ON ec.completed_by = au.id
      WHERE ec.resignation_id = $1
      ORDER BY ec.sort_order, ec.category
    `, [id]);

    // Group by category
    const grouped = {};
    for (const item of items.rows) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    }

    const total = items.rows.length;
    const completed = items.rows.filter(i => i.is_completed).length;

    res.json({
      items: items.rows,
      grouped,
      total,
      completed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0
    });
  } catch (error) {
    console.error('Error fetching clearance:', error);
    res.status(500).json({ error: 'Failed to fetch clearance items' });
  }
});

// Mark clearance item done/undone
router.put('/:id/clearance/:itemId', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, itemId } = req.params;
    const { is_completed, remarks } = req.body;
    const adminId = req.admin.id;

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE exit_clearance SET
        is_completed = $1,
        completed_by = CASE WHEN $1 = true THEN $2 ELSE NULL END,
        completed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
        remarks = $3
      WHERE id = $4 AND resignation_id = $5
      RETURNING *
    `, [is_completed, adminId, remarks || null, itemId, id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Clearance item not found' });
    }

    // Check if all clearance items are now complete
    const stats = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_completed = true) as completed
      FROM exit_clearance WHERE resignation_id = $1
    `, [id]);

    const allComplete = parseInt(stats.rows[0].total) === parseInt(stats.rows[0].completed) && parseInt(stats.rows[0].total) > 0;

    // Update resignation clearance_completed flag
    await client.query(`
      UPDATE resignations SET
        clearance_completed = $1,
        clearance_completed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE id = $2
    `, [allComplete, id]);

    await client.query('COMMIT');

    res.json({
      item: result.rows[0],
      clearance_completed: allComplete,
      total: parseInt(stats.rows[0].total),
      completed: parseInt(stats.rows[0].completed)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating clearance item:', error);
    res.status(500).json({ error: 'Failed to update clearance item' });
  } finally {
    client.release();
  }
});

// (Re)generate clearance from template
router.post('/:id/clearance/generate', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const resignation = await client.query(
      'SELECT r.*, e.company_id FROM resignations r JOIN employees e ON r.employee_id = e.id WHERE r.id = $1',
      [id]
    );

    if (resignation.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resignation not found' });
    }

    const r = resignation.rows[0];

    // Delete existing clearance items
    await client.query('DELETE FROM exit_clearance WHERE resignation_id = $1', [id]);

    // Get templates
    let templates = await client.query(
      'SELECT * FROM exit_clearance_templates WHERE company_id = $1 AND is_active = true ORDER BY sort_order',
      [r.company_id || r.company_id]
    );

    let templateRows = templates.rows;
    if (templateRows.length === 0) {
      const defaultTemplates = await client.query(
        'SELECT * FROM exit_clearance_templates WHERE company_id = 1 AND is_active = true ORDER BY sort_order'
      );
      templateRows = defaultTemplates.rows;
    }

    for (const tmpl of templateRows) {
      await client.query(`
        INSERT INTO exit_clearance (resignation_id, employee_id, company_id, category, item_name, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, r.employee_id, r.company_id, tmpl.category, tmpl.item_name, tmpl.sort_order]);
    }

    // Reset clearance_completed flag
    await client.query(
      'UPDATE resignations SET clearance_completed = false, clearance_completed_at = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    res.json({ message: 'Clearance items regenerated', count: templateRows.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating clearance:', error);
    res.status(500).json({ error: 'Failed to generate clearance items' });
  } finally {
    client.release();
  }
});

// Waive notice period
router.post('/:id/waive-notice', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { waive } = req.body;
    const adminId = req.admin.id;

    const result = await pool.query(`
      UPDATE resignations SET
        notice_waived = $1,
        notice_waived_by = CASE WHEN $1 = true THEN $2 ELSE NULL END,
        updated_at = NOW()
      WHERE id = $3 AND status IN ('pending', 'clearing')
      RETURNING *
    `, [waive !== false, adminId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found or already completed' });
    }

    res.json({ message: waive !== false ? 'Notice period waived' : 'Notice waiver removed', resignation: result.rows[0] });
  } catch (error) {
    console.error('Error waiving notice:', error);
    res.status(500).json({ error: 'Failed to waive notice period' });
  }
});

// =====================================================
// EXISTING ENDPOINTS (enhanced)
// =====================================================

// Check for approved leaves after last working day (before processing)
router.get('/:id/check-leaves', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const resignation = await pool.query(
      'SELECT * FROM resignations WHERE id = $1',
      [id]
    );

    if (resignation.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found' });
    }

    const r = resignation.rows[0];

    const approvedLeaves = await pool.query(`
      SELECT lr.id, lr.start_date, lr.end_date, lr.total_days, lt.name as leave_type_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
        AND lr.status = 'approved'
        AND lr.start_date > $2
      ORDER BY lr.start_date
    `, [r.employee_id, r.last_working_day]);

    const pendingLeaves = await pool.query(`
      SELECT lr.id, lr.start_date, lr.end_date, lr.total_days, lt.name as leave_type_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
        AND lr.status = 'pending'
        AND lr.start_date > $2
      ORDER BY lr.start_date
    `, [r.employee_id, r.last_working_day]);

    const totalApprovedDays = approvedLeaves.rows.reduce((sum, l) => sum + parseFloat(l.total_days), 0);
    const totalPendingDays = pendingLeaves.rows.reduce((sum, l) => sum + parseFloat(l.total_days), 0);

    res.json({
      last_working_day: r.last_working_day,
      approved_leaves: approvedLeaves.rows,
      pending_leaves: pendingLeaves.rows,
      total_approved_days: totalApprovedDays,
      total_pending_days: totalPendingDays,
      has_leaves_to_cancel: approvedLeaves.rows.length > 0 || pendingLeaves.rows.length > 0
    });
  } catch (error) {
    console.error('Error checking leaves:', error);
    res.status(500).json({ error: 'Failed to check leaves' });
  }
});

// Process resignation (complete the exit)
// Now guards: require clearance complete (or override flag)
router.post('/:id/process', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { final_salary_amount, settlement_date, override_clearance } = req.body;

    console.log('[Resignation Process] Starting process for ID:', id);

    await client.query('BEGIN');

    // Get resignation details
    const resignation = await client.query(
      'SELECT * FROM resignations WHERE id = $1',
      [id]
    );

    if (resignation.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resignation not found' });
    }

    const r = resignation.rows[0];

    if (r.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Resignation already processed' });
    }

    // Check clearance completion (unless overridden)
    if (!override_clearance && r.status === 'clearing') {
      const clearanceStats = await client.query(`
        SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_completed = true) as completed
        FROM exit_clearance WHERE resignation_id = $1
      `, [id]);

      const total = parseInt(clearanceStats.rows[0].total);
      const completed = parseInt(clearanceStats.rows[0].completed);

      if (total > 0 && completed < total) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Exit clearance incomplete (${completed}/${total}). Complete all clearance items or use override.`,
          clearance_total: total,
          clearance_completed: completed
        });
      }
    }

    // Update resignation status
    await client.query(`
      UPDATE resignations SET
        status = 'completed',
        final_salary_amount = $1,
        settlement_status = 'completed',
        settlement_date = $2,
        processed_by = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [final_salary_amount, settlement_date || new Date(), req.admin.id, id]);

    // Update employee status and employment_status
    await client.query(`
      UPDATE employees SET
        status = 'inactive',
        employment_status = 'exited',
        resign_date = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [r.last_working_day, r.employee_id]);

    // Auto-delete future schedules (after last working day)
    const deleteSchedulesResult = await client.query(`
      DELETE FROM schedules
      WHERE employee_id = $1 AND schedule_date > $2
      RETURNING id
    `, [r.employee_id, r.last_working_day]);

    const deletedSchedulesCount = deleteSchedulesResult.rows.length;

    // Cancel any pending leave requests that start after last working day
    const cancelPendingLeaveResult = await client.query(`
      UPDATE leave_requests
      SET status = 'cancelled',
          rejection_reason = 'Auto-cancelled due to resignation',
          updated_at = NOW()
      WHERE employee_id = $1
        AND status = 'pending'
        AND start_date > $2
      RETURNING id
    `, [r.employee_id, r.last_working_day]);

    // Also cancel APPROVED leave requests that start after last working day
    const approvedLeavesToCancel = await client.query(`
      SELECT lr.id, lr.leave_type_id, lr.total_days, lr.start_date, lt.is_paid
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
        AND lr.status = 'approved'
        AND lr.start_date > $2
    `, [r.employee_id, r.last_working_day]);

    // Restore leave balance for each cancelled approved leave
    for (const leave of approvedLeavesToCancel.rows) {
      if (leave.is_paid) {
        const year = new Date(leave.start_date).getFullYear();
        await client.query(`
          UPDATE leave_balances
          SET used_days = used_days - $1, updated_at = NOW()
          WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4
        `, [leave.total_days, r.employee_id, leave.leave_type_id, year]);
      }
    }

    // Cancel the approved leaves
    const cancelApprovedLeaveResult = await client.query(`
      UPDATE leave_requests
      SET status = 'cancelled',
          rejection_reason = 'Auto-cancelled due to resignation (after last working day)',
          updated_at = NOW()
      WHERE employee_id = $1
        AND status = 'approved'
        AND start_date > $2
      RETURNING id
    `, [r.employee_id, r.last_working_day]);

    const cancelledLeaveCount = cancelPendingLeaveResult.rows.length + cancelApprovedLeaveResult.rows.length;

    await client.query('COMMIT');
    console.log('[Resignation Process] Completed successfully for employee:', r.employee_id);

    res.json({
      message: 'Resignation processed successfully. Employee status updated to exited.',
      cleanup: {
        future_schedules_deleted: deletedSchedulesCount,
        pending_leave_cancelled: cancelledLeaveCount
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing resignation:', error);
    res.status(500).json({ error: 'Failed to process resignation' });
  } finally {
    client.release();
  }
});

// Cleanup future leaves for already-processed resignations
router.post('/:id/cleanup-leaves', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const resignation = await client.query(
      'SELECT * FROM resignations WHERE id = $1',
      [id]
    );

    if (resignation.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found' });
    }

    const r = resignation.rows[0];

    await client.query('BEGIN');

    const cancelPendingResult = await client.query(`
      UPDATE leave_requests
      SET status = 'cancelled',
          rejection_reason = 'Auto-cancelled due to resignation (cleanup)',
          updated_at = NOW()
      WHERE employee_id = $1
        AND status = 'pending'
        AND start_date > $2
      RETURNING id
    `, [r.employee_id, r.last_working_day]);

    const approvedLeavesToCancel = await client.query(`
      SELECT lr.id, lr.leave_type_id, lr.total_days, lr.start_date, lt.is_paid
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
        AND lr.status = 'approved'
        AND lr.start_date > $2
    `, [r.employee_id, r.last_working_day]);

    for (const leave of approvedLeavesToCancel.rows) {
      if (leave.is_paid) {
        const year = new Date(leave.start_date).getFullYear();
        await client.query(`
          UPDATE leave_balances
          SET used_days = used_days - $1, updated_at = NOW()
          WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4
        `, [leave.total_days, r.employee_id, leave.leave_type_id, year]);
      }
    }

    const cancelApprovedResult = await client.query(`
      UPDATE leave_requests
      SET status = 'cancelled',
          rejection_reason = 'Auto-cancelled due to resignation (cleanup)',
          updated_at = NOW()
      WHERE employee_id = $1
        AND status = 'approved'
        AND start_date > $2
      RETURNING id
    `, [r.employee_id, r.last_working_day]);

    await client.query('COMMIT');

    res.json({
      message: 'Leave cleanup completed',
      cancelled: {
        pending: cancelPendingResult.rows.length,
        approved: cancelApprovedResult.rows.length
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in resignation cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup leaves' });
  } finally {
    client.release();
  }
});

// Get detailed leave entitlement for resignation
router.get('/:id/leave-entitlement', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const resignation = await pool.query(
      'SELECT r.employee_id, r.last_working_day, e.join_date, e.company_id FROM resignations r JOIN employees e ON r.employee_id = e.id WHERE r.id = $1',
      [id]
    );

    if (resignation.rows.length === 0) {
      return res.status(404).json({ error: 'Resignation not found' });
    }

    const r = resignation.rows[0];
    const referenceDate = r.last_working_day || new Date();

    const entitlement = await calculateDetailedLeaveEntitlement(
      r.employee_id,
      r.company_id,
      referenceDate,
      r.join_date
    );

    res.json(entitlement);
  } catch (error) {
    console.error('Error calculating leave entitlement:', error);
    res.status(500).json({ error: 'Failed to calculate leave entitlement' });
  }
});

// Calculate final settlement
// Returns detailed breakdown without saving
router.get('/:id/settlement', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const waiveNotice = req.query.waive_notice === 'true';

    const settlement = await calculateFinalSettlement(id, { waiveNotice });
    res.json(settlement);
  } catch (error) {
    console.error('Error calculating settlement:', error);
    if (error.message === 'Resignation not found') {
      return res.status(404).json({ error: 'Resignation not found' });
    }
    res.status(500).json({ error: 'Failed to calculate settlement' });
  }
});

// Calculate and save final settlement
router.post('/:id/settlement', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const waiveNotice = req.body.waive_notice === true;

    const settlement = await calculateFinalSettlement(id, { waiveNotice });
    const updated = await saveFinalSettlement(id, settlement);

    res.json({
      message: 'Settlement calculated and saved',
      settlement,
      resignation: updated
    });
  } catch (error) {
    console.error('Error saving settlement:', error);
    if (error.message === 'Resignation not found') {
      return res.status(404).json({ error: 'Resignation not found' });
    }
    res.status(500).json({ error: 'Failed to save settlement' });
  }
});

// Cancel resignation (revert employee to active, delete clearance items)
router.post('/:id/cancel', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const resignation = await client.query(
      "SELECT * FROM resignations WHERE id = $1 AND status IN ('pending', 'clearing')",
      [id]
    );

    if (resignation.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resignation not found or cannot be cancelled' });
    }

    const r = resignation.rows[0];

    // Cancel resignation
    await client.query(
      "UPDATE resignations SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [id]
    );

    // Revert employee status if it was changed
    await client.query(`
      UPDATE employees SET
        employment_status = 'employed',
        last_working_day = NULL,
        updated_at = NOW()
      WHERE id = $1 AND employment_status IN ('notice', 'resigned_pending')
    `, [r.employee_id]);

    // Delete clearance items
    await client.query('DELETE FROM exit_clearance WHERE resignation_id = $1', [id]);

    await client.query('COMMIT');

    res.json({ message: 'Resignation cancelled. Employee reverted to active.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling resignation:', error);
    res.status(500).json({ error: 'Failed to cancel resignation' });
  } finally {
    client.release();
  }
});

// Delete resignation
router.delete('/:id', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Delete clearance items first
    await client.query('DELETE FROM exit_clearance WHERE resignation_id = $1', [id]);

    const result = await client.query(
      "DELETE FROM resignations WHERE id = $1 AND status = 'pending' RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Resignation not found or cannot be deleted' });
    }

    await client.query('COMMIT');

    res.json({ message: 'Resignation deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting resignation:', error);
    res.status(500).json({ error: 'Failed to delete resignation' });
  } finally {
    client.release();
  }
});

// Calculate final settlement (simple version)
router.post('/calculate-settlement', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, last_working_day } = req.body;

    if (!employee_id || !last_working_day) {
      return res.status(400).json({ error: 'Employee ID and last working day are required' });
    }

    const empResult = await pool.query(
      'SELECT default_basic_salary, default_allowance FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];
    const basicSalary = parseFloat(emp.default_basic_salary) || 0;
    const allowance = parseFloat(emp.default_allowance) || 0;

    const lastDay = new Date(last_working_day);
    const daysWorked = lastDay.getDate();
    const daysInMonth = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0).getDate();
    const proRatedSalary = ((basicSalary + allowance) / daysInMonth) * daysWorked;

    const currentYear = lastDay.getFullYear();
    const leaveBalance = await pool.query(`
      SELECT lb.entitled_days, lb.used_days
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2 AND lt.code = 'AL'
    `, [employee_id, currentYear]);

    let encashmentDays = 0;
    let encashmentAmount = 0;

    if (leaveBalance.rows.length > 0) {
      const remaining = leaveBalance.rows[0].entitled_days - leaveBalance.rows[0].used_days;
      encashmentDays = Math.max(0, remaining);
      encashmentAmount = (basicSalary / 26) * encashmentDays;
    }

    const claims = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM claims
      WHERE employee_id = $1 AND status = 'approved' AND linked_payroll_item_id IS NULL
    `, [employee_id]);

    const pendingClaims = parseFloat(claims.rows[0].total) || 0;

    res.json({
      basic_salary: basicSalary,
      allowance: allowance,
      days_worked: daysWorked,
      days_in_month: daysInMonth,
      pro_rated_salary: Math.round(proRatedSalary * 100) / 100,
      leave_encashment_days: encashmentDays,
      leave_encashment_amount: Math.round(encashmentAmount * 100) / 100,
      pending_claims: pendingClaims,
      total_final_settlement: Math.round((proRatedSalary + encashmentAmount + pendingClaims) * 100) / 100
    });
  } catch (error) {
    console.error('Error calculating settlement:', error);
    res.status(500).json({ error: 'Failed to calculate settlement' });
  }
});

module.exports = router;
