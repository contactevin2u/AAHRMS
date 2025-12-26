/**
 * Automation API Routes
 * Endpoints for payroll automation, claims auto-approval, and scheduled tasks
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Import automation utilities
const {
  getAutomationConfig,
  autoGeneratePayroll,
  canAutoApprove,
  autoApprovePayroll,
  markPayrollEdited,
  manualApprovePayroll,
  lockPayroll,
  runScheduledPayrollGeneration
} = require('../utils/payrollAutomation');

const {
  processClaimAutoApproval,
  getCompanyClaimTypes,
  getPendingClaimsSummary
} = require('../utils/claimsAutomation');

const {
  getUpcomingProbationEndings,
  getOverdueProbationReviews,
  completeProbationReview,
  getProbationSummary
} = require('../utils/probationReminder');

const {
  runDailyTasks,
  runMonthlyPayrollGeneration,
  runProbationReminders,
  getTaskHistory
} = require('../utils/scheduler');

const { getEntityAuditLogs, getCompanyAuditLogs } = require('../utils/auditLog');

// =====================================================
// AUTOMATION CONFIG ENDPOINTS
// =====================================================

// Get company automation config
router.get('/config', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const config = await getAutomationConfig(companyId);
    res.json(config);
  } catch (error) {
    console.error('Error fetching automation config:', error);
    res.status(500).json({ error: 'Failed to fetch automation config' });
  }
});

// Update company automation config
router.put('/config', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const {
      payroll_auto_generate,
      payroll_auto_generate_day,
      payroll_auto_approve,
      payroll_variance_threshold,
      payroll_lock_after_days,
      claims_auto_approve,
      claims_auto_approve_max_amount,
      claims_require_receipt_above,
      probation_reminder_enabled,
      probation_reminder_days_before
    } = req.body;

    const result = await pool.query(`
      INSERT INTO automation_configs (
        company_id, payroll_auto_generate, payroll_auto_generate_day,
        payroll_auto_approve, payroll_variance_threshold, payroll_lock_after_days,
        claims_auto_approve, claims_auto_approve_max_amount, claims_require_receipt_above,
        probation_reminder_enabled, probation_reminder_days_before
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (company_id) DO UPDATE SET
        payroll_auto_generate = COALESCE($2, automation_configs.payroll_auto_generate),
        payroll_auto_generate_day = COALESCE($3, automation_configs.payroll_auto_generate_day),
        payroll_auto_approve = COALESCE($4, automation_configs.payroll_auto_approve),
        payroll_variance_threshold = COALESCE($5, automation_configs.payroll_variance_threshold),
        payroll_lock_after_days = COALESCE($6, automation_configs.payroll_lock_after_days),
        claims_auto_approve = COALESCE($7, automation_configs.claims_auto_approve),
        claims_auto_approve_max_amount = COALESCE($8, automation_configs.claims_auto_approve_max_amount),
        claims_require_receipt_above = COALESCE($9, automation_configs.claims_require_receipt_above),
        probation_reminder_enabled = COALESCE($10, automation_configs.probation_reminder_enabled),
        probation_reminder_days_before = COALESCE($11, automation_configs.probation_reminder_days_before),
        updated_at = NOW()
      RETURNING *
    `, [
      companyId, payroll_auto_generate, payroll_auto_generate_day,
      payroll_auto_approve, payroll_variance_threshold, payroll_lock_after_days,
      claims_auto_approve, claims_auto_approve_max_amount, claims_require_receipt_above,
      probation_reminder_enabled, probation_reminder_days_before
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating automation config:', error);
    res.status(500).json({ error: 'Failed to update automation config' });
  }
});

// =====================================================
// PAYROLL AUTOMATION ENDPOINTS
// =====================================================

// Manually trigger payroll generation
router.post('/payroll/generate', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const { department_id, month, year } = req.body;

    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const result = await autoGeneratePayroll(companyId, department_id || null, targetMonth, targetYear);
    res.json(result);
  } catch (error) {
    console.error('Error generating payroll:', error);
    res.status(500).json({ error: 'Failed to generate payroll' });
  }
});

// Check if payroll can be auto-approved
router.get('/payroll/:id/can-auto-approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await canAutoApprove(id);
    res.json(result);
  } catch (error) {
    console.error('Error checking auto-approve:', error);
    res.status(500).json({ error: 'Failed to check auto-approve eligibility' });
  }
});

// Auto-approve a payroll run
router.post('/payroll/:id/auto-approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await autoApprovePayroll(id);
    res.json(result);
  } catch (error) {
    console.error('Error auto-approving payroll:', error);
    res.status(500).json({ error: 'Failed to auto-approve payroll' });
  }
});

// Mark payroll as edited (when admin modifies auto-approved run)
router.post('/payroll/:id/mark-edited', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await markPayrollEdited(id, req.admin.id, reason);
    res.json(result);
  } catch (error) {
    console.error('Error marking payroll edited:', error);
    res.status(500).json({ error: 'Failed to mark payroll as edited' });
  }
});

// Manually approve a payroll run
router.post('/payroll/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await manualApprovePayroll(id, req.admin.id);
    res.json(result);
  } catch (error) {
    console.error('Error approving payroll:', error);
    res.status(500).json({ error: 'Failed to approve payroll' });
  }
});

// Lock a payroll run
router.post('/payroll/:id/lock', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await lockPayroll(id, req.admin.id);
    res.json(result);
  } catch (error) {
    console.error('Error locking payroll:', error);
    res.status(500).json({ error: 'Failed to lock payroll' });
  }
});

// =====================================================
// CLAIMS AUTOMATION ENDPOINTS
// =====================================================

// Get claim types for company
router.get('/claim-types', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const types = await getCompanyClaimTypes(companyId);
    res.json(types);
  } catch (error) {
    console.error('Error fetching claim types:', error);
    res.status(500).json({ error: 'Failed to fetch claim types' });
  }
});

// Create/update claim type
router.post('/claim-types', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const {
      id, code, name, description,
      auto_approve_enabled, auto_approve_max_amount,
      require_receipt, max_per_claim, max_per_month, max_per_year
    } = req.body;

    let result;
    if (id) {
      result = await pool.query(`
        UPDATE claim_types SET
          code = $2, name = $3, description = $4,
          auto_approve_enabled = $5, auto_approve_max_amount = $6,
          require_receipt = $7, max_per_claim = $8, max_per_month = $9, max_per_year = $10,
          updated_at = NOW()
        WHERE id = $1 AND company_id = $11
        RETURNING *
      `, [id, code, name, description, auto_approve_enabled, auto_approve_max_amount,
          require_receipt, max_per_claim, max_per_month, max_per_year, companyId]);
    } else {
      result = await pool.query(`
        INSERT INTO claim_types (
          company_id, code, name, description,
          auto_approve_enabled, auto_approve_max_amount,
          require_receipt, max_per_claim, max_per_month, max_per_year
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [companyId, code, name, description, auto_approve_enabled, auto_approve_max_amount,
          require_receipt, max_per_claim, max_per_month, max_per_year]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving claim type:', error);
    res.status(500).json({ error: 'Failed to save claim type' });
  }
});

// Get pending claims summary
router.get('/claims/pending-summary', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const summary = await getPendingClaimsSummary(companyId);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching pending claims summary:', error);
    res.status(500).json({ error: 'Failed to fetch pending claims summary' });
  }
});

// Process claim for auto-approval
router.post('/claims/:id/process-auto', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await processClaimAutoApproval(id);
    res.json(result);
  } catch (error) {
    console.error('Error processing claim auto-approval:', error);
    res.status(500).json({ error: 'Failed to process claim auto-approval' });
  }
});

// =====================================================
// PROBATION ENDPOINTS
// =====================================================

// Get probation summary
router.get('/probation/summary', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const summary = await getProbationSummary(companyId);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching probation summary:', error);
    res.status(500).json({ error: 'Failed to fetch probation summary' });
  }
});

// Get upcoming probation endings
router.get('/probation/upcoming', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const daysAhead = parseInt(req.query.days) || 30;
    const upcoming = await getUpcomingProbationEndings(companyId, daysAhead);
    res.json(upcoming);
  } catch (error) {
    console.error('Error fetching upcoming probations:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming probations' });
  }
});

// Get overdue probation reviews
router.get('/probation/overdue', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const overdue = await getOverdueProbationReviews(companyId);
    res.json(overdue);
  } catch (error) {
    console.error('Error fetching overdue probations:', error);
    res.status(500).json({ error: 'Failed to fetch overdue probations' });
  }
});

// Complete probation review
router.post('/probation/:employeeId/review', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { outcome, notes, newEndDate } = req.body;

    if (!['confirmed', 'extended', 'terminated'].includes(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome. Must be confirmed, extended, or terminated.' });
    }

    const result = await completeProbationReview(
      parseInt(employeeId),
      outcome,
      req.admin.id,
      { notes, newEndDate }
    );

    res.json(result);
  } catch (error) {
    console.error('Error completing probation review:', error);
    res.status(500).json({ error: 'Failed to complete probation review' });
  }
});

// =====================================================
// SCHEDULER ENDPOINTS
// =====================================================

// Run daily tasks manually
router.post('/scheduler/run-daily', authenticateAdmin, async (req, res) => {
  try {
    // Only super_admin can trigger scheduler
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can trigger scheduler' });
    }

    const result = await runDailyTasks();
    res.json(result);
  } catch (error) {
    console.error('Error running daily tasks:', error);
    res.status(500).json({ error: 'Failed to run daily tasks' });
  }
});

// Run payroll generation manually
router.post('/scheduler/run-payroll-generation', authenticateAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can trigger scheduler' });
    }

    const result = await runMonthlyPayrollGeneration();
    res.json(result);
  } catch (error) {
    console.error('Error running payroll generation:', error);
    res.status(500).json({ error: 'Failed to run payroll generation' });
  }
});

// Run probation reminders manually
router.post('/scheduler/run-probation-reminders', authenticateAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can trigger scheduler' });
    }

    const result = await runProbationReminders();
    res.json(result);
  } catch (error) {
    console.error('Error running probation reminders:', error);
    res.status(500).json({ error: 'Failed to run probation reminders' });
  }
});

// Get task history
router.get('/scheduler/history', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await getTaskHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching task history:', error);
    res.status(500).json({ error: 'Failed to fetch task history' });
  }
});

// =====================================================
// AUDIT LOG ENDPOINTS
// =====================================================

// Get audit logs for an entity
router.get('/audit-logs/:entityType/:entityId', authenticateAdmin, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const logs = await getEntityAuditLogs(entityType, parseInt(entityId), limit);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching entity audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get company audit logs
router.get('/audit-logs', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.admin.company_id;
    const { entityType, action, limit, offset } = req.query;

    const logs = await getCompanyAuditLogs(companyId, {
      entityType,
      action,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching company audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
