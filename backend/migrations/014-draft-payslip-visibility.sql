-- Add draft_payslips_visible column to payroll_runs
-- When true, employees can see draft payslips in ESS (with DRAFT watermark)
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS draft_payslips_visible BOOLEAN DEFAULT false;
