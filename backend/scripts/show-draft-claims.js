const pool = require('../db');

async function showDraftClaimsBreakdown() {
  try {
    // Get current draft payrolls
    const drafts = await pool.query(`
      SELECT pr.id, pr.month, pr.year, pr.company_id, c.name as company_name,
             pr.total_net,
             (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = pr.id) as item_count
      FROM payroll_runs pr
      JOIN companies c ON pr.company_id = c.id
      WHERE pr.status = 'draft'
      ORDER BY pr.year DESC, pr.month DESC
    `);

    console.log('=== CURRENT DRAFT PAYROLLS ===\n');

    for (const draft of drafts.rows) {
      console.log('='.repeat(70));
      console.log(`${draft.company_name} - ${draft.month}/${draft.year} (Draft #${draft.id})`);
      console.log(`Employees: ${draft.item_count} | Total Net: RM${(parseFloat(draft.total_net) || 0).toFixed(2)}`);
      console.log('='.repeat(70));

      // Get payroll items with claims
      const items = await pool.query(`
        SELECT pi.id, pi.employee_id, e.name, pi.claims_amount
        FROM payroll_items pi
        JOIN employees e ON pi.employee_id = e.id
        WHERE pi.payroll_run_id = $1
        ORDER BY e.name
      `, [draft.id]);

      // Date range for this payroll
      const startOfMonth = `${draft.year}-${String(draft.month).padStart(2, '0')}-01`;
      const endOfMonth = new Date(draft.year, draft.month, 0).toISOString().split('T')[0];

      console.log(`Claim date range: ${startOfMonth} to ${endOfMonth}\n`);

      let hasAnyClaims = false;
      let totalClaimsInPayroll = 0;
      let totalApprovedNotLinked = 0;

      for (const item of items.rows) {
        // Get approved claims for this employee in date range (not yet linked)
        const claims = await pool.query(`
          SELECT id, amount, category, claim_date::text as claim_date,
                 auto_approved, description
          FROM claims
          WHERE employee_id = $1
            AND status = 'approved'
            AND linked_payroll_item_id IS NULL
            AND claim_date BETWEEN $2 AND $3
          ORDER BY claim_date
        `, [item.employee_id, startOfMonth, endOfMonth]);

        const payrollClaimsAmt = parseFloat(item.claims_amount) || 0;
        totalClaimsInPayroll += payrollClaimsAmt;

        if (claims.rows.length > 0 || payrollClaimsAmt > 0) {
          hasAnyClaims = true;
          const approvedTotal = claims.rows.reduce((sum, c) => sum + parseFloat(c.amount), 0);
          totalApprovedNotLinked += approvedTotal;

          console.log(`${item.name}:`);
          console.log(`  In Payroll: RM${payrollClaimsAmt.toFixed(2)} | Approved (unlinked): RM${approvedTotal.toFixed(2)}`);

          if (claims.rows.length > 0) {
            claims.rows.forEach(c => {
              const auto = c.auto_approved ? '[AUTO]' : '[MANUAL]';
              const desc = c.description ? ` - ${c.description.substring(0, 25)}...` : '';
              console.log(`    #${c.id}: RM${parseFloat(c.amount).toFixed(2)} (${c.category}) ${c.claim_date} ${auto}${desc}`);
            });
          }
          console.log('');
        }
      }

      if (!hasAnyClaims) {
        console.log('No claims in this payroll.\n');
      } else {
        console.log('-'.repeat(70));
        console.log(`TOTAL in Payroll: RM${totalClaimsInPayroll.toFixed(2)}`);
        console.log(`TOTAL Approved (unlinked in date range): RM${totalApprovedNotLinked.toFixed(2)}`);
        console.log('');
      }
    }

    if (drafts.rows.length === 0) {
      console.log('No draft payrolls found.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

showDraftClaimsBreakdown();
