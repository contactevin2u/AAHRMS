-- Add min_staff column to outlets table
-- This allows configuring minimum staff requirements per outlet for schedule coverage

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS min_staff INTEGER DEFAULT 2;

-- Add comment for documentation
COMMENT ON COLUMN outlets.min_staff IS 'Minimum staff required per shift for schedule coverage calculation';
