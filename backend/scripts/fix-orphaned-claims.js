const pool = require('../db');

async function updatePayrolls() {
  try {
    // Get employees with orphaned claims that were just fixed
    const employees = ['CONNIE HUI KANG YI', 'LAU YU JUN', 'LEONG XIA HWEI'];

    console.log('=== CHECKING DRAFT PAYROLLS FOR AFFECTED EMPLOYEES ===\n');

    for (const name of employees) {
      // Get employee's unlinked approved claims
      const claims = await pool.query(`
        SELECT c.id, c.amount, e.id as employee_id
        FROM claims c
        JOIN employees e ON c.employee_id = e.id
        WHERE e.name = $1
          AND c.status = 'approved'
          AND c.linked_payroll_item_id IS NULL
      `, [name]);

      if (claims.rows.length === 0) {
        console.log(`${name}: No unlinked claims`);
        continue;
      }

      const totalClaims = claims.rows.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const employeeId = claims.rows[0].employee_id;

      // Check if in draft payroll
      const payrollItem = await pool.query(`
        SELECT pi.id, pi.claims_amount, pi.gross_salary, pi.net_pay, pr.id as run_id
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        WHERE pi.employee_id = $1
          AND pr.status = 'draft'
      `, [employeeId]);

      if (payrollItem.rows.length === 0) {
        console.log(`${name}: Not in any draft payroll`);
        console.log(`  Unlinked claims: RM${totalClaims.toFixed(2)}`);
        console.log('');
        continue;
      }

      const pi = payrollItem.rows[0];
      const currentClaims = parseFloat(pi.claims_amount) || 0;

      console.log(`${name}:`);
      console.log(`  Payroll Item #${pi.id} (Run #${pi.run_id})`);
      console.log(`  Current claims: RM${currentClaims.toFixed(2)}`);
      console.log(`  Unlinked claims: RM${totalClaims.toFixed(2)}`);

      if (totalClaims > currentClaims) {
        const diff = totalClaims - currentClaims;
        const newGross = parseFloat(pi.gross_salary) + diff;
        const newNet = parseFloat(pi.net_pay) + diff;

        await pool.query(`
          UPDATE payroll_items
          SET claims_amount = $1, gross_salary = $2, net_pay = $3, updated_at = NOW()
          WHERE id = $4
        `, [totalClaims, newGross, newNet, pi.id]);

        await pool.query(`
          UPDATE payroll_runs
          SET total_gross = total_gross + $1, total_net = total_net + $1, updated_at = NOW()
          WHERE id = $2
        `, [diff, pi.run_id]);

        console.log(`  UPDATED: +RM${diff.toFixed(2)}`);
        console.log(`  New claims: RM${totalClaims.toFixed(2)}`);
      } else {
        console.log('  (Already up to date)');
      }
      console.log('');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

updatePayrolls();
