const pool = require('../db');

async function checkAslieClock() {
  try {
    // Find all Aslie employee records
    const emp = await pool.query(`
      SELECT e.id, e.name, e.company_id, c.name as company_name
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      WHERE e.name ILIKE '%aslie%'
    `);

    if (emp.rows.length === 0) {
      console.log('No employee found with name containing "aslie"');
      process.exit(0);
    }

    console.log('=== EMPLOYEE INFO ===');
    emp.rows.forEach(e => console.log(`ID: ${e.id}, Name: ${e.name}, Company: ${e.company_name} (ID: ${e.company_id})`));

    // Get clock records for ALL Aslie employees
    const employeeIds = emp.rows.map(e => e.id);

    const record = await pool.query(`
      SELECT cr.id, cr.work_date::text, cr.employee_id, e.name,
             cr.clock_in_1, cr.clock_out_1, cr.clock_in_2, cr.clock_out_2,
             cr.status, cr.total_work_minutes, cr.ot_minutes
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      WHERE cr.employee_id = ANY($1)
      ORDER BY cr.work_date DESC, cr.id DESC
      LIMIT 10
    `, [employeeIds]);

    console.log('\n=== RECENT CLOCK RECORDS (ALL ASLIE) ===');
    if (record.rows.length === 0) {
      console.log('No clock records found for any Aslie employee');
    } else {
      record.rows.forEach(r => {
        console.log(`${r.name} (Employee ID: ${r.employee_id})`);
        console.log(`  Date: ${r.work_date}, Status: ${r.status}, Record ID: ${r.id}`);
        console.log(`  clock_in_1: ${r.clock_in_1 || 'null'}`);
        console.log(`  clock_out_1: ${r.clock_out_1 || 'null'}`);
        console.log(`  clock_in_2: ${r.clock_in_2 || 'null'}`);
        console.log(`  clock_out_2: ${r.clock_out_2 || 'null'}`);
        console.log(`  total_work: ${r.total_work_minutes || 0} min, OT: ${r.ot_minutes || 0} min`);
        console.log('');
      });
    }

    // Check if AA Alive
    const companyId = emp.rows[0].company_id;
    const isAAAlive = companyId === 1;
    console.log(`=== COMPANY TYPE ===`);
    console.log(`Is AA Alive: ${isAAAlive}`);
    if (isAAAlive) {
      console.log('For AA Alive: clock_out_1 = Session End (not break)');
    } else {
      console.log('For Mimix: clock_out_1 = Break Start');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkAslieClock();
