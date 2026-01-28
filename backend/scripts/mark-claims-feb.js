const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Claims to carry forward to February (all except claim ID 18 which is paid in Jan)
  const claimIds = [153, 154, 156, 149, 150, 151, 152];

  console.log('Marking claims for February 2026 payroll...\n');

  // Check claims table structure
  const structure = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'claims'
    ORDER BY ordinal_position
  `);
  console.log('Claims table columns:', structure.rows.map(r => r.column_name).join(', '));

  // Update claims - set payroll_month to February 2026
  // If there's no payroll_month column, we'll add a note to description
  const hasPayrollMonth = structure.rows.some(r => r.column_name === 'payroll_month');
  const hasPayrollYear = structure.rows.some(r => r.column_name === 'payroll_year');
  const hasNotes = structure.rows.some(r => r.column_name === 'notes');

  for (const claimId of claimIds) {
    // Get current claim info
    const claim = await pool.query('SELECT * FROM claims WHERE id = $1', [claimId]);
    const c = claim.rows[0];

    if (hasPayrollMonth && hasPayrollYear) {
      await pool.query(`
        UPDATE claims SET payroll_month = 2, payroll_year = 2026 WHERE id = $1
      `, [claimId]);
      console.log(`Claim ${claimId} (${c.description}, RM ${c.amount}): Set to Feb 2026`);
    } else if (hasNotes) {
      await pool.query(`
        UPDATE claims SET notes = COALESCE(notes, '') || ' [Carry forward to Feb 2026]' WHERE id = $1
      `, [claimId]);
      console.log(`Claim ${claimId} (${c.description}, RM ${c.amount}): Added note for Feb 2026`);
    } else {
      // Update description to include the note
      const newDesc = c.description + ' [Carry forward to Feb 2026]';
      await pool.query(`
        UPDATE claims SET description = $1 WHERE id = $2
      `, [newDesc, claimId]);
      console.log(`Claim ${claimId} (${c.description}, RM ${c.amount}): Marked in description for Feb 2026`);
    }
  }

  // Calculate total
  const total = await pool.query(`
    SELECT SUM(amount) as total FROM claims WHERE id = ANY($1)
  `, [claimIds]);

  console.log('\n=====================================');
  console.log('Total claims marked for Feb 2026: RM ' + parseFloat(total.rows[0].total).toFixed(2));
  console.log('=====================================');

  pool.end();
}
run();
