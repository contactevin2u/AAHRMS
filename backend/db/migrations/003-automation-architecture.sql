-- =====================================================
-- Migration 003: Controlled Automation Architecture
-- Date: 2025-12-26
--
-- This migration implements:
-- 1. Audit logs table for all system actions
-- 2. Automation configuration per company
-- 3. Payroll status flow: draft → auto_generated → auto_approved → locked
-- 4. Claims auto-approval system
-- 5. Probation review reminders
-- =====================================================

-- =====================================================
-- 1. AUDIT LOGS TABLE
-- Tracks all system actions for accountability
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),

  -- What was affected
  entity_type VARCHAR(50) NOT NULL,  -- 'payroll_run', 'payroll_item', 'claim', 'employee', etc.
  entity_id INTEGER NOT NULL,

  -- What happened
  action VARCHAR(50) NOT NULL,  -- 'create', 'update', 'delete', 'approve', 'reject', 'lock', 'auto_generate', 'auto_approve'

  -- Who did it
  actor_type VARCHAR(20) NOT NULL,  -- 'admin', 'system', 'employee'
  actor_id INTEGER,  -- admin_users.id or employees.id, NULL for system
  actor_name VARCHAR(100),  -- Denormalized for quick display

  -- Details
  old_values JSONB,  -- Previous state
  new_values JSONB,  -- New state
  changes JSONB,     -- Summary of what changed
  reason TEXT,       -- Optional reason for the action

  -- Context
  ip_address VARCHAR(45),
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- =====================================================
-- 2. AUTOMATION CONFIGURATION TABLE
-- Company-specific automation settings
-- =====================================================

CREATE TABLE IF NOT EXISTS automation_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL UNIQUE,

  -- Payroll automation
  payroll_auto_generate BOOLEAN DEFAULT TRUE,
  payroll_auto_generate_day INTEGER DEFAULT 1,  -- Day of month to auto-generate
  payroll_auto_approve BOOLEAN DEFAULT FALSE,   -- Auto-approve if no variance
  payroll_variance_threshold DECIMAL(5,2) DEFAULT 5.00,  -- % variance allowed for auto-approve
  payroll_lock_after_days INTEGER DEFAULT 3,    -- Days after approval before auto-lock

  -- Claims automation
  claims_auto_approve BOOLEAN DEFAULT FALSE,
  claims_auto_approve_max_amount DECIMAL(10,2) DEFAULT 100.00,  -- Max amount for auto-approve
  claims_require_receipt_above DECIMAL(10,2) DEFAULT 50.00,     -- Require receipt above this

  -- Probation reminders
  probation_reminder_enabled BOOLEAN DEFAULT TRUE,
  probation_reminder_days_before INTEGER DEFAULT 14,  -- Days before probation ends

  -- Notification settings
  notify_payroll_generated BOOLEAN DEFAULT TRUE,
  notify_claims_pending BOOLEAN DEFAULT TRUE,
  notify_probation_ending BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 3. CLAIM TYPES TABLE (for category-based auto-approval)
-- =====================================================

CREATE TABLE IF NOT EXISTS claim_types (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Auto-approval rules
  auto_approve_enabled BOOLEAN DEFAULT FALSE,
  auto_approve_max_amount DECIMAL(10,2),
  require_receipt BOOLEAN DEFAULT TRUE,

  -- Limits
  max_per_claim DECIMAL(10,2),
  max_per_month DECIMAL(10,2),
  max_per_year DECIMAL(10,2),

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_claim_types_company ON claim_types(company_id);

-- =====================================================
-- 4. PROBATION REVIEWS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS probation_reviews (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) NOT NULL,
  company_id INTEGER REFERENCES companies(id) NOT NULL,

  -- Dates
  probation_start_date DATE NOT NULL,
  probation_end_date DATE NOT NULL,
  review_due_date DATE NOT NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'reminded', 'completed', 'extended'

  -- Review outcome
  outcome VARCHAR(20),  -- 'confirmed', 'extended', 'terminated'
  new_end_date DATE,    -- If extended
  review_notes TEXT,

  -- Reminders sent
  reminder_sent_at TIMESTAMP,
  reminder_count INTEGER DEFAULT 0,

  -- Audit
  reviewed_by INTEGER REFERENCES admin_users(id),
  reviewed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_probation_reviews_employee ON probation_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_status ON probation_reviews(status);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_due ON probation_reviews(review_due_date);

-- =====================================================
-- 5. EXTEND PAYROLL_RUNS FOR AUTOMATION STATUS FLOW
-- Status: draft → auto_generated → auto_approved → locked
-- With manual edit: auto_approved → edited → approved → locked
-- =====================================================

DO $$
BEGIN
  -- Generation tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='generation_type') THEN
    ALTER TABLE payroll_runs ADD COLUMN generation_type VARCHAR(20) DEFAULT 'manual';  -- 'manual', 'auto'
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='generated_at') THEN
    ALTER TABLE payroll_runs ADD COLUMN generated_at TIMESTAMP;
  END IF;

  -- Approval tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approval_type') THEN
    ALTER TABLE payroll_runs ADD COLUMN approval_type VARCHAR(20);  -- 'auto', 'manual'
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_at') THEN
    ALTER TABLE payroll_runs ADD COLUMN approved_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_by') THEN
    ALTER TABLE payroll_runs ADD COLUMN approved_by INTEGER REFERENCES admin_users(id);
  END IF;

  -- Edit tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='is_edited') THEN
    ALTER TABLE payroll_runs ADD COLUMN is_edited BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='edited_at') THEN
    ALTER TABLE payroll_runs ADD COLUMN edited_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='edited_by') THEN
    ALTER TABLE payroll_runs ADD COLUMN edited_by INTEGER REFERENCES admin_users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='edit_reason') THEN
    ALTER TABLE payroll_runs ADD COLUMN edit_reason TEXT;
  END IF;

  -- Lock tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='locked_at') THEN
    ALTER TABLE payroll_runs ADD COLUMN locked_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='locked_by') THEN
    ALTER TABLE payroll_runs ADD COLUMN locked_by INTEGER REFERENCES admin_users(id);
  END IF;

  -- Variance tracking for auto-approval
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='variance_from_previous') THEN
    ALTER TABLE payroll_runs ADD COLUMN variance_from_previous DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='variance_percentage') THEN
    ALTER TABLE payroll_runs ADD COLUMN variance_percentage DECIMAL(5,2);
  END IF;
END $$;

-- Update status column to support new values
-- Note: Status values now include: draft, auto_generated, auto_approved, edited, approved, locked, finalized
-- 'finalized' kept for backward compatibility

-- =====================================================
-- 6. EXTEND PAYROLL_ITEMS FOR EDIT TRACKING
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='is_edited') THEN
    ALTER TABLE payroll_items ADD COLUMN is_edited BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='original_values') THEN
    ALTER TABLE payroll_items ADD COLUMN original_values JSONB;  -- Stores pre-edit values
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='edited_at') THEN
    ALTER TABLE payroll_items ADD COLUMN edited_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='edited_by') THEN
    ALTER TABLE payroll_items ADD COLUMN edited_by INTEGER REFERENCES admin_users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='edit_reason') THEN
    ALTER TABLE payroll_items ADD COLUMN edit_reason TEXT;
  END IF;
END $$;

-- =====================================================
-- 7. EXTEND CLAIMS FOR AUTO-APPROVAL TRACKING
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='claim_type_id') THEN
    ALTER TABLE claims ADD COLUMN claim_type_id INTEGER REFERENCES claim_types(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='approval_type') THEN
    ALTER TABLE claims ADD COLUMN approval_type VARCHAR(20);  -- 'auto', 'manual'
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='auto_approved') THEN
    ALTER TABLE claims ADD COLUMN auto_approved BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='auto_approval_reason') THEN
    ALTER TABLE claims ADD COLUMN auto_approval_reason TEXT;
  END IF;
END $$;

-- =====================================================
-- 8. EXTEND EMPLOYEES FOR PROBATION TRACKING
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_months') THEN
    ALTER TABLE employees ADD COLUMN probation_months INTEGER DEFAULT 3;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_end_date') THEN
    ALTER TABLE employees ADD COLUMN probation_end_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_status') THEN
    ALTER TABLE employees ADD COLUMN probation_status VARCHAR(20) DEFAULT 'ongoing';  -- 'ongoing', 'confirmed', 'extended', 'terminated'
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='confirmed_date') THEN
    ALTER TABLE employees ADD COLUMN confirmed_date DATE;
  END IF;
END $$;

-- =====================================================
-- 9. SCHEDULED TASKS TABLE
-- For tracking scheduled automation jobs
-- =====================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),

  task_type VARCHAR(50) NOT NULL,  -- 'payroll_generate', 'claims_reminder', 'probation_reminder'
  task_name VARCHAR(100) NOT NULL,

  -- Schedule
  cron_expression VARCHAR(50),  -- For cron-based scheduling
  next_run_at TIMESTAMP,
  last_run_at TIMESTAMP,

  -- Status
  status VARCHAR(20) DEFAULT 'active',  -- 'active', 'paused', 'completed', 'failed'
  last_result TEXT,
  error_count INTEGER DEFAULT 0,

  -- Configuration
  config JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_company ON scheduled_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next ON scheduled_tasks(next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_type ON scheduled_tasks(task_type);

-- =====================================================
-- 10. SEED DEFAULT AUTOMATION CONFIGS
-- =====================================================

-- Insert default config for existing companies
INSERT INTO automation_configs (company_id, payroll_auto_generate, payroll_auto_approve, claims_auto_approve)
SELECT id, TRUE, FALSE, FALSE FROM companies
WHERE NOT EXISTS (SELECT 1 FROM automation_configs WHERE company_id = companies.id);

-- =====================================================
-- 11. SEED DEFAULT CLAIM TYPES
-- =====================================================

-- Common claim types
INSERT INTO claim_types (company_id, code, name, auto_approve_enabled, auto_approve_max_amount, require_receipt, max_per_claim)
SELECT c.id, 'TRANSPORT', 'Transportation', FALSE, 50.00, TRUE, 200.00
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM claim_types WHERE company_id = c.id AND code = 'TRANSPORT');

INSERT INTO claim_types (company_id, code, name, auto_approve_enabled, auto_approve_max_amount, require_receipt, max_per_claim)
SELECT c.id, 'MEAL', 'Meal Allowance', TRUE, 30.00, FALSE, 50.00
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM claim_types WHERE company_id = c.id AND code = 'MEAL');

INSERT INTO claim_types (company_id, code, name, auto_approve_enabled, auto_approve_max_amount, require_receipt, max_per_claim)
SELECT c.id, 'PARKING', 'Parking', TRUE, 20.00, FALSE, 50.00
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM claim_types WHERE company_id = c.id AND code = 'PARKING');

INSERT INTO claim_types (company_id, code, name, auto_approve_enabled, auto_approve_max_amount, require_receipt, max_per_claim)
SELECT c.id, 'MEDICAL', 'Medical', FALSE, NULL, TRUE, 500.00
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM claim_types WHERE company_id = c.id AND code = 'MEDICAL');

INSERT INTO claim_types (company_id, code, name, auto_approve_enabled, auto_approve_max_amount, require_receipt, max_per_claim)
SELECT c.id, 'OTHER', 'Other Expenses', FALSE, NULL, TRUE, 1000.00
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM claim_types WHERE company_id = c.id AND code = 'OTHER');

-- =====================================================
-- 12. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system actions';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity affected: payroll_run, payroll_item, claim, employee, etc.';
COMMENT ON COLUMN audit_logs.action IS 'Action performed: create, update, delete, approve, reject, lock, auto_generate, auto_approve';

COMMENT ON TABLE automation_configs IS 'Company-specific automation settings';
COMMENT ON COLUMN automation_configs.payroll_variance_threshold IS 'Percentage variance from previous month allowed for auto-approval';

COMMENT ON TABLE claim_types IS 'Claim categories with auto-approval rules';
COMMENT ON COLUMN claim_types.auto_approve_max_amount IS 'Claims up to this amount can be auto-approved if enabled';

COMMENT ON TABLE probation_reviews IS 'Tracks probation period reviews and reminders';

COMMENT ON COLUMN payroll_runs.generation_type IS 'How the run was created: manual or auto';
COMMENT ON COLUMN payroll_runs.approval_type IS 'How the run was approved: auto or manual';
COMMENT ON COLUMN payroll_runs.is_edited IS 'TRUE if any payroll item was manually edited after auto-approval';

COMMENT ON COLUMN payroll_items.original_values IS 'JSONB storing pre-edit values when is_edited=TRUE';

COMMENT ON TABLE scheduled_tasks IS 'Tracks scheduled automation jobs for cron-like execution';
