/**
 * Add new Mimix staff members - January 2026
 * Run: node scripts/add-mimix-staff-jan2026.js
 */

require('dotenv').config();
const pool = require('../db');
const bcrypt = require('bcryptjs');

const MIMIX_COMPANY_ID = 3;

// New staff to add
const newStaff = [
  {
    name: 'ATIQAH NAJMI BINTI ZAHARUDIN',
    ic_number: '080909-04-0278',
    position: 'SERVICE CREW',
    outlet_name: 'MIXUE SRI JATI (291)',
    join_date: '2026-01-26'
  },
  {
    name: 'NUR FARISYA ZULAIKHA BINTI ZAHRIZAN',
    ic_number: '081119-14-0834',
    position: 'SERVICE CREW',
    outlet_name: 'MIXUE SRI JATI (291)',
    join_date: '2025-01-26'
  }
];

// Helper to extract DOB and gender from IC
function parseIC(ic) {
  const cleanIC = ic.replace(/-/g, '');

  // Extract DOB (YYMMDD)
  const year = parseInt(cleanIC.substring(0, 2));
  const month = cleanIC.substring(2, 4);
  const day = cleanIC.substring(4, 6);

  // Determine century (00-30 = 2000s, 31-99 = 1900s)
  const fullYear = year <= 30 ? 2000 + year : 1900 + year;
  const dob = `${fullYear}-${month}-${day}`;

  // Gender from last digit (odd = male, even = female)
  const lastDigit = parseInt(cleanIC.slice(-1));
  const gender = lastDigit % 2 === 1 ? 'male' : 'female';

  return { dob, gender, cleanIC };
}

// Track generated IDs in this session
let lastGeneratedNum = 0;

// Generate employee ID
async function generateEmployeeId(client) {
  const result = await client.query(`
    SELECT employee_id FROM employees
    WHERE company_id = $1 AND employee_id LIKE 'MX%'
    ORDER BY employee_id DESC LIMIT 1
  `, [MIMIX_COMPANY_ID]);

  let dbMaxNum = 0;
  if (result.rows.length > 0) {
    const lastId = result.rows[0].employee_id;
    dbMaxNum = parseInt(lastId.replace('MX', ''));
  }

  // Use the higher of DB max or our session max
  const nextNum = Math.max(dbMaxNum, lastGeneratedNum) + 1;
  lastGeneratedNum = nextNum;

  return `MX${nextNum.toString().padStart(4, '0')}`;
}

async function addStaff() {
  const client = await pool.connect();

  try {
    console.log('Starting to add new Mimix staff...\n');

    // Check if company exists
    const companyCheck = await client.query(
      'SELECT id, name FROM companies WHERE id = $1',
      [MIMIX_COMPANY_ID]
    );

    if (companyCheck.rows.length === 0) {
      console.log('Error: Mimix company (ID 3) not found!');
      return;
    }

    console.log(`Company: ${companyCheck.rows[0].name}\n`);

    // Check/create outlet "MIXUE SRI JATI (291)"
    let outletResult = await client.query(
      'SELECT id, name FROM outlets WHERE company_id = $1 AND UPPER(name) LIKE $2',
      [MIMIX_COMPANY_ID, '%SRI JATI%']
    );

    let outletId;
    if (outletResult.rows.length === 0) {
      // Create the outlet
      const insertOutlet = await client.query(
        'INSERT INTO outlets (company_id, name, address) VALUES ($1, $2, $3) RETURNING id, name',
        [MIMIX_COMPANY_ID, 'MIXUE SRI JATI (291)', 'Sri Jati, Kuala Lumpur']
      );
      outletId = insertOutlet.rows[0].id;
      console.log(`Created outlet: ${insertOutlet.rows[0].name} (ID: ${outletId})\n`);
    } else {
      outletId = outletResult.rows[0].id;
      console.log(`Found outlet: ${outletResult.rows[0].name} (ID: ${outletId})\n`);
    }

    // Check/create position "SERVICE CREW"
    let positionResult = await client.query(
      'SELECT id, name FROM positions WHERE company_id = $1 AND UPPER(name) LIKE $2',
      [MIMIX_COMPANY_ID, '%SERVICE CREW%']
    );

    let positionId;
    if (positionResult.rows.length === 0) {
      // Create the position
      const insertPosition = await client.query(
        'INSERT INTO positions (company_id, name, role) VALUES ($1, $2, $3) RETURNING id, name',
        [MIMIX_COMPANY_ID, 'SERVICE CREW', 'crew']
      );
      positionId = insertPosition.rows[0].id;
      console.log(`Created position: ${insertPosition.rows[0].name} (ID: ${positionId})\n`);
    } else {
      positionId = positionResult.rows[0].id;
      console.log(`Found position: ${positionResult.rows[0].name} (ID: ${positionId})\n`);
    }

    // Add each staff member
    for (const staff of newStaff) {
      console.log(`\nProcessing: ${staff.name}`);

      // Check if already exists (by IC)
      const cleanIC = staff.ic_number.replace(/-/g, '');
      const existingCheck = await client.query(
        'SELECT id, employee_id, name FROM employees WHERE REPLACE(ic_number, \'-\', \'\') = $1',
        [cleanIC]
      );

      if (existingCheck.rows.length > 0) {
        console.log(`  - Already exists: ${existingCheck.rows[0].employee_id} - ${existingCheck.rows[0].name}`);
        continue;
      }

      // Parse IC for DOB and gender
      const { dob, gender } = parseIC(staff.ic_number);

      // Generate employee ID
      const employeeId = await generateEmployeeId(client);

      // Hash IC as initial password
      const passwordHash = await bcrypt.hash(cleanIC, 10);

      // Calculate probation end date (3 months from join)
      const joinDate = new Date(staff.join_date);
      const probationEnd = new Date(joinDate);
      probationEnd.setMonth(probationEnd.getMonth() + 3);

      // Insert employee
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
        staff.name,
        staff.ic_number,
        MIMIX_COMPANY_ID,
        outletId,
        staff.position,
        positionId,
        'staff',
        staff.join_date,
        dob,
        gender,
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
      console.log(`  - Created: ${emp.employee_id} - ${emp.name}`);
      console.log(`  - DOB: ${dob}, Gender: ${gender}`);
      console.log(`  - Join Date: ${staff.join_date}`);
      console.log(`  - Login: ${emp.employee_id} / ${cleanIC}`);
    }

    console.log('\n--- Summary ---');
    console.log('New staff added successfully!');
    console.log('\nLogin credentials:');
    console.log('- Username: Employee ID (e.g., MX0001)');
    console.log('- Password: IC number without dashes');
    console.log('- Users must change password on first login');

  } catch (error) {
    console.error('Error adding staff:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addStaff();
