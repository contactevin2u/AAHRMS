const pool = require('../db');

async function showClaimsByMonth() {
  try {
    // Get Michelle's approved claims not yet linked to payroll
    const claims = await pool.query(`
      SELECT c.id, c.amount, c.category,
             c.claim_date::text as claim_date,
             c.created_at::text as submitted_at,
             c.approved_at::text as approved_at,
             c.description,
             EXTRACT(MONTH FROM c.claim_date) as claim_month,
             EXTRACT(YEAR FROM c.claim_date) as claim_year,
             e.name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE e.name ILIKE '%michelle%'
        AND c.status = 'approved'
        AND c.linked_payroll_item_id IS NULL
      ORDER BY c.claim_date
    `);

    console.log('=== MICHELLE\'S APPROVED CLAIMS (Not Yet in Payroll) ===\n');

    // Group by payroll month
    const byMonth = {};
    claims.rows.forEach(c => {
      const key = `${c.claim_year}-${String(c.claim_month).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(c);
    });

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    for (const [monthKey, monthClaims] of Object.entries(byMonth).sort()) {
      const [year, month] = monthKey.split('-');
      const total = monthClaims.reduce((sum, c) => sum + parseFloat(c.amount), 0);

      console.log('='.repeat(60));
      console.log(`PAYROLL: ${monthNames[parseInt(month)]} ${year}`);
      console.log(`Claims: ${monthClaims.length} | Total: RM${total.toFixed(2)}`);
      console.log('='.repeat(60));

      monthClaims.forEach(c => {
        console.log(`  #${c.id}: RM${parseFloat(c.amount).toFixed(2)} (${c.category})`);
        console.log(`       Claim Date: ${c.claim_date}`);
        console.log(`       Submitted:  ${c.submitted_at ? c.submitted_at.substring(0, 10) : 'N/A'}`);
        if (c.description) console.log(`       Desc: ${c.description.substring(0, 40)}`);
        console.log('');
      });
    }

    // Show current draft payrolls
    console.log('\n' + '='.repeat(60));
    console.log('CURRENT DRAFT PAYROLLS (AA Alive)');
    console.log('='.repeat(60));

    const drafts = await pool.query(`
      SELECT pr.id, pr.month, pr.year, pi.claims_amount
      FROM payroll_runs pr
      JOIN payroll_items pi ON pr.id = pi.payroll_run_id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pr.status = 'draft'
        AND e.name ILIKE '%michelle%'
      ORDER BY pr.year, pr.month
    `);

    if (drafts.rows.length === 0) {
      console.log('Michelle is not in any draft payroll.');
    } else {
      drafts.rows.forEach(d => {
        console.log(`  ${monthNames[d.month]} ${d.year} (Draft #${d.id}): Claims in payroll = RM${parseFloat(d.claims_amount || 0).toFixed(2)}`);
      });
    }

    console.log('\n' + '-'.repeat(60));
    console.log('HOW IT WORKS:');
    console.log('-'.repeat(60));
    console.log('1. Claims go to payroll based on CLAIM DATE (not submit date)');
    console.log('2. If claim approved AFTER draft created, it\'s NOT auto-added');
    console.log('3. Need to manually update payroll OR recreate to include new claims');
    console.log('4. Claims are linked to payroll when FINALIZED');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

showClaimsByMonth();
