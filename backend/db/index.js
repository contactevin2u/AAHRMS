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
        name VARCHAR(100) NOT NULL,
        salary_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
