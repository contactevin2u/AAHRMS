const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hrms_db',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

async function checkLeaveBalances() {
  try {
    console.log('Checking leave balances for Mimix and AA Alive...\n');

    // Get company info
    const companiesResult = await pool.query(`
      SELECT id, name, code FROM companies WHERE id IN (1, 3) ORDER BY id
    `);

    console.log('Companies:');
    companiesResult.rows.forEach(c => console.log(`  - ${c.name} (ID: ${c.id}, Code: ${c.code})`));
    console.log('');

    // Get total leave balances per company
    const query = `
      SELECT
        c.id as company_id,
        c.name as company_name,
        lt.code as leave_type_code,
        lt.name as leave_type_name,
        COUNT(DISTINCT lb.employee_id) as employee_count,
        SUM(lb.entitled_days) as total_entitled,
        SUM(lb.used_days) as total_used,
        SUM(lb.carried_forward) as total_carried_forward,
        SUM(lb.entitled_days + lb.carried_forward - lb.used_days) as total_remaining,
        lb.year
      FROM leave_balances lb
      JOIN employees e ON lb.employee_id = e.id
      JOIN companies c ON e.company_id = c.id
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE c.id IN (1, 3) AND e.status = 'active'
      GROUP BY c.id, c.name, lt.code, lt.name, lb.year
      ORDER BY c.id, lb.year DESC, lt.code
    `;

    const result = await pool.query(query);

    // Group by company and year
    const grouped = {};
    result.rows.forEach(row => {
      const key = `${row.company_id}-${row.year}`;
      if (!grouped[key]) {
        grouped[key] = {
          company_id: row.company_id,
          company_name: row.company_name,
          year: row.year,
          leave_types: []
        };
      }
      grouped[key].leave_types.push({
        code: row.leave_type_code,
        name: row.leave_type_name,
        employee_count: parseInt(row.employee_count),
        total_entitled: parseFloat(row.total_entitled || 0),
        total_used: parseFloat(row.total_used || 0),
        total_carried_forward: parseFloat(row.total_carried_forward || 0),
        total_remaining: parseFloat(row.total_remaining || 0)
      });
    });

    // Display results
    Object.values(grouped).forEach(group => {
      console.log('='.repeat(70));
      console.log(`${group.company_name} - Year ${group.year}`);
      console.log('='.repeat(70));

      let grandTotalEntitled = 0;
      let grandTotalUsed = 0;
      let grandTotalCarriedForward = 0;
      let grandTotalRemaining = 0;

      console.log(`${'Leave Type'.padEnd(25)} ${'Employees'.padStart(10)} ${'Entitled'.padStart(12)} ${'Used'.padStart(10)} ${'C/F'.padStart(8)} ${'Remaining'.padStart(12)}`);
      console.log('-'.repeat(70));

      group.leave_types.forEach(lt => {
        console.log(`${lt.name.padEnd(25)} ${lt.employee_count.toString().padStart(10)} ${lt.total_entitled.toFixed(2).padStart(12)} ${lt.total_used.toFixed(2).padStart(10)} ${lt.total_carried_forward.toFixed(2).padStart(8)} ${lt.total_remaining.toFixed(2).padStart(12)}`);
        grandTotalEntitled += lt.total_entitled;
        grandTotalUsed += lt.total_used;
        grandTotalCarriedForward += lt.total_carried_forward;
        grandTotalRemaining += lt.total_remaining;
      });

      console.log('-'.repeat(70));
      console.log(`${'GRAND TOTAL'.padEnd(25)} ${''.padStart(10)} ${grandTotalEntitled.toFixed(2).padStart(12)} ${grandTotalUsed.toFixed(2).padStart(10)} ${grandTotalCarriedForward.toFixed(2).padStart(8)} ${grandTotalRemaining.toFixed(2).padStart(12)}`);
      console.log('');
    });

    // Summary comparison
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY COMPARISON');
    console.log('='.repeat(70));

    const summaryQuery = `
      SELECT
        c.name as company_name,
        COUNT(DISTINCT lb.employee_id) as total_employees,
        SUM(lb.entitled_days) as total_entitled,
        SUM(lb.used_days) as total_used,
        SUM(lb.carried_forward) as total_carried_forward,
        SUM(lb.entitled_days + lb.carried_forward - lb.used_days) as total_remaining,
        lb.year
      FROM leave_balances lb
      JOIN employees e ON lb.employee_id = e.id
      JOIN companies c ON e.company_id = c.id
      WHERE c.id IN (1, 3) AND e.status = 'active'
      GROUP BY c.id, c.name, lb.year
      ORDER BY lb.year DESC, c.id
    `;

    const summaryResult = await pool.query(summaryQuery);

    console.log(`${'Company'.padEnd(20)} ${'Year'.padStart(6)} ${'Employees'.padStart(10)} ${'Entitled'.padStart(12)} ${'Used'.padStart(10)} ${'C/F'.padStart(8)} ${'Remaining'.padStart(12)}`);
    console.log('-'.repeat(70));

    summaryResult.rows.forEach(row => {
      console.log(`${row.company_name.padEnd(20)} ${row.year.toString().padStart(6)} ${row.total_employees.toString().padStart(10)} ${parseFloat(row.total_entitled || 0).toFixed(2).padStart(12)} ${parseFloat(row.total_used || 0).toFixed(2).padStart(10)} ${parseFloat(row.total_carried_forward || 0).toFixed(2).padStart(8)} ${parseFloat(row.total_remaining || 0).toFixed(2).padStart(12)}`);
    });

  } catch (error) {
    console.error('Error checking leave balances:', error);
  } finally {
    await pool.end();
  }
}

checkLeaveBalances();
