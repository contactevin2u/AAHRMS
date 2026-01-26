const pool = require('../db');

async function setup() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Setting up outstation meal allowance...');
    console.log('='.repeat(60));

    // 1. Add outstation_meal_allowance column to employees table if not exists
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS outstation_meal_allowance DECIMAL(10,2) DEFAULT NULL
    `);
    console.log('✓ Added outstation_meal_allowance column to employees table');

    // 2. Set RM20 meal allowance for Fanny, Michelle, and Leh Lin
    const employees = [
      { id: 307, name: 'FANNY LAU HUAN YE' },
      { id: 66, name: 'MICHELLE CHEAN MEI TZEE' },
      { id: 313, name: 'LAU LEH LIN' }
    ];

    for (const emp of employees) {
      await client.query(
        'UPDATE employees SET outstation_meal_allowance = 20.00 WHERE id = $1',
        [emp.id]
      );
      console.log(`✓ Set RM20 meal allowance for ${emp.name} (ID: ${emp.id})`);
    }

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log('\nPolicy: If these employees submit meal claims for outstation');
    console.log('with amount <= RM20, claims can be directly approved even if');
    console.log('receipt amount does not match exactly.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    throw err;
  } finally {
    client.release();
  }

  process.exit(0);
}

setup().catch(e => { console.error(e); process.exit(1); });
