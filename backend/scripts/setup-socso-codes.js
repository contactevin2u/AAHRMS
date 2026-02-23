const pool = require('../db');

async function run() {
  await pool.query('ALTER TABLE outlets ADD COLUMN IF NOT EXISTS socso_code VARCHAR(20)');
  console.log('Added socso_code column');

  const codes = [
    [1, 'B3502107862M'],   // Mimix A - Subang
    [2, 'A3702155950W'],   // Marina Charisma
    [3, 'A3702160377M'],   // Miksu Boba - WM
    [4, 'A3702157476V'],   // Langkah ATD
    [5, 'A3702160380K'],   // Langkah BTR
    [6, 'A3702160379A'],   // Langkah ATS
    [7, 'B3202131599Y'],   // Langkah SLS
    [9, 'B3202133503K'],   // Langkah MSB
    [10, 'A3702166831V'],  // Kopi Antarabangsa
    [12, 'B3902121036K'],  // Langkah SLD
  ];

  for (const [id, code] of codes) {
    await pool.query('UPDATE outlets SET socso_code = $1 WHERE id = $2', [code, id]);
  }
  console.log('Set SOCSO codes for all outlets');

  const r = await pool.query('SELECT id, name, socso_code FROM outlets ORDER BY id');
  r.rows.forEach(o => console.log(o.id, o.name, '->', o.socso_code || 'null'));
  await pool.end();
}

run().catch(err => { console.error(err); pool.end(); process.exit(1); });
