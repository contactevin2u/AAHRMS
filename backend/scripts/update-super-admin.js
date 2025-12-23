// Run this script to update an admin user to super_admin role
// Usage: node scripts/update-super-admin.js <username>

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

async function updateToSuperAdmin(username) {
  try {
    // First check if user exists
    const checkResult = await pool.query(
      'SELECT id, username, role FROM admin_users WHERE username = $1',
      [username]
    );

    if (checkResult.rows.length === 0) {
      console.log(`User "${username}" not found.`);
      console.log('\nExisting users:');
      const allUsers = await pool.query('SELECT username, role FROM admin_users');
      allUsers.rows.forEach(u => console.log(`  - ${u.username} (${u.role})`));
      process.exit(1);
    }

    const user = checkResult.rows[0];
    console.log(`Found user: ${user.username} (current role: ${user.role})`);

    // Update to super_admin
    await pool.query(
      'UPDATE admin_users SET role = $1, company_id = NULL WHERE id = $2',
      ['super_admin', user.id]
    );

    console.log(`\nSuccess! Updated "${username}" to super_admin role.`);
    console.log('Please log out and log back in to see the changes.');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

const username = process.argv[2];
if (!username) {
  console.log('Usage: node scripts/update-super-admin.js <username>');
  console.log('Example: node scripts/update-super-admin.js admin');
  process.exit(1);
}

updateToSuperAdmin(username);
