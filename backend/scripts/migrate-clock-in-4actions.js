/**
 * Migration: Restructure clock_in_records for 4 actions per day
 *
 * Structure:
 * - clock_in_1: Start work (morning)
 * - clock_out_1: Break start
 * - clock_in_2: After break
 * - clock_out_2: End work
 *
 * Auto-calculated:
 * - total_work_minutes: Total working time
 * - total_break_minutes: Break duration
 * - ot_minutes: Overtime (anything above 8.5 hours = 510 minutes)
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

const STANDARD_WORK_MINUTES = 510; // 8.5 hours = 510 minutes

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('=== Clock-In 4 Actions Migration ===\n');

    // Check if new columns already exist
    const checkColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clock_in_records'
      AND column_name IN ('work_date', 'clock_in_1', 'clock_out_1', 'clock_in_2', 'clock_out_2')
    `);

    if (checkColumns.rows.length >= 4) {
      console.log('Migration already applied. Columns exist.');
      return;
    }

    console.log('Step 1: Adding new columns to clock_in_records...\n');

    // Add work_date column
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS work_date DATE
    `);
    console.log('  + work_date column added');

    // Rename existing clock_in_time to clock_in_1 if not already done
    const hasClockIn1 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clock_in_records' AND column_name = 'clock_in_1'
    `);

    if (hasClockIn1.rows.length === 0) {
      // Check if clock_in_time exists
      const hasClockInTime = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'clock_in_records' AND column_name = 'clock_in_time'
      `);

      if (hasClockInTime.rows.length > 0) {
        await client.query(`ALTER TABLE clock_in_records RENAME COLUMN clock_in_time TO clock_in_1`);
        console.log('  + Renamed clock_in_time → clock_in_1');
      } else {
        await client.query(`ALTER TABLE clock_in_records ADD COLUMN clock_in_1 TIME`);
        console.log('  + clock_in_1 column added');
      }
    }

    // Rename existing clock_out_time to clock_out_2 (end of day)
    const hasClockOut2 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clock_in_records' AND column_name = 'clock_out_2'
    `);

    if (hasClockOut2.rows.length === 0) {
      const hasClockOutTime = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'clock_in_records' AND column_name = 'clock_out_time'
      `);

      if (hasClockOutTime.rows.length > 0) {
        await client.query(`ALTER TABLE clock_in_records RENAME COLUMN clock_out_time TO clock_out_2`);
        console.log('  + Renamed clock_out_time → clock_out_2');
      } else {
        await client.query(`ALTER TABLE clock_in_records ADD COLUMN clock_out_2 TIME`);
        console.log('  + clock_out_2 column added');
      }
    }

    // Add clock_out_1 (break start)
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS clock_out_1 TIME
    `);
    console.log('  + clock_out_1 column added (break start)');

    // Add clock_in_2 (after break)
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS clock_in_2 TIME
    `);
    console.log('  + clock_in_2 column added (after break)');

    // Add location columns for each action
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS location_in_1 TEXT,
      ADD COLUMN IF NOT EXISTS location_out_1 TEXT,
      ADD COLUMN IF NOT EXISTS location_in_2 TEXT,
      ADD COLUMN IF NOT EXISTS location_out_2 TEXT
    `);
    console.log('  + Location columns added for each action');

    // Add photo columns for each action
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS photo_in_1 TEXT,
      ADD COLUMN IF NOT EXISTS photo_out_1 TEXT,
      ADD COLUMN IF NOT EXISTS photo_in_2 TEXT,
      ADD COLUMN IF NOT EXISTS photo_out_2 TEXT
    `);
    console.log('  + Photo columns added for each action');

    // Add calculated columns
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS total_work_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_break_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ot_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_hours NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ot_hours NUMERIC(5,2) DEFAULT 0
    `);
    console.log('  + Calculated columns added (total_work_minutes, ot_minutes, etc.)');

    // Add approval columns
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS approved_by INTEGER,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);
    console.log('  + Approval columns added');

    // Add OT rate column (configurable per record)
    await client.query(`
      ALTER TABLE clock_in_records
      ADD COLUMN IF NOT EXISTS ot_rate NUMERIC(4,2) DEFAULT 1.0
    `);
    console.log('  + OT rate column added (default 1.0x)');

    // Populate work_date from existing clock_in_1 data
    console.log('\nStep 2: Populating work_date from existing records...');
    await client.query(`
      UPDATE clock_in_records
      SET work_date = DATE(clock_in_1)
      WHERE work_date IS NULL AND clock_in_1 IS NOT NULL
    `);
    console.log('  + work_date populated from clock_in_1');

    // Create unique constraint on employee + date (one record per employee per day)
    console.log('\nStep 3: Creating unique constraint...');
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clock_in_employee_date
        ON clock_in_records(employee_id, work_date)
      `);
      console.log('  + Unique index on (employee_id, work_date) created');
    } catch (e) {
      console.log('  ! Unique index may already exist or has conflicts');
    }

    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clock_in_company_date
      ON clock_in_records(company_id, work_date)
    `);
    console.log('  + Index on (company_id, work_date) created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clock_in_outlet_date
      ON clock_in_records(outlet_id, work_date)
    `);
    console.log('  + Index on (outlet_id, work_date) created');

    console.log('\n=== Migration Completed Successfully ===\n');
    console.log('New Table Structure:');
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ Daily Attendance Record (Per Employee Per Day) │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log('│ work_date      │ Date of work                  │');
    console.log('│ clock_in_1     │ Start work (morning)          │');
    console.log('│ clock_out_1    │ Break start                   │');
    console.log('│ clock_in_2     │ After break                   │');
    console.log('│ clock_out_2    │ End work                      │');
    console.log('│ total_hours    │ Auto-calculated               │');
    console.log('│ ot_hours       │ Overtime (> 8.5 hours)        │');
    console.log('│ status         │ pending/approved/rejected     │');
    console.log('└─────────────────────────────────────────────────┘');
    console.log(`\nStandard Work Hours: 8.5 hours (${STANDARD_WORK_MINUTES} minutes)`);

  } catch (error) {
    console.error('Migration Error:', error.message);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
