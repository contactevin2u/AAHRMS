const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== Updating Claims with Payroll Month ===\n');

  // Step 1: Add payroll_month and payroll_year columns if they don't exist
  console.log('Step 1: Adding payroll_month and payroll_year columns...');

  await pool.query(`
    ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS payroll_month INTEGER,
    ADD COLUMN IF NOT EXISTS payroll_year INTEGER
  `);
  console.log('Columns added/verified.\n');

  // Step 2: Get all pending and approved claims
  const claims = await pool.query(`
    SELECT c.id, c.employee_id, e.name, c.claim_date, c.description, c.amount, c.status,
           c.payroll_month, c.payroll_year
    FROM claims c
    JOIN employees e ON c.employee_id = e.id
    WHERE c.status IN ('pending', 'approved')
    ORDER BY e.name, c.claim_date DESC
  `);

  console.log('Step 2: Processing ' + claims.rows.length + ' claims...\n');

  // Step 3: Update each claim with payroll month
  // Logic:
  // - If claim_date is in January 2026 and not already marked for Feb -> January 2026
  // - If claim_date is in December 2025 or earlier -> January 2026 (carried forward)
  // - If already marked [Carry forward to Feb 2026] -> February 2026
  // - Pending claims -> Next available payroll (February 2026)

  let janCount = 0;
  let febCount = 0;

  for (const c of claims.rows) {
    const claimDate = new Date(c.claim_date);
    const claimMonth = claimDate.getMonth() + 1; // 1-12
    const claimYear = claimDate.getFullYear();

    let payrollMonth, payrollYear;

    // Check if already marked for Feb 2026
    if (c.description && c.description.includes('[Carry forward to Feb 2026]')) {
      payrollMonth = 2;
      payrollYear = 2026;
      febCount++;
    }
    // Pending claims go to February 2026 (next payroll)
    else if (c.status === 'pending') {
      payrollMonth = 2;
      payrollYear = 2026;
      febCount++;
    }
    // Approved claims from Jan 2026 or earlier -> January 2026 payroll
    else if (claimYear < 2026 || (claimYear === 2026 && claimMonth === 1)) {
      payrollMonth = 1;
      payrollYear = 2026;
      janCount++;
    }
    // Future claims -> February 2026 or later
    else {
      payrollMonth = claimMonth;
      payrollYear = claimYear;
      if (payrollMonth === 2 && payrollYear === 2026) febCount++;
    }

    // Update the claim
    await pool.query(`
      UPDATE claims
      SET payroll_month = $1, payroll_year = $2
      WHERE id = $3
    `, [payrollMonth, payrollYear, c.id]);
  }

  console.log('Claims assigned to January 2026: ' + janCount);
  console.log('Claims assigned to February 2026: ' + febCount);

  // Step 4: Verify updates
  console.log('\n=== Summary by Payroll Month ===\n');

  const summary = await pool.query(`
    SELECT payroll_year, payroll_month, status, COUNT(*) as count, SUM(amount) as total
    FROM claims
    WHERE status IN ('pending', 'approved')
    AND payroll_month IS NOT NULL
    GROUP BY payroll_year, payroll_month, status
    ORDER BY payroll_year, payroll_month, status
  `);

  summary.rows.forEach(row => {
    const monthName = new Date(row.payroll_year, row.payroll_month - 1).toLocaleString('en', { month: 'long' });
    console.log(`${monthName} ${row.payroll_year} (${row.status}): ${row.count} claims, RM ${parseFloat(row.total).toFixed(2)}`);
  });

  console.log('\nDone!');
  pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  pool.end();
});
