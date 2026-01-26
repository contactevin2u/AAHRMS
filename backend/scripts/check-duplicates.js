const pool = require('../db');

async function checkDuplicates() {
  const result = await pool.query(`
    SELECT REPLACE(ic_number, '-', '') as ic,
           COUNT(*) as count,
           STRING_AGG(name || ' (ID:' || id || ', outlet:' || COALESCE(outlet_id::text, 'NULL') || ')', ', ') as employees
    FROM employees
    WHERE company_id = 3 AND status = 'active' AND ic_number IS NOT NULL
    GROUP BY REPLACE(ic_number, '-', '')
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  console.log('DUPLICATE EMPLOYEES (same IC number):');
  console.log('='.repeat(80));
  if (result.rows.length === 0) {
    console.log('No duplicates found!');
  } else {
    for (const row of result.rows) {
      console.log(`IC: ${row.ic} - ${row.count} records`);
      console.log(`  ${row.employees}`);
      console.log('');
    }
  }
  process.exit(0);
}

checkDuplicates().catch(e => { console.error(e); process.exit(1); });
