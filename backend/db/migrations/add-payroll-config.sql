-- Add payroll_config JSONB column to companies table
-- This stores configurable payroll settings (work hours, rates, statutory flags, etc.)
-- Separate from payroll_settings which stores feature flags and legacy config

ALTER TABLE companies ADD COLUMN IF NOT EXISTS payroll_config JSONB DEFAULT '{}';

COMMENT ON COLUMN companies.payroll_config IS 'Company-level payroll configuration: work hours, part-time rates, statutory flags, outstation settings';
