-- =============================================================================
-- UNIFIED PAYROLL ENGINE MIGRATION
-- =============================================================================
-- Merges V1 and V2 payroll systems into one configurable engine
-- Each company can enable/disable features via settings
-- =============================================================================

-- Add payroll feature settings to companies table
-- These settings control which payroll features are active for each company
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payroll_settings JSONB DEFAULT '{
  "features": {
    "auto_ot_from_clockin": true,
    "auto_ph_pay": true,
    "auto_claims_linking": true,
    "unpaid_leave_deduction": true,
    "salary_carry_forward": true,
    "flexible_commissions": true,
    "flexible_allowances": true,
    "indoor_sales_logic": false,
    "ytd_pcb_calculation": true,
    "require_approval": false
  },
  "rates": {
    "ot_multiplier": 1.0,
    "ph_multiplier": 1.0,
    "indoor_sales_basic": 4000,
    "indoor_sales_commission_rate": 6,
    "standard_work_hours": 8,
    "standard_work_days": 22
  },
  "period": {
    "type": "calendar_month",
    "start_day": 1,
    "end_day": 0,
    "payment_day": 5,
    "payment_month_offset": 1
  },
  "statutory": {
    "epf_enabled": true,
    "socso_enabled": true,
    "eis_enabled": true,
    "pcb_enabled": true,
    "statutory_on_ot": false,
    "statutory_on_allowance": false,
    "statutory_on_incentive": false
  }
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN companies.payroll_settings IS 'Company-specific payroll configuration. Controls which features are active and rate settings.';

-- Ensure payroll_runs has all required columns
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES admin_users(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS variance_threshold DECIMAL(5,2) DEFAULT 10.0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS has_variance_warning BOOLEAN DEFAULT FALSE;

-- Ensure payroll_items has YTD tracking columns
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ytd_gross DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ytd_epf DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ytd_pcb DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ytd_taxable DECIMAL(12,2) DEFAULT 0;

-- Add statutory base tracking (for audit)
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS statutory_base DECIMAL(12,2) DEFAULT 0;

-- Add variance tracking
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS prev_month_net DECIMAL(12,2);
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS variance_amount DECIMAL(12,2);
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS variance_percent DECIMAL(5,2);
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS variance_reviewed BOOLEAN DEFAULT FALSE;

-- Create index for faster YTD queries
CREATE INDEX IF NOT EXISTS idx_payroll_items_ytd
ON payroll_items (employee_id, (SELECT year FROM payroll_runs WHERE id = payroll_run_id));

-- =============================================================================
-- PAYROLL FEATURE FLAGS REFERENCE
-- =============================================================================
--
-- FEATURES (boolean):
-- - auto_ot_from_clockin: Auto-calculate OT hours/amount from clock_in_records
-- - auto_ph_pay: Auto-calculate public holiday pay for days worked
-- - auto_claims_linking: Link approved claims to payroll items on finalization
-- - unpaid_leave_deduction: Deduct unpaid leave days from salary
-- - salary_carry_forward: Use previous month's salary if not changed
-- - flexible_commissions: Load commissions from employee_commissions table
-- - flexible_allowances: Load allowances from employee_allowances table
-- - indoor_sales_logic: Compare basic vs commission, take higher (Indoor Sales dept)
-- - ytd_pcb_calculation: Use YTD data for accurate PCB (LHDN computerized method)
-- - require_approval: Require admin approval before finalization
--
-- RATES:
-- - ot_multiplier: OT rate (1.0 = flat rate, 1.5 = time-and-half)
-- - ph_multiplier: Public holiday extra pay rate
-- - indoor_sales_basic: Minimum basic for Indoor Sales
-- - indoor_sales_commission_rate: Commission % for Indoor Sales
-- - standard_work_hours: Hours per day for rate calculation
-- - standard_work_days: Days per month for rate calculation
--
-- PERIOD:
-- - type: 'calendar_month' or 'mid_month'
-- - start_day: Day of month period starts (1 for calendar, 15 for mid-month)
-- - end_day: Day of month period ends (0 = last day, 14 for mid-month)
-- - payment_day: Day of month payment is due
-- - payment_month_offset: Months after period end (0 = same month, 1 = next)
--
-- STATUTORY:
-- - epf_enabled, socso_enabled, eis_enabled, pcb_enabled: Toggle deductions
-- - statutory_on_ot: Include OT in statutory base (default: false)
-- - statutory_on_allowance: Include allowance in statutory base (default: false)
-- - statutory_on_incentive: Include incentive in statutory base (default: false)
--
-- =============================================================================
