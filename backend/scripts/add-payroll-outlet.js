require('dotenv').config();
const { Pool } = require('pg');

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

async function migrate() {
  try {
    // Check if column already exists
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='payroll_runs' AND column_name='outlet_id'
    `);

    if (check.rows.length > 0) {
      console.log('outlet_id column already exists');
    } else {
      // Add outlet_id column
      await pool.query(`
        ALTER TABLE payroll_runs
        ADD COLUMN outlet_id INTEGER REFERENCES outlets(id)
      `);
      console.log('Added outlet_id column to payroll_runs');
    }

    // Create index
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_runs_outlet ON payroll_runs(outlet_id)');
    console.log('Index created/verified');

    console.log('Migration complete!');
    process.exit(0);
  } catch (e) {
    console.error('Migration error:', e.message);
    process.exit(1);
  }
}

migrate();
