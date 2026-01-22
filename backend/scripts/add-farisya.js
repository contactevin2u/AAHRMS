/**
 * Add Nur Farisya to Mimix
 * Run: node scripts/add-farisya.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Direct connection (avoid auto-init)
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

async function addFarisya() {
  const client = await pool.connect();

  try {
    console.log('Adding Nur Farisya Zulaikha...\n');

    const MIMIX_COMPANY_ID = 3;

    // Get outlet ID
    const outletResult = await client.query(
      'SELECT id FROM outlets WHERE company_id = $1 AND UPPER(name) LIKE $2',
      [MIMIX_COMPANY_ID, '%SRI JATI%']
    );
    const outletId = outletResult.rows[0]?.id || 6;
    console.log(`Outlet ID: ${outletId}`);

    // Get position ID
    const positionResult = await client.query(
      'SELECT id FROM positions WHERE company_id = $1 AND UPPER(name) LIKE $2',
      [MIMIX_COMPANY_ID, '%SERVICE CREW%']
    );
    const positionId = positionResult.rows[0]?.id || 4;
    console.log(`Position ID: ${positionId}`);

    // Check if employee exists
    const existsCheck = await client.query(
      "SELECT id FROM employees WHERE REPLACE(ic_number, '-', '') = '081119140834'"
    );

    if (existsCheck.rows.length > 0) {
      console.log('Employee already exists!');
      return;
    }

    // Get next employee ID
    const lastIdResult = await client.query(`
      SELECT employee_id FROM employees
      WHERE company_id = $1 AND employee_id LIKE 'MX%'
      ORDER BY employee_id DESC LIMIT 1
    `, [MIMIX_COMPANY_ID]);

    // MX0002 already exists (Atiqah), use MX0003
    const employeeId = 'MX0003';
    console.log(`Employee ID: ${employeeId}`);

    // Hash password (IC without dashes)
    const ic = '081119140834';
    const passwordHash = await bcrypt.hash(ic, 10);

    // Calculate probation end (3 months from join)
    const joinDate = new Date('2025-01-26');
    const probationEnd = new Date(joinDate);
    probationEnd.setMonth(probationEnd.getMonth() + 3);

    // Insert
    const insertResult = await client.query(`
      INSERT INTO employees (
        employee_id, name, ic_number, company_id, outlet_id,
        position, position_id, employee_role,
        join_date, date_of_birth, gender,
        employment_type, probation_months, probation_end_date, probation_status,
        status, employment_status,
        password_hash, must_change_password, ess_enabled
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17,
        $18, $19, $20
      ) RETURNING id, employee_id, name
    `, [
      employeeId,
      'NUR FARISYA ZULAIKHA BINTI ZAHRIZAN',
      '081119-14-0834',
      MIMIX_COMPANY_ID,
      outletId,
      'SERVICE CREW',
      positionId,
      'staff',
      '2025-01-26',
      '2008-11-19',
      'female',
      'probation',
      3,
      probationEnd.toISOString().split('T')[0],
      'ongoing',
      'active',
      'employed',
      passwordHash,
      true,
      true
    ]);

    const emp = insertResult.rows[0];
    console.log(`\nSuccess! Created: ${emp.employee_id} - ${emp.name}`);
    console.log(`Login: ${emp.employee_id} / 081119140834`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addFarisya();
