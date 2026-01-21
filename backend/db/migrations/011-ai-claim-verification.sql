-- Migration: AI Claim Verification
-- Adds columns for AI-based receipt verification and duplicate detection

-- Add AI verification columns to claims table
DO $$
BEGIN
  -- Receipt hash for duplicate detection
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='receipt_hash') THEN
    ALTER TABLE claims ADD COLUMN receipt_hash VARCHAR(64);
  END IF;

  -- AI extracted data
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='ai_extracted_amount') THEN
    ALTER TABLE claims ADD COLUMN ai_extracted_amount DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='ai_extracted_merchant') THEN
    ALTER TABLE claims ADD COLUMN ai_extracted_merchant VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='ai_extracted_date') THEN
    ALTER TABLE claims ADD COLUMN ai_extracted_date DATE;
  END IF;

  -- AI confidence level: high, low, unreadable
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='ai_confidence') THEN
    ALTER TABLE claims ADD COLUMN ai_confidence VARCHAR(20);
  END IF;

  -- Flag if employee ignored amount mismatch warning
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='amount_mismatch_ignored') THEN
    ALTER TABLE claims ADD COLUMN amount_mismatch_ignored BOOLEAN DEFAULT FALSE;
  END IF;

  -- Auto-approval flags
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='auto_approved') THEN
    ALTER TABLE claims ADD COLUMN auto_approved BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='auto_rejected') THEN
    ALTER TABLE claims ADD COLUMN auto_rejected BOOLEAN DEFAULT FALSE;
  END IF;

  -- Duplicate reference (if rejected as duplicate, reference to original claim)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='duplicate_of_claim_id') THEN
    ALTER TABLE claims ADD COLUMN duplicate_of_claim_id INTEGER REFERENCES claims(id);
  END IF;
END $$;

-- Index for faster duplicate checking
CREATE INDEX IF NOT EXISTS idx_claims_receipt_hash ON claims(receipt_hash);
CREATE INDEX IF NOT EXISTS idx_claims_ai_extracted ON claims(ai_extracted_merchant, ai_extracted_date, ai_extracted_amount);
