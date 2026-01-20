-- Migration: Combine Sick Leave (SL) and Medical Leave (ML)
-- Sick Leave and Medical Leave are the same thing - 14 days for all companies

-- Step 1: Insert ML (Medical Leave) for each company if it doesn't exist
INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment)
SELECT 'ML', 'Medical Leave', TRUE, 14, 'Medical/Sick Leave - 14 days per year', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE code = 'ML' AND company_id = 1);

INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment)
SELECT 'ML', 'Medical Leave', TRUE, 14, 'Medical/Sick Leave - 14 days per year', 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE code = 'ML' AND company_id = 3);

-- Step 2: Update any existing ML leave types to have 14 days (remove service year rules)
UPDATE leave_types
SET default_days_per_year = 14,
    description = 'Medical/Sick Leave - 14 days per year',
    entitlement_rules = NULL
WHERE code = 'ML';

-- Step 3: Transfer any SL (Sick Leave) balances to ML (Medical Leave)
-- First, update leave_balances to point to ML instead of SL
UPDATE leave_balances lb
SET leave_type_id = (
  SELECT id FROM leave_types
  WHERE code = 'ML' AND company_id = (
    SELECT company_id FROM employees WHERE id = lb.employee_id
  )
  LIMIT 1
)
WHERE lb.leave_type_id IN (SELECT id FROM leave_types WHERE code = 'SL');

-- Step 4: Transfer any SL leave_requests to ML
UPDATE leave_requests lr
SET leave_type_id = (
  SELECT id FROM leave_types
  WHERE code = 'ML' AND company_id = (
    SELECT company_id FROM employees WHERE id = lr.employee_id
  )
  LIMIT 1
)
WHERE lr.leave_type_id IN (SELECT id FROM leave_types WHERE code = 'SL');

-- Step 5: Delete SL (Sick Leave) leave types (now that balances/requests are migrated)
DELETE FROM leave_types WHERE code = 'SL';

-- Verify the changes
SELECT id, code, name, default_days_per_year, company_id, description FROM leave_types WHERE code IN ('ML', 'SL') ORDER BY company_id, code;
