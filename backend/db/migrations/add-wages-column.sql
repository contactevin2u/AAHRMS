-- Add wages column for part-time employees
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS wages DECIMAL(10,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS part_time_hours DECIMAL(10,2) DEFAULT 0;
