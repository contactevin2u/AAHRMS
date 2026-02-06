-- =====================================================
-- Migration 014: AA Alive Payroll Separation
-- Date: 2026-02-06
--
-- Adds AA Alive-specific payroll columns and tables:
-- 1. New columns on payroll_items for driver earnings
-- 2. driver_commissions table for order/upsell tracking
-- 3. role_type on employees (driver vs office)
-- 4. is_outstation on clock_in_records
-- 5. AA Alive OT rules and payroll config
-- =====================================================

-- =====================================================
-- 1. Add AA Alive columns to payroll_items
-- =====================================================

ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS upsell_commission DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS order_commission DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS trip_allowance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS trip_allowance_days INTEGER DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ot_extra_days INTEGER DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ot_extra_days_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS employee_role_type VARCHAR(20);

-- =====================================================
-- 2. Create driver_commissions table
-- =====================================================

CREATE TABLE IF NOT EXISTS driver_commissions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  commission_type VARCHAR(20) NOT NULL CHECK (commission_type IN ('order', 'upsell')),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  rate_per_order DECIMAL(12,2) DEFAULT 0,
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('orderops', 'manual')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, period_month, period_year, commission_type)
);

CREATE INDEX IF NOT EXISTS idx_driver_commissions_employee ON driver_commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_driver_commissions_period ON driver_commissions(period_month, period_year);
CREATE INDEX IF NOT EXISTS idx_driver_commissions_company ON driver_commissions(company_id);

-- =====================================================
-- 3. Add role_type to employees
-- =====================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_type VARCHAR(20);

-- Populate role_type for AA Alive (company_id=1) based on department
UPDATE employees e
SET role_type = CASE
  WHEN d.name ILIKE '%driver%' OR e.position ILIKE '%driver%' THEN 'driver'
  ELSE 'office'
END
FROM departments d
WHERE e.department_id = d.id
  AND e.company_id = 1
  AND e.role_type IS NULL;

-- Set remaining AA Alive employees without department to 'office'
UPDATE employees
SET role_type = 'office'
WHERE company_id = 1
  AND role_type IS NULL;

-- =====================================================
-- 4. Add is_outstation to clock_in_records
-- =====================================================

ALTER TABLE clock_in_records ADD COLUMN IF NOT EXISTS is_outstation BOOLEAN DEFAULT FALSE;

-- Backfill is_outstation from notes field
UPDATE clock_in_records
SET is_outstation = TRUE
WHERE company_id = 1
  AND is_outstation = FALSE
  AND notes ILIKE '%outstation%';

-- =====================================================
-- 5. Insert/Update AA Alive OT rules
-- =====================================================

-- AA Alive company-wide OT rule: 9hr threshold (8hr work + 1hr break), 1.0x all
INSERT INTO ot_rules (
  company_id, department_id, name,
  normal_hours_per_day, includes_break, break_duration_minutes,
  ot_threshold_hours,
  ot_normal_multiplier, ot_weekend_multiplier, ot_ph_multiplier, ot_ph_after_hours_multiplier,
  rounding_method, rounding_direction, min_ot_hours,
  is_active
) VALUES (
  1, NULL, 'AA Alive Default',
  8.00, TRUE, 60,
  8.00,
  1.00, 1.00, 1.00, NULL,
  '30min', 'down', 0,
  TRUE
)
ON CONFLICT (company_id, department_id)
DO UPDATE SET
  name = 'AA Alive Default',
  normal_hours_per_day = 8.00,
  includes_break = TRUE,
  break_duration_minutes = 60,
  ot_threshold_hours = 8.00,
  ot_normal_multiplier = 1.00,
  ot_weekend_multiplier = 1.00,
  ot_ph_multiplier = 1.00,
  ot_ph_after_hours_multiplier = NULL,
  rounding_method = '30min',
  rounding_direction = 'down',
  min_ot_hours = 0,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- 6. Update AA Alive payroll_config
-- =====================================================

UPDATE companies
SET payroll_config = COALESCE(payroll_config, '{}'::jsonb) || '{
  "standard_work_days": 22,
  "ot_rate_divisor_days": 26,
  "ot_rate_divisor_hours": 8,
  "work_hours_per_day": 9,
  "trip_allowance_per_day": 100,
  "statutory_on_commission": true,
  "statutory_on_ot": false,
  "statutory_on_allowance": false
}'::jsonb
WHERE id = 1;
