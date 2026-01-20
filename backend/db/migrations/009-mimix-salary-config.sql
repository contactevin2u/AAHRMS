-- =====================================================
-- Migration 009: Mimix Salary Configuration
-- Date: 2025-01-20
--
-- This migration configures:
-- 1. Mimix employee salary structure
--    - Supervisor: RM 2000
--    - Full time (confirmed): RM 1800
--    - Full time (probation): RM 1700
--    - Part time: RM 8.72/hour
-- 2. OT rates for Mimix
--    - Normal: 1.5x
--    - PH: 2.0x
--    - PH after hours: 3.0x
-- 3. Auto salary update on probation confirmation
-- =====================================================

-- =====================================================
-- 1. ADD HOURLY_RATE COLUMN FOR PART-TIME EMPLOYEES
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='hourly_rate') THEN
    ALTER TABLE employees ADD COLUMN hourly_rate DECIMAL(10,2) DEFAULT 0;
    COMMENT ON COLUMN employees.hourly_rate IS 'Hourly rate for part-time employees (e.g., RM 8.72/hour for Mimix)';
  END IF;
END $$;

-- =====================================================
-- 2. ADD MIN_OT_HOURS TO OT_RULES TABLE
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ot_rules' AND column_name='min_ot_hours') THEN
    ALTER TABLE ot_rules ADD COLUMN min_ot_hours DECIMAL(4,2) DEFAULT 1.00;
    COMMENT ON COLUMN ot_rules.min_ot_hours IS 'Minimum OT hours required before counting (e.g., 1.0 = less than 1 hour OT rounds to 0)';
  END IF;
END $$;

-- =====================================================
-- 3. UPDATE/INSERT MIMIX OT RULES
-- =====================================================

-- Update existing Mimix OT rules or insert if not exists
INSERT INTO ot_rules (
  company_id,
  department_id,
  name,
  normal_hours_per_day,
  includes_break,
  break_duration_minutes,
  ot_threshold_hours,
  ot_normal_multiplier,
  ot_weekend_multiplier,
  ot_ph_multiplier,
  ot_ph_after_hours_multiplier,
  min_ot_hours,
  rounding_method,
  rounding_direction
)
SELECT
  c.id,
  NULL,  -- All departments
  'Mimix Standard OT',
  8.00,  -- 8 hour shift including break
  TRUE,
  60,    -- 1 hour break
  7.50,  -- OT starts after 7.5 working hours (8 - 0.5hr break deducted)
  1.50,  -- Normal OT: 1.5x
  1.50,  -- Weekend OT: 1.5x
  2.00,  -- PH: 2.0x
  3.00,  -- PH after hours: 3.0x
  1.00,  -- Minimum 1 hour OT required
  '30min',
  'down'
FROM companies c
WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, department_id) DO UPDATE SET
  normal_hours_per_day = 8.00,
  includes_break = TRUE,
  break_duration_minutes = 60,
  ot_threshold_hours = 7.50,
  ot_normal_multiplier = 1.50,
  ot_weekend_multiplier = 1.50,
  ot_ph_multiplier = 2.00,
  ot_ph_after_hours_multiplier = 3.00,
  min_ot_hours = 1.00,
  rounding_method = '30min',
  rounding_direction = 'down',
  updated_at = NOW();

-- =====================================================
-- 4. CREATE MIMIX SALARY CONFIGURATION TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS mimix_salary_config (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL,
  position_role VARCHAR(50) NOT NULL,  -- 'supervisor', 'crew', 'manager'
  work_type VARCHAR(20) NOT NULL,      -- 'full_time', 'part_time'
  employment_type VARCHAR(20),         -- 'probation', 'confirmed', NULL for all
  basic_salary DECIMAL(10,2) DEFAULT 0,
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, position_role, work_type, employment_type)
);

COMMENT ON TABLE mimix_salary_config IS 'Salary configuration for Mimix positions based on role, work type, and employment status';

-- Insert Mimix salary configurations
-- Supervisor: RM 2000 (full time, confirmed)
INSERT INTO mimix_salary_config (company_id, position_role, work_type, employment_type, basic_salary, hourly_rate)
SELECT c.id, 'supervisor', 'full_time', 'confirmed', 2000.00, 0
FROM companies c WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, position_role, work_type, employment_type) DO UPDATE SET basic_salary = 2000.00, updated_at = NOW();

-- Supervisor: RM 2000 (full time, probation - same as confirmed for supervisors)
INSERT INTO mimix_salary_config (company_id, position_role, work_type, employment_type, basic_salary, hourly_rate)
SELECT c.id, 'supervisor', 'full_time', 'probation', 2000.00, 0
FROM companies c WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, position_role, work_type, employment_type) DO UPDATE SET basic_salary = 2000.00, updated_at = NOW();

-- Crew (service crew, cashier): RM 1800 confirmed
INSERT INTO mimix_salary_config (company_id, position_role, work_type, employment_type, basic_salary, hourly_rate)
SELECT c.id, 'crew', 'full_time', 'confirmed', 1800.00, 0
FROM companies c WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, position_role, work_type, employment_type) DO UPDATE SET basic_salary = 1800.00, updated_at = NOW();

-- Crew (service crew, cashier): RM 1700 probation
INSERT INTO mimix_salary_config (company_id, position_role, work_type, employment_type, basic_salary, hourly_rate)
SELECT c.id, 'crew', 'full_time', 'probation', 1700.00, 0
FROM companies c WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, position_role, work_type, employment_type) DO UPDATE SET basic_salary = 1700.00, updated_at = NOW();

-- Part time: RM 8.72/hour (all roles)
INSERT INTO mimix_salary_config (company_id, position_role, work_type, employment_type, basic_salary, hourly_rate)
SELECT c.id, 'crew', 'part_time', NULL, 0, 8.72
FROM companies c WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, position_role, work_type, employment_type) DO UPDATE SET hourly_rate = 8.72, updated_at = NOW();

-- Manager: RM 2500 (for future use)
INSERT INTO mimix_salary_config (company_id, position_role, work_type, employment_type, basic_salary, hourly_rate)
SELECT c.id, 'manager', 'full_time', 'confirmed', 2500.00, 0
FROM companies c WHERE c.code = 'MIMIX' OR c.name LIKE '%Mimix%'
ON CONFLICT (company_id, position_role, work_type, employment_type) DO UPDATE SET basic_salary = 2500.00, updated_at = NOW();

-- =====================================================
-- 5. UPDATE EXISTING MIMIX EMPLOYEES WITH NEW SALARIES
-- =====================================================

-- Update Supervisor salaries
UPDATE employees e
SET
  default_basic_salary = 2000.00,
  salary_before_confirmation = CASE WHEN employment_type = 'probation' THEN 2000.00 ELSE salary_before_confirmation END,
  salary_after_confirmation = 2000.00,
  updated_at = NOW()
FROM positions p
WHERE e.position_id = p.id
  AND p.role = 'supervisor'
  AND e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'full_time'
  AND e.status = 'active';

-- Update Full-time Crew (confirmed) salaries
UPDATE employees e
SET
  default_basic_salary = 1800.00,
  salary_after_confirmation = 1800.00,
  updated_at = NOW()
FROM positions p
WHERE e.position_id = p.id
  AND p.role = 'crew'
  AND e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'full_time'
  AND e.employment_type = 'confirmed'
  AND e.status = 'active';

-- Update Full-time Crew (probation) salaries
UPDATE employees e
SET
  default_basic_salary = 1700.00,
  salary_before_confirmation = 1700.00,
  salary_after_confirmation = 1800.00,
  increment_amount = 100.00,
  updated_at = NOW()
FROM positions p
WHERE e.position_id = p.id
  AND p.role = 'crew'
  AND e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'full_time'
  AND e.employment_type = 'probation'
  AND e.status = 'active';

-- Update Part-time employees hourly rate
UPDATE employees e
SET
  hourly_rate = 8.72,
  default_basic_salary = 0,
  updated_at = NOW()
WHERE e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'PART TIMER'
  AND e.status = 'active';

-- =====================================================
-- 6. ALSO UPDATE BY POSITION NAME (fallback for employees without position_id)
-- =====================================================

-- Update supervisors by position name
UPDATE employees e
SET
  default_basic_salary = 2000.00,
  salary_before_confirmation = CASE WHEN employment_type = 'probation' THEN 2000.00 ELSE salary_before_confirmation END,
  salary_after_confirmation = 2000.00,
  updated_at = NOW()
WHERE e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'full_time'
  AND e.status = 'active'
  AND e.position_id IS NULL
  AND (LOWER(e.position) LIKE '%supervisor%' OR LOWER(e.employee_role) = 'supervisor');

-- Update crew (confirmed) by position name
UPDATE employees e
SET
  default_basic_salary = 1800.00,
  salary_after_confirmation = 1800.00,
  updated_at = NOW()
WHERE e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'full_time'
  AND e.employment_type = 'confirmed'
  AND e.status = 'active'
  AND e.position_id IS NULL
  AND (
    LOWER(e.position) LIKE '%crew%'
    OR LOWER(e.position) LIKE '%cashier%'
    OR LOWER(e.position) LIKE '%service%'
    OR LOWER(e.employee_role) = 'staff'
    OR e.position IS NULL
  );

-- Update crew (probation) by position name
UPDATE employees e
SET
  default_basic_salary = 1700.00,
  salary_before_confirmation = 1700.00,
  salary_after_confirmation = 1800.00,
  increment_amount = 100.00,
  updated_at = NOW()
WHERE e.company_id IN (SELECT id FROM companies WHERE code = 'MIMIX' OR name LIKE '%Mimix%')
  AND e.work_type = 'full_time'
  AND e.employment_type = 'probation'
  AND e.status = 'active'
  AND e.position_id IS NULL
  AND (
    LOWER(e.position) LIKE '%crew%'
    OR LOWER(e.position) LIKE '%cashier%'
    OR LOWER(e.position) LIKE '%service%'
    OR LOWER(e.employee_role) = 'staff'
    OR e.position IS NULL
  );

-- =====================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE mimix_salary_config IS
'Mimix salary structure:
- Supervisor (full_time): RM 2000
- Crew (full_time, confirmed): RM 1800
- Crew (full_time, probation): RM 1700
- Part-time: RM 8.72/hour

OT Rates:
- Normal: 1.5x
- PH: 2.0x
- PH after working hours: 3.0x

When probation employee is confirmed:
1. employment_type changes from ''probation'' to ''confirmed''
2. default_basic_salary is updated to salary_after_confirmation (RM 1800)
3. This happens automatically via probation.js confirm endpoint';
