-- Add absent days tracking to payroll items
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS absent_days DECIMAL(5,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS absent_day_deduction DECIMAL(10,2) DEFAULT 0;
