-- Migration: Add profile_picture column to employees table
-- Date: 2026-01-20
-- Description: Allow employees to upload profile pictures via ESS

-- Add profile_picture column to store Cloudinary URL
ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(500);

-- Create index for faster lookups when joining employee data
CREATE INDEX IF NOT EXISTS idx_employees_profile_picture ON employees(profile_picture) WHERE profile_picture IS NOT NULL;

-- Comment on column
COMMENT ON COLUMN employees.profile_picture IS 'Cloudinary URL for employee profile picture, uploaded via ESS';
