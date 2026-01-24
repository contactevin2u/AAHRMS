const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function checkAttendance() {
  try {
    // Get all employees
    const allEmployees = await pool.query(`
      SELECT e.id, e.name, e.ic_number, e.status, e.outlet_id, o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      ORDER BY e.status DESC, e.outlet_id, e.name
    `);

    console.log('=== CHECKING ALL EMPLOYEES FOR ATTENDANCE/CLOCK-IN RECORDS ===\n');

    const inactiveWithRecords = [];
    const inactiveWithoutRecords = [];
    const noOutletWithRecords = [];
    const noOutletWithoutRecords = [];

    for (const emp of allEmployees.rows) {
      // Check clock_in_records
      const clockResult = await pool.query(
        'SELECT COUNT(*) as count FROM clock_in_records WHERE employee_id = $1',
        [emp.id]
      );
      // Check payroll records
      const payrollResult = await pool.query(
        'SELECT COUNT(*) as count FROM payroll WHERE employee_id = $1',
        [emp.id]
      );
      // Check schedules
      const scheduleResult = await pool.query(
        'SELECT COUNT(*) as count FROM schedules WHERE employee_id = $1',
        [emp.id]
      );

      const clockCount = parseInt(clockResult.rows[0].count);
      const payrollCount = parseInt(payrollResult.rows[0].count);
      const scheduleCount = parseInt(scheduleResult.rows[0].count);
      const totalRecords = clockCount + payrollCount + scheduleCount;

      emp.clock_count = clockCount;
      emp.payroll_count = payrollCount;
      emp.schedule_count = scheduleCount;
      emp.total_records = totalRecords;

      // Categorize employees
      if (emp.status !== 'active') {
        if (totalRecords > 0) {
          inactiveWithRecords.push(emp);
        } else {
          inactiveWithoutRecords.push(emp);
        }
      } else if (emp.outlet_id === null) {
        if (totalRecords > 0) {
          noOutletWithRecords.push(emp);
        } else {
          noOutletWithoutRecords.push(emp);
        }
      }
    }

    // Display results
    console.log('=============================================================');
    console.log('INACTIVE EMPLOYEES WITH RECORDS (NEED REVIEW)');
    console.log('=============================================================');
    if (inactiveWithRecords.length === 0) {
      console.log('None found.\n');
    } else {
      inactiveWithRecords.forEach(emp => {
        console.log(`${emp.name} (${emp.ic_number})`);
        console.log(`  Status: ${emp.status}, Outlet: ${emp.outlet_name || 'NONE'}`);
        console.log(`  Clock-in: ${emp.clock_count}, Payroll: ${emp.payroll_count}, Schedule: ${emp.schedule_count}`);
        console.log('');
      });
    }

    console.log('=============================================================');
    console.log('ACTIVE EMPLOYEES WITH NO OUTLET BUT HAVE RECORDS (NEED REVIEW)');
    console.log('=============================================================');
    if (noOutletWithRecords.length === 0) {
      console.log('None found.\n');
    } else {
      noOutletWithRecords.forEach(emp => {
        console.log(`${emp.name} (${emp.ic_number})`);
        console.log(`  Status: ${emp.status}, Outlet: NONE`);
        console.log(`  Clock-in: ${emp.clock_count}, Payroll: ${emp.payroll_count}, Schedule: ${emp.schedule_count}`);
        console.log('');
      });
    }

    console.log('=============================================================');
    console.log('EMPLOYEES TO DEACTIVATE (NO RECORDS)');
    console.log('=============================================================');
    const toDeactivate = [...inactiveWithoutRecords, ...noOutletWithoutRecords];
    if (toDeactivate.length === 0) {
      console.log('None found.\n');
    } else {
      toDeactivate.forEach(emp => {
        console.log(`${emp.name} (${emp.ic_number}) - Status: ${emp.status}, Outlet: ${emp.outlet_name || 'NONE'}`);
      });
    }

    console.log('\n--- SUMMARY ---');
    console.log(`Inactive with records (need review): ${inactiveWithRecords.length}`);
    console.log(`No outlet with records (need review): ${noOutletWithRecords.length}`);
    console.log(`Can be deactivated (no records): ${toDeactivate.length}`);

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkAttendance();
