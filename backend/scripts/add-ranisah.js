require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addEmployee() {
  try {
    const name = 'RANISAH IJES';
    const icNumber = '010527-12-1124';
    const cleanIC = icNumber.replace(/[-\s]/g, ''); // 010527121124
    const outletId = 6; // Langkah ATS - Sri Jati
    const companyId = 3; // Mimix
    const employeeId = 'SVRANISAH';
    const username = 'svranisah';
    const employeeRole = 'supervisor';

    // Hash IC number as password
    const passwordHash = await bcrypt.hash(cleanIC, 10);

    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM employees WHERE ic_number = $1 OR LOWER(name) = LOWER($2)',
      [icNumber, name]
    );

    if (existing.rows.length > 0) {
      console.log('Employee already exists!');
      process.exit(1);
    }

    // Insert employee
    const result = await pool.query(`
      INSERT INTO employees (
        employee_id, name, ic_number, username, password_hash,
        company_id, outlet_id, employee_role,
        status, ess_enabled, must_change_password,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', true, true, NOW(), NOW())
      RETURNING id, employee_id, name
    `, [employeeId, name, icNumber, username, passwordHash, companyId, outletId, employeeRole]);

    console.log('Employee added successfully!');
    console.log('================================');
    console.log('Name:', name);
    console.log('Employee ID:', employeeId);
    console.log('Username:', username);
    console.log('IC:', icNumber);
    console.log('Outlet: Langkah ATS - Sri Jati');
    console.log('Role: Supervisor');
    console.log('');
    console.log('LOGIN CREDENTIALS:');
    console.log('  Username:', username);
    console.log('  Password:', cleanIC, '(IC without dashes)');
    console.log('');
    console.log('Will be asked to change password on first login.');

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

addEmployee();
