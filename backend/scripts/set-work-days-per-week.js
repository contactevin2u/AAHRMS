/**
 * Set work_days_per_week in payroll_config for each company
 * - AA Alive (company_id=1): 5 days/week (Mon-Fri)
 * - Mimix (company_id=3): 6 days/week (no fixed rest day, shift-based)
 */
const pool = require('../db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // AA Alive: 5-day work week
    await client.query(`
      UPDATE companies
      SET payroll_config = COALESCE(payroll_config, '{}'::jsonb) || '{"work_days_per_week": 5}'::jsonb
      WHERE id = 1
    `);
    console.log('AA Alive (id=1): set work_days_per_week = 5');

    // Mimix: 6-day work week
    await client.query(`
      UPDATE companies
      SET payroll_config = COALESCE(payroll_config, '{}'::jsonb) || '{"work_days_per_week": 6}'::jsonb
      WHERE id = 3
    `);
    console.log('Mimix (id=3): set work_days_per_week = 6');

    // Also remove fixed work_days_per_month from Mimix if it's set to 26
    // so the dynamic calculation takes effect
    const mimixConfig = await client.query('SELECT payroll_config FROM companies WHERE id = 3');
    const config = mimixConfig.rows[0]?.payroll_config || {};
    if (config.work_days_per_month) {
      await client.query(`
        UPDATE companies
        SET payroll_config = payroll_config - 'work_days_per_month'
        WHERE id = 3
      `);
      console.log('Mimix: removed fixed work_days_per_month =', config.work_days_per_month);
    }

    // Also remove fixed work_days_per_month from AA Alive if set
    const aaConfig = await client.query('SELECT payroll_config FROM companies WHERE id = 1');
    const aaConfigData = aaConfig.rows[0]?.payroll_config || {};
    if (aaConfigData.work_days_per_month) {
      await client.query(`
        UPDATE companies
        SET payroll_config = payroll_config - 'work_days_per_month'
        WHERE id = 1
      `);
      console.log('AA Alive: removed fixed work_days_per_month =', aaConfigData.work_days_per_month);
    }

    await client.query('COMMIT');
    console.log('\nDone! Working days will now be calculated dynamically per month:');
    console.log('  AA Alive: Mon-Fri (e.g., Feb 2026 = 20 days)');
    console.log('  Mimix: 6 days/week (e.g., Feb 2026 = 24 days)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
