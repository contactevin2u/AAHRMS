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
    `);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

module.exports = pool;
