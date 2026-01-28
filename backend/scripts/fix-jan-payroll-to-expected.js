/**
 * Fix January 2026 Payroll to match Expected Values from LHDN/KWSP slips
 */

const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Expected values from LHDN/KWSP slips (corrected)
const expectedValues = {
  'EVIN LIM': { epf_ee: 1628, epf_er: 1776 },
  'HIDAYAH BINTI MUSTAPA': { epf_ee: 1133, epf_er: 1236 },
  'MICHELLE CHEAN MEI TZEE': { epf_ee: 2101, epf_er: 2292, pcb: 1014.75 },
  'NASHRATUN NABILAH BINTI SABRI': { epf_ee: 1892, epf_er: 2064 },
  'NUR HASLIZA ZAINAL ABIDIN': { socso_ee: 8.75, eis_ee: 3.50 },
  'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH': { epf_ee: 2879, epf_er: 3141 },
  'RAJA NUR SYAKIRAH BINTI RAJA SHURAN': { epf_ee: 1584, epf_er: 1728 },
  'TAN HUI YANG': { epf_ee: 1573, epf_er: 1716 }
};

async function run() {
  const shouldFix = process.argv.includes('--fix');

  console.log('='.repeat(70));
  console.log('FIX JANUARY 2026 PAYROLL TO EXPECTED VALUES');
  console.log(shouldFix ? 'MODE: FIX (will update database)' : 'MODE: PREVIEW');
  console.log('='.repeat(70));
  console.log('');

  for (const [name, expected] of Object.entries(expectedValues)) {
    console.log(`\n${name}:`);

    // Get current values
    const result = await pool.query(`
      SELECT pi.id, pi.epf_employee, pi.epf_employer, pi.socso_employee, pi.eis_employee, pi.pcb
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = 1 AND pr.month = 1 AND pr.year = 2026
        AND e.name = $1
    `, [name]);

    if (result.rows.length === 0) {
      console.log('  Not found in database');
      continue;
    }

    const row = result.rows[0];
    const updates = [];
    const updateValues = [];
    let paramIndex = 2;

    if (expected.epf_ee !== undefined && parseFloat(row.epf_employee) !== expected.epf_ee) {
      console.log(`  EPF_EE: ${row.epf_employee} -> ${expected.epf_ee}`);
      updates.push(`epf_employee = $${paramIndex++}`);
      updateValues.push(expected.epf_ee);
    }

    if (expected.epf_er !== undefined && parseFloat(row.epf_employer) !== expected.epf_er) {
      console.log(`  EPF_ER: ${row.epf_employer} -> ${expected.epf_er}`);
      updates.push(`epf_employer = $${paramIndex++}`);
      updateValues.push(expected.epf_er);
    }

    if (expected.socso_ee !== undefined && parseFloat(row.socso_employee) !== expected.socso_ee) {
      console.log(`  SOCSO_EE: ${row.socso_employee} -> ${expected.socso_ee}`);
      updates.push(`socso_employee = $${paramIndex++}`);
      updateValues.push(expected.socso_ee);
    }

    if (expected.eis_ee !== undefined && parseFloat(row.eis_employee) !== expected.eis_ee) {
      console.log(`  EIS_EE: ${row.eis_employee} -> ${expected.eis_ee}`);
      updates.push(`eis_employee = $${paramIndex++}`);
      updateValues.push(expected.eis_ee);
    }

    if (expected.pcb !== undefined && Math.abs(parseFloat(row.pcb || 0) - expected.pcb) > 0.01) {
      console.log(`  PCB: ${row.pcb || 0} -> ${expected.pcb}`);
      updates.push(`pcb = $${paramIndex++}`);
      updateValues.push(expected.pcb);
    }

    if (updates.length === 0) {
      console.log('  Already correct!');
    } else if (shouldFix) {
      await pool.query(
        `UPDATE payroll_items SET ${updates.join(', ')} WHERE id = $1`,
        [row.id, ...updateValues]
      );
      console.log('  >> FIXED');
    }
  }

  console.log('\n' + '='.repeat(70));
  if (!shouldFix) {
    console.log('To apply these fixes, run with --fix flag:');
    console.log('  node scripts/fix-jan-payroll-to-expected.js --fix');
  } else {
    console.log('All fixes applied!');
    console.log('Run verify-payroll.js to confirm all values now match.');
  }

  pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  pool.end();
});
