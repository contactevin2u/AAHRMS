/**
 * Add excluded_employees column to payroll_runs table
 * This column stores employees who were excluded from payroll generation
 * due to having no schedule AND no clock-in records for the period.
 *
 * NOTE: This feature only applies to Mimix (outlet-based companies)
 * because they require schedule and clock-in records.
 * Other companies don't use this exclusion logic.
 */

const pool = require('../db');

async function addColumn() {
  try {
    // Check if column exists
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payroll_runs' AND column_name = 'excluded_employees'
    `);

    if (checkResult.rows.length > 0) {
      console.log('Column excluded_employees already exists');
      return;
    }

    // Add the column
    await pool.query(`
      ALTER TABLE payroll_runs
      ADD COLUMN excluded_employees JSONB DEFAULT NULL
    `);

    console.log('Successfully added excluded_employees column to payroll_runs');
  } catch (error) {
    console.error('Error adding column:', error);
  } finally {
    await pool.end();
  }
}

addColumn();
