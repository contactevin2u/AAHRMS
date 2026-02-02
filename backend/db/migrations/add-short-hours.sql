-- Add short hours tracking to payroll_items
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS short_hours NUMERIC(6,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS short_hours_deduction NUMERIC(10,2) DEFAULT 0;
