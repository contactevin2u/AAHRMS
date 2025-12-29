#!/usr/bin/env node
/**
 * =============================================================================
 * DATA RETENTION CLEANUP SCRIPT
 * =============================================================================
 *
 * Purpose: Automatically delete media data according to retention policy
 *
 * RETENTION RULES:
 * - Media (selfies, location details): Delete after 6 months, enforce by 12 months
 * - Attendance/Payroll records: Retain for 7 years (NOT deleted by this script)
 *
 * WHAT IS DELETED:
 * - photo_in_1, photo_out_1, photo_in_2, photo_out_2 (set to NULL)
 * - address_in_1, address_out_1, address_in_2, address_out_2 (set to NULL)
 *
 * WHAT IS PRESERVED:
 * - Clock timestamps (clock_in_1, clock_out_1, clock_in_2, clock_out_2)
 * - Location coordinates (location_in_*, location_out_*) - kept for geo-audit
 * - Face detection boolean (face_detected_*) - non-biometric
 * - Work hours, OT hours, payroll data
 * - All approval/audit logs
 *
 * USAGE:
 * - Run daily via cron: 0 2 * * * node /path/to/data-retention-cleanup.js
 * - Or manually: node scripts/data-retention-cleanup.js [--dry-run] [--force]
 *
 * OPTIONS:
 * --dry-run    Show what would be deleted without actually deleting
 * --force      Delete records past 12-month hard deadline (normally 6-month soft)
 * --batch=N    Process N records per batch (default: 100)
 * --verbose    Show detailed progress
 *
 * =============================================================================
 */

require('dotenv').config();
const { Pool } = require('pg');

// Configuration
const CONFIG = {
  // Retention periods in months
  SOFT_DELETE_MONTHS: 6,    // Eligible for deletion
  HARD_DELETE_MONTHS: 12,   // Must be deleted

  // Processing
  BATCH_SIZE: 100,
  MAX_RECORDS_PER_RUN: 10000,

  // Logging
  LOG_LEVEL: process.env.RETENTION_LOG_LEVEL || 'info'
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  verbose: args.includes('--verbose'),
  batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1]) || CONFIG.BATCH_SIZE
};

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Logging utility
const log = {
  info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
  debug: (...args) => options.verbose && console.log(`[${new Date().toISOString()}] DEBUG:`, ...args)
};

/**
 * Get records eligible for media cleanup
 */
async function getEligibleRecords(limit) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - CONFIG.SOFT_DELETE_MONTHS);

  const query = `
    SELECT
      id,
      employee_id,
      company_id,
      work_date,
      media_retention_eligible_at,
      -- Check which fields have data
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
      AND media_retention_eligible_at <= $1
      AND (
        photo_in_1 IS NOT NULL OR photo_out_1 IS NOT NULL OR
        photo_in_2 IS NOT NULL OR photo_out_2 IS NOT NULL OR
        address_in_1 IS NOT NULL OR address_out_1 IS NOT NULL OR
        address_in_2 IS NOT NULL OR address_out_2 IS NOT NULL
      )
    ORDER BY work_date ASC
    LIMIT $2
  `;

  const result = await pool.query(query, [cutoffDate.toISOString().split('T')[0], limit]);
  return result.rows;
}

/**
 * Delete media from a single record and log the action
 */
async function deleteMediaFromRecord(client, record) {
  const fieldsCleared = [];

  // Determine which fields will be cleared
  if (record.has_photo_in_1) fieldsCleared.push('photo_in_1');
  if (record.has_photo_out_1) fieldsCleared.push('photo_out_1');
  if (record.has_photo_in_2) fieldsCleared.push('photo_in_2');
  if (record.has_photo_out_2) fieldsCleared.push('photo_out_2');
  if (record.has_address_in_1) fieldsCleared.push('address_in_1');
  if (record.has_address_out_1) fieldsCleared.push('address_out_1');
  if (record.has_address_in_2) fieldsCleared.push('address_in_2');
  if (record.has_address_out_2) fieldsCleared.push('address_out_2');

  if (fieldsCleared.length === 0) {
    return { skipped: true, reason: 'No media to delete' };
  }

  // Clear media fields
  const updateQuery = `
    UPDATE clock_in_records
    SET
      photo_in_1 = NULL,
      photo_out_1 = NULL,
      photo_in_2 = NULL,
      photo_out_2 = NULL,
      address_in_1 = NULL,
      address_out_1 = NULL,
      address_in_2 = NULL,
      address_out_2 = NULL,
      media_deleted_at = NOW(),
      media_deletion_logged = TRUE
    WHERE id = $1
  `;

  await client.query(updateQuery, [record.id]);

  // Log the deletion
  const logQuery = `
    INSERT INTO data_retention_logs (
      table_name,
      record_id,
      data_type,
      retention_policy,
      record_date,
      employee_id,
      company_id,
      fields_cleared,
      deletion_verified,
      verified_at
    ) VALUES (
      'clock_in_records',
      $1,
      'media',
      '6_month_media',
      $2,
      $3,
      $4,
      $5,
      TRUE,
      NOW()
    )
  `;

  await client.query(logQuery, [
    record.id,
    record.work_date,
    record.employee_id,
    record.company_id,
    fieldsCleared
  ]);

  return { success: true, fieldsCleared };
}

/**
 * Process records in batches
 */
async function processRetention() {
  log.info('='.repeat(60));
  log.info('DATA RETENTION CLEANUP STARTED');
  log.info(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  log.info(`Batch size: ${options.batchSize}`);
  log.info('='.repeat(60));

  let totalProcessed = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;
  let errors = [];

  try {
    // Get eligible records
    const records = await getEligibleRecords(CONFIG.MAX_RECORDS_PER_RUN);

    if (records.length === 0) {
      log.info('No records eligible for cleanup');
      return { processed: 0, deleted: 0, skipped: 0, errors: [] };
    }

    log.info(`Found ${records.length} records eligible for cleanup`);

    // Process in batches
    for (let i = 0; i < records.length; i += options.batchSize) {
      const batch = records.slice(i, i + options.batchSize);
      log.debug(`Processing batch ${Math.floor(i / options.batchSize) + 1} (${batch.length} records)`);

      for (const record of batch) {
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          if (options.dryRun) {
            // Dry run - just log what would happen
            const fieldsToDelete = [];
            if (record.has_photo_in_1) fieldsToDelete.push('photo_in_1');
            if (record.has_photo_out_1) fieldsToDelete.push('photo_out_1');
            if (record.has_photo_in_2) fieldsToDelete.push('photo_in_2');
            if (record.has_photo_out_2) fieldsToDelete.push('photo_out_2');
            if (record.has_address_in_1) fieldsToDelete.push('address_in_1');
            if (record.has_address_out_1) fieldsToDelete.push('address_out_1');
            if (record.has_address_in_2) fieldsToDelete.push('address_in_2');
            if (record.has_address_out_2) fieldsToDelete.push('address_out_2');

            log.debug(`[DRY RUN] Would delete from record ${record.id}: ${fieldsToDelete.join(', ')}`);
            totalDeleted++;
          } else {
            // Live deletion
            const result = await deleteMediaFromRecord(client, record);

            if (result.skipped) {
              totalSkipped++;
              log.debug(`Skipped record ${record.id}: ${result.reason}`);
            } else if (result.success) {
              totalDeleted++;
              log.debug(`Deleted media from record ${record.id}: ${result.fieldsCleared.join(', ')}`);
            }
          }

          await client.query('COMMIT');
          totalProcessed++;

        } catch (err) {
          await client.query('ROLLBACK');
          errors.push({ recordId: record.id, error: err.message });
          log.error(`Failed to process record ${record.id}:`, err.message);
        } finally {
          client.release();
        }
      }

      // Progress report every batch
      log.info(`Progress: ${totalProcessed}/${records.length} processed, ${totalDeleted} deleted, ${errors.length} errors`);
    }

  } catch (err) {
    log.error('Retention cleanup failed:', err);
    throw err;
  }

  return { processed: totalProcessed, deleted: totalDeleted, skipped: totalSkipped, errors };
}

/**
 * Generate compliance report
 */
async function generateComplianceReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {},
    pendingByCompany: [],
    overdueRecords: 0
  };

  try {
    // Get overall summary
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE media_deleted_at IS NULL AND media_retention_eligible_at < CURRENT_DATE) AS pending_deletions,
        COUNT(*) FILTER (WHERE media_deleted_at IS NULL AND media_retention_eligible_at < CURRENT_DATE - INTERVAL '6 months') AS overdue_deletions,
        COUNT(*) FILTER (WHERE media_deleted_at IS NOT NULL) AS completed_deletions,
        COUNT(*) AS total_records
      FROM clock_in_records
    `;
    const summaryResult = await pool.query(summaryQuery);
    report.summary = summaryResult.rows[0];
    report.overdueRecords = parseInt(report.summary.overdue_deletions);

    // Get breakdown by company
    const companyQuery = `
      SELECT
        c.name AS company_name,
        cr.company_id,
        COUNT(*) FILTER (WHERE cr.media_deleted_at IS NULL AND cr.media_retention_eligible_at < CURRENT_DATE) AS pending,
        COUNT(*) FILTER (WHERE cr.media_deleted_at IS NULL AND cr.media_retention_eligible_at < CURRENT_DATE - INTERVAL '6 months') AS overdue
      FROM clock_in_records cr
      LEFT JOIN companies c ON cr.company_id = c.id
      GROUP BY cr.company_id, c.name
      HAVING COUNT(*) FILTER (WHERE cr.media_deleted_at IS NULL AND cr.media_retention_eligible_at < CURRENT_DATE) > 0
      ORDER BY overdue DESC, pending DESC
    `;
    const companyResult = await pool.query(companyQuery);
    report.pendingByCompany = companyResult.rows;

  } catch (err) {
    log.error('Failed to generate compliance report:', err);
  }

  return report;
}

/**
 * Main execution
 */
async function main() {
  log.info('Starting data retention cleanup...');

  try {
    // Run cleanup
    const result = await processRetention();

    // Generate compliance report
    const report = await generateComplianceReport();

    // Summary
    log.info('='.repeat(60));
    log.info('CLEANUP COMPLETE');
    log.info('='.repeat(60));
    log.info(`Records processed: ${result.processed}`);
    log.info(`Media deleted: ${result.deleted}`);
    log.info(`Skipped: ${result.skipped}`);
    log.info(`Errors: ${result.errors.length}`);
    log.info('');
    log.info('COMPLIANCE STATUS:');
    log.info(`  Total records: ${report.summary.total_records}`);
    log.info(`  Pending deletions: ${report.summary.pending_deletions}`);
    log.info(`  Overdue (>12 months): ${report.summary.overdue_deletions}`);
    log.info(`  Completed deletions: ${report.summary.completed_deletions}`);

    if (report.overdueRecords > 0) {
      log.warn(`WARNING: ${report.overdueRecords} records are past the 12-month hard deadline!`);
    }

    // Exit with appropriate code
    if (result.errors.length > 0) {
      process.exit(1);
    }

    process.exit(0);

  } catch (err) {
    log.error('Retention cleanup failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { processRetention, generateComplianceReport };
