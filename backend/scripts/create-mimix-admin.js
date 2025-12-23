const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function createMimixAdmin() {
  const client = await pool.connect();
  try {
    console.log('=== Creating Mimix A Admin User ===\n');

    // Get Mimix A company ID
    const mimixCompany = await client.query("SELECT id FROM companies WHERE LOWER(name) LIKE '%mimix%'");
    if (mimixCompany.rows.length === 0) {
      throw new Error('Mimix A company not found. Run setup-mimix.js first.');
    }
    const mimixId = mimixCompany.rows[0].id;
    console.log('Mimix A company ID:', mimixId);

    // Check if admin already exists
    const existingAdmin = await client.query(
      "SELECT id FROM admin_users WHERE username = $1",
      ['mimixadmin']
    );

    if (existingAdmin.rows.length > 0) {
      console.log('Mimix admin user already exists');
      return;
    }

    // Create password hash
    const password = 'Mimix1234';
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user for Mimix A
    const result = await client.query(
      `INSERT INTO admin_users (username, password_hash, name, role, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, name, role, company_id`,
      ['mimixadmin', passwordHash, 'Mimix Admin', 'admin', mimixId]
    );

    console.log('Created Mimix A admin user:');
    console.log('  Username:', result.rows[0].username);
    console.log('  Password:', password);
    console.log('  Role:', result.rows[0].role);
    console.log('  Company ID:', result.rows[0].company_id);

    // Show all admin users
    console.log('\n=== All Admin Users ===');
    const allAdmins = await client.query(`
      SELECT au.id, au.username, au.name, au.role, au.company_id, c.name as company_name
      FROM admin_users au
      LEFT JOIN companies c ON au.company_id = c.id
      ORDER BY au.id
    `);
    allAdmins.rows.forEach(a => {
      console.log('  ' + a.username + ' - ' + a.role + ' - ' + (a.company_name || 'All Companies'));
    });

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

createMimixAdmin()
  .then(() => {
    console.log('\nAdmin user created successfully!');
  })
  .catch(err => {
    console.error('Failed:', err);
    process.exit(1);
  });
