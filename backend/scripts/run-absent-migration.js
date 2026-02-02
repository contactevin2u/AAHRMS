require('dotenv').config();
const { Pool } = require('pg');
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432, database: process.env.DB_NAME || 'hrms_db', user: process.env.DB_USER, password: process.env.DB_PASSWORD });

async function run() {
  await pool.query(`ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS absent_days DECIMAL(5,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS absent_day_deduction DECIMAL(10,2) DEFAULT 0`);
  console.log('Migration done: absent_days and absent_day_deduction columns added');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
