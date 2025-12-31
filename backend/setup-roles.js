const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function setupRoles() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update real MANAGER based on position
    console.log('=== UPDATING REAL MANAGER ===');
    const managerResult = await client.query(`
      UPDATE employees
      SET employee_role = 'manager'
      WHERE company_id = 3
        AND UPPER(position) = 'MANAGER'
        AND status = 'active'
      RETURNING id, employee_id, name, position, ic_number
    `);
    console.log('Updated ' + managerResult.rows.length + ' manager(s):');
    managerResult.rows.forEach(m => {
      console.log('  - ' + m.name + ' (' + m.employee_id + ') | IC for login: ' + m.ic_number);
    });

    // 2. Update real SUPERVISORS based on position
    console.log('\n=== UPDATING REAL SUPERVISORS ===');
    const supervisorResult = await client.query(`
      UPDATE employees
      SET employee_role = 'supervisor'
      WHERE company_id = 3
        AND UPPER(position) = 'SUPERVISOR'
        AND status = 'active'
      RETURNING id, employee_id, name, position, ic_number, outlet_id
    `);
    console.log('Updated ' + supervisorResult.rows.length + ' supervisor(s):');
    supervisorResult.rows.forEach(s => {
      console.log('  - ' + s.name + ' (' + s.employee_id + ') | IC for login: ' + s.ic_number);
    });

    // 3. Create TEST Supervisor account
    console.log('\n=== CREATING TEST SUPERVISOR ===');
    const testSupervisor = await client.query(`
      INSERT INTO employees (
        employee_id, name, ic_number, position, employee_role,
        company_id, outlet_id, status, employment_type,
        default_basic_salary, created_at, updated_at
      ) VALUES (
        'TEST-SV01', 'Test Supervisor', '900101-01-0001', 'SUPERVISOR', 'supervisor',
        3, 1, 'active', 'confirmed',
        2000, NOW(), NOW()
      )
      ON CONFLICT (employee_id) DO UPDATE SET
        employee_role = 'supervisor',
        position = 'SUPERVISOR',
        updated_at = NOW()
      RETURNING id, employee_id, name, ic_number, outlet_id
    `);
    console.log('Test Supervisor created/updated:');
    console.log('  Employee ID: TEST-SV01');
    console.log('  Name: Test Supervisor');
    console.log('  IC (Password): 900101-01-0001');
    console.log('  Outlet ID: 1 (Mimix A - Subang Perdana)');

    // 4. Create TEST Manager account
    console.log('\n=== CREATING TEST MANAGER ===');
    const testManager = await client.query(`
      INSERT INTO employees (
        employee_id, name, ic_number, position, employee_role,
        company_id, outlet_id, status, employment_type,
        default_basic_salary, created_at, updated_at
      ) VALUES (
        'TEST-MG01', 'Test Manager', '900101-01-0002', 'MANAGER', 'manager',
        3, 1, 'active', 'confirmed',
        3000, NOW(), NOW()
      )
      ON CONFLICT (employee_id) DO UPDATE SET
        employee_role = 'manager',
        position = 'MANAGER',
        updated_at = NOW()
      RETURNING id, employee_id, name, ic_number, outlet_id
    `);
    console.log('Test Manager created/updated:');
    console.log('  Employee ID: TEST-MG01');
    console.log('  Name: Test Manager');
    console.log('  IC (Password): 900101-01-0002');
    console.log('  Outlet ID: 1 (Mimix A - Subang Perdana)');

    await client.query('COMMIT');

    // Summary
    console.log('\n========================================');
    console.log('=== TEST LOGIN CREDENTIALS ===');
    console.log('========================================');
    console.log('\nTEST SUPERVISOR:');
    console.log('  URL: /staff-clockin or ESS Portal');
    console.log('  IC Number: 900101-01-0001');
    console.log('  Password: 900101-01-0001');
    console.log('\nTEST MANAGER:');
    console.log('  URL: /staff-clockin or ESS Portal');
    console.log('  IC Number: 900101-01-0002');
    console.log('  Password: 900101-01-0002');
    console.log('\n========================================');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

setupRoles();
