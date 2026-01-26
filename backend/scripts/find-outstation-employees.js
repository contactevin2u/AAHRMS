const pool = require('../db');

async function find() {
  const result = await pool.query(`
    SELECT id, name, employee_id
    FROM employees
    WHERE company_id = 1
      AND status = 'active'
      AND (name ILIKE '%fanny%' OR name ILIKE '%michell%' OR name ILIKE '%lehlin%')
    ORDER BY name
  `);

  console.log('AA Alive employees found:');
  for (const emp of result.rows) {
    console.log(`  ID: ${emp.id} | Name: ${emp.name} | Dept: ${emp.department || 'N/A'}`);
  }
  process.exit(0);
}

find().catch(e => { console.error(e); process.exit(1); });
