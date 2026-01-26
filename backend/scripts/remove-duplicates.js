const pool = require('../db');

async function removeDuplicates() {
  // Employee IDs to delete (ones with 0 attendance records)
  // When both have 0 records, keep the older one
  const toDelete = [
    { id: 359, name: 'NUR ADILA NATASYA', reason: 'duplicate, 0 records (keeping ID 127 with 1 record)' },
    { id: 363, name: 'NUR NILAM SARI', reason: 'duplicate, 0 records (keeping ID 191 with 8 records)' },
    { id: 356, name: 'ADAM MIKHAEL RIDUWN', reason: 'duplicate, newer entry (keeping older ID 122)' },
    { id: 357, name: 'MUHAMMAD ROZAIMIE', reason: 'duplicate, 0 records (keeping ID 330 with 1 record)' },
    { id: 355, name: 'YANG ANTAH AFIQAH', reason: 'duplicate, 0 records (keeping ID 123 with 3 records)' },
    { id: 354, name: 'AMEER ISKANDAR', reason: 'duplicate, newer entry (keeping older ID 128)' },
    { id: 329, name: 'NOR SUMAYYAH', reason: 'duplicate, 0 records (keeping ID 358 with 1 record)' },
  ];

  console.log('REMOVING DUPLICATE EMPLOYEES:');
  console.log('='.repeat(80));

  let deleted = 0;
  let errors = 0;

  for (const emp of toDelete) {
    try {
      // Set status to 'deleted' instead of hard delete to preserve audit trail
      await pool.query(
        "UPDATE employees SET status = 'deleted' WHERE id = $1",
        [emp.id]
      );
      console.log(`✓ Deleted ID ${emp.id}: ${emp.name}`);
      console.log(`  Reason: ${emp.reason}`);
      deleted++;
    } catch (err) {
      console.error(`✗ Failed to delete ID ${emp.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`COMPLETED: ${deleted} duplicates removed, ${errors} errors`);
  console.log('='.repeat(80));

  process.exit(0);
}

removeDuplicates().catch(e => { console.error(e); process.exit(1); });
