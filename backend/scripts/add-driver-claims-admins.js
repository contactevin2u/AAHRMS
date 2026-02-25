/**
 * Create admin users for Driver Claims Portal
 * Usernames: admin, rafina, hidayah, syakirah, bella, sofea
 * Password: {username}123
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../db');
const bcrypt = require('bcryptjs');

const users = [
  { username: 'admin', name: 'Admin', password: 'admin123' },
  { username: 'rafina', name: 'Rafina', password: 'rafina123' },
  { username: 'hidayah', name: 'Hidayah', password: 'hidayah123' },
  { username: 'syakirah', name: 'Syakirah', password: 'syakirah123' },
  { username: 'bella', name: 'Bella', password: 'bella123' },
  { username: 'sofea', name: 'Sofea', password: 'sofea123' },
];

async function createUsers() {
  try {
    for (const user of users) {
      // Check if user already exists
      const existing = await pool.query(
        'SELECT id, username FROM admin_users WHERE username = $1',
        [user.username]
      );

      if (existing.rows.length > 0) {
        // Update password for existing user
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(user.password, salt);
        await pool.query(
          'UPDATE admin_users SET password_hash = $1 WHERE username = $2',
          [hash, user.username]
        );
        console.log(`Updated password for existing user: ${user.username} (password: ${user.password})`);
      } else {
        // Create new user
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(user.password, salt);
        await pool.query(
          `INSERT INTO admin_users (username, password_hash, name, role, status, company_id)
           VALUES ($1, $2, $3, 'hr', 'active', 1)`,
          [user.username, hash, user.name]
        );
        console.log(`Created user: ${user.username} (password: ${user.password})`);
      }
    }

    console.log('\nAll driver claims admin users ready!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createUsers();
