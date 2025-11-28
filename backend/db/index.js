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
    `);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

module.exports = pool;
