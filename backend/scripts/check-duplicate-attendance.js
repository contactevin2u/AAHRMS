const pool = require('../db');

async function checkDuplicateAttendance() {
  // Duplicate employee IDs to check
  const duplicates = [
    { ic: '050201101234', name: 'NUR ADILA NATASYA', ids: [359, 127] },
    { ic: '050706140044', name: 'NUR NILAM SARI', ids: [363, 191] },
    { ic: '060716140143', name: 'ADAM MIKHAEL RIDUWN', ids: [122, 356] },
    { ic: '080329081065', name: 'MUHAMMAD ROZAIMIE', ids: [330, 357] },
    { ic: '041011140916', name: 'YANG ANTAH AFIQAH', ids: [123, 355] },
    { ic: '000807141219', name: 'AMEER ISKANDAR', ids: [128, 354] },
    { ic: '081105140200', name: 'NOR SUMAYYAH', ids: [358, 329] },
  ];

  console.log('DUPLICATE ATTENDANCE CHECK:');
  console.log('='.repeat(80));

  const toDelete = [];

  for (const dup of duplicates) {
    console.log(`\n${dup.name} (IC: ${dup.ic}):`);

    for (const id of dup.ids) {
      const clockResult = await pool.query(
        'SELECT COUNT(*) FROM clock_in_records WHERE employee_id = $1',
        [id]
      );
      const count = parseInt(clockResult.rows[0].count);

      const empResult = await pool.query(
        'SELECT created_at FROM employees WHERE id = $1',
        [id]
      );
      const createdAt = empResult.rows[0]?.created_at;

      console.log(`  ID ${id}: ${count} clock records, created: ${createdAt?.toISOString().slice(0,10) || 'N/A'}`);

      if (count === 0) {
        toDelete.push({ id, name: dup.name, ic: dup.ic });
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDED DELETIONS (0 attendance records):');
  console.log('='.repeat(80));

  if (toDelete.length === 0) {
    console.log('None - all duplicates have attendance records. Manual review required.');
  } else {
    for (const emp of toDelete) {
      console.log(`  DELETE employee ID ${emp.id}: ${emp.name}`);
    }
  }

  process.exit(0);
}

checkDuplicateAttendance().catch(e => { console.error(e); process.exit(1); });
