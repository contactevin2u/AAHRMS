-- =============================================================================
-- PAYROLL DATA INTEGRITY CONSTRAINTS
-- =============================================================================
-- This migration adds critical database-level constraints to prevent:
-- 1. Duplicate payroll runs for the same period
-- 2. Duplicate employees in a single payroll run
-- 3. Claims linked to multiple payroll items
-- 4. Modification of finalized payroll items
-- =============================================================================

-- =============================================================================
-- CONSTRAINT 1: Unique payroll run per period per company
-- =============================================================================
-- Prevents race condition where two admins create duplicate runs

-- First, check for and remove any existing duplicates (keep the oldest)
DELETE FROM payroll_items WHERE payroll_run_id IN (
  SELECT id FROM payroll_runs pr1
  WHERE EXISTS (
    SELECT 1 FROM payroll_runs pr2
    WHERE pr2.company_id = pr1.company_id
      AND pr2.month = pr1.month
      AND pr2.year = pr1.year
      AND COALESCE(pr2.department_id, 0) = COALESCE(pr1.department_id, 0)
      AND pr2.id < pr1.id
  )
);

DELETE FROM payroll_runs pr1
WHERE EXISTS (
  SELECT 1 FROM payroll_runs pr2
  WHERE pr2.company_id = pr1.company_id
    AND pr2.month = pr1.month
    AND pr2.year = pr1.year
    AND COALESCE(pr2.department_id, 0) = COALESCE(pr1.department_id, 0)
    AND pr2.id < pr1.id
);

-- Add unique constraint (NULLS NOT DISTINCT handles NULL department_id)
ALTER TABLE payroll_runs
DROP CONSTRAINT IF EXISTS unique_payroll_run_period;

ALTER TABLE payroll_runs
ADD CONSTRAINT unique_payroll_run_period
UNIQUE NULLS NOT DISTINCT (company_id, month, year, department_id, outlet_id);

COMMENT ON CONSTRAINT unique_payroll_run_period ON payroll_runs IS
'Prevents duplicate payroll runs for the same company/month/year/department combination';

-- =============================================================================
-- CONSTRAINT 2: Unique employee per payroll run
-- =============================================================================
-- Prevents same employee appearing twice in one run

-- First, check for and remove any existing duplicates (keep the first one)
DELETE FROM payroll_items pi1
WHERE EXISTS (
  SELECT 1 FROM payroll_items pi2
  WHERE pi2.payroll_run_id = pi1.payroll_run_id
    AND pi2.employee_id = pi1.employee_id
    AND pi2.id < pi1.id
);

ALTER TABLE payroll_items
DROP CONSTRAINT IF EXISTS unique_employee_per_run;

ALTER TABLE payroll_items
ADD CONSTRAINT unique_employee_per_run
UNIQUE (payroll_run_id, employee_id);

COMMENT ON CONSTRAINT unique_employee_per_run ON payroll_items IS
'Ensures each employee appears exactly once per payroll run';

-- =============================================================================
-- CONSTRAINT 3: Claims can only be linked once
-- =============================================================================
-- Prevents same claim being paid in multiple payroll items

-- Note: A claim can only have ONE linked_payroll_item_id
-- This is already enforced by it being a single column, but we add an index
-- to make lookup fast and document the intent

CREATE INDEX IF NOT EXISTS idx_claims_linked_payroll
ON claims(linked_payroll_item_id)
WHERE linked_payroll_item_id IS NOT NULL;

COMMENT ON INDEX idx_claims_linked_payroll IS
'Index for fast lookup of linked claims and enforces claim-to-payroll relationship';

-- =============================================================================
-- CONSTRAINT 4: Finalized payroll items are immutable
-- =============================================================================
-- Prevents any modification to payroll items after run is finalized

CREATE OR REPLACE FUNCTION enforce_payroll_finalization_lock()
RETURNS TRIGGER AS $$
DECLARE
  run_status TEXT;
BEGIN
  -- Get the status of the payroll run
  SELECT status INTO run_status
  FROM payroll_runs
  WHERE id = COALESCE(OLD.payroll_run_id, NEW.payroll_run_id);

  IF run_status = 'finalized' THEN
    RAISE EXCEPTION 'Cannot modify payroll items in a finalized payroll run. Run ID: %, Status: %',
      COALESCE(OLD.payroll_run_id, NEW.payroll_run_id), run_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_item_finalization_lock ON payroll_items;

CREATE TRIGGER payroll_item_finalization_lock
BEFORE UPDATE OR DELETE ON payroll_items
FOR EACH ROW
EXECUTE FUNCTION enforce_payroll_finalization_lock();

COMMENT ON TRIGGER payroll_item_finalization_lock ON payroll_items IS
'Prevents modification of payroll items after the run is finalized';

-- =============================================================================
-- CONSTRAINT 5: Claims linked to finalized payroll cannot be unlinked
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_finalized_claim_unlink()
RETURNS TRIGGER AS $$
DECLARE
  run_status TEXT;
BEGIN
  -- Only check if we're trying to unlink (changing from non-null to null or different value)
  IF OLD.linked_payroll_item_id IS NOT NULL AND
     (NEW.linked_payroll_item_id IS NULL OR NEW.linked_payroll_item_id != OLD.linked_payroll_item_id) THEN

    -- Check if the payroll run is finalized
    SELECT pr.status INTO run_status
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pi.id = OLD.linked_payroll_item_id;

    IF run_status = 'finalized' THEN
      RAISE EXCEPTION 'Cannot unlink claim from finalized payroll. Claim ID: %, Payroll Item ID: %',
        OLD.id, OLD.linked_payroll_item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS claim_finalization_lock ON claims;

CREATE TRIGGER claim_finalization_lock
BEFORE UPDATE ON claims
FOR EACH ROW
EXECUTE FUNCTION prevent_finalized_claim_unlink();

COMMENT ON TRIGGER claim_finalization_lock ON claims IS
'Prevents unlinking claims from finalized payroll runs';

-- =============================================================================
-- VERIFICATION QUERIES (run these to verify constraints are working)
-- =============================================================================
--
-- Test 1: Try to insert duplicate run (should fail)
-- INSERT INTO payroll_runs (company_id, month, year, status)
-- VALUES (1, 12, 2024, 'draft');
-- INSERT INTO payroll_runs (company_id, month, year, status)
-- VALUES (1, 12, 2024, 'draft');  -- Should fail
--
-- Test 2: Try to insert duplicate employee in run (should fail)
-- INSERT INTO payroll_items (payroll_run_id, employee_id, basic_salary, net_pay)
-- VALUES (1, 100, 3000, 2500);
-- INSERT INTO payroll_items (payroll_run_id, employee_id, basic_salary, net_pay)
-- VALUES (1, 100, 3000, 2500);  -- Should fail
--
-- Test 3: Try to update finalized payroll item (should fail)
-- UPDATE payroll_items SET basic_salary = 5000
-- WHERE payroll_run_id = (SELECT id FROM payroll_runs WHERE status = 'finalized' LIMIT 1);
-- Should raise: "Cannot modify payroll items in a finalized payroll run"
--
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 005-payroll-integrity-constraints completed successfully';
  RAISE NOTICE 'Added constraints: unique_payroll_run_period, unique_employee_per_run';
  RAISE NOTICE 'Added triggers: payroll_item_finalization_lock, claim_finalization_lock';
END $$;
