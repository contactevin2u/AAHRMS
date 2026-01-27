const pool = require('../db');

async function checkClaimsPayrollLink() {
  try {
    // Check payroll_items table structure for claims
    const columns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'payroll_items'
      AND column_name LIKE '%claim%'
      ORDER BY ordinal_position
    `);

    console.log('=== PAYROLL_ITEMS CLAIMS COLUMNS ===');
    columns.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // Check claims table for payroll link
    const claimCols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'claims'
      AND (column_name LIKE '%payroll%' OR column_name LIKE '%paid%')
    `);

    console.log('\n=== CLAIMS TABLE PAYROLL COLUMNS ===');
    if (claimCols.rows.length === 0) {
      console.log('  (No payroll-related columns found in claims table)');
    } else {
      claimCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
    }

    // Sample payroll items with claims
    const sample = await pool.query(`
      SELECT pi.id, e.name, pi.claims_amount, pr.month, pr.year, pr.status
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pi.claims_amount > 0
      ORDER BY pr.year DESC, pr.month DESC
      LIMIT 5
    `);

    console.log('\n=== SAMPLE PAYROLL ITEMS WITH CLAIMS ===');
    if (sample.rows.length === 0) {
      console.log('  (No payroll items with claims found)');
    } else {
      sample.rows.forEach(r => {
        console.log(`  ${r.name}: RM${r.claims_amount} in ${r.month}/${r.year} payroll (${r.status})`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkClaimsPayrollLink();
