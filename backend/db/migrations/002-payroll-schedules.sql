-- =====================================================
-- Migration 002: Payroll Schedules, OT Rules, Transfers, Final Settlement
-- Date: 2025-12-26
--
-- This migration adds support for:
-- 1. Company/department-specific OT calculation rules
-- 2. Flexible payroll period configurations (calendar, mid-month, etc.)
-- 3. Employee transfer tracking between companies
-- 4. Enhanced resignation final settlement calculations
-- =====================================================

-- =====================================================
-- 1. OT RULES TABLE
-- Supports different OT multipliers per company/department
-- =====================================================

CREATE TABLE IF NOT EXISTS ot_rules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL,
  department_id INTEGER REFERENCES departments(id), -- NULL = applies to all departments in company
  name VARCHAR(100) NOT NULL,

  -- Working hours configuration
  normal_hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  includes_break BOOLEAN DEFAULT FALSE,
  break_duration_minutes INTEGER DEFAULT 0,

  -- OT thresholds and multipliers
  ot_threshold_hours DECIMAL(4,2) NOT NULL DEFAULT 8.00,  -- Hours before OT kicks in
  ot_normal_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.50, -- Normal OT rate (e.g., 1.5x)
  ot_weekend_multiplier DECIMAL(3,2) DEFAULT 1.50,         -- Weekend OT rate
  ot_ph_multiplier DECIMAL(3,2) NOT NULL DEFAULT 2.00,     -- Public holiday rate
  ot_ph_after_hours_multiplier DECIMAL(3,2) DEFAULT NULL,  -- PH after normal hours (e.g., Mimix 3.0x)

  -- Rounding rules
  rounding_method VARCHAR(20) DEFAULT 'minute', -- 'minute', '15min', '30min', 'hour'
  rounding_direction VARCHAR(10) DEFAULT 'nearest', -- 'up', 'down', 'nearest'

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_ot_rules_company ON ot_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_ot_rules_department ON ot_rules(company_id, department_id);

-- =====================================================
-- 2. PAYROLL PERIOD CONFIGURATIONS TABLE
-- Supports different salary schedules per department
-- =====================================================

CREATE TABLE IF NOT EXISTS payroll_period_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL,
  department_id INTEGER REFERENCES departments(id), -- NULL = company default
  name VARCHAR(100) NOT NULL,

  -- Period definition
  period_type VARCHAR(20) NOT NULL DEFAULT 'calendar_month',
    -- 'calendar_month': 1st-31st (standard)
    -- 'mid_month': 15th prev to 14th current
    -- 'custom': use start_day/end_day
  period_start_day INTEGER DEFAULT 1,  -- Day of month period starts
  period_end_day INTEGER DEFAULT 0,    -- 0 = end of month, or specific day

  -- Payment schedule
  payment_day INTEGER NOT NULL DEFAULT 5, -- Day payment is due
  payment_month_offset INTEGER DEFAULT 1, -- 0 = same month, 1 = next month

  -- Commission handling
  commission_period_offset INTEGER DEFAULT 0, -- 0 = same as salary, -1 = previous period

  -- Notes
  notes TEXT,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_period_company ON payroll_period_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period_dept ON payroll_period_configs(company_id, department_id);

-- =====================================================
-- 3. EMPLOYEE TRANSFERS TABLE
-- Tracks employee movement between companies
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_transfers (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) NOT NULL,           -- New employee record
  previous_employee_id INTEGER REFERENCES employees(id) NOT NULL,  -- Old employee record
  from_company_id INTEGER REFERENCES companies(id) NOT NULL,
  to_company_id INTEGER REFERENCES companies(id) NOT NULL,
  transfer_date DATE NOT NULL,
  reason TEXT,

  -- What gets transferred
  transfer_leave_balance BOOLEAN DEFAULT TRUE,
  transfer_service_years BOOLEAN DEFAULT TRUE,

  -- Audit
  processed_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_transfers_employee ON employee_transfers(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_transfers_previous ON employee_transfers(previous_employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_transfers_date ON employee_transfers(transfer_date);

-- =====================================================
-- 4. EXTEND EMPLOYEES TABLE FOR TRANSFERS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='previous_employee_id') THEN
    ALTER TABLE employees ADD COLUMN previous_employee_id INTEGER REFERENCES employees(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='transfer_date') THEN
    ALTER TABLE employees ADD COLUMN transfer_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='transfer_reason') THEN
    ALTER TABLE employees ADD COLUMN transfer_reason TEXT;
  END IF;
END $$;

-- =====================================================
-- 5. EXTEND PAYROLL_RUNS TABLE FOR PERIOD TRACKING
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_start_date') THEN
    ALTER TABLE payroll_runs ADD COLUMN period_start_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_end_date') THEN
    ALTER TABLE payroll_runs ADD COLUMN period_end_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='payment_due_date') THEN
    ALTER TABLE payroll_runs ADD COLUMN payment_due_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_label') THEN
    ALTER TABLE payroll_runs ADD COLUMN period_label VARCHAR(100);
  END IF;
END $$;

-- =====================================================
-- 6. EXTEND PAYROLL_ITEMS TABLE FOR COMMISSION PERIODS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='commission_period_start') THEN
    ALTER TABLE payroll_items ADD COLUMN commission_period_start DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='commission_period_end') THEN
    ALTER TABLE payroll_items ADD COLUMN commission_period_end DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='commission_period_label') THEN
    ALTER TABLE payroll_items ADD COLUMN commission_period_label VARCHAR(100);
  END IF;
END $$;

-- =====================================================
-- 7. EXTEND RESIGNATIONS TABLE FOR FULL SETTLEMENT
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='prorated_salary') THEN
    ALTER TABLE resignations ADD COLUMN prorated_salary DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='salary_days_worked') THEN
    ALTER TABLE resignations ADD COLUMN salary_days_worked INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='pending_claims_amount') THEN
    ALTER TABLE resignations ADD COLUMN pending_claims_amount DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='prorated_bonus_amount') THEN
    ALTER TABLE resignations ADD COLUMN prorated_bonus_amount DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='notice_buyout_amount') THEN
    ALTER TABLE resignations ADD COLUMN notice_buyout_amount DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='notice_buyout_type') THEN
    ALTER TABLE resignations ADD COLUMN notice_buyout_type VARCHAR(20); -- 'employee_pays' or 'company_pays'
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='total_deductions') THEN
    ALTER TABLE resignations ADD COLUMN total_deductions DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resignations' AND column_name='settlement_breakdown') THEN
    ALTER TABLE resignations ADD COLUMN settlement_breakdown JSONB;
  END IF;
END $$;

-- =====================================================
-- 8. SEED DEFAULT OT RULES FOR AA ALIVE
-- =====================================================

-- AA Alive Driver: 9 hrs (incl 1hr break), OT 1.0x, PH 2.0x
INSERT INTO ot_rules (company_id, department_id, name, normal_hours_per_day, includes_break,
  break_duration_minutes, ot_threshold_hours, ot_normal_multiplier, ot_ph_multiplier, rounding_method)
SELECT c.id, d.id, 'AA Alive Driver OT', 9.00, TRUE, 60, 9.00, 1.00, 2.00, 'minute'
FROM companies c
JOIN departments d ON d.company_id = c.id AND d.name = 'Driver'
WHERE c.code = 'AA_ALIVE' OR c.name LIKE '%AA Alive%'
ON CONFLICT (company_id, department_id) DO NOTHING;

-- Mimix: 8 hrs, OT 1.5x, PH 2.0x, PH after hours 3.0x
INSERT INTO ot_rules (company_id, department_id, name, normal_hours_per_day, ot_threshold_hours,
  ot_normal_multiplier, ot_ph_multiplier, ot_ph_after_hours_multiplier, rounding_method)
SELECT c.id, NULL, 'Mimix Standard OT', 8.00, 8.00, 1.50, 2.00, 3.00, 'minute'
FROM companies c
WHERE c.code = 'MIMIX_A' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, department_id) DO NOTHING;

-- =====================================================
-- 9. SEED PAYROLL PERIOD CONFIGS FOR AA ALIVE
-- =====================================================

-- Driver: Calendar month, pay 5th next month
INSERT INTO payroll_period_configs
  (company_id, department_id, name, period_type, period_start_day, period_end_day,
   payment_day, payment_month_offset, commission_period_offset, notes)
SELECT c.id, d.id, 'Driver Schedule', 'calendar_month', 1, 0, 5, 1, 0,
       'Standard monthly payroll, payment by 5th of following month'
FROM companies c
JOIN departments d ON d.company_id = c.id AND d.name = 'Driver'
WHERE c.code = 'AA_ALIVE' OR c.name LIKE '%AA Alive%'
ON CONFLICT (company_id, department_id) DO NOTHING;

-- Office: Calendar month, pay 25th same month (full month projected)
INSERT INTO payroll_period_configs
  (company_id, department_id, name, period_type, period_start_day, period_end_day,
   payment_day, payment_month_offset, commission_period_offset, notes)
SELECT c.id, d.id, 'Office Schedule', 'calendar_month', 1, 0, 25, 0, 0,
       'Full month salary projected on 25th'
FROM companies c
JOIN departments d ON d.company_id = c.id AND d.name = 'Office'
WHERE c.code = 'AA_ALIVE' OR c.name LIKE '%AA Alive%'
ON CONFLICT (company_id, department_id) DO NOTHING;

-- Outdoor Sales: Calendar month, commission from previous month
INSERT INTO payroll_period_configs
  (company_id, department_id, name, period_type, period_start_day, period_end_day,
   payment_day, payment_month_offset, commission_period_offset, notes)
SELECT c.id, d.id, 'Outdoor Sales Schedule', 'calendar_month', 1, 0, 25, 0, -1,
       'Basic salary current month, commission from previous month'
FROM companies c
JOIN departments d ON d.company_id = c.id AND d.name = 'Outdoor Sales'
WHERE c.code = 'AA_ALIVE' OR c.name LIKE '%AA Alive%'
ON CONFLICT (company_id, department_id) DO NOTHING;

-- Indoor Sales: Mid-month period (15th to 14th)
INSERT INTO payroll_period_configs
  (company_id, department_id, name, period_type, period_start_day, period_end_day,
   payment_day, payment_month_offset, commission_period_offset, notes)
SELECT c.id, d.id, 'Indoor Sales Schedule', 'mid_month', 15, 14, 25, 0, 0,
       'Period: 15th of previous month to 14th of current month'
FROM companies c
JOIN departments d ON d.company_id = c.id AND d.name = 'Indoor Sales'
WHERE c.code = 'AA_ALIVE' OR c.name LIKE '%AA Alive%'
ON CONFLICT (company_id, department_id) DO NOTHING;

-- =====================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE ot_rules IS 'Company/department-specific overtime calculation rules';
COMMENT ON COLUMN ot_rules.ot_ph_after_hours_multiplier IS 'For Mimix: 3.0x rate for PH hours beyond normal threshold';
COMMENT ON COLUMN ot_rules.includes_break IS 'TRUE if normal_hours_per_day includes break time (e.g., AA Alive Driver 9hrs incl 1hr break)';

COMMENT ON TABLE payroll_period_configs IS 'Flexible payroll period and payment schedule configurations';
COMMENT ON COLUMN payroll_period_configs.period_type IS 'calendar_month=1st-31st, mid_month=15th-14th, custom=use start/end days';
COMMENT ON COLUMN payroll_period_configs.commission_period_offset IS '0=same period, -1=previous month (for Outdoor Sales)';

COMMENT ON TABLE employee_transfers IS 'Audit trail for employee transfers between companies';
COMMENT ON COLUMN employees.previous_employee_id IS 'Links to old employee record when transferred from another company';

COMMENT ON COLUMN resignations.notice_buyout_type IS 'employee_pays=short notice deduction, company_pays=termination compensation';
COMMENT ON COLUMN resignations.settlement_breakdown IS 'JSONB with detailed calculation breakdown for final settlement';
