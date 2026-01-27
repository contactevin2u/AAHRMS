/**
 * Check Sri Jati (291) staff
 */
require('dotenv').config();
const pool = require('../db');

async function check() {
  const client = await pool.connect();
  try {
    // Get Sri Jati outlet info
    const outlet = await client.query(`
      SELECT o.id, o.name, o.supervisor_id, e.name as manager_name
      FROM outlets o
      LEFT JOIN employees e ON o.supervisor_id = e.id
      WHERE UPPER(o.name) LIKE '%SRI JATI%'
    `);

    console.log('='.repeat(70));
    console.log('OUTLET:', outlet.rows[0].name);
    console.log('Manager:', outlet.rows[0].manager_name || 'Not set');
    console.log('='.repeat(70));

    // Get all staff
    const staff = await client.query(`
      SELECT
        employee_id,
        name,
        ic_number,
        position,
        employee_role,
        employment_type,
        status
      FROM employees
      WHERE outlet_id = $1
      ORDER BY
        CASE employee_role
          WHEN 'manager' THEN 1
          WHEN 'supervisor' THEN 2
          ELSE 3
        END,
        employment_type,
        name
    `, [outlet.rows[0].id]);

    console.log('\nTotal Staff:', staff.rows.length);

    let currentType = '';
    for (const emp of staff.rows) {
      let type = emp.employee_role === 'manager' ? 'MANAGER' :
                 emp.employment_type === 'part_time' ? 'PART-TIME' : 'FULL-TIME';

      if (type !== currentType) {
        console.log('\n--- ' + type + ' ---');
        currentType = type;
      }

      console.log(`${emp.employee_id.padEnd(12)} | ${emp.name.padEnd(40)} | ${emp.ic_number}`);
    }

    console.log('\n' + '='.repeat(70));

  } finally {
    client.release();
    await pool.end();
  }
}
check();
