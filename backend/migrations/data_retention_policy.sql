-- =============================================================================
-- DATA RETENTION POLICY MIGRATION
-- =============================================================================
--
-- RETENTION RULES:
-- 1. Media & Sensitive Data: 6-12 months (auto-delete)
--    - Selfie images (photo_in_1, photo_out_1, photo_in_2, photo_out_2)
--    - Location metadata (address_in_*, address_out_*)
--
-- 2. Attendance & Payroll Records: 7 years
--    - Clock timestamps
--    - Working hours, OT hours
--    - Payroll calculations
--    - Approval logs
--
-- =============================================================================

-- Create retention logs table
CREATE TABLE IF NOT EXISTS data_retention_logs (
    id SERIAL PRIMARY KEY,

    -- What was deleted
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    data_type VARCHAR(50) NOT NULL, -- 'media', 'location', 'full_record'

    -- Deletion details
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_by VARCHAR(100) DEFAULT 'system_retention_job',

    -- Policy reference
    retention_policy VARCHAR(50) NOT NULL, -- '6_month_media', '12_month_enforce', '7_year_archive'

    -- Audit trail (what was deleted, not the data itself)
    record_date DATE, -- The work_date of the deleted record
    employee_id INTEGER,
    company_id INTEGER,

    -- Summary of what was removed
    fields_cleared TEXT[], -- Array of field names that were cleared

    -- Verification
    deletion_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_retention_logs_deleted_at
ON data_retention_logs (deleted_at);

CREATE INDEX IF NOT EXISTS idx_retention_logs_table_record
ON data_retention_logs (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_retention_logs_employee
ON data_retention_logs (employee_id, record_date);

-- Add retention tracking columns to clock_in_records
ALTER TABLE clock_in_records
ADD COLUMN IF NOT EXISTS media_retention_eligible_at DATE,
ADD COLUMN IF NOT EXISTS media_deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS media_deletion_logged BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN clock_in_records.media_retention_eligible_at IS
'Date when media becomes eligible for deletion (work_date + 6 months)';

COMMENT ON COLUMN clock_in_records.media_deleted_at IS
'Timestamp when media (photos, detailed location) was deleted';

COMMENT ON COLUMN clock_in_records.media_deletion_logged IS
'Whether the deletion was logged to data_retention_logs';

-- Update existing records to set retention eligibility
UPDATE clock_in_records
SET media_retention_eligible_at = work_date + INTERVAL '6 months'
WHERE media_retention_eligible_at IS NULL;

-- Create trigger to auto-set retention date on new records
CREATE OR REPLACE FUNCTION set_media_retention_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.media_retention_eligible_at := NEW.work_date + INTERVAL '6 months';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_retention_date ON clock_in_records;

CREATE TRIGGER trigger_set_retention_date
    BEFORE INSERT ON clock_in_records
    FOR EACH ROW
    EXECUTE FUNCTION set_media_retention_date();

-- =============================================================================
-- VIEWS FOR RETENTION MONITORING
-- =============================================================================

-- View: Records eligible for media cleanup
CREATE OR REPLACE VIEW v_media_cleanup_eligible AS
SELECT
    id,
    employee_id,
    company_id,
    work_date,
    media_retention_eligible_at,
    CURRENT_DATE - media_retention_eligible_at AS days_past_eligible,
    CASE
        WHEN photo_in_1 IS NOT NULL OR photo_out_1 IS NOT NULL
             OR photo_in_2 IS NOT NULL OR photo_out_2 IS NOT NULL
        THEN TRUE
        ELSE FALSE
    END AS has_media,
    media_deleted_at IS NOT NULL AS already_deleted
FROM clock_in_records
WHERE media_retention_eligible_at <= CURRENT_DATE
  AND media_deleted_at IS NULL;

-- View: Retention policy compliance summary
CREATE OR REPLACE VIEW v_retention_compliance AS
SELECT
    company_id,
    COUNT(*) FILTER (WHERE media_deleted_at IS NULL AND media_retention_eligible_at < CURRENT_DATE) AS pending_deletions,
    COUNT(*) FILTER (WHERE media_deleted_at IS NULL AND media_retention_eligible_at < CURRENT_DATE - INTERVAL '6 months') AS overdue_deletions,
    COUNT(*) FILTER (WHERE media_deleted_at IS NOT NULL) AS completed_deletions,
    MIN(media_retention_eligible_at) FILTER (WHERE media_deleted_at IS NULL) AS oldest_pending_date
FROM clock_in_records
GROUP BY company_id;

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE data_retention_logs IS
'Audit log for data retention actions. Records what was deleted, when, and by whom.
Required for compliance verification. DO NOT DELETE entries from this table.';

COMMENT ON VIEW v_media_cleanup_eligible IS
'Shows clock_in_records that are eligible for media cleanup based on 6-month retention policy.';

COMMENT ON VIEW v_retention_compliance IS
'Summary of retention policy compliance by company. Shows pending and overdue deletions.';
