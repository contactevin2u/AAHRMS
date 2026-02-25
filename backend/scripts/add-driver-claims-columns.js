/**
 * Migration: Add driver claims portal columns to claims table
 *
 * Adds columns for cash payment tracking and driver signature:
 * - cash_paid_at: When payment was released
 * - cash_paid_by: Which admin released the payment
 * - driver_signature: Base64 signature image from driver
 *
 * Status flow: approved -> paid (with signature)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../db');

async function migrate() {
  try {
    console.log('Adding driver claims columns...');

    // Add cash_paid_at column
    await pool.query(`
      ALTER TABLE claims
      ADD COLUMN IF NOT EXISTS cash_paid_at TIMESTAMP
    `);
    console.log('Added cash_paid_at column');

    // Add cash_paid_by column
    await pool.query(`
      ALTER TABLE claims
      ADD COLUMN IF NOT EXISTS cash_paid_by INTEGER REFERENCES admin_users(id)
    `);
    console.log('Added cash_paid_by column');

    // Add driver_signature column (base64 text)
    await pool.query(`
      ALTER TABLE claims
      ADD COLUMN IF NOT EXISTS driver_signature TEXT
    `);
    console.log('Added driver_signature column');

    // Add index for driver claims queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_claims_cash_paid
      ON claims(cash_paid_at) WHERE cash_paid_at IS NOT NULL
    `);
    console.log('Added index on cash_paid_at');

    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
