/**
 * Update Mimix employee salaries and roles based on spreadsheet data
 * Run with: node backend/scripts/update-mimix-salaries.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Employee data from screenshots - IC number is the key identifier
// Format: { ic_number: { role: 'Full Time'|'Part Time'|'Supervisor'|'Manager', basic_salary: number, hourly_rate: number (for part-time) } }
const employeeData = {
  // Outlet 231
  '020203-09-0113': { role: 'Manager', basic_salary: 2000 },
  '021115-13-1151': { role: 'Full Time', basic_salary: 1800 },
  '010821-12-1010': { role: 'Full Time', basic_salary: 1800 },
  '040723-06-0602': { role: 'Full Time', basic_salary: 1800 },
  '050413-09-0155': { role: 'Full Time', basic_salary: 1800 },
  '060925-14-0131': { role: 'Full Time', basic_salary: 1800 },
  '001212-05-0670': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '040820-10-1365': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '050707-14-0636': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Outlet 233
  '931003-14-6247': { role: 'Manager', basic_salary: 3300 }, // 3000 + 300 transport
  '020916-12-0976': { role: 'Full Time', basic_salary: 2000 },
  '950407-01-6530': { role: 'Full Time', basic_salary: 2000 },
  '061023-12-1438': { role: 'Full Time', basic_salary: 2000 },
  'X5922551': { role: 'Full Time', basic_salary: 1800 }, // DEA AGUSTINA - NO KWSP ETC
  '080401-10-1092': { role: 'Full Time', basic_salary: 1800 },
  '080301-14-0844': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '081005-08-0263': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '080609-10-1825': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  // Special cases - before Raya
  // '': { role: 'Full Time', basic_salary: 2200 }, // ANIS NATASHA BINTI SATIMAN
  // '': { role: 'Full Time', basic_salary: 2200 }, // NIK NUR AIN SYAHIRAH BT NIK MAT HUSSAIN

  // Outlet 275
  '000807-14-1219': { role: 'Supervisor', basic_salary: 2000 },
  '041011-14-0916': { role: 'Full Time', basic_salary: 1800 },
  '60716140143': { role: 'Full Time', basic_salary: 1800 },
  '080329-08-1065': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '081105-14-0200': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '050201-10-1234': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Outlet 291
  '010527-12-1124': { role: 'Supervisor', basic_salary: 2500 },
  '030102-14-1427': { role: 'Full Time', basic_salary: 1800 },
  '060827-12-0866': { role: 'Full Time', basic_salary: 1800 },
  '080909-04-0278': { role: 'Full Time', basic_salary: 1800 },
  '081119-14-0834': { role: 'Full Time', basic_salary: 1800 },
  '070115-01-1628': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '070714-07-0136': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '010212-10-0812': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Outlet 296
  '980118066029': { role: 'Manager', basic_salary: 2000 }, // LIM CHUN LI - salary unknown (?)
  '870903-52-6580': { role: 'Supervisor', basic_salary: 2000 },
  '060327-14-1003': { role: 'Full Time', basic_salary: 1800 },
  '060906-09-0087': { role: 'Full Time', basic_salary: 1800 },
  '060830-14-1342': { role: 'Full Time', basic_salary: 1800 },
  '071012-14-0050': { role: 'Full Time', basic_salary: 1800 },
  '061009-14-1125': { role: 'Full Time', basic_salary: 1800 },
  '031028-14-1094': { role: 'Full Time', basic_salary: 1800 },
  '071226-10-1866': { role: 'Full Time', basic_salary: 1800 }, // PUTERI DAMIA - was 8.72 but "BECOME PART TIMER"
  '061231-14-0473': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '021206-08-1268': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '070306-10-0439': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Outlet 307
  '971113-43-5249': { role: 'Manager', basic_salary: 2000 },
  '000505-04-0113': { role: 'Supervisor', basic_salary: 2000 },
  '980405-14-6187': { role: 'Full Time', basic_salary: 1800 },
  '060515-14-1107': { role: 'Full Time', basic_salary: 1800 },
  '000414-14-0055': { role: 'Full Time', basic_salary: 1800 },
  '050511-14-1506': { role: 'Full Time', basic_salary: 1800 },
  '080611-10-1111': { role: 'Full Time', basic_salary: 1800 },
  '050217-14-1580': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '080503-10-1157': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '001016-07-0770': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '080622-03-0646': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '970818-14-5298': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Outlet 308
  '040707-10-1240': { role: 'Supervisor', basic_salary: 2300 },
  '040913-08-0567': { role: 'Full Time', basic_salary: 1800 },
  '040904-14-1356': { role: 'Full Time', basic_salary: 2000 }, // NUR KHADIJAH CAMELIA
  '060531-10-1420': { role: 'Full Time', basic_salary: 1800 },
  '050210-14-0331': { role: 'Full Time', basic_salary: 1800 },
  '081029-10-2658': { role: 'Full Time', basic_salary: 1800 },
  '050706-14-0044': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '040318-10-0025': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Outlet 397
  '950727-12-6376': { role: 'Supervisor', basic_salary: 2000 },
  '960530-10-5108': { role: 'Full Time', basic_salary: 1800 },
  'E7282699': { role: 'Full Time', basic_salary: 1800 }, // JUJU JUARSIH
  '020520-12-1075': { role: 'Full Time', basic_salary: 1800 },
  '040421-14-0287': { role: 'Full Time', basic_salary: 1800 },
  'E8321908': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 }, // MUTIARA RAMADINI
  'E3042955': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 }, // IKA SARIANA

  // Outlet 655
  '991109-12-5430': { role: 'Supervisor', basic_salary: 2000 },
  '060617-16-0069': { role: 'Full Time', basic_salary: 1800 },
  '080703-10-1717': { role: 'Full Time', basic_salary: 1800 },
  '081205-12-1269': { role: 'Full Time', basic_salary: 1800 },
  '061207-16-0159': { role: 'Full Time', basic_salary: 1800 },
  '081228-16-0033': { role: 'Full Time', basic_salary: 1800 },
  '081010-10-0206': { role: 'Full Time', basic_salary: 1800 },
  '050302-10-0089': { role: 'Full Time', basic_salary: 1800 },
  '050905-02-0010': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '051231-16-0088': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '010120-05-0280': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '070201-16-0021': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '031120-10-1554': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '070120-10-1038': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '071024-10-1462': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },
  '040527-16-0040': { role: 'Part Time', basic_salary: 0, hourly_rate: 8.72 },

  // Aicha outlets
  '060727-10-0454': { role: 'Supervisor', basic_salary: 2000 },
  '000323-10-1130': { role: 'Full Time', basic_salary: 1800 },
  '061227-10-1586': { role: 'Full Time', basic_salary: 1800 },
  '010614-14-1254': { role: 'Full Time', basic_salary: 1800 },
  '050709-10-0910': { role: 'Full Time', basic_salary: 1800 },
};

async function updateMimixSalaries() {
  const client = await pool.connect();

  try {
    console.log('Starting Mimix salary update...\n');

    // Get all Mimix employees (company_id = 3)
    const employees = await client.query(`
      SELECT id, name, ic_number, default_basic_salary, employment_type, employee_role, hourly_rate
      FROM employees
      WHERE company_id = 3 AND status = 'active'
      ORDER BY name
    `);

    console.log(`Found ${employees.rows.length} active Mimix employees\n`);

    let updated = 0;
    let notFound = 0;
    let noChange = 0;

    for (const emp of employees.rows) {
      // Clean IC number for matching (remove dashes)
      const icClean = emp.ic_number?.replace(/-/g, '').trim();

      // Try to find in our data
      let data = employeeData[emp.ic_number] || employeeData[icClean];

      // Also try with dashes
      if (!data && icClean) {
        const icWithDashes = icClean.length === 12
          ? `${icClean.slice(0,6)}-${icClean.slice(6,8)}-${icClean.slice(8)}`
          : icClean;
        data = employeeData[icWithDashes];
      }

      if (!data) {
        console.log(`NOT FOUND: ${emp.name} (IC: ${emp.ic_number})`);
        notFound++;
        continue;
      }

      // Determine employment_type and employee_role
      let employmentType = emp.employment_type;
      let employeeRole = emp.employee_role;
      let basicSalary = emp.default_basic_salary;
      let hourlyRate = emp.hourly_rate;

      if (data.role === 'Manager') {
        employmentType = 'full_time';
        employeeRole = 'manager';
        basicSalary = data.basic_salary;
      } else if (data.role === 'Supervisor') {
        employmentType = 'full_time';
        employeeRole = 'supervisor';
        basicSalary = data.basic_salary;
      } else if (data.role === 'Full Time') {
        employmentType = 'full_time';
        employeeRole = 'staff';
        basicSalary = data.basic_salary;
      } else if (data.role === 'Part Time') {
        employmentType = 'part_time';
        employeeRole = 'staff';
        basicSalary = 0;
        hourlyRate = data.hourly_rate || 8.72;
      }

      // Check if update needed
      const needsUpdate =
        parseFloat(emp.default_basic_salary) !== basicSalary ||
        emp.employment_type !== employmentType ||
        emp.employee_role !== employeeRole ||
        (employmentType === 'part_time' && parseFloat(emp.hourly_rate) !== hourlyRate);

      if (!needsUpdate) {
        noChange++;
        continue;
      }

      // Update employee
      await client.query(`
        UPDATE employees
        SET default_basic_salary = $1,
            employment_type = $2,
            employee_role = $3,
            hourly_rate = COALESCE($4, hourly_rate),
            updated_at = NOW()
        WHERE id = $5
      `, [basicSalary, employmentType, employeeRole, hourlyRate, emp.id]);

      console.log(`UPDATED: ${emp.name}`);
      console.log(`  IC: ${emp.ic_number}`);
      console.log(`  Role: ${emp.employee_role} -> ${employeeRole}`);
      console.log(`  Type: ${emp.employment_type} -> ${employmentType}`);
      console.log(`  Salary: RM${emp.default_basic_salary} -> RM${basicSalary}${hourlyRate ? ` (hourly: ${hourlyRate})` : ''}`);
      console.log('');

      updated++;
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Total employees: ${employees.rows.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`No change needed: ${noChange}`);
    console.log(`Not found in data: ${notFound}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

updateMimixSalaries();
