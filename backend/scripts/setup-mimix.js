const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function setupMimixA() {
  const client = await pool.connect();
  try {
    console.log('=== Setting up Mimix A Sdn Bhd ===\n');

    // 1. Add grouping_type to companies if not exists
    const groupingCol = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='grouping_type'"
    );
    if (groupingCol.rows.length === 0) {
      await client.query("ALTER TABLE companies ADD COLUMN grouping_type VARCHAR(20) DEFAULT 'department'");
      console.log('Added grouping_type column to companies');
    }

    // 2. Check current companies
    const companies = await client.query('SELECT * FROM companies ORDER BY id');
    console.log('Current companies:', companies.rows.map(c => c.name).join(', ') || 'None');

    // 3. Create Mimix A company if not exists
    const mimixExists = await client.query("SELECT id FROM companies WHERE LOWER(name) LIKE '%mimix%'");
    let mimixId;

    if (mimixExists.rows.length === 0) {
      const result = await client.query(
        "INSERT INTO companies (name, code, address, grouping_type) VALUES ($1, $2, $3, $4) RETURNING id",
        ['Mimix A Sdn Bhd', 'MIMIX', '', 'outlet']
      );
      mimixId = result.rows[0].id;
      console.log('Created Mimix A company with ID:', mimixId);
    } else {
      mimixId = mimixExists.rows[0].id;
      console.log('Mimix A already exists with ID:', mimixId);
    }

    // 4. Update AA Alive to have department grouping
    await client.query("UPDATE companies SET grouping_type = 'department' WHERE grouping_type IS NULL");
    await client.query("UPDATE companies SET grouping_type = 'outlet' WHERE LOWER(name) LIKE '%mimix%'");

    // 5. Create outlets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS outlets (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) NOT NULL,
        name VARCHAR(100) NOT NULL,
        address TEXT,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, name)
      )
    `);
    console.log('Created outlets table');

    // 6. Add outlet_id to employees table if not exists
    const outletCol = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='outlet_id'"
    );
    if (outletCol.rows.length === 0) {
      await client.query('ALTER TABLE employees ADD COLUMN outlet_id INTEGER REFERENCES outlets(id)');
      console.log('Added outlet_id column to employees');
    } else {
      console.log('outlet_id column already exists in employees');
    }

    // 7. Show final state
    const allCompanies = await client.query('SELECT id, name, code, grouping_type FROM companies ORDER BY id');
    console.log('\n=== Companies ===');
    allCompanies.rows.forEach(c => {
      console.log('  ' + c.id + ': ' + c.name + ' (' + c.grouping_type + ')');
    });

    return mimixId;

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

setupMimixA()
  .then(mimixId => {
    console.log('\nSetup complete! Mimix A company ID:', mimixId);
  })
  .catch(err => {
    console.error('Setup failed:', err);
    process.exit(1);
  });
