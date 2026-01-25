-- =============================================================================
-- Migration 013: Payroll System Improvements
-- =============================================================================
-- This migration adds:
-- 1. EA Forms table for Borang EA generation
-- 2. Email queue table for async email delivery
-- 3. Updates company payroll_settings with new features
-- 4. Adds audit logging improvements
-- =============================================================================

-- Run this migration with: psql -d your_database -f 013-payroll-improvements.sql

BEGIN;

-- =============================================================================
-- 1. EA Forms Table (Borang EA storage)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ea_forms (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  form_data JSONB NOT NULL,
  total_employment_income DECIMAL(12,2),
  total_epf DECIMAL(10,2),
  total_pcb DECIMAL(10,2),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pdf_url TEXT,
  status VARCHAR(20) DEFAULT 'generated', -- generated, sent, acknowledged
  sent_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  UNIQUE(employee_id, year)
);

-- Indexes for EA forms
CREATE INDEX IF NOT EXISTS idx_ea_forms_employee ON ea_forms(employee_id);
CREATE INDEX IF NOT EXISTS idx_ea_forms_year ON ea_forms(year);
CREATE INDEX IF NOT EXISTS idx_ea_forms_company ON ea_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_ea_forms_company_year ON ea_forms(company_id, year);

COMMENT ON TABLE ea_forms IS 'Stores generated EA forms (Borang EA) for Malaysian tax purposes';

-- =============================================================================
-- 2. Email Queue Table (for async email delivery)
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_queue (
  id SERIAL PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  subject VARCHAR(500) NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, cancelled
  priority INTEGER DEFAULT 5, -- 1 = highest, 10 = lowest
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP,
  sent_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB, -- Additional data (employee_id, reference_type, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scheduled_for TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for email queue
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON email_queue(priority, created_at) WHERE status = 'pending';

COMMENT ON TABLE email_queue IS 'Queue for asynchronous email delivery';

-- =============================================================================
-- 3. Update Company Payroll Settings with New Features
-- =============================================================================

-- Add new feature flags to companies with existing payroll_settings
UPDATE companies
SET payroll_settings = jsonb_set(
  COALESCE(payroll_settings, '{}'),
  '{features}',
  COALESCE(payroll_settings->'features', '{}') || '{
    "ot_requires_approval": false,
    "variance_threshold": 5,
    "auto_email_payslips": false,
    "email_ot_approvals": false
  }'::jsonb
)
WHERE payroll_settings IS NOT NULL
  AND payroll_settings->'features' IS NOT NULL;

-- Set ot_requires_approval = true for Mimix (company_id = 3) based on existing behavior
UPDATE companies
SET payroll_settings = jsonb_set(
  payroll_settings,
  '{features,ot_requires_approval}',
  'true'::jsonb
)
WHERE id = 3
  AND payroll_settings IS NOT NULL;

-- =============================================================================
-- 4. Payroll Audit Log Improvements
-- =============================================================================

-- Ensure payroll_audit_logs table exists with required columns
CREATE TABLE IF NOT EXISTS payroll_audit_logs (
  id SERIAL PRIMARY KEY,
  payroll_item_id INTEGER REFERENCES payroll_items(id) ON DELETE SET NULL,
  payroll_run_id INTEGER REFERENCES payroll_runs(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL, -- edit, approve, reject, finalize, generate
  field_changed VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  performed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_payroll_audit_item ON payroll_audit_logs(payroll_item_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_run ON payroll_audit_logs(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_employee ON payroll_audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_action ON payroll_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_date ON payroll_audit_logs(performed_at);

COMMENT ON TABLE payroll_audit_logs IS 'Audit trail for all payroll changes';

-- =============================================================================
-- 5. Add missing columns to companies table for EA forms
-- =============================================================================

-- Employer EPF number (for EA forms)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS employer_epf_no VARCHAR(20);

-- Employer income tax number (for EA forms)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS employer_income_tax_no VARCHAR(20);

-- Company address (if not exists)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS address TEXT;

-- =============================================================================
-- 6. Add email column to employees if not exists
-- =============================================================================

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email) WHERE email IS NOT NULL;

-- =============================================================================
-- 7. Add tax reference number to employees for EA forms
-- =============================================================================

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS tax_no VARCHAR(20);

-- =============================================================================
-- Verification queries (run manually to verify migration)
-- =============================================================================

-- Check EA forms table
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'ea_forms';

-- Check company settings
-- SELECT id, name, payroll_settings->'features' as features
-- FROM companies
-- WHERE payroll_settings IS NOT NULL;

-- Check audit logs table
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'payroll_audit_logs';

COMMIT;

-- =============================================================================
-- Rollback (if needed, run manually)
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS ea_forms CASCADE;
-- DROP TABLE IF EXISTS email_queue CASCADE;
-- DROP TABLE IF EXISTS payroll_audit_logs CASCADE;
-- ALTER TABLE companies DROP COLUMN IF EXISTS employer_epf_no;
-- ALTER TABLE companies DROP COLUMN IF EXISTS employer_income_tax_no;
-- ALTER TABLE employees DROP COLUMN IF EXISTS tax_no;
-- COMMIT;
