/**
 * Add Sri Jati (291) outlet staff - January 2026
 * Run: node scripts/add-sri-jati-staff.js
 */

require('dotenv').config();
const pool = require('../db');
const bcrypt = require('bcryptjs');

const MIMIX_COMPANY_ID = 3;

// Sri Jati (291) staff list
const staffList = [
  // Manager
  {
    name: 'RANISAH IJES',
    ic_number: '010527-12-1124',
    position: 'SUPERVISOR',
    employee_role: 'supervisor',
    employment_type: 'permanent',
    join_date: '2026-01-26'
  },
  // Full-timers
  {
    name: 'NURUL FIRDAUS',
    ic_number: '030102-14-1427',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'probation',
    join_date: '2026-01-26'
  },
  {
    name: 'SHAREFFA SYAHFIQAH',
    ic_number: '060827-12-0866',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'probation',
    join_date: '2026-01-26'
  },
  {
    name: 'ATIQAH NAJMI BINTI ZAHARUDIN',
    ic_number: '080909-04-0278',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'probation',
    join_date: '2026-01-26'
  },
  {
    name: 'NUR FARISYA ZULAIKHA BINTI ZAHRIZAN',
    ic_number: '081119-14-0834',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'probation',
    join_date: '2026-01-26'
  },
  // Part-timers
  {
    name: 'INTAN NURISYAH',
    ic_number: '070115-01-1628',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'part_time',
    join_date: '2026-01-26'
  },
  {
    name: 'NOR AIN HAWANIS',
    ic_number: '070714-07-0136',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'part_time',
    join_date: '2026-01-26'
  },
  {
    name: 'AZ-NUR AMIRAH BINTI AZAHAR',
    ic_number: '010212-10-0812',
    position: 'SERVICE CREW',
    employee_role: 'staff',
    employment_type: 'part_time',
    join_date: '2026-01-26'
  }
];

// Parse IC for DOB and gender
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
    ORDER BY CAST(SUBSTRING(employee_id FROM 3) AS INTEGER) DESC LIMIT 1
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
    console.log('='.repeat(60));
    console.log('Adding Sri Jati (291) Staff');
    console.log('='.repeat(60));

    // Check/create outlet
    let outletResult = await client.query(
      'SELECT id, name FROM outlets WHERE company_id = $1 AND UPPER(name) LIKE $2',
      [MIMIX_COMPANY_ID, '%SRI JATI%']
    );

    let outletId;
    if (outletResult.rows.length === 0) {
      const insertOutlet = await client.query(
        'INSERT INTO outlets (company_id, name, address) VALUES ($1, $2, $3) RETURNING id, name',
        [MIMIX_COMPANY_ID, 'MIXUE SRI JATI (291)', 'Sri Jati, Kuala Lumpur']
      );
      outletId = insertOutlet.rows[0].id;
      console.log(`\nCreated outlet: ${insertOutlet.rows[0].name} (ID: ${outletId})`);
    } else {
      outletId = outletResult.rows[0].id;
      console.log(`\nUsing outlet: ${outletResult.rows[0].name} (ID: ${outletId})`);
    }

    // Get/create positions
    const positionCache = {};

    async function getPositionId(positionName) {
      if (positionCache[positionName]) return positionCache[positionName];

      let posResult = await client.query(
        'SELECT id FROM positions WHERE company_id = $1 AND UPPER(name) = UPPER($2)',
        [MIMIX_COMPANY_ID, positionName]
      );

      if (posResult.rows.length === 0) {
        const insertPos = await client.query(
          'INSERT INTO positions (company_id, name) VALUES ($1, $2) RETURNING id',
          [MIMIX_COMPANY_ID, positionName]
        );
        positionCache[positionName] = insertPos.rows[0].id;
      } else {
        positionCache[positionName] = posResult.rows[0].id;
      }

      return positionCache[positionName];
    }

    const added = [];
    const skipped = [];

    console.log('\n--- Processing Staff ---\n');

    for (const staff of staffList) {
      const cleanIC = staff.ic_number.replace(/-/g, '');

      // Check if already exists
      const existingCheck = await client.query(
        'SELECT id, employee_id, name, employee_role FROM employees WHERE REPLACE(ic_number, \'-\', \'\') = $1',
        [cleanIC]
      );

      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0];
        console.log(`SKIP: ${staff.name}`);
        console.log(`      Already exists as ${existing.employee_id} (${existing.employee_role})`);
        skipped.push({ ...staff, existing_id: existing.employee_id });
        continue;
      }

      // Parse IC
      const { dob, gender } = parseIC(staff.ic_number);

      // Get position ID
      const positionId = await getPositionId(staff.position);

      // Generate employee ID
      const employeeId = await generateEmployeeId(client);

      // Hash IC as password
      const passwordHash = await bcrypt.hash(cleanIC, 10);

      // Calculate probation end if applicable
      let probationEndDate = null;
      let probationStatus = null;
      let probationMonths = null;

      if (staff.employment_type === 'probation') {
        const joinDate = new Date(staff.join_date);
        const probationEnd = new Date(joinDate);
        probationEnd.setMonth(probationEnd.getMonth() + 3);
        probationEndDate = probationEnd.toISOString().split('T')[0];
        probationStatus = 'ongoing';
        probationMonths = 3;
      }

      // Insert employee
      await client.query(`
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
        )
      `, [
        employeeId,
        staff.name,
        staff.ic_number,
        MIMIX_COMPANY_ID,
        outletId,
        staff.position,
        positionId,
        staff.employee_role,
        staff.join_date,
        dob,
        gender,
        staff.employment_type,
        probationMonths,
        probationEndDate,
        probationStatus,
        'active',
        'employed',
        passwordHash,
        true,
        true
      ]);

      console.log(`ADD:  ${staff.name}`);
      console.log(`      ID: ${employeeId} | Role: ${staff.employee_role} | Type: ${staff.employment_type}`);
      console.log(`      DOB: ${dob} | Gender: ${gender}`);
      console.log(`      Login: ${employeeId} / ${cleanIC}`);
      console.log('');

      added.push({ ...staff, employee_id: employeeId, cleanIC });
    }

    // Summary
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Added: ${added.length} employees`);
    console.log(`Skipped: ${skipped.length} employees (already exist)`);

    if (added.length > 0) {
      console.log('\n--- NEW EMPLOYEES ---');
      console.log('');
      for (const emp of added) {
        const type = emp.employment_type === 'part_time' ? '(Part-Time)' :
                     emp.employee_role === 'supervisor' ? '(Manager)' : '(Full-Time)';
        console.log(`${emp.employee_id} - ${emp.name} ${type}`);
        console.log(`  Login: ${emp.employee_id} / ${emp.cleanIC}`);
      }
    }

    if (skipped.length > 0) {
      console.log('\n--- ALREADY EXISTS ---');
      for (const emp of skipped) {
        console.log(`${emp.existing_id} - ${emp.name}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Login: Use Employee ID or Full Name + IC Number');
    console.log('Password: IC number without dashes (must change on first login)');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

addStaff();
