-- Migration: Add letterhead and company stamp columns to companies table
-- Date: 2026-03-12

-- Add letterhead image URL column
ALTER TABLE companies ADD COLUMN IF NOT EXISTS letterhead_url TEXT;

-- Add company stamp/chop image URL column
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_stamp_url TEXT;
