/**
 * Script to add missing clock in/out records for Mimix Subang Perdana
 * January 2026
 */

const pool = require('../db');

// Mimix Subang Perdana outlet
const COMPANY_ID = 3;
const OUTLET_ID = 1; // Subang Perdana

// Employee attendance data
const attendanceData = [
  {
    name: 'MUHAMMAD TAUFIQ SAIFULLAH BIN KHALID',
    records: [
      { date: '2026-01-01', in: '14:45', out: '23:30' },
      { date: '2026-01-02', in: '15:00', out: '23:30' },
      { date: '2026-01-03', in: '15:00', out: '23:30' },
      { date: '2026-01-04', in: '15:00', out: '23:30' },
      { date: '2026-01-12', in: '15:00', out: '01:31' }, // overnight
      { date: '2026-01-19', in: null, out: '23:52' },
      { date: '2026-01-20', in: null, out: '23:47' },
      { date: '2026-01-23', in: null, out: '23:58' },
    ]
  },
  {
    name: 'NIK NUR AIN SYAHIRAH BINTI NIK MAT',
    altNames: ['NIK NUR AIN SYAHIRAH BINTI NIK MAT @ HUSSAIN'],
    records: [
      { date: '2026-01-01', in: '15:00', out: '23:30' },
      { date: '2026-01-02', in: '15:00', out: '23:30' },
      { date: '2026-01-03', in: '15:00', out: '23:30' },
      { date: '2026-01-04', in: '15:00', out: '23:30' },
      { date: '2026-01-05', in: '08:00', out: '17:30' },
      { date: '2026-01-06', in: '09:00', out: '17:30' },
      { date: '2026-01-11', in: '09:00', out: '17:30' },
      { date: '2026-01-12', in: '15:00', out: '13:30' }, // likely 01:30 overnight
      { date: '2026-01-21', in: null, out: '17:30' },
      { date: '2026-01-25', in: null, out: '17:30' },
    ]
  },
  {
    name: 'ANIS NATASHA BINTI SATIMAN',
    records: [
      { date: '2026-01-01', in: '09:00', out: '23:30' },
      { date: '2026-01-02', in: '09:00', out: '17:30' },
      { date: '2026-01-03', in: '09:00', out: '17:30' },
      { date: '2026-01-04', in: '09:00', out: '17:30' },
      { date: '2026-01-05', in: '15:00', out: '01:00' }, // overnight
      { date: '2026-01-10', in: '15:00', out: '23:30' },
      { date: '2026-01-13', in: null, out: '17:30' },
      { date: '2026-01-19', in: '15:00', out: '01:30' }, // overnight
      { date: '2026-01-26', in: '15:18', out: '16:18' }, // short shift (break?)
    ]
  },
  {
    name: 'NABILA ADRIANA BINTI MUHAMAD AZLEN',
    records: [
      { date: '2026-01-05', in: '15:00', out: '01:00' }, // overnight
      { date: '2026-01-06', in: '15:00', out: '23:30' },
      { date: '2026-01-07', in: '15:00', out: '23:30' },
      { date: '2026-01-08', in: '15:00', out: '23:30' },
      { date: '2026-01-12', in: '09:00', out: '17:30' },
    ]
  },
  {
    name: 'ALLYCIA LYRICA ANAK STEPHEN',
    records: [
      { date: '2026-01-01', in: '09:00', out: '17:30' },
      { date: '2026-01-03', in: '09:00', out: '17:30' },
      { date: '2026-01-04', in: '09:00', out: '17:30' },
      { date: '2026-01-05', in: '15:00', out: '01:00' }, // overnight
      { date: '2026-01-07', in: '15:00', out: '23:30' },
      { date: '2026-01-08', in: '15:00', out: '23:30' },
      { date: '2026-01-10', in: '15:00', out: '23:30' },
    ]
  },
  {
    name: 'PRISSILVIA DUSIL',
    records: [
      { date: '2026-01-03', in: '09:00', out: '17:30' },
      { date: '2026-01-05', in: '15:00', out: '01:00' }, // overnight
      { date: '2026-01-06', in: '15:00', out: '23:30' },
      { date: '2026-01-07', in: '15:00', out: '23:30' },
      { date: '2026-01-08', in: '15:00', out: '23:30' },
      { date: '2026-01-25', in: null, out: '17:48' },
    ]
  },
  {
    name: 'FEORNIE ASHIRA',
    records: [
      { date: '2026-01-01', in: '15:00', out: '23:30' },
      { date: '2026-01-02', in: '15:00', out: '23:30' },
      { date: '2026-01-03', in: '15:00', out: '23:30' },
      { date: '2026-01-04', in: '15:00', out: '23:30' },
      { date: '2026-01-05', in: '08:00', out: '17:30' },
      { date: '2026-01-12', in: '15:00', out: '17:30' },
    ]
  },
  {
    name: 'NURSYAMSHAFIQAH BINTI NAZRAN',
    records: [
      { date: '2026-01-02', in: '15:00', out: '23:30' },
      { date: '2026-01-03', in: '15:00', out: '23:30' },
      { date: '2026-01-04', in: '15:00', out: '23:30' },
      { date: '2026-01-05', in: '09:00', out: '17:30' },
      { date: '2026-01-06', in: '09:00', out: '17:30' },
      { date: '2026-01-07', in: '09:00', out: '17:30' },
      { date: '2026-01-08', in: '09:00', out: '17:30' },
      { date: '2026-01-09', in: '09:00', out: '17:30' },
      { date: '2026-01-10', in: '09:00', out: '17:30' },
      { date: '2026-01-11', in: '15:00', out: '23:30' },
      { date: '2026-01-12', in: '15:00', out: '23:30' },
      { date: '2026-01-25', in: null, out: '17:47' },
      { date: '2026-01-26', in: null, out: '00:44' },
    ]
  },
  {
    name: 'DEA AGUSTINA',
    records: [
      { date: '2026-01-01', in: '13:00', out: '21:30' },
      { date: '2026-01-02', in: '13:00', out: '21:30' },
      { date: '2026-01-03', in: '13:00', out: '21:30' },
      { date: '2026-01-04', in: '13:00', out: '21:30' },
      { date: '2026-01-05', in: '13:00', out: '21:30' },
      { date: '2026-01-07', in: '13:00', out: '21:30' },
      { date: '2026-01-08', in: '13:00', out: '21:30' },
      { date: '2026-01-09', in: '13:00', out: '21:30' },
      { date: '2026-01-10', in: '13:00', out: '21:30' },
      { date: '2026-01-11', in: '13:00', out: '21:30' },
      { date: '2026-01-12', in: '13:00', out: '21:30' },
      { date: '2026-01-13', in: '13:00', out: '21:30' },
      { date: '2026-01-14', in: '13:00', out: '21:30' },
      { date: '2026-01-15', in: '13:00', out: '21:30' },
      { date: '2026-01-16', in: '13:00', out: '21:30' },
      { date: '2026-01-17', in: '13:00', out: '21:30' },
      { date: '2026-01-19', in: '13:00', out: '21:30' },
      { date: '2026-01-20', in: '13:00', out: '21:30' },
      { date: '2026-01-22', in: '13:00', out: '21:30' },
    ]
  },
  {
    name: 'AIDIL HAKIM BIN FARID KAMIL',
    records: [
      { date: '2026-01-09', in: '15:00', out: '23:30' },
      { date: '2026-01-10', in: '15:00', out: '23:30' },
      { date: '2026-01-11', in: '15:00', out: '23:30' },
      { date: '2026-01-12', in: '15:00', out: '23:30' },
      { date: '2026-01-15', in: '15:00', out: '23:30' },
      { date: '2026-01-16', in: '15:00', out: '23:30' },
      { date: '2026-01-17', in: '15:00', out: '23:30' },
      { date: '2026-01-22', in: '15:00', out: '23:30' },
    ]
  },
  {
    name: 'MUHAMMAD SAIFF FAIRUZ BIN MD ISA',
    records: [
      { date: '2026-01-04', in: '15:00', out: '23:30' },
      { date: '2026-01-05', in: '08:00', out: '17:30' },
      { date: '2026-01-07', in: '15:00', out: '23:30' },
      { date: '2026-01-08', in: '15:00', out: '23:30' },
      { date: '2026-01-09', in: '15:00', out: '23:30' },
      { date: '2026-01-10', in: '15:00', out: '23:30' },
      { date: '2026-01-11', in: '15:00', out: '23:30' },
      { date: '2026-01-12', in: '08:00', out: '17:30' },
      { date: '2026-01-13', in: '09:00', out: '17:30' },
      { date: '2026-01-14', in: '09:00', out: '17:30' },
      { date: '2026-01-22', in: '15:00', out: '23:30' },
      { date: '2026-01-23', in: '09:00', out: '17:30' },
    ]
  },
  {
    name: 'NUR FARAH HANIS BINTI MURLIYADY',
    records: [
      { date: '2026-01-12', in: '15:00', out: '23:30' },
      { date: '2026-01-17', in: '15:00', out: '23:30' },
      { date: '2026-01-18', in: '15:00', out: '23:30' },
      { date: '2026-01-19', in: '09:00', out: '17:30' },
    ]
  },
  {
    name: 'NORHAZIRAH BINTI HAIRI',
    records: [
      { date: '2026-01-07', in: '09:00', out: '17:30' },
      { date: '2026-01-08', in: '09:00', out: '17:30' },
      { date: '2026-01-09', in: '09:00', out: '17:30' },
      { date: '2026-01-10', in: '09:00', out: '17:30' },
      { date: '2026-01-11', in: '09:00', out: '17:30' },
      { date: '2026-01-13', in: '15:00', out: '23:30' },
      { date: '2026-01-14', in: '15:00', out: '23:30' },
      { date: '2026-01-15', in: '15:00', out: '23:30' },
      { date: '2026-01-16', in: '13:30', out: '23:30' },
      { date: '2026-01-18', in: '16:30', out: '23:30' },
      { date: '2026-01-19', in: '17:00', out: '00:30' }, // overnight
      { date: '2026-01-20', in: '09:00', out: '17:30' },
      { date: '2026-01-21', in: '09:00', out: '17:30' },
      { date: '2026-01-22', in: '09:00', out: '17:30' },
    ]
  },
  {
    name: 'AZRIQ DANISH BIN MAT AZIZ',
    records: [
      { date: '2026-01-12', in: '12:00', out: '17:30' },
      { date: '2026-01-15', in: '09:00', out: '17:30' },
      { date: '2026-01-16', in: '09:00', out: '17:30' },
      { date: '2026-01-17', in: '09:00', out: '17:30' },
      { date: '2026-01-20', in: '09:00', out: '17:30' },
      { date: '2026-01-21', in: '09:00', out: '17:30' },
    ]
  },
];

async function findEmployeeByName(name, altNames = []) {
  // Try exact match first
  let result = await pool.query(
    `SELECT id, name, employee_id FROM employees
     WHERE company_id = $1 AND outlet_id = $2 AND UPPER(name) = UPPER($3)`,
    [COMPANY_ID, OUTLET_ID, name]
  );

  if (result.rows.length > 0) return result.rows[0];

  // Try alternative names
  for (const altName of altNames) {
    result = await pool.query(
      `SELECT id, name, employee_id FROM employees
       WHERE company_id = $1 AND outlet_id = $2 AND UPPER(name) = UPPER($3)`,
      [COMPANY_ID, OUTLET_ID, altName]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // Try partial match
  result = await pool.query(
    `SELECT id, name, employee_id FROM employees
     WHERE company_id = $1 AND outlet_id = $2 AND UPPER(name) LIKE $3`,
    [COMPANY_ID, OUTLET_ID, `%${name.split(' ')[0]}%`]
  );

  if (result.rows.length === 1) return result.rows[0];
  if (result.rows.length > 1) {
    // Try more specific match
    const firstName = name.split(' ')[0];
    const lastName = name.split(' ').pop();
    result = await pool.query(
      `SELECT id, name, employee_id FROM employees
       WHERE company_id = $1 AND outlet_id = $2
       AND UPPER(name) LIKE $3 AND UPPER(name) LIKE $4`,
      [COMPANY_ID, OUTLET_ID, `%${firstName}%`, `%${lastName}%`]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  return null;
}

function formatTime(time) {
  if (!time) return null;
  const [h, m] = time.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
}

function calculateHours(inTime, outTime) {
  if (!inTime || !outTime) return null;

  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);

  let inMinutes = inH * 60 + inM;
  let outMinutes = outH * 60 + outM;

  // Handle overnight shifts
  if (outMinutes < inMinutes) {
    outMinutes += 24 * 60;
  }

  const diffMinutes = outMinutes - inMinutes;
  return (diffMinutes / 60).toFixed(2);
}

async function insertAttendanceRecord(employeeId, record) {
  const { date, in: clockIn, out: clockOut } = record;

  // Check if record exists
  const existing = await pool.query(
    'SELECT id FROM clock_in_records WHERE employee_id = $1 AND work_date = $2',
    [employeeId, date]
  );

  const inTime = formatTime(clockIn);
  const outTime = formatTime(clockOut);
  const totalHours = calculateHours(clockIn, clockOut);
  const status = (clockIn && clockOut) ? 'completed' : 'completed';

  if (existing.rows.length > 0) {
    // Update existing
    await pool.query(`
      UPDATE clock_in_records
      SET clock_in_1 = COALESCE($1, clock_in_1),
          clock_out_2 = COALESCE($2, clock_out_2),
          total_work_hours = COALESCE($3, total_work_hours),
          status = $4,
          updated_at = NOW()
      WHERE employee_id = $5 AND work_date = $6
    `, [inTime, outTime, totalHours, status, employeeId, date]);
    return 'updated';
  } else {
    // Insert new
    await pool.query(`
      INSERT INTO clock_in_records
        (employee_id, company_id, outlet_id, work_date, clock_in_1, clock_out_2, total_work_hours, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [employeeId, COMPANY_ID, OUTLET_ID, date, inTime, outTime, totalHours, status]);
    return 'inserted';
  }
}

async function insertSchedule(employeeId, record) {
  const { date, in: clockIn, out: clockOut } = record;

  // Skip if no times at all
  if (!clockIn && !clockOut) return 'skipped';

  // Check if schedule exists
  const existing = await pool.query(
    'SELECT id FROM schedules WHERE employee_id = $1 AND schedule_date = $2',
    [employeeId, date]
  );

  const shiftStart = formatTime(clockIn) || '09:00:00';
  const shiftEnd = formatTime(clockOut) || '17:30:00';

  if (existing.rows.length > 0) {
    // Update existing
    await pool.query(`
      UPDATE schedules
      SET shift_start = $1, shift_end = $2, status = 'completed', updated_at = NOW()
      WHERE employee_id = $3 AND schedule_date = $4
    `, [shiftStart, shiftEnd, employeeId, date]);
    return 'updated';
  } else {
    // Insert new
    await pool.query(`
      INSERT INTO schedules
        (employee_id, company_id, outlet_id, schedule_date, shift_start, shift_end, break_duration, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 60, 'completed', NOW(), NOW())
    `, [employeeId, COMPANY_ID, OUTLET_ID, date, shiftStart, shiftEnd]);
    return 'inserted';
  }
}

async function main() {
  console.log('===========================================');
  console.log('Adding Subang Perdana Attendance Records');
  console.log('===========================================\n');

  let totalRecords = 0;
  let totalSchedules = 0;
  let notFound = [];

  for (const emp of attendanceData) {
    const employee = await findEmployeeByName(emp.name, emp.altNames || []);

    if (!employee) {
      console.log(`❌ Employee NOT FOUND: ${emp.name}`);
      notFound.push(emp.name);
      continue;
    }

    console.log(`\n✓ Found: ${employee.name} (${employee.employee_id})`);

    for (const record of emp.records) {
      try {
        const attResult = await insertAttendanceRecord(employee.id, record);
        const schedResult = await insertSchedule(employee.id, record);

        console.log(`  ${record.date}: ${record.in || 'N/A'} - ${record.out || 'N/A'} [Att: ${attResult}, Sched: ${schedResult}]`);
        totalRecords++;
        totalSchedules++;
      } catch (err) {
        console.error(`  ❌ Error on ${record.date}: ${err.message}`);
      }
    }
  }

  console.log('\n===========================================');
  console.log(`Total attendance records processed: ${totalRecords}`);
  console.log(`Total schedules processed: ${totalSchedules}`);

  if (notFound.length > 0) {
    console.log(`\n⚠️  Employees not found (${notFound.length}):`);
    notFound.forEach(name => console.log(`   - ${name}`));
  }

  console.log('===========================================');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
