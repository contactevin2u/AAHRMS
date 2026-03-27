/**
 * Fix claims that were wrongly linked to payroll items from a different month.
 * The old finalization code had no date filter, so March claims could get linked to Feb payroll.
 * This script unlinks claims where claim_date falls outside the payroll run's month.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432, database: process.env.DB_NAME || 'hrms_db', user: process.env.DB_USER, password: process.env.DB_PASSWORD });

async function fix() {
  try {
    // Find claims linked to payroll items where the claim_date doesn't match the payroll run month
    const result = await pool.query(`
      SELECT c.id, c.employee_id, c.claim_date, c.amount, c.category,
             pi.id as payroll_item_id, pr.month, pr.year,
             e.name as employee_name
      FROM claims c
      JOIN payroll_items pi ON c.linked_payroll_item_id = pi.id
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON c.employee_id = e.id
      WHERE c.claim_date < (pr.year || '-' || LPAD(pr.month::text, 2, '0') || '-01')::date
         OR c.claim_date > (date_trunc('month', (pr.year || '-' || LPAD(pr.month::text, 2, '0') || '-01')::date) + interval '1 month - 1 day')::date
      ORDER BY c.claim_date
    `);

    console.log(`Found ${result.rows.length} wrongly linked claims:\n`);
    for (const r of result.rows) {
      console.log(`  Claim #${r.id}: ${r.employee_name} - ${r.category} RM${r.amount} on ${r.claim_date.toISOString().split('T')[0]} → linked to ${r.month}/${r.year} payroll`);
    }

    if (result.rows.length === 0) {
      console.log('No wrongly linked claims found.');
      process.exit(0);
    }

    // Unlink them
    const ids = result.rows.map(r => r.id);
    const updateResult = await pool.query(`
      UPDATE claims SET linked_payroll_item_id = NULL, updated_at = NOW()
      WHERE id = ANY($1)
    `, [ids]);

    console.log(`\nUnlinked ${updateResult.rowCount} claims. They will now be picked up by the correct month's payroll.`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

fix();
