const { Pool } = require('pg');
require('dotenv').config();

// Support both DATABASE_URL (Render) and individual vars (local)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hrms_db',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Auto-create tables on startup
const initDb = async () => {
  try {
    await pool.query(`
      -- Anonymous Feedback
      CREATE TABLE IF NOT EXISTS anonymous_feedback (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE,
        admin_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON anonymous_feedback(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_category ON anonymous_feedback(category);
      CREATE INDEX IF NOT EXISTS idx_feedback_is_read ON anonymous_feedback(is_read);

      -- Departments
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        salary_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Fix duplicate departments (for existing tables)
      DO $$
      DECLARE
        dept_name TEXT;
        keep_id INTEGER;
      BEGIN
        -- For each duplicate department name, update employees to use the lowest id
        FOR dept_name, keep_id IN
          SELECT LOWER(name), MIN(id) FROM departments GROUP BY LOWER(name) HAVING COUNT(*) > 1
        LOOP
          -- Update employees to point to the kept department
          UPDATE employees SET department_id = keep_id
          WHERE department_id IN (SELECT id FROM departments WHERE LOWER(name) = dept_name AND id != keep_id);

          -- Update salary_configs to point to the kept department
          UPDATE salary_configs SET department_id = keep_id
          WHERE department_id IN (SELECT id FROM departments WHERE LOWER(name) = dept_name AND id != keep_id);

          -- Delete duplicate departments
          DELETE FROM departments WHERE LOWER(name) = dept_name AND id != keep_id;
        END LOOP;

        -- Add unique constraint if not exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'departments_name_key'
        ) THEN
          ALTER TABLE departments ADD CONSTRAINT departments_name_key UNIQUE (name);
        END IF;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
        WHEN others THEN
          NULL;
      END $$;

      -- Employees
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        ic_number VARCHAR(20),
        department_id INTEGER REFERENCES departments(id),
        position VARCHAR(100),
        join_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        bank_name VARCHAR(100),
        bank_account_no VARCHAR(50),
        bank_account_holder VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add bank columns if they don't exist (for existing tables)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='bank_name') THEN
          ALTER TABLE employees ADD COLUMN bank_name VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='bank_account_no') THEN
          ALTER TABLE employees ADD COLUMN bank_account_no VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='bank_account_holder') THEN
          ALTER TABLE employees ADD COLUMN bank_account_holder VARCHAR(100);
        END IF;
        -- Statutory fields for employees
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='epf_number') THEN
          ALTER TABLE employees ADD COLUMN epf_number VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='socso_number') THEN
          ALTER TABLE employees ADD COLUMN socso_number VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='tax_number') THEN
          ALTER TABLE employees ADD COLUMN tax_number VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='epf_contribution_type') THEN
          ALTER TABLE employees ADD COLUMN epf_contribution_type VARCHAR(20) DEFAULT 'normal';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='marital_status') THEN
          ALTER TABLE employees ADD COLUMN marital_status VARCHAR(20) DEFAULT 'single';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='spouse_working') THEN
          ALTER TABLE employees ADD COLUMN spouse_working BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='children_count') THEN
          ALTER TABLE employees ADD COLUMN children_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='date_of_birth') THEN
          ALTER TABLE employees ADD COLUMN date_of_birth DATE;
        END IF;
        -- Default salary fields for each employee
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='default_basic_salary') THEN
          ALTER TABLE employees ADD COLUMN default_basic_salary DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='default_allowance') THEN
          ALTER TABLE employees ADD COLUMN default_allowance DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='commission_rate') THEN
          ALTER TABLE employees ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='per_trip_rate') THEN
          ALTER TABLE employees ADD COLUMN per_trip_rate DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='ot_rate') THEN
          ALTER TABLE employees ADD COLUMN ot_rate DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='outstation_rate') THEN
          ALTER TABLE employees ADD COLUMN outstation_rate DECIMAL(10,2) DEFAULT 0;
        END IF;
        -- Additional salary fields for flexible earning components
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='default_bonus') THEN
          ALTER TABLE employees ADD COLUMN default_bonus DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='trade_commission_rate') THEN
          ALTER TABLE employees ADD COLUMN trade_commission_rate DECIMAL(5,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='default_incentive') THEN
          ALTER TABLE employees ADD COLUMN default_incentive DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='default_other_earnings') THEN
          ALTER TABLE employees ADD COLUMN default_other_earnings DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='other_earnings_description') THEN
          ALTER TABLE employees ADD COLUMN other_earnings_description VARCHAR(255);
        END IF;
        -- Address field
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='address') THEN
          ALTER TABLE employees ADD COLUMN address TEXT;
        END IF;
      END $$;

      -- Salary Configuration per Department
      CREATE TABLE IF NOT EXISTS salary_configs (
        id SERIAL PRIMARY KEY,
        department_id INTEGER REFERENCES departments(id),
        basic_salary DECIMAL(10,2) DEFAULT 0,
        has_commission BOOLEAN DEFAULT FALSE,
        commission_rate DECIMAL(5,2) DEFAULT 0,
        has_allowance BOOLEAN DEFAULT FALSE,
        allowance_amount DECIMAL(10,2) DEFAULT 0,
        has_per_trip BOOLEAN DEFAULT FALSE,
        per_trip_rate DECIMAL(10,2) DEFAULT 0,
        has_ot BOOLEAN DEFAULT FALSE,
        ot_rate DECIMAL(10,2) DEFAULT 0,
        has_outstation BOOLEAN DEFAULT FALSE,
        outstation_rate DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Monthly Payroll Records
      CREATE TABLE IF NOT EXISTS payroll (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id),
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        basic_salary DECIMAL(10,2) DEFAULT 0,
        commission DECIMAL(10,2) DEFAULT 0,
        allowance DECIMAL(10,2) DEFAULT 0,
        trip_pay DECIMAL(10,2) DEFAULT 0,
        ot_pay DECIMAL(10,2) DEFAULT 0,
        outstation_pay DECIMAL(10,2) DEFAULT 0,
        bonus DECIMAL(10,2) DEFAULT 0,
        deductions DECIMAL(10,2) DEFAULT 0,
        total_salary DECIMAL(10,2) DEFAULT 0,
        sales_amount DECIMAL(10,2) DEFAULT 0,
        trip_count INTEGER DEFAULT 0,
        ot_hours DECIMAL(5,2) DEFAULT 0,
        outstation_days INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'draft',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, month, year)
      );

      -- Add statutory columns to payroll if not exist
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='epf_employee') THEN
          ALTER TABLE payroll ADD COLUMN epf_employee DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='epf_employer') THEN
          ALTER TABLE payroll ADD COLUMN epf_employer DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='socso_employee') THEN
          ALTER TABLE payroll ADD COLUMN socso_employee DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='socso_employer') THEN
          ALTER TABLE payroll ADD COLUMN socso_employer DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='eis_employee') THEN
          ALTER TABLE payroll ADD COLUMN eis_employee DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='eis_employer') THEN
          ALTER TABLE payroll ADD COLUMN eis_employer DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='pcb') THEN
          ALTER TABLE payroll ADD COLUMN pcb DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='gross_salary') THEN
          ALTER TABLE payroll ADD COLUMN gross_salary DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='net_salary') THEN
          ALTER TABLE payroll ADD COLUMN net_salary DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='other_deductions') THEN
          ALTER TABLE payroll ADD COLUMN other_deductions DECIMAL(10,2) DEFAULT 0;
        END IF;
      END $$;

      -- Insert default departments if not exists
      INSERT INTO departments (name, salary_type) VALUES
        ('Office', 'fixed_bonus_commission_allowance'),
        ('Indoor Sales', 'commission_only'),
        ('Outdoor Sales', 'basic_allowance_commission'),
        ('Driver', 'basic_trip_commission_outstation_ot')
      ON CONFLICT DO NOTHING;

      -- =====================================================
      -- NEW HRMS SYSTEM TABLES
      -- =====================================================

      -- Leave Types (AL, ML, UL, etc.)
      CREATE TABLE IF NOT EXISTS leave_types (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        is_paid BOOLEAN DEFAULT TRUE,
        default_days_per_year INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert default leave types
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description) VALUES
        ('AL', 'Annual Leave', TRUE, 14, 'Paid annual leave'),
        ('ML', 'Medical Leave', TRUE, 14, 'Paid medical/sick leave'),
        ('UL', 'Unpaid Leave', FALSE, 0, 'Unpaid leave - deducted from salary'),
        ('EL', 'Emergency Leave', TRUE, 3, 'Emergency leave'),
        ('CL', 'Compassionate Leave', TRUE, 3, 'Bereavement/compassionate leave'),
        ('ML2', 'Maternity Leave', TRUE, 60, 'Maternity leave'),
        ('PL', 'Paternity Leave', TRUE, 7, 'Paternity leave')
      ON CONFLICT (code) DO NOTHING;

      -- Leave Balances (per employee per year)
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id INTEGER REFERENCES leave_types(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        entitled_days DECIMAL(5,2) DEFAULT 0,
        used_days DECIMAL(5,2) DEFAULT 0,
        carried_forward DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, leave_type_id, year)
      );

      -- Leave Requests
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id INTEGER REFERENCES leave_types(id),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days DECIMAL(5,2) NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        approver_id INTEGER REFERENCES admin_users(id),
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
      CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
      CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

      -- Claims
      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        claim_date DATE NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT,
        amount DECIMAL(10,2) NOT NULL,
        receipt_url TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        approver_id INTEGER REFERENCES admin_users(id),
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        linked_payroll_item_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_claims_employee ON claims(employee_id);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
      CREATE INDEX IF NOT EXISTS idx_claims_date ON claims(claim_date);

      -- Payroll Runs (monthly payroll batch)
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id SERIAL PRIMARY KEY,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        total_gross DECIMAL(12,2) DEFAULT 0,
        total_deductions DECIMAL(12,2) DEFAULT 0,
        total_net DECIMAL(12,2) DEFAULT 0,
        total_employer_cost DECIMAL(12,2) DEFAULT 0,
        employee_count INTEGER DEFAULT 0,
        notes TEXT,
        department_id INTEGER REFERENCES departments(id),
        created_by INTEGER REFERENCES admin_users(id),
        finalized_at TIMESTAMP,
        finalized_by INTEGER REFERENCES admin_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add department_id column to payroll_runs if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='department_id') THEN
          ALTER TABLE payroll_runs ADD COLUMN department_id INTEGER REFERENCES departments(id);
        END IF;
        -- Drop old unique constraint and add new one with department_id
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_month_year_key') THEN
          ALTER TABLE payroll_runs DROP CONSTRAINT payroll_runs_month_year_key;
        END IF;
      END $$;

      -- Create unique index for month, year, department_id (nullable)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_unique
      ON payroll_runs (month, year, COALESCE(department_id, -1));

      -- Payroll Items (one per employee per payroll run)
      CREATE TABLE IF NOT EXISTS payroll_items (
        id SERIAL PRIMARY KEY,
        payroll_run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,

        -- Earnings
        basic_salary DECIMAL(10,2) DEFAULT 0,
        fixed_allowance DECIMAL(10,2) DEFAULT 0,
        ot_amount DECIMAL(10,2) DEFAULT 0,
        incentive_amount DECIMAL(10,2) DEFAULT 0,
        commission_amount DECIMAL(10,2) DEFAULT 0,
        claims_amount DECIMAL(10,2) DEFAULT 0,
        bonus DECIMAL(10,2) DEFAULT 0,
        other_earnings DECIMAL(10,2) DEFAULT 0,
        gross_salary DECIMAL(10,2) DEFAULT 0,

        -- Leave deductions
        unpaid_leave_days DECIMAL(5,2) DEFAULT 0,
        unpaid_leave_deduction DECIMAL(10,2) DEFAULT 0,

        -- Statutory deductions
        epf_employee DECIMAL(10,2) DEFAULT 0,
        epf_employer DECIMAL(10,2) DEFAULT 0,
        socso_employee DECIMAL(10,2) DEFAULT 0,
        socso_employer DECIMAL(10,2) DEFAULT 0,
        eis_employee DECIMAL(10,2) DEFAULT 0,
        eis_employer DECIMAL(10,2) DEFAULT 0,
        pcb DECIMAL(10,2) DEFAULT 0,

        -- Other deductions
        other_deductions DECIMAL(10,2) DEFAULT 0,
        deduction_remarks TEXT,

        -- Totals
        total_deductions DECIMAL(10,2) DEFAULT 0,
        net_pay DECIMAL(10,2) DEFAULT 0,
        employer_total_cost DECIMAL(10,2) DEFAULT 0,

        -- Metadata
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(payroll_run_id, employee_id)
      );

      CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
      CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);

      -- Add additional earning columns to payroll_items if not exist
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='trade_commission_amount') THEN
          ALTER TABLE payroll_items ADD COLUMN trade_commission_amount DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='outstation_amount') THEN
          ALTER TABLE payroll_items ADD COLUMN outstation_amount DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='other_earnings_description') THEN
          ALTER TABLE payroll_items ADD COLUMN other_earnings_description VARCHAR(255);
        END IF;
      END $$;

      -- Resignations / Employment Status History
      CREATE TABLE IF NOT EXISTS resignations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        notice_date DATE NOT NULL,
        last_working_day DATE NOT NULL,
        reason TEXT,
        remarks TEXT,
        status VARCHAR(20) DEFAULT 'pending',

        -- Final settlement
        leave_encashment_days DECIMAL(5,2) DEFAULT 0,
        leave_encashment_amount DECIMAL(10,2) DEFAULT 0,
        final_salary_amount DECIMAL(10,2) DEFAULT 0,
        settlement_status VARCHAR(20) DEFAULT 'pending',
        settlement_date DATE,

        processed_by INTEGER REFERENCES admin_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add resign_date to employees if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='resign_date') THEN
          ALTER TABLE employees ADD COLUMN resign_date DATE;
        END IF;
      END $$;

      -- Public Holidays (for leave calculation)
      CREATE TABLE IF NOT EXISTS public_holidays (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        year INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_holidays_date ON public_holidays(date);
      CREATE INDEX IF NOT EXISTS idx_holidays_year ON public_holidays(year);
    `);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

module.exports = pool;
