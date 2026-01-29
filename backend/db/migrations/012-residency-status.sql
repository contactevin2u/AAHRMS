-- Migration 012: Add residency_status for EPF rate determination
-- Values: 'malaysian' (default), 'pr' (permanent resident), 'foreign' (foreign worker)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='residency_status') THEN
    ALTER TABLE employees ADD COLUMN residency_status VARCHAR(20) DEFAULT 'malaysian';
  END IF;
END $$;
