const pool = require('../db');

async function updateBankAccounts() {
  // Fixed names based on database search
  const employees = [
    { name: 'SITI FATIMAH BINTI PARSON', account: '6423067819', bank: 'PUBLIC BANK' },
    { name: 'Wan Nur Najihah Binti Wan Nawang', account: '156114388941', bank: 'MAYBANK' },
    { name: 'SOFEA ZULAIKHA PUTRI', account: '12298020116933', bank: 'BANK ISLAM' }
  ];

  console.log('=== Updating Bank Accounts for AA Alive ===\n');

  let updated = 0;
  let notFound = [];

  for (const emp of employees) {
    const result = await pool.query(
      `UPDATE employees SET bank_account_no = $1, bank_name = $2
       WHERE company_id = 1 AND UPPER(name) LIKE UPPER($3)
       RETURNING id, name`,
      [emp.account, emp.bank, '%' + emp.name + '%']
    );
    if (result.rows.length > 0) {
      console.log('Updated:', result.rows[0].name, '|', emp.bank, emp.account);
      updated++;
    } else {
      console.log('NOT FOUND:', emp.name);
      notFound.push(emp.name);
    }
  }

  console.log('\n=== Summary ===');
  console.log('Updated:', updated);
  console.log('Not found:', notFound.length);
  if (notFound.length > 0) {
    console.log('Missing:', notFound.join(', '));
  }

  process.exit(0);
}

updateBankAccounts().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
