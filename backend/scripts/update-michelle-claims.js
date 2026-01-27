const pool = require('../db');

async function updateMichelleClaims() {
  try {
    // Get Michelle's employee_id and total approved unlinked claims
    const claims = await pool.query(`
      SELECT e.id as employee_id, e.name, SUM(c.amount) as total
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE e.name ILIKE '%michelle%'
        AND c.status = 'approved'
        AND c.linked_payroll_item_id IS NULL
      GROUP BY e.id, e.name
    `);

    if (claims.rows.length === 0) {
      console.log('No approved unlinked claims found for Michelle');
      process.exit(0);
    }

    const totalClaims = parseFloat(claims.rows[0].total) || 0;
    const employeeId = claims.rows[0].employee_id;
    console.log(`Employee: ${claims.rows[0].name} (ID: ${employeeId})`);
    console.log(`Total approved claims: RM${totalClaims.toFixed(2)}`);

    // Find Michelle's payroll item in Draft #84
    const item = await pool.query(`
      SELECT pi.id, pi.claims_amount, pi.gross_salary, pi.net_pay
      FROM payroll_items pi
      WHERE pi.payroll_run_id = 84
        AND pi.employee_id = $1
    `, [employeeId]);

    if (item.rows.length === 0) {
      console.log('Michelle not found in Draft #84');
      process.exit(1);
    }

    const pi = item.rows[0];
    console.log(`\nPayroll Item #${pi.id}:`);
    console.log(`  Current claims_amount: RM${(parseFloat(pi.claims_amount) || 0).toFixed(2)}`);

    // Calculate new gross and net
    const oldClaims = parseFloat(pi.claims_amount) || 0;
    const claimsDiff = totalClaims - oldClaims;
    const newGross = parseFloat(pi.gross_salary) + claimsDiff;
    const newNet = parseFloat(pi.net_pay) + claimsDiff;

    console.log(`  New claims_amount: RM${totalClaims.toFixed(2)}`);
    console.log(`  New gross_salary: RM${newGross.toFixed(2)}`);
    console.log(`  New net_pay: RM${newNet.toFixed(2)}`);

    // Update the payroll item
    await pool.query(`
      UPDATE payroll_items
      SET claims_amount = $1,
          gross_salary = $2,
          net_pay = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [totalClaims, newGross, newNet, pi.id]);

    console.log('\nPayroll item updated successfully!');

    // Update payroll run totals
    await pool.query(`
      UPDATE payroll_runs
      SET total_gross = (SELECT COALESCE(SUM(gross_salary), 0) FROM payroll_items WHERE payroll_run_id = 84),
          total_net = (SELECT COALESCE(SUM(net_pay), 0) FROM payroll_items WHERE payroll_run_id = 84),
          total_deductions = (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_items WHERE payroll_run_id = 84),
          updated_at = NOW()
      WHERE id = 84
    `);

    console.log('Payroll run totals updated!');

    // Verify the update
    const verify = await pool.query(`
      SELECT pi.claims_amount, pi.gross_salary, pi.net_pay
      FROM payroll_items pi
      WHERE pi.id = $1
    `, [pi.id]);

    console.log('\n=== VERIFIED ===');
    console.log(`Claims: RM${parseFloat(verify.rows[0].claims_amount).toFixed(2)}`);
    console.log(`Gross: RM${parseFloat(verify.rows[0].gross_salary).toFixed(2)}`);
    console.log(`Net: RM${parseFloat(verify.rows[0].net_pay).toFixed(2)}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

updateMichelleClaims();
