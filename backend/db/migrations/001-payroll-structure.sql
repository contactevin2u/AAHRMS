-- Migration: Multi-Company Payroll Structure Setup
-- Date: 2025-12-22
-- Description: Add new tables for department payroll components, sales records, and clock-in records

-- =====================================================
-- 1. Add new columns to existing tables
-- =====================================================

-- Add payroll_structure_code to departments table
ALTER TABLE departments ADD COLUMN IF NOT EXISTS payroll_structure_code VARCHAR(50);

-- Add tier and shift columns to employees table (for future use)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tier VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift VARCHAR(20);

-- =====================================================
-- 2. Create department_payroll_components table
-- =====================================================

CREATE TABLE IF NOT EXISTS department_payroll_components (
  id SERIAL PRIMARY KEY,
  department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  component_name VARCHAR(50) NOT NULL,  -- basic_salary, allowance, commission, ot, bonus, etc.
  is_enabled BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT false,
  default_value DECIMAL(12,2),
  calculation_type VARCHAR(30), -- fixed, percentage, hourly, per_trip, compare_higher
  calculation_config JSONB DEFAULT '{}',  -- Additional config (e.g., {rate: 6, base: 'total_sales'})
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(department_id, component_name)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dept_payroll_components_dept ON department_payroll_components(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_payroll_components_company ON department_payroll_components(company_id);

-- =====================================================
-- 3. Create sales_records table (for Indoor Sales commission)
-- =====================================================

CREATE TABLE IF NOT EXISTS sales_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  sales_date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_sales_records_employee ON sales_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_company ON sales_records(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_month_year ON sales_records(month, year);
CREATE INDEX IF NOT EXISTS idx_sales_records_date ON sales_records(sales_date);

-- =====================================================
-- 4. Create clock_in_records table (for future Clock In/Out feature)
-- =====================================================

CREATE TABLE IF NOT EXISTS clock_in_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMP NOT NULL,
  clock_out_time TIMESTAMP,
  clock_in_location JSONB,  -- {lat, lng, address}
  clock_out_location JSONB,
  total_hours DECIMAL(5,2),
  ot_hours DECIMAL(5,2) DEFAULT 0,
  work_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  approved_by INTEGER REFERENCES admin_users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_clock_in_employee ON clock_in_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_clock_in_company ON clock_in_records(company_id);
CREATE INDEX IF NOT EXISTS idx_clock_in_work_date ON clock_in_records(work_date);
CREATE INDEX IF NOT EXISTS idx_clock_in_status ON clock_in_records(status);

-- =====================================================
-- 5. Update companies table settings column
-- =====================================================

-- The settings column already exists as JSONB, we'll use it to store:
-- {
--   clock_in_enabled: boolean,
--   clock_in_departments: [department_ids],
--   ot_calculation_method: 'clock_in' | 'manual',
--   default_ot_rate: 1.0,
--   indoor_sales_basic: 4000,
--   indoor_sales_commission_rate: 6
-- }

-- =====================================================
-- 6. Update payroll_items table for Indoor Sales tracking
-- =====================================================

-- Add columns to track Indoor Sales calculation method
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS sales_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS salary_calculation_method VARCHAR(30); -- 'basic' or 'commission' for Indoor Sales

-- =====================================================
-- 7. Create view for employee monthly sales summary
-- =====================================================

CREATE OR REPLACE VIEW employee_monthly_sales AS
SELECT
  employee_id,
  company_id,
  month,
  year,
  SUM(total_sales) as total_monthly_sales,
  COUNT(*) as sales_record_count
FROM sales_records
GROUP BY employee_id, company_id, month, year;

-- =====================================================
-- 8. Create view for employee monthly clock-in summary
-- =====================================================

CREATE OR REPLACE VIEW employee_monthly_clock_in AS
SELECT
  employee_id,
  company_id,
  EXTRACT(MONTH FROM work_date) as month,
  EXTRACT(YEAR FROM work_date) as year,
  SUM(total_hours) as total_work_hours,
  SUM(ot_hours) as total_ot_hours,
  COUNT(*) as work_days
FROM clock_in_records
WHERE status = 'approved'
GROUP BY employee_id, company_id, EXTRACT(MONTH FROM work_date), EXTRACT(YEAR FROM work_date);
