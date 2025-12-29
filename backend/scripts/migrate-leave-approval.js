/**
 * Migration: Add multi-level leave approval workflow
 *
 * Workflow:
 * - Regular employee leave: Supervisor → Director approval
 * - Supervisor leave: Manager approval
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting leave approval workflow migration...\n');

    // 1. Add employee_role to employees table
    console.log('1. Adding employee_role column to employees...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS employee_role VARCHAR(20) DEFAULT 'staff'
    `);
    console.log('   Done.\n');

    // 2. Add reports_to for hierarchy
    console.log('2. Adding reports_to column to employees...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS reports_to INTEGER REFERENCES employees(id)
    `);
    console.log('   Done.\n');

    // 3. Add multi-level approval columns to leave_requests
    console.log('3. Adding multi-level approval columns to leave_requests...');

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS approval_level INTEGER DEFAULT 1
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS supervisor_id INTEGER REFERENCES employees(id)
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS supervisor_approved BOOLEAN DEFAULT FALSE
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS supervisor_approved_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS director_id INTEGER REFERENCES employees(id)
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS director_approved BOOLEAN DEFAULT FALSE
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS director_approved_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS requires_director_approval BOOLEAN DEFAULT TRUE
    `);

    console.log('   Done.\n');

    // 4. Create approval_config table for company-specific settings
    console.log('4. Creating approval_config table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS approval_config (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        supervisor_roles TEXT[] DEFAULT ARRAY['supervisor'],
        manager_roles TEXT[] DEFAULT ARRAY['manager'],
        director_roles TEXT[] DEFAULT ARRAY['director'],
        require_director_approval BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id)
      )
    `);
    console.log('   Done.\n');

    // 5. Insert default approval config for existing companies
    console.log('5. Setting up default approval config...');
    await client.query(`
      INSERT INTO approval_config (company_id, require_director_approval)
      SELECT id, TRUE FROM companies
      ON CONFLICT (company_id) DO NOTHING
    `);
    console.log('   Done.\n');

    console.log('========================================');
    console.log('Migration completed successfully!');
    console.log('========================================\n');

    console.log('Employee roles available:');
    console.log('  - staff (default)');
    console.log('  - supervisor');
    console.log('  - manager');
    console.log('  - director\n');

    console.log('Leave approval workflow:');
    console.log('  - Staff leave: Supervisor → Director');
    console.log('  - Supervisor leave: Manager/Director');
    console.log('  - Manager leave: Director');

  } catch (error) {
    console.error('Migration error:', error.message);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
