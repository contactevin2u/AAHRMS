const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function createTestEmployee() {
  try {
    // Delete existing test employee if exists
    await pool.query("DELETE FROM employees WHERE employee_id = 'TEST-NEW01'");

    // Create new test employee with must_change_password = true
    const result = await pool.query(`
      INSERT INTO employees (
        employee_id, name, ic_number, position, employee_role,
        company_id, outlet_id, status, employment_type,
        default_basic_salary, ess_enabled, must_change_password,
        created_at, updated_at
      ) VALUES (
        'TEST-NEW01', 'Test New Employee', '880101-01-1234', 'CREW', 'staff',
        3, 1, 'active', 'confirmed',
        1500, true, true,
        NOW(), NOW()
      )
      RETURNING id, employee_id, name, ic_number, must_change_password, ess_enabled
    `);

    console.log('=== NEW TEST EMPLOYEE CREATED ===');
    console.log(result.rows[0]);
    console.log('');
    console.log('=== LOGIN CREDENTIALS ===');
    console.log('Employee ID: TEST-NEW01');
    console.log('IC Number:   880101-01-1234');
    console.log('');
    console.log('Expected behavior:');
    console.log('1. Login with above credentials');
    console.log('2. Should redirect to Change Password page');
    console.log('3. Can either change password or skip');
    console.log('4. If skip, will ask again on next login');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

createTestEmployee();
