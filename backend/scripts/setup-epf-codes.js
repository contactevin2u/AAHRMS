const pool = require('../db');

async function run() {
  // Add epf_code column to outlets
  await pool.query('ALTER TABLE outlets ADD COLUMN IF NOT EXISTS epf_code VARCHAR(20)');
  console.log('Added epf_code column to outlets');

  // Add epf_code column to companies (fallback)
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS epf_code VARCHAR(20)');
  console.log('Added epf_code column to companies');

  // Set EPF employer codes from sample files
  const codes = [
    [1, '024986721'],   // Mimix A - Subang (MMXA)
    [2, '025031903'],   // Marina Charisma
    [3, '025271076'],   // Miksu Boba - WM (BOBA)
    [4, '025149033'],   // Langkah ATD
    [5, null],          // Langkah BTR - no sample
    [6, '25271700'],    // Langkah ATS
    [7, '025270924'],   // Langkah SLS
    [9, '025412664'],   // Langkah MSB
    [10, '25271700'],   // Kopi Antarabangsa (same as ATS)
    [12, '025412656'],  // Langkah SLD
  ];

  for (const [id, code] of codes) {
    if (code) {
      await pool.query('UPDATE outlets SET epf_code = $1 WHERE id = $2', [code, id]);
    }
  }
  console.log('Set EPF codes for outlets');

  const r = await pool.query('SELECT id, name, epf_code, socso_code FROM outlets ORDER BY id');
  r.rows.forEach(o => console.log(o.id, o.name, '| EPF:', o.epf_code || 'null', '| SOCSO:', o.socso_code || 'null'));

  await pool.end();
}
run().catch(e => { console.error(e); pool.end(); process.exit(1); });
