-- Migration: Salary Advances
-- Track salary advances given to employees and auto-deduct from payroll

-- Create salary_advances table
CREATE TABLE IF NOT EXISTS salary_advances (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),

  -- Advance details
  amount DECIMAL(10,2) NOT NULL,
  advance_date DATE NOT NULL,
  reason TEXT,
  reference_number VARCHAR(50),

  -- Repayment tracking
  deduction_method VARCHAR(20) DEFAULT 'full', -- 'full', 'installment'
  installment_amount DECIMAL(10,2),            -- If installment, how much per month
  total_deducted DECIMAL(10,2) DEFAULT 0,      -- How much has been deducted so far
  remaining_balance DECIMAL(10,2),             -- Auto-calculated: amount - total_deducted

  -- Status
  status VARCHAR(20) DEFAULT 'pending',        -- 'pending', 'active', 'completed', 'cancelled'
  approved_by INTEGER REFERENCES admin_users(id),
  approved_at TIMESTAMP,

  -- Payroll linking
  linked_payroll_item_id INTEGER REFERENCES payroll_items(id), -- When fully deducted
  expected_deduction_month INTEGER,            -- Which month to start deduction
  expected_deduction_year INTEGER,

  -- Audit
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track individual deductions (for installment plans)
CREATE TABLE IF NOT EXISTS salary_advance_deductions (
  id SERIAL PRIMARY KEY,
  advance_id INTEGER NOT NULL REFERENCES salary_advances(id),
  payroll_item_id INTEGER REFERENCES payroll_items(id),
  amount DECIMAL(10,2) NOT NULL,
  deduction_date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add advance_deduction column to payroll_items if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='advance_deduction') THEN
    ALTER TABLE payroll_items ADD COLUMN advance_deduction DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_salary_advances_employee ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_company ON salary_advances(company_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON salary_advances(status);
CREATE INDEX IF NOT EXISTS idx_salary_advances_expected_month ON salary_advances(expected_deduction_year, expected_deduction_month);
CREATE INDEX IF NOT EXISTS idx_advance_deductions_advance ON salary_advance_deductions(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_deductions_payroll ON salary_advance_deductions(payroll_item_id);

-- Trigger to auto-update remaining_balance
CREATE OR REPLACE FUNCTION update_advance_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update remaining balance when total_deducted changes
  NEW.remaining_balance := NEW.amount - COALESCE(NEW.total_deducted, 0);

  -- Auto-complete if fully paid
  IF NEW.remaining_balance <= 0 AND NEW.status = 'active' THEN
    NEW.status := 'completed';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_advance_balance ON salary_advances;
CREATE TRIGGER trg_update_advance_balance
BEFORE UPDATE ON salary_advances
FOR EACH ROW
EXECUTE FUNCTION update_advance_balance();

-- Function to calculate pending advances for an employee
CREATE OR REPLACE FUNCTION get_pending_advance_amount(p_employee_id INTEGER, p_month INTEGER, p_year INTEGER)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  total_pending DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN deduction_method = 'full' THEN remaining_balance
      WHEN deduction_method = 'installment' THEN LEAST(installment_amount, remaining_balance)
      ELSE remaining_balance
    END
  ), 0)
  INTO total_pending
  FROM salary_advances
  WHERE employee_id = p_employee_id
    AND status = 'active'
    AND (
      (expected_deduction_year < p_year) OR
      (expected_deduction_year = p_year AND expected_deduction_month <= p_month)
    );

  RETURN total_pending;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE salary_advances IS 'Track salary advances given to employees for auto-deduction from payroll';
COMMENT ON TABLE salary_advance_deductions IS 'Track individual deductions from salary advances (for installment plans)';
