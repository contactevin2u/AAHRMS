/**
 * Audit Logging Utility
 * Records all system actions for accountability and tracking
 */

const pool = require('../db');

/**
 * Log an action to the audit trail
 *
 * @param {Object} params - Audit log parameters
 * @param {number} params.companyId - Company ID
 * @param {string} params.entityType - Type of entity (payroll_run, claim, employee, etc.)
 * @param {number} params.entityId - ID of the affected entity
 * @param {string} params.action - Action performed (create, update, approve, etc.)
 * @param {string} params.actorType - Who performed it (admin, system, employee)
 * @param {number} params.actorId - ID of the actor (null for system)
 * @param {string} params.actorName - Name of the actor
 * @param {Object} params.oldValues - Previous state
 * @param {Object} params.newValues - New state
 * @param {Object} params.changes - Summary of changes
 * @param {string} params.reason - Optional reason for the action
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - Client user agent
 * @returns {Object} Created audit log entry
 */
async function logAction({
  companyId,
  entityType,
  entityId,
  action,
  actorType = 'system',
  actorId = null,
  actorName = 'System',
  oldValues = null,
  newValues = null,
  changes = null,
  reason = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    const result = await pool.query(`
      INSERT INTO audit_logs (
        company_id, entity_type, entity_id, action,
        actor_type, actor_id, actor_name,
        old_values, new_values, changes, reason,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      companyId,
      entityType,
      entityId,
      action,
      actorType,
      actorId,
      actorName,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      changes ? JSON.stringify(changes) : null,
      reason,
      ipAddress,
      userAgent
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw - audit logging should not break the main operation
    return null;
  }
}

/**
 * Log a payroll action
 */
async function logPayrollAction(payrollRunId, action, admin, details = {}) {
  const { companyId, oldValues, newValues, changes, reason } = details;

  return logAction({
    companyId,
    entityType: 'payroll_run',
    entityId: payrollRunId,
    action,
    actorType: admin ? 'admin' : 'system',
    actorId: admin?.id || null,
    actorName: admin?.name || 'System',
    oldValues,
    newValues,
    changes,
    reason
  });
}

/**
 * Log a payroll item edit
 */
async function logPayrollItemEdit(payrollItemId, admin, oldValues, newValues, reason = null) {
  const changes = {};
  for (const key of Object.keys(newValues)) {
    if (oldValues[key] !== newValues[key]) {
      changes[key] = { from: oldValues[key], to: newValues[key] };
    }
  }

  return logAction({
    companyId: oldValues.company_id,
    entityType: 'payroll_item',
    entityId: payrollItemId,
    action: 'edit',
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.name,
    oldValues,
    newValues,
    changes,
    reason
  });
}

/**
 * Log a claim action
 */
async function logClaimAction(claimId, action, actor, details = {}) {
  const { companyId, employeeId, oldValues, newValues, reason, autoApproved } = details;

  return logAction({
    companyId,
    entityType: 'claim',
    entityId: claimId,
    action: autoApproved ? 'auto_approve' : action,
    actorType: actor ? 'admin' : 'system',
    actorId: actor?.id || null,
    actorName: actor?.name || 'System',
    oldValues,
    newValues,
    reason
  });
}

/**
 * Log an employee action
 */
async function logEmployeeAction(employeeId, action, admin, details = {}) {
  return logAction({
    companyId: details.companyId,
    entityType: 'employee',
    entityId: employeeId,
    action,
    actorType: admin ? 'admin' : 'system',
    actorId: admin?.id || null,
    actorName: admin?.name || 'System',
    oldValues: details.oldValues,
    newValues: details.newValues,
    changes: details.changes,
    reason: details.reason
  });
}

/**
 * Get audit logs for an entity
 */
async function getEntityAuditLogs(entityType, entityId, limit = 50) {
  const result = await pool.query(`
    SELECT * FROM audit_logs
    WHERE entity_type = $1 AND entity_id = $2
    ORDER BY created_at DESC
    LIMIT $3
  `, [entityType, entityId, limit]);

  return result.rows;
}

/**
 * Get recent audit logs for a company
 */
async function getCompanyAuditLogs(companyId, options = {}) {
  const { entityType, action, actorId, limit = 100, offset = 0 } = options;

  let query = `
    SELECT * FROM audit_logs
    WHERE company_id = $1
  `;
  const params = [companyId];
  let paramIndex = 2;

  if (entityType) {
    query += ` AND entity_type = $${paramIndex++}`;
    params.push(entityType);
  }

  if (action) {
    query += ` AND action = $${paramIndex++}`;
    params.push(action);
  }

  if (actorId) {
    query += ` AND actor_id = $${paramIndex++}`;
    params.push(actorId);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = {
  logAction,
  logPayrollAction,
  logPayrollItemEdit,
  logClaimAction,
  logEmployeeAction,
  getEntityAuditLogs,
  getCompanyAuditLogs
};
