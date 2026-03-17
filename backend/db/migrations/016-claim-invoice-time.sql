-- Migration: Add invoice number and time to claims for better duplicate detection
-- Previously duplicate detection only used merchant + date + amount,
-- which caused false positives for legitimate separate purchases

DO $$
BEGIN
  -- AI extracted invoice/receipt number
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='ai_extracted_invoice_no') THEN
    ALTER TABLE claims ADD COLUMN ai_extracted_invoice_no VARCHAR(100);
  END IF;

  -- AI extracted transaction time
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='ai_extracted_time') THEN
    ALTER TABLE claims ADD COLUMN ai_extracted_time VARCHAR(20);
  END IF;
END $$;
