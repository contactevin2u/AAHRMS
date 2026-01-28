const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Get Michelle's employee ID
  const emp = await pool.query("SELECT id, name FROM employees WHERE name ILIKE '%michelle%chean%'");
  console.log('Employee:', emp.rows[0]);

  const empId = emp.rows[0].id;

  // Get all claims for Michelle
  const claims = await pool.query(`
    SELECT c.*, ct.name as claim_type_name
    FROM claims c
    LEFT JOIN claim_types ct ON c.claim_type_id = ct.id
    WHERE c.employee_id = $1
    ORDER BY c.claim_date DESC, c.created_at DESC
  `, [empId]);

  console.log('\n=== ALL CLAIMS FOR MICHELLE CHEAN MEI TZEE ===\n');

  let totalApproved = 0;
  let totalPending = 0;

  claims.rows.forEach((c, i) => {
    console.log((i + 1) + '. Claim ID: ' + c.id);
    console.log('   Type: ' + (c.claim_type_name || c.claim_type || 'N/A'));
    console.log('   Amount: RM ' + c.amount);
    console.log('   Date: ' + (c.claim_date ? new Date(c.claim_date).toISOString().split('T')[0] : 'N/A'));
    console.log('   Status: ' + c.status);
    console.log('   Description: ' + (c.description || 'N/A'));
    console.log('   Payroll Run ID: ' + (c.payroll_run_id || 'Not assigned'));
    console.log('');

    if (c.status === 'approved') {
      totalApproved += parseFloat(c.amount);
    } else if (c.status === 'pending') {
      totalPending += parseFloat(c.amount);
    }
  });

  console.log('=====================================');
  console.log('Total Approved Claims: RM ' + totalApproved.toFixed(2));
  console.log('Total Pending Claims: RM ' + totalPending.toFixed(2));
  console.log('=====================================');

  console.log('\nNote: Original claim in draft payroll was RM 1,550.89');
  console.log('Updated claim in image is RM 51.05');
  console.log('Difference to carry forward: RM ' + (1550.89 - 51.05).toFixed(2));

  pool.end();
}
run();
