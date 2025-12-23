/**
 * Seed Script: AA Alive Sdn Bhd Employees
 *
 * This script imports all employees from the provided employee list
 * into AA Alive Sdn Bhd (Company ID: 1)
 *
 * Run with: node scripts/seed-aa-alive-employees.js
 */

const pool = require('../db');

// Employee data extracted from images
const EMPLOYEES = [
  // Image 1
  { employee_id: 'ADAM', name: 'AR ADAM MIRZA BIN ARAZMI', ic_number: '021223-12-0863', department: 'Driver', email: 'bell68594@gmail.com', join_date: '2025-08-24' },
  { employee_id: 'ADIN', name: 'HABER BIN ABU HASSAN', ic_number: '930220-12-6379', department: 'Driver', email: 'boydin819@gmail.com', join_date: '2025-03-01' },
  { employee_id: 'AIMAN', name: 'MOHAMAD SHAHZUWAN AIMAN BIN MD KHARI', ic_number: '990929-03-5321', department: 'Driver', email: 'zuwanshah785@gmail.com', join_date: '2025-09-08' },
  { employee_id: 'ALIA', name: 'ALIA NATASHA BINTI NORZAIN', ic_number: '981007-01-6680', department: 'Office', email: 'alianatasha1311@gmail.com', join_date: '2025-04-01' },
  { employee_id: 'ALIFF', name: 'MUHAMMAD NOR ALIF BIN MOHD GHAFAR', ic_number: '871010-08-6447', department: 'Driver', email: 'jiacheng911202@googlemail.com', join_date: '2025-03-01' },
  { employee_id: 'ANELICE', name: 'LEONG XIA HWEI', ic_number: '960213-14-6192', department: 'Office', email: 'aneliceleong06@gmail.com', join_date: '2025-05-29' },
  { employee_id: 'ASLIE', name: 'ASLIE BIN ABU BAKAR', ic_number: '720506-12-5667', department: 'Driver', email: 'aslie9191@gmail.com', join_date: '2025-08-19' },
  { employee_id: 'ASRI', name: 'MOHAMMAD AL-ASRI ZULFADLI BIN ASLIE', ic_number: '020112-12-0831', department: 'Driver', email: 'namikazeyakuza02@icloud.com', join_date: '2025-10-25' },
  { employee_id: 'BELLA', name: 'NASHRATUN NABILAH BINTI SABRI', ic_number: '950103-12-5674', department: 'Office', email: 'nashratun.nabilahh@gmail.com', join_date: '2025-11-10' },
  { employee_id: 'CHLOE', name: 'TAN HUI YANG', ic_number: '920428-14-5422', department: 'Office', email: 'yang_thy92@live.com', join_date: '2025-09-01' },
  { employee_id: 'CONNIE', name: 'CONNIE HUI KANG YI', ic_number: '020105-14-0076', department: 'Office', email: 'conniehuikangyi@gmail.com', join_date: '2025-11-03' },
  { employee_id: 'EZZATI', name: 'NUR EZZATI BINTI ISMAIL', ic_number: '010209-08-0988', department: 'Office', email: 'nurezzati.isml@gmail.com', join_date: '2025-11-17' },
  { employee_id: 'FAIQ', name: 'MOHD FAIQ BIN RUDZELAN', ic_number: '910913-06-5507', department: 'Driver', email: 'faiq6846@gmail.com', join_date: '2025-03-01' },
  { employee_id: 'FAKHRUL', name: 'FAKHRUL AZIZI BIN TALIB', ic_number: '871217-02-5609', department: 'Driver', email: 'fakhrul36azizi@gmail.com', join_date: '2025-06-09' },
  { employee_id: 'FARAH', name: 'NUR FARAH IZZATI BINTI MD LAZIM', ic_number: '980825-43-5188', department: 'Office', email: 'farah25izzati@gmail.com', join_date: '2025-06-02' },

  // Image 2
  { employee_id: 'HAFIZ', name: 'HAFIZ BIN ZAINAL ABIDIN', ic_number: '930429-12-5289', department: 'Driver', email: 'poyzainal@gmail.com', join_date: '2025-03-01' },
  { employee_id: 'HANA', name: 'FARHANAH BINTI ABD TALIB', ic_number: '930102-10-5948', department: 'Office', email: 'farhanahtalib21@gmail.com', join_date: '2025-09-01' },
  { employee_id: 'HASLIZA', name: 'NUR HASLIZA ZAINAL ABIDIN', ic_number: '010927-12-0710', department: 'Office', email: 'lizazainal4@gmail.com', join_date: '2025-09-01' },
  { employee_id: 'HIDAYAH', name: 'HIDAYAH BINTI MUSTAPA', ic_number: '990518-07-5564', department: 'Office', email: 'hidayahmustapaworking@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'IQZAT', name: 'AR IQZAT ALFAYYADH B AR AZMI', ic_number: '920618-12-6441', department: 'Driver', email: 'ariqzatalfayyadh@gmail.com', join_date: '2025-03-01' },
  { employee_id: 'IZUWAN', name: 'MD IZUWAN BIN YUSIN', ic_number: '921221-12-6835', department: 'Driver', email: 'fareezuwan2112@gmail.com', join_date: '2025-06-09' },
  { employee_id: 'IZZUL', name: 'MUHAMMAD ISMAIZZUL BIN ZAINI', ic_number: '950623-14-5177', department: 'Driver', email: 'nursabihaa@gmail.com', join_date: '2025-03-01' },
  { employee_id: 'LINA', name: 'NUR AZLINA BINTI AHMAD APANDI', ic_number: '981031-10-5562', department: 'Office', email: 'azlinaahmad98@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'MICHELLE', name: 'MICHELLE CHEAN MEI TZEE', ic_number: '990929-08-6540', department: null, email: 'michellechean.work@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'NAD', name: 'NAJAH NADZIRAH BINTI ROSLI', ic_number: '921214-10-5710', department: 'Office', email: 'aaniz847@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'PIAN', name: 'MOHD SAFIAN BIN YUSIN', ic_number: '870127-49-5637', department: 'Driver', email: 'safianyusin426@gmail.com', join_date: '2025-03-01' },
  { employee_id: 'RAFINA', name: 'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH', ic_number: '010602-00-0076', department: 'Office', email: 'finarafina15@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'SAIFUL', name: 'ENGKU SAIFUL AZHARI BIN CHE ENGKU GARIB', ic_number: '850709-04-5259', department: 'Driver', email: 'saifulsaifulazhari2@gmail.com', join_date: '2025-04-04' },
  { employee_id: 'SHANIA', name: 'SHANIA IZZATY', ic_number: '990120-56-5360', department: 'Office', email: null, join_date: '2025-06-17' },
  { employee_id: 'SITI', name: 'SITI FATIMAH BINTI PARSON', ic_number: '940120-12-5466', department: 'Office', email: 'maymayparson94@gmail.com', join_date: '2025-06-01' },

  // Image 3
  { employee_id: 'SYAKIRAH', name: 'RAJA NUR SYAKIRAH BINTI RAJA SHURAN', ic_number: '000101-14-0986', department: 'Office', email: 'rajasyakirah01@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'SYIFA', name: 'NUR SYIFA ATHIRAH BINTI HAMDAN', ic_number: '980824-14-5410', department: 'Office', email: 'nrsyifa.athirah@gmail.com', join_date: '2025-05-28' },
  { employee_id: 'SYUKRI', name: 'MUHAMMAD SYUKRI BIN MASKUR', ic_number: '940926-14-6725', department: 'Driver', email: 'syukrimuhd804@gmail.com', join_date: '2025-08-04' },
  { employee_id: 'ZAINAL', name: 'ZAINAL ABIDIN BIN ABU BAKAR', ic_number: '730515-12-5560', department: 'Driver', email: 'enanzainalabidin@gmail.com', join_date: '2025-08-19' }
];

// Helper function to extract date of birth from IC number
function extractDOBFromIC(icNumber) {
  if (!icNumber) return null;

  // IC format: YYMMDD-SS-NNNN
  const cleaned = icNumber.replace(/-/g, '');
  if (cleaned.length < 6) return null;

  const yy = parseInt(cleaned.substring(0, 2));
  const mm = cleaned.substring(2, 4);
  const dd = cleaned.substring(4, 6);

  // Determine century: if yy > 25, assume 1900s, otherwise 2000s
  const century = yy > 25 ? '19' : '20';
  const yyyy = century + cleaned.substring(0, 2);

  return `${yyyy}-${mm}-${dd}`;
}

// Helper function to determine gender from IC number
function getGenderFromIC(icNumber) {
  if (!icNumber) return null;

  const cleaned = icNumber.replace(/-/g, '');
  const lastDigit = parseInt(cleaned.charAt(cleaned.length - 1));

  // Odd = Male, Even = Female
  return lastDigit % 2 === 1 ? 'male' : 'female';
}

async function seedEmployees() {
  const client = await pool.connect();
  const companyId = 1; // AA Alive Sdn Bhd

  try {
    console.log('Starting AA Alive employee seeding...\n');

    // Get department IDs
    const deptResult = await client.query(
      'SELECT id, name FROM departments WHERE company_id = $1',
      [companyId]
    );

    const deptMap = {};
    deptResult.rows.forEach(d => {
      deptMap[d.name.toLowerCase()] = d.id;
    });

    console.log('Department mapping:', deptMap);
    console.log('');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const emp of EMPLOYEES) {
      try {
        // Check if employee already exists
        const existing = await client.query(
          'SELECT id FROM employees WHERE employee_id = $1 AND company_id = $2',
          [emp.employee_id, companyId]
        );

        if (existing.rows.length > 0) {
          console.log(`SKIP: ${emp.employee_id} - ${emp.name} (already exists)`);
          skipCount++;
          continue;
        }

        // Get department ID
        let departmentId = null;
        if (emp.department) {
          departmentId = deptMap[emp.department.toLowerCase()];
          if (!departmentId) {
            console.log(`WARNING: Department "${emp.department}" not found for ${emp.employee_id}`);
          }
        }

        // Extract DOB and gender from IC
        const dateOfBirth = extractDOBFromIC(emp.ic_number);
        const gender = getGenderFromIC(emp.ic_number);

        // Insert employee
        await client.query(`
          INSERT INTO employees (
            employee_id, name, email, ic_number, department_id,
            join_date, date_of_birth, status, company_id,
            employment_type, probation_months
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 'confirmed', 3)
        `, [
          emp.employee_id,
          emp.name,
          emp.email,
          emp.ic_number,
          departmentId,
          emp.join_date,
          dateOfBirth,
          companyId
        ]);

        console.log(`ADDED: ${emp.employee_id} - ${emp.name} (${emp.department || 'No Dept'})`);
        successCount++;

      } catch (err) {
        console.error(`ERROR: ${emp.employee_id} - ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total employees: ${EMPLOYEES.length}`);
    console.log(`Successfully added: ${successCount}`);
    console.log(`Skipped (existing): ${skipCount}`);
    console.log(`Errors: ${errorCount}`);

    // Show employee count by department
    const countResult = await client.query(`
      SELECT d.name as department, COUNT(e.id) as count
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
      GROUP BY d.name
      ORDER BY count DESC
    `, [companyId]);

    console.log('\n=== Employees by Department ===');
    countResult.rows.forEach(r => {
      console.log(`${r.department || 'No Department'}: ${r.count}`);
    });

  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedEmployees();
