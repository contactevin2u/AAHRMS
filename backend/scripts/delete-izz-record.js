const pool = require('../db');

async function deleteRecord() {
  // Find the employee
  const emp = await pool.query("SELECT id, name, company_id FROM employees WHERE name ILIKE '%IZZ AMMAR%'");

  if (emp.rows.length === 0) {
    console.log('Employee not found');
    process.exit(1);
  }

  console.log('Employee:', emp.rows[0].name, '(ID:', emp.rows[0].id, ')');

  // Find the record for 27 Jan 2026
  const record = await pool.query(`
    SELECT id, work_date::text, clock_in_1, clock_out_1, clock_out_2, status, outlet_id
    FROM clock_in_records
    WHERE employee_id = $1
    AND work_date = '2026-01-27'
    ORDER BY id DESC
  `, [emp.rows[0].id]);

  console.log('\nRecords for 27 Jan 2026:');
  if (record.rows.length === 0) {
    console.log('No records found');
    process.exit(0);
  }

  record.rows.forEach(r => {
    console.log('ID:', r.id, '| in1:', r.clock_in_1, '| out1:', r.clock_out_1, '| out2:', r.clock_out_2, '| status:', r.status);
  });

  // Delete the record(s)
  const recordIds = record.rows.map(r => r.id);
  console.log('\nDeleting record ID(s):', recordIds.join(', '));

  await pool.query('DELETE FROM clock_in_records WHERE id = ANY($1)', [recordIds]);

  console.log('Record(s) deleted successfully!');

  // Verify
  const verify = await pool.query(`
    SELECT COUNT(*) as count FROM clock_in_records
    WHERE employee_id = $1 AND work_date = '2026-01-27'
  `, [emp.rows[0].id]);

  console.log('Remaining records for 27 Jan:', verify.rows[0].count);

  process.exit(0);
}

deleteRecord().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
