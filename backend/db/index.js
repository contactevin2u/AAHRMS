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
      -- =====================================================
      -- MULTI-COMPANY / MULTI-TENANT SUPPORT
      -- =====================================================

      -- Companies Table (must be created first)
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        logo_url TEXT,
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        registration_number VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create default company if not exists (for migration)
      INSERT INTO companies (id, name, code, status)
      VALUES (1, 'Default Company', 'DEFAULT', 'active')
      ON CONFLICT (id) DO NOTHING;

      -- Anonymous Feedback
      CREATE TABLE IF NOT EXISTS anonymous_feedback (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE,
        admin_notes TEXT
      );

      -- Add company_id to anonymous_feedback
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='anonymous_feedback' AND column_name='company_id') THEN
          ALTER TABLE anonymous_feedback ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add role-based access control columns to admin_users
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='name') THEN
          ALTER TABLE admin_users ADD COLUMN name VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='email') THEN
          ALTER TABLE admin_users ADD COLUMN email VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='role') THEN
          ALTER TABLE admin_users ADD COLUMN role VARCHAR(50) DEFAULT 'admin';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='status') THEN
          ALTER TABLE admin_users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='last_login') THEN
          ALTER TABLE admin_users ADD COLUMN last_login TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='updated_at') THEN
          ALTER TABLE admin_users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='created_by') THEN
          ALTER TABLE admin_users ADD COLUMN created_by INTEGER;
        END IF;
        -- Profile fields for letters and approvals
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='designation') THEN
          ALTER TABLE admin_users ADD COLUMN designation VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='phone') THEN
          ALTER TABLE admin_users ADD COLUMN phone VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='signature_text') THEN
          ALTER TABLE admin_users ADD COLUMN signature_text VARCHAR(255);
        END IF;
        -- Multi-company support: company_id (NULL for super_admin system-wide access)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='company_id') THEN
          ALTER TABLE admin_users ADD COLUMN company_id INTEGER REFERENCES companies(id);
          -- Migrate existing non-super_admin users to default company
          UPDATE admin_users SET company_id = 1 WHERE role != 'super_admin' AND company_id IS NULL;
        END IF;
        -- Link admin_users to employees for position-based permissions
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='employee_id') THEN
          ALTER TABLE admin_users ADD COLUMN employee_id INTEGER REFERENCES employees(id);
        END IF;
        -- Outlet restriction for supervisor/manager roles
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_users' AND column_name='outlet_id') THEN
          ALTER TABLE admin_users ADD COLUMN outlet_id INTEGER REFERENCES outlets(id);
        END IF;
      END $$;

      -- Login history for audit trail
      CREATE TABLE IF NOT EXISTS admin_login_history (
        id SERIAL PRIMARY KEY,
        admin_user_id INTEGER REFERENCES admin_users(id),
        username VARCHAR(50),
        ip_address VARCHAR(45),
        user_agent TEXT,
        login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT TRUE
      );

      -- Roles table for permission management
      CREATE TABLE IF NOT EXISTS admin_roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        permissions JSONB DEFAULT '{}',
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert default roles
      INSERT INTO admin_roles (name, display_name, description, permissions, is_system) VALUES
        ('super_admin', 'Super Admin', 'Full system control with all permissions',
         '{"all": true}', TRUE),
        ('boss', 'Boss', 'Full access view, can approve and review everything',
         '{"dashboard": true, "employees": true, "leave": true, "claims": true, "payroll": true, "contributions": true, "resignations": true, "letters": true, "departments": true, "feedback": true, "users": true, "approve_leave": true, "approve_claims": true, "view_salary": true}', TRUE),
        ('director', 'Director', 'High access, can manage HR tasks, issue letters, view salary',
         '{"dashboard": true, "employees": true, "leave": true, "claims": true, "payroll": true, "contributions": true, "resignations": true, "letters": true, "departments": true, "feedback": true, "users": true, "approve_leave": true, "approve_claims": true, "view_salary": true}', TRUE),
        ('hr', 'HR', 'Manage employees, payroll, letters, leave, claims',
         '{"dashboard": true, "employees": true, "leave": true, "claims": true, "payroll": true, "contributions": true, "resignations": true, "letters": true, "departments": true, "feedback": true, "approve_leave": true, "approve_claims": true, "view_salary": true}', TRUE),
        ('manager', 'Manager', 'Can view team data, approve leave and claims',
         '{"dashboard": true, "employees": {"view": true}, "leave": true, "claims": true, "approve_leave": true, "approve_claims": true}', FALSE),
        ('viewer', 'Viewer', 'Read-only access to reports and dashboards',
         '{"dashboard": true, "employees": {"view": true}, "payroll": {"view": true}, "contributions": {"view": true}}', FALSE)
      ON CONFLICT (name) DO NOTHING;

      CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON anonymous_feedback(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_category ON anonymous_feedback(category);
      CREATE INDEX IF NOT EXISTS idx_feedback_is_read ON anonymous_feedback(is_read);

      -- Departments
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        salary_type VARCHAR(50) NOT NULL,
        payroll_structure_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add payroll_structure_code column if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='payroll_structure_code') THEN
          ALTER TABLE departments ADD COLUMN payroll_structure_code VARCHAR(50);
        END IF;
      END $$;

      -- Add company_id to departments
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='company_id') THEN
          ALTER TABLE departments ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          -- Migrate existing departments to default company
          UPDATE departments SET company_id = 1 WHERE company_id IS NULL;
        END IF;
        -- Drop the old unique constraint on name only (if exists)
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_name_key') THEN
          ALTER TABLE departments DROP CONSTRAINT departments_name_key;
        END IF;
      END $$;

      -- Create unique constraint on name + company_id (each company can have same department names)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name_company ON departments(name, company_id);

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
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='fixed_ot_amount') THEN
          ALTER TABLE employees ADD COLUMN fixed_ot_amount DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='other_earnings_description') THEN
          ALTER TABLE employees ADD COLUMN other_earnings_description VARCHAR(255);
        END IF;
        -- Address field
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='address') THEN
          ALTER TABLE employees ADD COLUMN address TEXT;
        END IF;
        -- Employee Self-Service (ESS) Authentication fields
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='password_hash') THEN
          ALTER TABLE employees ADD COLUMN password_hash VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='last_login') THEN
          ALTER TABLE employees ADD COLUMN last_login TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='password_reset_token') THEN
          ALTER TABLE employees ADD COLUMN password_reset_token VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='password_reset_expires') THEN
          ALTER TABLE employees ADD COLUMN password_reset_expires TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='ess_enabled') THEN
          ALTER TABLE employees ADD COLUMN ess_enabled BOOLEAN DEFAULT TRUE;
        END IF;
        -- Probation tracking fields
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='employment_type') THEN
          ALTER TABLE employees ADD COLUMN employment_type VARCHAR(20) DEFAULT 'probation';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_months') THEN
          ALTER TABLE employees ADD COLUMN probation_months INTEGER DEFAULT 3;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_end_date') THEN
          ALTER TABLE employees ADD COLUMN probation_end_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='confirmation_date') THEN
          ALTER TABLE employees ADD COLUMN confirmation_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='salary_before_confirmation') THEN
          ALTER TABLE employees ADD COLUMN salary_before_confirmation DECIMAL(10,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='salary_after_confirmation') THEN
          ALTER TABLE employees ADD COLUMN salary_after_confirmation DECIMAL(10,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='increment_amount') THEN
          ALTER TABLE employees ADD COLUMN increment_amount DECIMAL(10,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_status') THEN
          ALTER TABLE employees ADD COLUMN probation_status VARCHAR(20) DEFAULT 'ongoing';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_extended_months') THEN
          ALTER TABLE employees ADD COLUMN probation_extended_months INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='probation_notes') THEN
          ALTER TABLE employees ADD COLUMN probation_notes TEXT;
        END IF;
        -- Residency status for EPF rate determination (malaysian/pr/foreign)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='residency_status') THEN
          ALTER TABLE employees ADD COLUMN residency_status VARCHAR(20) DEFAULT 'malaysian';
        END IF;
        -- Multi-company support
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='company_id') THEN
          ALTER TABLE employees ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          -- Migrate existing employees to default company
          UPDATE employees SET company_id = 1 WHERE company_id IS NULL;
        END IF;
        -- Profile completion tracking (employee self-onboarding)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='profile_completed') THEN
          ALTER TABLE employees ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='profile_completed_at') THEN
          ALTER TABLE employees ADD COLUMN profile_completed_at TIMESTAMP;
        END IF;
        -- ID Type: 'ic' for Malaysian IC, 'passport' for passport/other
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='id_type') THEN
          ALTER TABLE employees ADD COLUMN id_type VARCHAR(20) DEFAULT 'ic';
        END IF;
        -- Employment Status: employed/resigned/terminated (separate from active/inactive status)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='employment_status') THEN
          ALTER TABLE employees ADD COLUMN employment_status VARCHAR(20) DEFAULT 'employed';
          -- Migrate existing 'resigned' status to employment_status
          UPDATE employees SET employment_status = 'resigned', status = 'inactive' WHERE status = 'resigned';
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);

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

      -- Add company_id to salary_configs (inherits from department, but explicit for queries)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salary_configs' AND column_name='company_id') THEN
          ALTER TABLE salary_configs ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE salary_configs SET company_id = 1 WHERE company_id IS NULL;
        END IF;
      END $$;

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
        -- Multi-company support
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll' AND column_name='company_id') THEN
          ALTER TABLE payroll ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE payroll SET company_id = 1 WHERE company_id IS NULL;
        END IF;
      END $$;

      -- Insert default departments if not exists
      -- Payroll Structure:
      -- Driver: basic + trip commission (RM30) + upsell (10%) + outstation (RM100/day) + OT (1.0x)
      -- Indoor Sales: basic RM4k OR 6% commission (whichever higher)
      -- Office: basic + allowance + commission
      -- Outdoor Sales: basic + allowance + commission (by tier)
      INSERT INTO departments (name, salary_type, payroll_structure_code, company_id) VALUES
        ('Driver', 'basic_trip_upsell_outstation_ot', 'driver', 1),
        ('Indoor Sales', 'basic_or_commission_higher', 'indoor_sales', 1),
        ('Office', 'basic_allowance_commission', 'office', 1),
        ('Outdoor Sales', 'basic_allowance_commission_tier', 'outdoor_sales', 1)
      ON CONFLICT (name, company_id) DO NOTHING;

      -- =====================================================
      -- NEW HRMS SYSTEM TABLES
      -- =====================================================

      -- Leave Types (AL, ML, UL, etc.)
      CREATE TABLE IF NOT EXISTS leave_types (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) NOT NULL,
        name VARCHAR(50) NOT NULL,
        is_paid BOOLEAN DEFAULT TRUE,
        default_days_per_year INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add company_id to leave_types
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='company_id') THEN
          ALTER TABLE leave_types ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE leave_types SET company_id = 1 WHERE company_id IS NULL;
        END IF;
        -- Drop old unique constraint and create new one with company_id
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_code_key') THEN
          ALTER TABLE leave_types DROP CONSTRAINT leave_types_code_key;
        END IF;
      END $$;

      -- Unique constraint on code + company_id
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_types_code_company ON leave_types(code, company_id);

      -- Add Malaysian Employment Act leave type columns
      DO $$
      BEGIN
        -- requires_attachment: true for sick leave (MC required)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='requires_attachment') THEN
          ALTER TABLE leave_types ADD COLUMN requires_attachment BOOLEAN DEFAULT FALSE;
        END IF;
        -- is_consecutive: true for maternity/paternity (consecutive days only)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='is_consecutive') THEN
          ALTER TABLE leave_types ADD COLUMN is_consecutive BOOLEAN DEFAULT FALSE;
        END IF;
        -- max_occurrences: limit per career (e.g., 5 for maternity/paternity)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='max_occurrences') THEN
          ALTER TABLE leave_types ADD COLUMN max_occurrences INTEGER;
        END IF;
        -- min_service_days: minimum service days required (e.g., 90 for maternity)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='min_service_days') THEN
          ALTER TABLE leave_types ADD COLUMN min_service_days INTEGER DEFAULT 0;
        END IF;
        -- gender_restriction: 'male', 'female', or null for all
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='gender_restriction') THEN
          ALTER TABLE leave_types ADD COLUMN gender_restriction VARCHAR(10);
        END IF;
        -- entitlement_rules: JSONB for service-year based entitlements
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='entitlement_rules') THEN
          ALTER TABLE leave_types ADD COLUMN entitlement_rules JSONB;
        END IF;
        -- carries_forward: whether unused days can be carried to next year
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='carries_forward') THEN
          ALTER TABLE leave_types ADD COLUMN carries_forward BOOLEAN DEFAULT FALSE;
        END IF;
        -- max_carry_forward: max days that can be carried forward
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='max_carry_forward') THEN
          ALTER TABLE leave_types ADD COLUMN max_carry_forward INTEGER DEFAULT 0;
        END IF;
      END $$;

      -- Insert Malaysian Employment Act leave types
      -- Annual Leave: 8 days (<2 years), 12 days (2-5 years), 16 days (>5 years)
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment, entitlement_rules, carries_forward, max_carry_forward) VALUES
        ('AL', 'Annual Leave', TRUE, 8, 'Paid annual leave per Malaysian Employment Act 1955', 1, FALSE,
         '{"type": "service_years", "rules": [{"min_years": 0, "max_years": 2, "days": 8}, {"min_years": 2, "max_years": 5, "days": 12}, {"min_years": 5, "max_years": 99, "days": 16}]}',
         TRUE, 5)
      ON CONFLICT (code, company_id) DO UPDATE SET
        entitlement_rules = EXCLUDED.entitlement_rules,
        carries_forward = EXCLUDED.carries_forward,
        max_carry_forward = EXCLUDED.max_carry_forward;

      -- Medical Leave: 14 days (<2yr), 18 days (2-5yr), 22 days (5+yr)
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment, entitlement_rules) VALUES
        ('ML', 'Medical Leave', TRUE, 14, 'Medical/Sick Leave - 14 days (<2yr), 18 days (2-5yr), 22 days (5+yr)', 1, TRUE,
         '{"type": "service_years", "rules": [{"min_years": 0, "max_years": 2, "days": 14}, {"min_years": 2, "max_years": 5, "days": 18}, {"min_years": 5, "max_years": 99, "days": 22}]}')
      ON CONFLICT (code, company_id) DO UPDATE SET
        requires_attachment = TRUE,
        entitlement_rules = EXCLUDED.entitlement_rules;

      -- Hospitalization Leave: 60 days (separate from sick leave)
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment) VALUES
        ('HL', 'Hospitalization Leave', TRUE, 60, 'Hospitalization leave - separate from sick leave, requires MC', 1, TRUE)
      ON CONFLICT (code, company_id) DO UPDATE SET
        default_days_per_year = 60,
        requires_attachment = TRUE;

      -- Maternity Leave: 98 days, first 5 children only, requires 90 days service
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, is_consecutive, max_occurrences, min_service_days, gender_restriction) VALUES
        ('MAT', 'Maternity Leave', TRUE, 98, 'Maternity leave - 98 consecutive days for first 5 children', 1, TRUE, 5, 90, 'female')
      ON CONFLICT (code, company_id) DO UPDATE SET
        default_days_per_year = 98,
        is_consecutive = TRUE,
        max_occurrences = 5,
        min_service_days = 90,
        gender_restriction = 'female';

      -- Paternity Leave: 7 days, first 5 children only, married males only
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, is_consecutive, max_occurrences, gender_restriction) VALUES
        ('PAT', 'Paternity Leave', TRUE, 7, 'Paternity leave - 7 consecutive days for married males, first 5 children', 1, TRUE, 5, 'male')
      ON CONFLICT (code, company_id) DO UPDATE SET
        default_days_per_year = 7,
        is_consecutive = TRUE,
        max_occurrences = 5,
        gender_restriction = 'male';

      -- Unpaid Leave
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id) VALUES
        ('UL', 'Unpaid Leave', FALSE, 0, 'Unpaid leave - deducted from salary', 1)
      ON CONFLICT (code, company_id) DO NOTHING;

      -- Compassionate Leave
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id) VALUES
        ('CL', 'Compassionate Leave', TRUE, 3, 'Bereavement/compassionate leave', 1)
      ON CONFLICT (code, company_id) DO NOTHING;

      -- Emergency Leave
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id) VALUES
        ('EL', 'Emergency Leave', TRUE, 3, 'Emergency leave', 1)
      ON CONFLICT (code, company_id) DO NOTHING;

      -- ==============================================
      -- MIMIX (company_id=3) LEAVE TYPES
      -- AL: 0-4yr=12days, 5+yr=16days
      -- ML: 14 days for all
      -- ==============================================

      -- Mimix Annual Leave: 12 days (0-4 years), 16 days (5+ years)
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment, entitlement_rules, carries_forward, max_carry_forward) VALUES
        ('AL', 'Annual Leave', TRUE, 12, 'Paid annual leave', 3, FALSE,
         '{"type": "service_years", "rules": [{"min_years": 0, "max_years": 5, "days": 12}, {"min_years": 5, "max_years": 99, "days": 16}]}',
         TRUE, 5)
      ON CONFLICT (code, company_id) DO UPDATE SET
        entitlement_rules = EXCLUDED.entitlement_rules,
        default_days_per_year = 12,
        carries_forward = EXCLUDED.carries_forward,
        max_carry_forward = EXCLUDED.max_carry_forward;

      -- Mimix Medical Leave: 14 days (<2yr), 18 days (2-5yr), 22 days (5+yr)
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment, entitlement_rules) VALUES
        ('ML', 'Medical Leave', TRUE, 14, 'Medical/Sick Leave - 14 days (<2yr), 18 days (2-5yr), 22 days (5+yr)', 3, TRUE,
         '{"type": "service_years", "rules": [{"min_years": 0, "max_years": 2, "days": 14}, {"min_years": 2, "max_years": 5, "days": 18}, {"min_years": 5, "max_years": 99, "days": 22}]}')
      ON CONFLICT (code, company_id) DO UPDATE SET
        requires_attachment = TRUE,
        entitlement_rules = EXCLUDED.entitlement_rules;

      -- Mimix Hospitalization Leave
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id, requires_attachment) VALUES
        ('HL', 'Hospitalization Leave', TRUE, 60, 'Hospitalization leave - separate from sick leave, requires MC', 3, TRUE)
      ON CONFLICT (code, company_id) DO UPDATE SET
        default_days_per_year = 60,
        requires_attachment = TRUE;

      -- Mimix Unpaid Leave
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id) VALUES
        ('UL', 'Unpaid Leave', FALSE, 0, 'Unpaid leave - deducted from salary', 3)
      ON CONFLICT (code, company_id) DO NOTHING;

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

      -- Add MC upload and approval columns to leave_requests
      DO $$
      BEGIN
        -- mc_url: Medical Certificate URL for sick leave
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='mc_url') THEN
          ALTER TABLE leave_requests ADD COLUMN mc_url TEXT;
        END IF;
        -- half_day: for half-day leave (AM/PM)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='half_day') THEN
          ALTER TABLE leave_requests ADD COLUMN half_day VARCHAR(2);
        END IF;
        -- supervisor approval columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='supervisor_id') THEN
          ALTER TABLE leave_requests ADD COLUMN supervisor_id INTEGER REFERENCES employees(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='supervisor_approved') THEN
          ALTER TABLE leave_requests ADD COLUMN supervisor_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='supervisor_approved_at') THEN
          ALTER TABLE leave_requests ADD COLUMN supervisor_approved_at TIMESTAMP;
        END IF;
        -- manager approval columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='manager_id') THEN
          ALTER TABLE leave_requests ADD COLUMN manager_id INTEGER REFERENCES employees(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='manager_approved') THEN
          ALTER TABLE leave_requests ADD COLUMN manager_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='manager_approved_at') THEN
          ALTER TABLE leave_requests ADD COLUMN manager_approved_at TIMESTAMP;
        END IF;
        -- approval level tracking (1=supervisor, 2=manager, 3=admin)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='approval_level') THEN
          ALTER TABLE leave_requests ADD COLUMN approval_level INTEGER DEFAULT 1;
        END IF;
        -- child_number: for maternity/paternity tracking (1-5)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='child_number') THEN
          ALTER TABLE leave_requests ADD COLUMN child_number INTEGER;
        END IF;
        -- auto_approved: flag for AI auto-approved leaves (AA Alive only)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='auto_approved') THEN
          ALTER TABLE leave_requests ADD COLUMN auto_approved BOOLEAN DEFAULT FALSE;
        END IF;
        -- auto_approved_at: timestamp when leave was auto-approved
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='auto_approved_at') THEN
          ALTER TABLE leave_requests ADD COLUMN auto_approved_at TIMESTAMP;
        END IF;
      END $$;

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

      -- Add supervisor approval columns to claims
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='supervisor_id') THEN
          ALTER TABLE claims ADD COLUMN supervisor_id INTEGER REFERENCES employees(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='supervisor_approved') THEN
          ALTER TABLE claims ADD COLUMN supervisor_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='supervisor_approved_at') THEN
          ALTER TABLE claims ADD COLUMN supervisor_approved_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='remarks') THEN
          ALTER TABLE claims ADD COLUMN remarks TEXT;
        END IF;
      END $$;

      -- AI Claim Verification columns
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
        -- Duplicate reference
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='claims' AND column_name='duplicate_of_claim_id') THEN
          ALTER TABLE claims ADD COLUMN duplicate_of_claim_id INTEGER REFERENCES claims(id);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_claims_receipt_hash ON claims(receipt_hash);

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

      -- Add department_id and company_id columns to payroll_runs if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='department_id') THEN
          ALTER TABLE payroll_runs ADD COLUMN department_id INTEGER REFERENCES departments(id);
        END IF;
        -- Multi-company support
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='company_id') THEN
          ALTER TABLE payroll_runs ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE payroll_runs SET company_id = 1 WHERE company_id IS NULL;
        END IF;
        -- Approval workflow columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_by') THEN
          ALTER TABLE payroll_runs ADD COLUMN approved_by INTEGER REFERENCES admin_users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_at') THEN
          ALTER TABLE payroll_runs ADD COLUMN approved_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='has_variance_warning') THEN
          ALTER TABLE payroll_runs ADD COLUMN has_variance_warning BOOLEAN DEFAULT FALSE;
        END IF;
        -- Add outlet_id for outlet-based companies (Mimix)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='outlet_id') THEN
          ALTER TABLE payroll_runs ADD COLUMN outlet_id INTEGER REFERENCES outlets(id);
        END IF;
        -- Add period tracking columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_start_date') THEN
          ALTER TABLE payroll_runs ADD COLUMN period_start_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_end_date') THEN
          ALTER TABLE payroll_runs ADD COLUMN period_end_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='payment_due_date') THEN
          ALTER TABLE payroll_runs ADD COLUMN payment_due_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_label') THEN
          ALTER TABLE payroll_runs ADD COLUMN period_label VARCHAR(100);
        END IF;
        -- Drop old unique constraint and add new one with department_id
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_month_year_key') THEN
          ALTER TABLE payroll_runs DROP CONSTRAINT payroll_runs_month_year_key;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON payroll_runs(company_id);
      CREATE INDEX IF NOT EXISTS idx_payroll_runs_outlet ON payroll_runs(outlet_id);

      -- Drop old unique index without company_id if exists
      DROP INDEX IF EXISTS idx_payroll_runs_unique;

      -- Create unique index for company_id, month, year, department_id/outlet_id (nullable)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_unique
      ON payroll_runs (company_id, month, year, COALESCE(department_id, -1), COALESCE(outlet_id, -1));

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
        -- OT hours tracking
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='ot_hours') THEN
          ALTER TABLE payroll_items ADD COLUMN ot_hours DECIMAL(5,2) DEFAULT 0;
        END IF;
        -- Public holiday days worked and pay (extra 1.0x daily rate)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='ph_days_worked') THEN
          ALTER TABLE payroll_items ADD COLUMN ph_days_worked DECIMAL(5,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='ph_pay') THEN
          ALTER TABLE payroll_items ADD COLUMN ph_pay DECIMAL(10,2) DEFAULT 0;
        END IF;
        -- Statutory base for deduction calculation
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='statutory_base') THEN
          ALTER TABLE payroll_items ADD COLUMN statutory_base DECIMAL(10,2) DEFAULT 0;
        END IF;
        -- YTD tracking for PCB calculation
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='ytd_gross') THEN
          ALTER TABLE payroll_items ADD COLUMN ytd_gross DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='ytd_epf') THEN
          ALTER TABLE payroll_items ADD COLUMN ytd_epf DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='ytd_pcb') THEN
          ALTER TABLE payroll_items ADD COLUMN ytd_pcb DECIMAL(12,2) DEFAULT 0;
        END IF;
        -- Variance tracking
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='prev_month_net') THEN
          ALTER TABLE payroll_items ADD COLUMN prev_month_net DECIMAL(10,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='variance_amount') THEN
          ALTER TABLE payroll_items ADD COLUMN variance_amount DECIMAL(10,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='variance_percent') THEN
          ALTER TABLE payroll_items ADD COLUMN variance_percent DECIMAL(6,2);
        END IF;
        -- EPF breakdown for MyTax (Saraan Biasa vs Saraan Tambahan)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='epf_on_normal') THEN
          ALTER TABLE payroll_items ADD COLUMN epf_on_normal DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='epf_on_additional') THEN
          ALTER TABLE payroll_items ADD COLUMN epf_on_additional DECIMAL(10,2) DEFAULT 0;
        END IF;
        -- PCB breakdown for MyTax
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='pcb_normal') THEN
          ALTER TABLE payroll_items ADD COLUMN pcb_normal DECIMAL(10,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='pcb_additional') THEN
          ALTER TABLE payroll_items ADD COLUMN pcb_additional DECIMAL(10,2) DEFAULT 0;
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

      -- Add company_id to public_holidays
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='public_holidays' AND column_name='company_id') THEN
          ALTER TABLE public_holidays ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE public_holidays SET company_id = 1 WHERE company_id IS NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_holidays_date ON public_holidays(date);
      CREATE INDEX IF NOT EXISTS idx_holidays_year ON public_holidays(year);
      CREATE INDEX IF NOT EXISTS idx_holidays_company ON public_holidays(company_id);

      -- =====================================================
      -- EMPLOYEE SELF-SERVICE (ESS) TABLES
      -- =====================================================

      -- Notifications for employees
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications(employee_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

      -- =====================================================
      -- HR LETTERS / NOTICES TABLE
      -- =====================================================

      -- HR Letters (Warning, Appreciation, Promotion, etc.)
      CREATE TABLE IF NOT EXISTS hr_letters (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        letter_type VARCHAR(50) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        attachment_url TEXT,
        attachment_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'unread',
        issued_by INTEGER REFERENCES admin_users(id),
        issued_by_name VARCHAR(100),
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_hr_letters_employee ON hr_letters(employee_id);
      CREATE INDEX IF NOT EXISTS idx_hr_letters_type ON hr_letters(letter_type);
      CREATE INDEX IF NOT EXISTS idx_hr_letters_status ON hr_letters(status);
      CREATE INDEX IF NOT EXISTS idx_hr_letters_created ON hr_letters(created_at DESC);

      -- Add issued_by_designation and company_id to hr_letters if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hr_letters' AND column_name='issued_by_designation') THEN
          ALTER TABLE hr_letters ADD COLUMN issued_by_designation VARCHAR(100);
        END IF;
        -- Multi-company support
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hr_letters' AND column_name='company_id') THEN
          ALTER TABLE hr_letters ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE hr_letters SET company_id = 1 WHERE company_id IS NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_hr_letters_company ON hr_letters(company_id);

      -- Letter Templates
      CREATE TABLE IF NOT EXISTS letter_templates (
        id SERIAL PRIMARY KEY,
        letter_type VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add company_id to letter_templates
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='letter_templates' AND column_name='company_id') THEN
          ALTER TABLE letter_templates ADD COLUMN company_id INTEGER REFERENCES companies(id) DEFAULT 1;
          UPDATE letter_templates SET company_id = 1 WHERE company_id IS NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_letter_templates_company ON letter_templates(company_id);

      -- Add unique constraint on letter_type to prevent duplicates
      DO $$
      BEGIN
        -- First, clean up duplicate templates (keep only the first one per letter_type)
        DELETE FROM letter_templates
        WHERE id NOT IN (
          SELECT MIN(id) FROM letter_templates GROUP BY letter_type
        );

        -- Add unique constraint if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'letter_templates_letter_type_key'
        ) THEN
          ALTER TABLE letter_templates ADD CONSTRAINT letter_templates_letter_type_key UNIQUE (letter_type);
        END IF;
      END $$;

      -- Insert default letter templates
      INSERT INTO letter_templates (letter_type, name, subject, content, company_id) VALUES
        ('warning', 'Warning Letter (Surat Amaran)', 'Official Warning Notice',
         'Dear {{employee_name}},

This letter serves as an official warning regarding {{reason}}.

We have observed the following concerns:
{{details}}

Please be advised that this matter is being documented in your employment record. We expect immediate improvement in the areas mentioned above.

Failure to comply may result in further disciplinary action, up to and including termination of employment.

Please acknowledge receipt of this letter by signing below.

Regards,
Human Resources Department
{{company_name}}', 1),
        ('appreciation', 'Appreciation Letter', 'Letter of Appreciation',
         'Dear {{employee_name}},

We would like to take this opportunity to express our sincere appreciation for your outstanding contribution to the company.

{{details}}

Your dedication and hard work have not gone unnoticed. We are fortunate to have you as part of our team.

Keep up the excellent work!

Best regards,
Human Resources Department
{{company_name}}', 1),
        ('promotion', 'Promotion Letter', 'Congratulations on Your Promotion',
         'Dear {{employee_name}},

We are pleased to inform you that you have been promoted to the position of {{new_position}}, effective {{effective_date}}.

This promotion reflects your hard work, dedication, and valuable contributions to our organization.

Your new responsibilities will include:
{{details}}

Your revised compensation package will be communicated to you separately.

Congratulations on this well-deserved achievement!

Best regards,
Human Resources Department
{{company_name}}', 1),
        ('performance_improvement', 'Performance Improvement Notice', 'Performance Improvement Plan Notice',
         'Dear {{employee_name}},

Following our recent discussions regarding your work performance, this letter outlines the areas requiring improvement.

Areas of Concern:
{{details}}

Expected Improvements:
- {{improvement_1}}
- {{improvement_2}}
- {{improvement_3}}

Review Period: {{review_period}}

We are committed to supporting your success. Please do not hesitate to reach out if you need any assistance or resources.

Regards,
Human Resources Department
{{company_name}}', 1),
        ('salary_adjustment', 'Salary Adjustment Letter', 'Notification of Salary Adjustment',
         'Dear {{employee_name}},

We are pleased to inform you of an adjustment to your compensation, effective {{effective_date}}.

Your new salary details are as follows:
- Previous Basic Salary: RM {{old_salary}}
- New Basic Salary: RM {{new_salary}}

{{details}}

This adjustment reflects your contributions and performance within the organization.

Congratulations!

Best regards,
Human Resources Department
{{company_name}}', 1),
        ('general_notice', 'General Notice', 'Important Notice',
         'Dear {{employee_name}},

{{details}}

If you have any questions, please contact the HR department.

Regards,
Human Resources Department
{{company_name}}', 1),
        ('termination', 'Termination Letter', 'Notice of Employment Termination',
         'Dear {{employee_name}},

This letter serves as formal notification that your employment with {{company_name}} will be terminated effective {{effective_date}}.

Reason for Termination:
{{details}}

Please note the following:
- Your final paycheck will be processed on {{final_pay_date}}
- All company property must be returned by your last working day
- Exit interview will be scheduled with HR

Regards,
Human Resources Department
{{company_name}}', 1),
        ('confirmation', 'Confirmation Letter', 'Employment Confirmation',
         'Dear {{employee_name}},

We are pleased to confirm that your probationary period has been successfully completed.

Effective {{effective_date}}, you are now confirmed as a permanent employee of {{company_name}} in the position of {{position}}.

{{details}}

Congratulations and welcome to the team!

Best regards,
Human Resources Department
{{company_name}}', 1)
      ON CONFLICT DO NOTHING;

      -- =====================================================
      -- PROBATION HISTORY TABLE (Audit Log)
      -- =====================================================
      CREATE TABLE IF NOT EXISTS probation_history (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        old_status VARCHAR(20),
        new_status VARCHAR(20),
        old_salary DECIMAL(10,2),
        new_salary DECIMAL(10,2),
        extension_months INTEGER,
        notes TEXT,
        performed_by INTEGER REFERENCES admin_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_probation_history_employee ON probation_history(employee_id);
      CREATE INDEX IF NOT EXISTS idx_probation_history_created ON probation_history(created_at DESC);

      -- =====================================================
      -- FLEXIBLE COMMISSION & ALLOWANCE SYSTEM
      -- =====================================================

      -- Commission Types (predefined list per company)
      CREATE TABLE IF NOT EXISTS commission_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        calculation_type VARCHAR(20) DEFAULT 'fixed',
        is_active BOOLEAN DEFAULT TRUE,
        company_id INTEGER REFERENCES companies(id) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Allowance Types (predefined list per company)
      CREATE TABLE IF NOT EXISTS allowance_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_taxable BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        company_id INTEGER REFERENCES companies(id) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Employee Commission Assignments
      CREATE TABLE IF NOT EXISTS employee_commissions (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        commission_type_id INTEGER REFERENCES commission_types(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, commission_type_id)
      );

      -- Employee Allowance Assignments
      CREATE TABLE IF NOT EXISTS employee_allowances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        allowance_type_id INTEGER REFERENCES allowance_types(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, allowance_type_id)
      );

      -- Payroll Commission Items (breakdown per payroll)
      CREATE TABLE IF NOT EXISTS payroll_commission_items (
        id SERIAL PRIMARY KEY,
        payroll_item_id INTEGER REFERENCES payroll_items(id) ON DELETE CASCADE,
        commission_type_id INTEGER REFERENCES commission_types(id),
        commission_name VARCHAR(100),
        amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Payroll Allowance Items (breakdown per payroll)
      CREATE TABLE IF NOT EXISTS payroll_allowance_items (
        id SERIAL PRIMARY KEY,
        payroll_item_id INTEGER REFERENCES payroll_items(id) ON DELETE CASCADE,
        allowance_type_id INTEGER REFERENCES allowance_types(id),
        allowance_name VARCHAR(100),
        amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_commission_types_company ON commission_types(company_id);
      CREATE INDEX IF NOT EXISTS idx_allowance_types_company ON allowance_types(company_id);
      CREATE INDEX IF NOT EXISTS idx_employee_commissions_employee ON employee_commissions(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_allowances_employee ON employee_allowances(employee_id);
      CREATE INDEX IF NOT EXISTS idx_payroll_commission_items_payroll ON payroll_commission_items(payroll_item_id);
      CREATE INDEX IF NOT EXISTS idx_payroll_allowance_items_payroll ON payroll_allowance_items(payroll_item_id);

      -- Add unique constraints if not exists
      DO $$ BEGIN
        ALTER TABLE commission_types ADD CONSTRAINT unique_commission_name_company UNIQUE (name, company_id);
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;

      DO $$ BEGIN
        ALTER TABLE allowance_types ADD CONSTRAINT unique_allowance_name_company UNIQUE (name, company_id);
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;

      -- Insert default commission types (skip if exists)
      INSERT INTO commission_types (name, description, calculation_type, company_id) VALUES
        ('Sales Commission', 'Commission based on sales', 'percentage', 1),
        ('Referral Commission', 'Commission for referrals', 'fixed', 1),
        ('Target Bonus', 'Bonus for hitting targets', 'fixed', 1),
        ('Performance Bonus', 'Performance-based bonus', 'fixed', 1),
        ('Project Commission', 'Commission per project', 'fixed', 1)
      ON CONFLICT (name, company_id) DO NOTHING;

      -- Insert default allowance types (skip if exists)
      INSERT INTO allowance_types (name, description, is_taxable, company_id) VALUES
        ('Transport Allowance', 'Monthly transport allowance', TRUE, 1),
        ('Meal Allowance', 'Daily meal allowance', TRUE, 1),
        ('Phone Allowance', 'Mobile phone allowance', TRUE, 1),
        ('Petrol Allowance', 'Fuel reimbursement', TRUE, 1),
        ('Parking Allowance', 'Parking fees', TRUE, 1),
        ('Housing Allowance', 'Housing assistance', TRUE, 1)
      ON CONFLICT (name, company_id) DO NOTHING;

      -- =====================================================
      -- OUTLETS TABLE (for outlet-based companies like Mimix)
      -- =====================================================
      CREATE TABLE IF NOT EXISTS outlets (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name VARCHAR(100) NOT NULL,
        address TEXT,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_outlets_company ON outlets(company_id);

      -- Add outlet_id to employees for outlet-based companies
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='outlet_id') THEN
          ALTER TABLE employees ADD COLUMN outlet_id INTEGER REFERENCES outlets(id);
        END IF;
      END $$;

      -- Add grouping_type to companies (department or outlet)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='grouping_type') THEN
          ALTER TABLE companies ADD COLUMN grouping_type VARCHAR(20) DEFAULT 'department';
        END IF;
      END $$;

      -- =====================================================
      -- POSITIONS TABLE (normalized job positions)
      -- =====================================================
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL,
        is_multi_outlet BOOLEAN DEFAULT FALSE,
        role VARCHAR(20) DEFAULT 'crew',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_positions_company ON positions(company_id);
      CREATE INDEX IF NOT EXISTS idx_positions_department ON positions(department_id);

      -- Add role column to positions if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='positions' AND column_name='role') THEN
          ALTER TABLE positions ADD COLUMN role VARCHAR(20) DEFAULT 'crew';
        END IF;
      END $$;

      -- Update existing positions with appropriate roles based on name
      UPDATE positions SET role = 'manager' WHERE LOWER(name) LIKE '%manager%' AND (role IS NULL OR role = 'crew');
      UPDATE positions SET role = 'supervisor' WHERE LOWER(name) LIKE '%supervisor%' AND (role IS NULL OR role = 'crew');

      -- =====================================================
      -- AUTO-SET employment_type = 'confirmed' FOR HIGH-LEVEL POSITIONS
      -- Positions at level >= 40 (assistant supervisor and above) should have employment_type = 'confirmed'
      -- This includes: assistant supervisor (40), supervisor (60), manager (80), director (90), admin/boss (100)
      -- =====================================================

      -- Update employees with high-level roles to have confirmed employment_type
      UPDATE employees e
      SET employment_type = 'confirmed', probation_status = 'confirmed'
      WHERE e.employment_type != 'confirmed'
        AND (
          -- Check by position_id linking to positions table with high-level role
          EXISTS (
            SELECT 1 FROM positions p
            WHERE p.id = e.position_id
            AND p.role IN ('manager', 'supervisor', 'admin', 'director', 'assistant supervisor', 'assistant_supervisor')
          )
          -- Or check by employee_role directly (includes assistant supervisor variations)
          OR e.employee_role IN ('supervisor', 'manager', 'director', 'admin', 'boss', 'super_admin',
                                 'assistant supervisor', 'assistant_supervisor', 'asst supervisor', 'asst. supervisor')
          -- Or check by position name containing these keywords (supervisor covers assistant supervisor too)
          OR LOWER(e.position) LIKE '%supervisor%'
          OR LOWER(e.position) LIKE '%manager%'
          OR LOWER(e.position) LIKE '%director%'
          OR LOWER(e.position) LIKE '%admin%'
          OR LOWER(e.position) LIKE '%boss%'
        );

      -- =====================================================
      -- SYNC probation_status FOR ALL CONFIRMED EMPLOYEES
      -- Ensures probation_status = 'confirmed' when employment_type = 'confirmed'
      -- This fixes any data inconsistency from manual updates
      -- =====================================================

      UPDATE employees
      SET probation_status = 'confirmed'
      WHERE employment_type = 'confirmed'
        AND (probation_status IS NULL OR probation_status != 'confirmed');

      -- =====================================================
      -- SET outlet_id = NULL FOR MANAGERS AND ABOVE
      -- Positions at level >= 80 (manager, director, admin) should NOT have outlet_id
      -- Managers operate at company level, not outlet level
      -- =====================================================

      UPDATE employees e
      SET outlet_id = NULL
      WHERE e.outlet_id IS NOT NULL
        AND (
          -- Check by position_id linking to positions table with manager+ role
          EXISTS (
            SELECT 1 FROM positions p
            WHERE p.id = e.position_id
            AND p.role IN ('manager', 'admin', 'director', 'boss', 'super_admin')
          )
          -- Or check by employee_role directly
          OR e.employee_role IN ('manager', 'director', 'admin', 'boss', 'super_admin')
          -- Or check by position name containing manager keywords
          OR LOWER(e.position) LIKE '%manager%'
          OR LOWER(e.position) LIKE '%director%'
          OR LOWER(e.position) LIKE '%admin%'
          OR LOWER(e.position) LIKE '%boss%'
        );

      -- =====================================================
      -- EMPLOYEE_OUTLETS TABLE (for multi-outlet managers)
      -- =====================================================
      CREATE TABLE IF NOT EXISTS employee_outlets (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        outlet_id INTEGER REFERENCES outlets(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, outlet_id)
      );

      CREATE INDEX IF NOT EXISTS idx_employee_outlets_employee ON employee_outlets(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_outlets_outlet ON employee_outlets(outlet_id);

      -- Add position_id to employees
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='position_id') THEN
          ALTER TABLE employees ADD COLUMN position_id INTEGER REFERENCES positions(id);
        END IF;
      END $$;

      -- =====================================================
      -- AUTO-LINK position text to position_id
      -- For employees who have position text but no position_id
      -- =====================================================
      UPDATE employees e
      SET position_id = p.id
      FROM positions p
      WHERE e.position_id IS NULL
        AND e.position IS NOT NULL
        AND LOWER(TRIM(e.position)) = LOWER(TRIM(p.name))
        AND e.company_id = p.company_id;

      -- Add must_change_password flag to employees (for first login with IC)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='must_change_password') THEN
          ALTER TABLE employees ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE;
        END IF;
        -- Work type: full_time or part_time (for Mimix attendance calculation)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='work_type') THEN
          ALTER TABLE employees ADD COLUMN work_type VARCHAR(20) DEFAULT 'full_time';
        END IF;
        -- Clock in required: determines if employee needs to clock in/out
        -- Mimix (company_id=3): default TRUE (all must clock in)
        -- AA Alive (company_id=1): default FALSE (only if enabled)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='clock_in_required') THEN
          ALTER TABLE employees ADD COLUMN clock_in_required BOOLEAN DEFAULT FALSE;
          -- Set defaults based on company
          UPDATE employees SET clock_in_required = TRUE WHERE company_id = 3;
          UPDATE employees SET clock_in_required = FALSE WHERE company_id = 1;
        END IF;
      END $$;

      -- =====================================================
      -- CLOCK-IN RECORDS TABLE (for attendance)
      -- =====================================================
      CREATE TABLE IF NOT EXISTS clock_in_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        outlet_id INTEGER REFERENCES outlets(id),
        work_date DATE NOT NULL,

        -- 4-action clock times (HH:MM format stored as TIME)
        clock_in_1 TIME,
        clock_out_1 TIME,
        clock_in_2 TIME,
        clock_out_2 TIME,

        -- Photos for each action
        photo_in_1 TEXT,
        photo_out_1 TEXT,
        photo_in_2 TEXT,
        photo_out_2 TEXT,

        -- Location for each action (point format: lat,lng)
        location_in_1 TEXT,
        location_out_1 TEXT,
        location_in_2 TEXT,
        location_out_2 TEXT,

        -- Address for each action
        address_in_1 TEXT,
        address_out_1 TEXT,
        address_in_2 TEXT,
        address_out_2 TEXT,

        -- Face detection for each action
        face_detected_in_1 BOOLEAN,
        face_detected_out_1 BOOLEAN,
        face_detected_in_2 BOOLEAN,
        face_detected_out_2 BOOLEAN,
        face_confidence_in_1 DECIMAL(5,4),
        face_confidence_out_1 DECIMAL(5,4),
        face_confidence_in_2 DECIMAL(5,4),
        face_confidence_out_2 DECIMAL(5,4),

        -- Calculated hours
        total_work_hours DECIMAL(5,2) DEFAULT 0,
        ot_hours DECIMAL(5,2) DEFAULT 0,

        -- Status and approval
        status VARCHAR(20) DEFAULT 'pending',
        approved_by INTEGER REFERENCES admin_users(id),
        approved_at TIMESTAMP,
        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, work_date)
      );

      CREATE INDEX IF NOT EXISTS idx_clock_in_employee ON clock_in_records(employee_id);
      CREATE INDEX IF NOT EXISTS idx_clock_in_company ON clock_in_records(company_id);
      CREATE INDEX IF NOT EXISTS idx_clock_in_outlet ON clock_in_records(outlet_id);
      CREATE INDEX IF NOT EXISTS idx_clock_in_work_date ON clock_in_records(work_date);

      -- Add missing columns to existing clock_in_records table
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='work_date') THEN
          ALTER TABLE clock_in_records ADD COLUMN work_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='clock_in_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN clock_in_1 TIME;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='clock_out_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN clock_out_1 TIME;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='clock_in_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN clock_in_2 TIME;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='clock_out_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN clock_out_2 TIME;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='photo_in_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN photo_in_1 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='location_in_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN location_in_1 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='address_in_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN address_in_1 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_detected_in_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_detected_in_1 BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_confidence_in_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_confidence_in_1 DECIMAL(5,4);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='total_work_hours') THEN
          ALTER TABLE clock_in_records ADD COLUMN total_work_hours DECIMAL(5,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_hours') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_hours DECIMAL(5,2) DEFAULT 0;
        END IF;
        -- Add other missing columns for out_1, in_2, out_2
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='photo_out_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN photo_out_1 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='photo_in_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN photo_in_2 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='photo_out_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN photo_out_2 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='location_out_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN location_out_1 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='location_in_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN location_in_2 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='location_out_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN location_out_2 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='address_out_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN address_out_1 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='address_in_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN address_in_2 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='address_out_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN address_out_2 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_detected_out_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_detected_out_1 BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_detected_in_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_detected_in_2 BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_detected_out_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_detected_out_2 BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_confidence_out_1') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_confidence_out_1 DECIMAL(5,4);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_confidence_in_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_confidence_in_2 DECIMAL(5,4);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='face_confidence_out_2') THEN
          ALTER TABLE clock_in_records ADD COLUMN face_confidence_out_2 DECIMAL(5,4);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='approved_by') THEN
          ALTER TABLE clock_in_records ADD COLUMN approved_by INTEGER REFERENCES admin_users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='approved_at') THEN
          ALTER TABLE clock_in_records ADD COLUMN approved_at TIMESTAMP;
        END IF;
        -- Schedule-related columns for attendance tracking
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='has_schedule') THEN
          ALTER TABLE clock_in_records ADD COLUMN has_schedule BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='schedule_id') THEN
          ALTER TABLE clock_in_records ADD COLUMN schedule_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='attendance_status') THEN
          ALTER TABLE clock_in_records ADD COLUMN attendance_status VARCHAR(20) DEFAULT 'present';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='wrong_shift_reason') THEN
          ALTER TABLE clock_in_records ADD COLUMN wrong_shift_reason TEXT;
        END IF;
        -- OT approval columns (for supervisor approval flow)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_flagged') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_flagged BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_approved') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_approved_by') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_approved_by INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_approved_at') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_approved_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_rejection_reason') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_rejection_reason TEXT;
        END IF;
        -- Auto clock-out columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='is_auto_clock_out') THEN
          ALTER TABLE clock_in_records ADD COLUMN is_auto_clock_out BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='auto_clock_out_reason') THEN
          ALTER TABLE clock_in_records ADD COLUMN auto_clock_out_reason VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='needs_admin_review') THEN
          ALTER TABLE clock_in_records ADD COLUMN needs_admin_review BOOLEAN DEFAULT FALSE;
        END IF;
        -- Store calculated minutes for accurate tracking
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='total_work_minutes') THEN
          ALTER TABLE clock_in_records ADD COLUMN total_work_minutes INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_minutes') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_minutes INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='ot_rate') THEN
          ALTER TABLE clock_in_records ADD COLUMN ot_rate DECIMAL(3,2) DEFAULT 1.5;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clock_in_records' AND column_name='approval_status') THEN
          ALTER TABLE clock_in_records ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending';
        END IF;
      END $$;

      -- Create unique index on employee_id + work_date if not exists
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clock_in_employee_date ON clock_in_records(employee_id, work_date);

      -- =====================================================
      -- LEAVE MULTI-LEVEL APPROVAL COLUMNS
      -- =====================================================
      DO $$ BEGIN
        -- Supervisor approval columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='supervisor_id') THEN
          ALTER TABLE leave_requests ADD COLUMN supervisor_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='supervisor_approved') THEN
          ALTER TABLE leave_requests ADD COLUMN supervisor_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='supervisor_approved_at') THEN
          ALTER TABLE leave_requests ADD COLUMN supervisor_approved_at TIMESTAMP;
        END IF;
        -- Manager approval columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='manager_id') THEN
          ALTER TABLE leave_requests ADD COLUMN manager_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='manager_approved') THEN
          ALTER TABLE leave_requests ADD COLUMN manager_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='manager_approved_at') THEN
          ALTER TABLE leave_requests ADD COLUMN manager_approved_at TIMESTAMP;
        END IF;
        -- Approval level tracking (1=pending_supervisor, 2=pending_manager, 3=pending_admin, 4=approved)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='approval_level') THEN
          ALTER TABLE leave_requests ADD COLUMN approval_level INTEGER DEFAULT 1;
        END IF;
      END $$;

      -- =====================================================
      -- EMPLOYEE ROLE INDEX
      -- =====================================================
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='employee_role') THEN
          ALTER TABLE employees ADD COLUMN employee_role VARCHAR(20) DEFAULT 'staff';
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(employee_role);
      CREATE INDEX IF NOT EXISTS idx_employees_outlet_role ON employees(outlet_id, employee_role);

      -- =====================================================
      -- SCHEDULING SYSTEM (for outlet-based companies like Mimix)
      -- =====================================================

      -- Main schedules table
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        outlet_id INTEGER REFERENCES outlets(id),
        schedule_date DATE NOT NULL,
        shift_start TIME NOT NULL,
        shift_end TIME NOT NULL,
        break_duration INTEGER DEFAULT 60,
        status VARCHAR(20) DEFAULT 'scheduled',
        created_by INTEGER REFERENCES admin_users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, schedule_date)
      );

      CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
      CREATE INDEX IF NOT EXISTS idx_schedules_employee ON schedules(employee_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_outlet ON schedules(outlet_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_company ON schedules(company_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);

      -- Extra shift requests table
      CREATE TABLE IF NOT EXISTS extra_shift_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        outlet_id INTEGER REFERENCES outlets(id),
        request_date DATE NOT NULL,
        shift_start TIME NOT NULL,
        shift_end TIME NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        approved_by INTEGER REFERENCES admin_users(id),
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        schedule_id INTEGER REFERENCES schedules(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_extra_shift_employee ON extra_shift_requests(employee_id);
      CREATE INDEX IF NOT EXISTS idx_extra_shift_status ON extra_shift_requests(status);
      CREATE INDEX IF NOT EXISTS idx_extra_shift_date ON extra_shift_requests(request_date);

      -- Schedule audit logs table
      CREATE TABLE IF NOT EXISTS schedule_audit_logs (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        reason TEXT,
        performed_by INTEGER REFERENCES admin_users(id),
        performed_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_schedule_audit_schedule ON schedule_audit_logs(schedule_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_audit_employee ON schedule_audit_logs(employee_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_audit_action ON schedule_audit_logs(action);

      -- Shift swap requests table (for outlet employees to swap shifts)
      CREATE TABLE IF NOT EXISTS shift_swap_requests (
        id SERIAL PRIMARY KEY,
        outlet_id INTEGER REFERENCES outlets(id),
        requester_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        requester_shift_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
        target_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        target_shift_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending_target',
        target_response VARCHAR(20),
        target_responded_at TIMESTAMP,
        admin_response VARCHAR(20),
        admin_id INTEGER REFERENCES admin_users(id),
        admin_responded_at TIMESTAMP,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_swap_outlet ON shift_swap_requests(outlet_id);
      CREATE INDEX IF NOT EXISTS idx_swap_requester ON shift_swap_requests(requester_id);
      CREATE INDEX IF NOT EXISTS idx_swap_target ON shift_swap_requests(target_id);
      CREATE INDEX IF NOT EXISTS idx_swap_status ON shift_swap_requests(status);

      -- =====================================================
      -- SHIFT SWAP SUPERVISOR APPROVAL COLUMNS
      -- =====================================================
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shift_swap_requests' AND column_name='supervisor_id') THEN
          ALTER TABLE shift_swap_requests ADD COLUMN supervisor_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shift_swap_requests' AND column_name='supervisor_approved') THEN
          ALTER TABLE shift_swap_requests ADD COLUMN supervisor_approved BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shift_swap_requests' AND column_name='supervisor_approved_at') THEN
          ALTER TABLE shift_swap_requests ADD COLUMN supervisor_approved_at TIMESTAMP;
        END IF;
      END $$;
    `);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

module.exports = pool;
