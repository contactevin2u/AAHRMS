/**
 * Seed Test Employees (Second Set) and Random Schedules
 *
 * Creates test[outletname]2 employees for all outlets
 * and generates random schedules for December 2025 and January 2026
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

// Second set of test employees
const testEmployees2 = [
  { employee_id: 'TESTMIMIXA2', name: 'Test MimixA 2', outlet_code: 'MIMIXA' },
  { employee_id: 'TESTMARINA2', name: 'Test Marina 2', outlet_code: 'MARINA' },
  { employee_id: 'TESTMIKSU2', name: 'Test MiksuBoba 2', outlet_code: 'MIKSU' },
  { employee_id: 'TESTATD2', name: 'Test LangkahATD 2', outlet_code: 'ATD' },
  { employee_id: 'TESTBTR2', name: 'Test LangkahBTR 2', outlet_code: 'BTR' },
  { employee_id: 'TESTATS2', name: 'Test LangkahATS 2', outlet_code: 'ATS' },
  { employee_id: 'TESTSLS2', name: 'Test LangkahSLS 2', outlet_code: 'SLS' },
  { employee_id: 'TESTMSB2', name: 'Test LangkahMSB 2', outlet_code: 'MSB' },
  { employee_id: 'TESTKOPI2', name: 'Test KopiAicha 2', outlet_code: 'KOPI' },
  { employee_id: 'TESTAISU2', name: 'Test Aisu 2', outlet_code: 'AISU' },
  { employee_id: 'TESTSLD2', name: 'Test LangkahSLD 2', outlet_code: 'SLD' }
];

// Shift patterns
const shifts = [
  { start: '09:00', end: '18:00' },
  { start: '10:00', end: '19:00' },
  { start: '11:00', end: '20:00' },
  { start: '08:00', end: '17:00' },
  { start: '12:00', end: '21:00' },
  { start: '14:00', end: '22:00' }
];

// Generate random dates for a month
function getRandomDates(year, month, count) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = [];
  const usedDays = new Set();

  while (dates.length < count && usedDays.size < daysInMonth) {
    const day = Math.floor(Math.random() * daysInMonth) + 1;
    if (!usedDays.has(day)) {
      usedDays.add(day);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dates.push(dateStr);
    }
  }

  return dates.sort();
}

// Get random shift
function getRandomShift() {
  return shifts[Math.floor(Math.random() * shifts.length)];
}

async function seedTestData() {
  const client = await pool.connect();

  try {
    console.log('Starting test data seeding...\n');

    // Get all outlets with their companies
    const outletsResult = await client.query(`
      SELECT o.id, o.name, o.company_id, c.name as company_name
      FROM outlets o
      JOIN companies c ON o.company_id = c.id
    `);
    const outlets = outletsResult.rows;
    console.log(`Found ${outlets.length} outlets\n`);

    // Create outlet code mapping based on name
    const outletMap = {};
    outlets.forEach(o => {
      const name = o.name?.toUpperCase() || '';

      if (name.includes('MIMIX') || name.includes('SUBANG')) outletMap['MIMIXA'] = o;
      if (name.includes('MARINA') || name.includes('CHARISMA')) outletMap['MARINA'] = o;
      if (name.includes('MIKSU') || name.includes('WANGSA')) outletMap['MIKSU'] = o;
      if (name.includes('ATD') || name.includes('TAMAN PUTRA')) outletMap['ATD'] = o;
      if (name.includes('BTR') || name.includes('TUN RAZAK')) outletMap['BTR'] = o;
      if (name.includes('ATS') || name.includes('SRI JATI')) outletMap['ATS'] = o;
      if (name.includes('SLS') || name.includes('PUCHONG')) outletMap['SLS'] = o;
      if (name.includes('MSB') || name.includes('PARAMOUNT')) outletMap['MSB'] = o;
      if (name.includes('KOPI') || name.includes('AICHA') || name.includes('ANTARABANGSA')) outletMap['KOPI'] = o;
      if (name.includes('AISU') || name.includes('MINUMAN')) outletMap['AISU'] = o;
      if (name.includes('SLD') || name.includes('LANGKAH SLD')) outletMap['SLD'] = o;
    });

    console.log('Outlet mapping:');
    Object.entries(outletMap).forEach(([code, outlet]) => {
      console.log(`  ${code} -> ${outlet.name} (ID: ${outlet.id})`);
    });
    console.log('');

    // Hash password
    const password = await bcrypt.hash('test1234', 10);

    // Create second set of test employees
    console.log('Creating second set of test employees...');
    const createdEmployees = [];

    for (const emp of testEmployees2) {
      const outlet = outletMap[emp.outlet_code];
      if (!outlet) {
        console.log(`  Skipping ${emp.employee_id} - outlet ${emp.outlet_code} not found`);
        continue;
      }

      // Check if employee already exists
      const existingResult = await client.query(
        'SELECT id FROM employees WHERE employee_id = $1',
        [emp.employee_id]
      );

      if (existingResult.rows.length > 0) {
        console.log(`  ${emp.employee_id} already exists (ID: ${existingResult.rows[0].id})`);
        createdEmployees.push({
          id: existingResult.rows[0].id,
          employee_id: emp.employee_id,
          outlet_id: outlet.id,
          company_id: outlet.company_id
        });
        continue;
      }

      // Create employee
      const result = await client.query(`
        INSERT INTO employees (
          employee_id, name, email, password_hash, company_id, outlet_id,
          department_id, position, status, join_date,
          default_basic_salary, bank_name, bank_account_no, ess_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        emp.employee_id,
        emp.name,
        `${emp.employee_id.toLowerCase()}@test.com`,
        password,
        outlet.company_id,
        outlet.id,
        null,
        'Staff',
        'active',
        '2025-01-01',
        1800,
        'Test Bank',
        '1234567890',
        true
      ]);

      console.log(`  Created ${emp.employee_id} (ID: ${result.rows[0].id}) at ${outlet.name}`);
      createdEmployees.push({
        id: result.rows[0].id,
        employee_id: emp.employee_id,
        outlet_id: outlet.id,
        company_id: outlet.company_id
      });
    }

    console.log(`\nCreated/found ${createdEmployees.length} second-set employees\n`);

    // Get ALL test employees (both first and second set)
    const allTestEmployeesResult = await client.query(`
      SELECT e.id, e.employee_id, e.name, e.outlet_id, e.company_id, o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.employee_id LIKE 'TEST%'
      ORDER BY e.outlet_id, e.employee_id
    `);
    const allTestEmployees = allTestEmployeesResult.rows;
    console.log(`Found ${allTestEmployees.length} total test employees\n`);

    // Generate schedules for December 2025 and January 2026
    console.log('Generating random schedules...\n');

    let schedulesCreated = 0;

    for (const emp of allTestEmployees) {
      if (!emp.outlet_id) {
        console.log(`  Skipping ${emp.employee_id} - no outlet assigned`);
        continue;
      }

      // December 2025: 10-15 random workdays
      const dec2025Dates = getRandomDates(2025, 12, Math.floor(Math.random() * 6) + 10);

      // January 2026: 10-15 random workdays
      const jan2026Dates = getRandomDates(2026, 1, Math.floor(Math.random() * 6) + 10);

      const allDates = [...dec2025Dates, ...jan2026Dates];

      for (const date of allDates) {
        // Check if schedule already exists
        const existingSchedule = await client.query(
          'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
          [emp.id, date]
        );

        if (existingSchedule.rows.length > 0) continue;

        const shift = getRandomShift();

        await client.query(`
          INSERT INTO schedules (employee_id, outlet_id, schedule_date, shift_start, shift_end, break_duration, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [emp.id, emp.outlet_id, date, shift.start, shift.end, 60, 'scheduled']);

        schedulesCreated++;
      }

      console.log(`  ${emp.employee_id}: ${dec2025Dates.length} days in Dec 2025, ${jan2026Dates.length} days in Jan 2026`);
    }

    console.log(`\nTotal schedules created: ${schedulesCreated}`);

    // Summary
    console.log('\n========== SUMMARY ==========');
    console.log('\nSecond Set Test Accounts:');
    console.log('| Employee ID   | Name              | Password |');
    console.log('|---------------|-------------------|----------|');
    for (const emp of testEmployees2) {
      if (outletMap[emp.outlet_code]) {
        console.log(`| ${emp.employee_id.padEnd(13)} | ${emp.name.padEnd(17)} | test1234 |`);
      }
    }

    console.log('\nAll test employees now have schedules for:');
    console.log('- December 2025 (10-15 random days each)');
    console.log('- January 2026 (10-15 random days each)');
    console.log('\nYou can now test the shift swap feature!');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedTestData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
