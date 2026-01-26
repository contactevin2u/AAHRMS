const pool = require('../db');

async function createResignations() {
  const resignations = [
    {
      employee_id: 169,
      name: 'NABILA ADRIANA BINTI MUHAMAD AZLEN',
      notice_date: '2026-01-26',  // Today
      last_working_day: '2026-01-29',
      reason: 'Personal reasons'
    },
    {
      employee_id: 167,
      name: 'ALLYCIA LYRICA ANAK STEPHEN',
      notice_date: '2026-01-26',  // Today
      last_working_day: '2026-01-30',
      reason: 'Personal reasons'
    }
  ];

  console.log('CREATING RESIGNATION RECORDS');
  console.log('='.repeat(60));

  for (const r of resignations) {
    try {
      // Check if resignation already exists
      const existing = await pool.query(
        `SELECT id, status FROM resignations WHERE employee_id = $1 AND status != 'cancelled'`,
        [r.employee_id]
      );

      if (existing.rows.length > 0) {
        console.log(`\n${r.name}:`);
        console.log(`  Already has resignation record (ID: ${existing.rows[0].id}, Status: ${existing.rows[0].status})`);
        continue;
      }

      // Create resignation record
      const result = await pool.query(`
        INSERT INTO resignations (employee_id, notice_date, last_working_day, reason, status, settlement_status)
        VALUES ($1, $2, $3, $4, 'pending', 'pending')
        RETURNING id
      `, [r.employee_id, r.notice_date, r.last_working_day, r.reason]);

      console.log(`\n${r.name}:`);
      console.log(`  ✓ Resignation created (ID: ${result.rows[0].id})`);
      console.log(`  Notice Date: ${r.notice_date}`);
      console.log(`  Last Working Day: ${r.last_working_day}`);
      console.log(`  Status: pending (employee can still clock in)`);
    } catch (err) {
      console.log(`\n${r.name}:`);
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  // Verify employee status is still active
  console.log('\n' + '='.repeat(60));
  console.log('EMPLOYEE STATUS CHECK:');
  console.log('='.repeat(60));

  const employees = await pool.query(`
    SELECT id, name, status
    FROM employees
    WHERE id IN (169, 167)
  `);

  for (const emp of employees.rows) {
    console.log(`  ${emp.name}: ${emp.status.toUpperCase()} (can clock in: ${emp.status === 'active' ? 'YES' : 'NO'})`);
  }

  process.exit(0);
}

createResignations().catch(e => { console.error(e); process.exit(1); });
