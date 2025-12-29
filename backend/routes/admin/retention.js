/**
 * Data Retention Management API
 *
 * Endpoints for monitoring and managing data retention policy compliance.
 *
 * RETENTION POLICY:
 * - Media (selfies, addresses): 6 months (soft), 12 months (hard delete)
 * - Attendance/Payroll records: 7 years retention
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

// Require admin authentication
const authenticateAdmin = require('../../middleware/adminAuth');

/**
 * GET /api/admin/retention/status
 * Get overall retention policy compliance status
 */
router.get('/status', authenticateAdmin, asyncHandler(async (req, res) => {
  const companyId = req.query.company_id || req.admin.company_id;

  // Get retention summary
  const summaryQuery = `
    SELECT
      COUNT(*) AS total_records,
      COUNT(*) FILTER (
        WHERE media_deleted_at IS NULL
        AND (photo_in_1 IS NOT NULL OR photo_out_1 IS NOT NULL
             OR photo_in_2 IS NOT NULL OR photo_out_2 IS NOT NULL)
      ) AS records_with_media,
      COUNT(*) FILTER (
        WHERE media_deleted_at IS NULL
        AND media_retention_eligible_at < CURRENT_DATE
      ) AS pending_cleanup,
      COUNT(*) FILTER (
        WHERE media_deleted_at IS NULL
        AND media_retention_eligible_at < CURRENT_DATE - INTERVAL '6 months'
      ) AS overdue_cleanup,
      COUNT(*) FILTER (WHERE media_deleted_at IS NOT NULL) AS cleaned_records,
      MIN(media_retention_eligible_at) FILTER (
        WHERE media_deleted_at IS NULL
        AND media_retention_eligible_at < CURRENT_DATE
      ) AS oldest_pending_date
    FROM clock_in_records
    WHERE ($1::INTEGER IS NULL OR company_id = $1)
  `;

  const summary = await pool.query(summaryQuery, [companyId === 'all' ? null : companyId]);

  // Get recent cleanup logs
  const logsQuery = `
    SELECT
      deleted_at,
      COUNT(*) AS records_deleted,
      array_agg(DISTINCT unnest(fields_cleared)) AS fields_cleared
    FROM data_retention_logs
    WHERE ($1::INTEGER IS NULL OR company_id = $1)
    GROUP BY DATE(deleted_at), deleted_at
    ORDER BY deleted_at DESC
    LIMIT 10
  `;

  let logs = [];
  try {
    const logsResult = await pool.query(logsQuery, [companyId === 'all' ? null : companyId]);
    logs = logsResult.rows;
  } catch (e) {
    // Table might not exist yet
    logs = [];
  }

  const data = summary.rows[0];

  res.json({
    policy: {
      media_retention_months: 6,
      hard_delete_months: 12,
      attendance_retention_years: 7
    },
    compliance: {
      total_records: parseInt(data.total_records),
      records_with_media: parseInt(data.records_with_media),
      pending_cleanup: parseInt(data.pending_cleanup),
      overdue_cleanup: parseInt(data.overdue_cleanup),
      cleaned_records: parseInt(data.cleaned_records),
      oldest_pending_date: data.oldest_pending_date,
      compliance_status: parseInt(data.overdue_cleanup) === 0 ? 'compliant' : 'action_required'
    },
    recent_cleanups: logs,
    next_scheduled_cleanup: 'Daily at 02:00 UTC'
  });
}));

/**
 * GET /api/admin/retention/pending
 * Get list of records pending cleanup
 */
router.get('/pending', authenticateAdmin, asyncHandler(async (req, res) => {
  const companyId = req.query.company_id || req.admin.company_id;
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = parseInt(req.query.offset) || 0;

  const query = `
    SELECT
      cr.id,
      cr.employee_id,
      e.name AS employee_name,
      cr.work_date,
      cr.media_retention_eligible_at,
      CURRENT_DATE - cr.media_retention_eligible_at AS days_overdue,
      CASE
        WHEN cr.media_retention_eligible_at < CURRENT_DATE - INTERVAL '6 months' THEN 'critical'
        WHEN cr.media_retention_eligible_at < CURRENT_DATE - INTERVAL '3 months' THEN 'warning'
        ELSE 'normal'
      END AS urgency,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN cr.photo_in_1 IS NOT NULL THEN 'photo_in_1' END,
        CASE WHEN cr.photo_out_1 IS NOT NULL THEN 'photo_out_1' END,
        CASE WHEN cr.photo_in_2 IS NOT NULL THEN 'photo_in_2' END,
        CASE WHEN cr.photo_out_2 IS NOT NULL THEN 'photo_out_2' END,
        CASE WHEN cr.address_in_1 IS NOT NULL THEN 'address_in_1' END,
        CASE WHEN cr.address_out_1 IS NOT NULL THEN 'address_out_1' END,
        CASE WHEN cr.address_in_2 IS NOT NULL THEN 'address_in_2' END,
        CASE WHEN cr.address_out_2 IS NOT NULL THEN 'address_out_2' END
      ], NULL) AS media_fields
    FROM clock_in_records cr
    LEFT JOIN employees e ON cr.employee_id = e.id
    WHERE cr.media_deleted_at IS NULL
      AND cr.media_retention_eligible_at < CURRENT_DATE
      AND ($1::INTEGER IS NULL OR cr.company_id = $1)
      AND (
        cr.photo_in_1 IS NOT NULL OR cr.photo_out_1 IS NOT NULL OR
        cr.photo_in_2 IS NOT NULL OR cr.photo_out_2 IS NOT NULL
      )
    ORDER BY cr.media_retention_eligible_at ASC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query(query, [
    companyId === 'all' ? null : companyId,
    limit,
    offset
  ]);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) FROM clock_in_records
    WHERE media_deleted_at IS NULL
      AND media_retention_eligible_at < CURRENT_DATE
      AND ($1::INTEGER IS NULL OR company_id = $1)
      AND (photo_in_1 IS NOT NULL OR photo_out_1 IS NOT NULL OR
           photo_in_2 IS NOT NULL OR photo_out_2 IS NOT NULL)
  `;
  const countResult = await pool.query(countQuery, [companyId === 'all' ? null : companyId]);

  res.json({
    records: result.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
      has_more: offset + limit < parseInt(countResult.rows[0].count)
    }
  });
}));

/**
 * GET /api/admin/retention/logs
 * Get retention action logs
 */
router.get('/logs', authenticateAdmin, asyncHandler(async (req, res) => {
  const companyId = req.query.company_id || req.admin.company_id;
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let query = `
    SELECT
      id,
      table_name,
      record_id,
      data_type,
      deleted_at,
      deleted_by,
      retention_policy,
      record_date,
      employee_id,
      fields_cleared,
      deletion_verified
    FROM data_retention_logs
    WHERE ($1::INTEGER IS NULL OR company_id = $1)
  `;

  const params = [companyId === 'all' ? null : companyId];

  if (startDate) {
    params.push(startDate);
    query += ` AND deleted_at >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    query += ` AND deleted_at <= $${params.length}`;
  }

  query += ` ORDER BY deleted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  let result;
  try {
    result = await pool.query(query, params);
  } catch (e) {
    // Table might not exist yet
    return res.json({ logs: [], pagination: { total: 0, limit, offset, has_more: false } });
  }

  res.json({
    logs: result.rows,
    pagination: {
      limit,
      offset,
      has_more: result.rows.length === limit
    }
  });
}));

/**
 * POST /api/admin/retention/cleanup
 * Manually trigger cleanup (super_admin only)
 */
router.post('/cleanup', authenticateAdmin, asyncHandler(async (req, res) => {
  // Only super_admin can trigger manual cleanup
  if (req.admin.role !== 'super_admin') {
    throw new ValidationError('Only super admin can trigger manual cleanup');
  }

  const { dry_run = true, limit = 100 } = req.body;
  const companyId = req.body.company_id || null;

  // Get eligible records
  const eligibleQuery = `
    SELECT
      id,
      employee_id,
      company_id,
      work_date,
      media_retention_eligible_at,
      photo_in_1 IS NOT NULL AS has_photo_in_1,
      photo_out_1 IS NOT NULL AS has_photo_out_1,
      photo_in_2 IS NOT NULL AS has_photo_in_2,
      photo_out_2 IS NOT NULL AS has_photo_out_2,
      address_in_1 IS NOT NULL AS has_address_in_1,
      address_out_1 IS NOT NULL AS has_address_out_1,
      address_in_2 IS NOT NULL AS has_address_in_2,
      address_out_2 IS NOT NULL AS has_address_out_2
    FROM clock_in_records
    WHERE media_deleted_at IS NULL
      AND media_retention_eligible_at < CURRENT_DATE
      AND ($1::INTEGER IS NULL OR company_id = $1)
      AND (photo_in_1 IS NOT NULL OR photo_out_1 IS NOT NULL OR
           photo_in_2 IS NOT NULL OR photo_out_2 IS NOT NULL)
    ORDER BY work_date ASC
    LIMIT $2
  `;

  const eligible = await pool.query(eligibleQuery, [companyId, Math.min(limit, 500)]);

  if (dry_run) {
    // Dry run - just report what would be deleted
    return res.json({
      mode: 'dry_run',
      would_delete: eligible.rows.length,
      records: eligible.rows.map(r => ({
        id: r.id,
        employee_id: r.employee_id,
        work_date: r.work_date,
        fields: [
          r.has_photo_in_1 ? 'photo_in_1' : null,
          r.has_photo_out_1 ? 'photo_out_1' : null,
          r.has_photo_in_2 ? 'photo_in_2' : null,
          r.has_photo_out_2 ? 'photo_out_2' : null,
          r.has_address_in_1 ? 'address_in_1' : null,
          r.has_address_out_1 ? 'address_out_1' : null,
          r.has_address_in_2 ? 'address_in_2' : null,
          r.has_address_out_2 ? 'address_out_2' : null
        ].filter(Boolean)
      })),
      message: 'Dry run complete. No data was deleted. Set dry_run: false to execute.'
    });
  }

  // Live cleanup
  let deleted = 0;
  const errors = [];

  for (const record of eligible.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get fields to clear
      const fieldsCleared = [
        record.has_photo_in_1 ? 'photo_in_1' : null,
        record.has_photo_out_1 ? 'photo_out_1' : null,
        record.has_photo_in_2 ? 'photo_in_2' : null,
        record.has_photo_out_2 ? 'photo_out_2' : null,
        record.has_address_in_1 ? 'address_in_1' : null,
        record.has_address_out_1 ? 'address_out_1' : null,
        record.has_address_in_2 ? 'address_in_2' : null,
        record.has_address_out_2 ? 'address_out_2' : null
      ].filter(Boolean);

      // Clear media fields
      await client.query(`
        UPDATE clock_in_records
        SET photo_in_1 = NULL, photo_out_1 = NULL, photo_in_2 = NULL, photo_out_2 = NULL,
            address_in_1 = NULL, address_out_1 = NULL, address_in_2 = NULL, address_out_2 = NULL,
            media_deleted_at = NOW(),
            media_deletion_logged = TRUE
        WHERE id = $1
      `, [record.id]);

      // Log deletion
      await client.query(`
        INSERT INTO data_retention_logs (
          table_name, record_id, data_type, retention_policy,
          record_date, employee_id, company_id, fields_cleared,
          deleted_by, deletion_verified, verified_at
        ) VALUES (
          'clock_in_records', $1, 'media', '6_month_media',
          $2, $3, $4, $5,
          $6, TRUE, NOW()
        )
      `, [
        record.id,
        record.work_date,
        record.employee_id,
        record.company_id,
        fieldsCleared,
        `admin:${req.admin.id}`
      ]);

      await client.query('COMMIT');
      deleted++;
    } catch (err) {
      await client.query('ROLLBACK');
      errors.push({ id: record.id, error: err.message });
    } finally {
      client.release();
    }
  }

  res.json({
    mode: 'live',
    deleted,
    errors: errors.length,
    error_details: errors.length > 0 ? errors : undefined,
    message: `Cleanup complete. ${deleted} records processed.`
  });
}));

module.exports = router;
