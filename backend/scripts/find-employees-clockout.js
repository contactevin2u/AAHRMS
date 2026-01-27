require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function findEmployees() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Date:', today);
    console.log('='.repeat(80));

    // List of employees to find (by name patterns)
    const employeesToFind = [
      // AICHA KUANG (KOPI ANTARABANGSA)
      { name: 'NUR SUHAILAH BINTI SUELMI', outlet: 'AICHA KUANG / KOPI ANTARABANGSA', clockOut: '17:35:00' },
      { name: 'INTAN NUR SHAZWIN', outlet: 'AICHA KUANG / KOPI ANTARABANGSA', clockOut: '17:35:00' },

      // Mixue Putrajaya (665)
      { name: 'MUHAMMAD ZARIF BIN RAHIMI', outlet: 'Mixue Putrajaya (665)', clockOut: '18:30:00' },
      { name: 'NOORAYUNI BINTI ABD SHUKOR', outlet: 'Mixue Putrajaya (665)', clockOut: '18:30:00' },
      { name: 'NUR DARWISYAH SAFI BINTI ZAIDI', outlet: 'Mixue Putrajaya (665)', clockOut: '18:30:00' },
      { name: 'NURUL SYAIDATUL AMIRA BINTI KAMARULZAMAN', outlet: 'Mixue Putrajaya (665)', clockOut: '18:30:00' },
      { name: 'IMMAN BIN MOHD SOFIAN', outlet: 'Mixue Putrajaya (665)', clockOut: '18:30:00' },
      { name: 'IZZ AMMAR BIN ANWARFAKHRI', outlet: 'Mixue Putrajaya (665)', clockOut: '18:30:00' },

      // Langka MSB
      { name: 'NUR JANNAH HAFIDHAH BINTI ABDULLAH', outlet: 'Langka MSB', clockOut: '17:40:00', ic: '950727-12-6376' },
      { name: 'NURJANNAH SHADRINNA BINTI ABDULLAH', outlet: 'Langka MSB', clockOut: '17:52:00' },

      // MIXUE TAMAN PUCHONG UTAMA (308)
      { name: 'MUHAMMAD AMMAR NAFIZ BIN KAMAL ARIFFIN', outlet: 'Mixue Puchong Utama (308)', clockOut: '19:30:00' },
      { name: 'ADRIANA NATASYA BINTI RUSDI', outlet: 'Mixue Puchong Utama (308)', clockOut: '17:30:00' },
    ];

    const results = [];

    for (const emp of employeesToFind) {
      // Search for employee by name (case insensitive, partial match)
      const searchName = emp.name.split(' ').slice(0, 3).join('%');

      const empResult = await pool.query(`
        SELECT e.id, e.employee_id, e.name, e.ic_number, e.outlet_id, o.name as outlet_name,
               e.company_id, e.status
        FROM employees e
        LEFT JOIN outlets o ON e.outlet_id = o.id
        WHERE e.company_id = 3
          AND UPPER(e.name) LIKE UPPER($1)
          AND e.status = 'active'
        ORDER BY e.name
      `, [`%${emp.name}%`]);

      if (empResult.rows.length === 0) {
        // Try with first two words only
        const shortName = emp.name.split(' ').slice(0, 2).join(' ');
        const retryResult = await pool.query(`
          SELECT e.id, e.employee_id, e.name, e.ic_number, e.outlet_id, o.name as outlet_name,
                 e.company_id, e.status
          FROM employees e
          LEFT JOIN outlets o ON e.outlet_id = o.id
          WHERE e.company_id = 3
            AND UPPER(e.name) LIKE UPPER($1)
            AND e.status = 'active'
          ORDER BY e.name
        `, [`%${shortName}%`]);

        if (retryResult.rows.length === 0) {
          results.push({
            searchName: emp.name,
            expectedOutlet: emp.outlet,
            clockOut: emp.clockOut,
            found: false,
            error: 'NOT FOUND'
          });
          continue;
        }
        empResult.rows = retryResult.rows;
      }

      const found = empResult.rows[0];

      // Get today's clock-in record
      const clockResult = await pool.query(`
        SELECT id, clock_in_1, clock_out_1, clock_in_2, clock_out_2, status
        FROM clock_in_records
        WHERE employee_id = $1 AND work_date = $2
      `, [found.id, today]);

      const clockRecord = clockResult.rows[0];

      // Determine which field to update
      let updateField = null;
      let currentStatus = 'No record today';

      if (clockRecord) {
        if (clockRecord.clock_in_1 && !clockRecord.clock_out_1) {
          updateField = 'clock_out_1';
          currentStatus = `Clocked in at ${clockRecord.clock_in_1}, needs clock_out_1`;
        } else if (clockRecord.clock_out_1 && !clockRecord.clock_in_2) {
          updateField = 'clock_in_2 first, then clock_out_2';
          currentStatus = `On break since ${clockRecord.clock_out_1}`;
        } else if (clockRecord.clock_in_2 && !clockRecord.clock_out_2) {
          updateField = 'clock_out_2';
          currentStatus = `Back from break at ${clockRecord.clock_in_2}, needs clock_out_2`;
        } else if (clockRecord.clock_out_2) {
          updateField = 'ALREADY COMPLETED';
          currentStatus = `Already clocked out at ${clockRecord.clock_out_2}`;
        }
      }

      results.push({
        searchName: emp.name,
        expectedOutlet: emp.outlet,
        clockOut: emp.clockOut,
        found: true,
        dbId: found.id,
        dbName: found.name,
        dbOutlet: found.outlet_name,
        dbOutletId: found.outlet_id,
        clockRecordId: clockRecord?.id,
        currentStatus,
        updateField,
        clockIn1: clockRecord?.clock_in_1,
        clockOut1: clockRecord?.clock_out_1,
        clockIn2: clockRecord?.clock_in_2,
        clockOut2: clockRecord?.clock_out_2
      });
    }

    // Group by outlet and display
    console.log('\n' + '='.repeat(80));
    console.log('SEARCH RESULTS');
    console.log('='.repeat(80));

    let currentOutlet = '';
    for (const r of results) {
      if (r.expectedOutlet !== currentOutlet) {
        currentOutlet = r.expectedOutlet;
        console.log(`\n### ${currentOutlet} ###\n`);
      }

      if (!r.found) {
        console.log(`❌ ${r.searchName}`);
        console.log(`   ERROR: ${r.error}`);
        console.log(`   Requested clock-out: ${r.clockOut}`);
      } else {
        const match = r.dbOutlet?.toUpperCase().includes(r.expectedOutlet.split(' ')[0].toUpperCase()) ||
                      r.expectedOutlet.toUpperCase().includes(r.dbOutlet?.split(' ')[0].toUpperCase());
        const outletStatus = match ? '✓' : '⚠️ OUTLET MISMATCH';

        console.log(`${r.updateField === 'ALREADY COMPLETED' ? '⚠️' : '✓'} ${r.dbName} (ID: ${r.dbId})`);
        console.log(`   DB Outlet: ${r.dbOutlet} (ID: ${r.dbOutletId}) ${outletStatus}`);
        console.log(`   Clock Record ID: ${r.clockRecordId || 'NONE'}`);
        console.log(`   Current: in1=${r.clockIn1 || '-'} out1=${r.clockOut1 || '-'} in2=${r.clockIn2 || '-'} out2=${r.clockOut2 || '-'}`);
        console.log(`   Status: ${r.currentStatus}`);
        console.log(`   Action: ${r.updateField || 'NO CLOCK-IN RECORD'}`);
        console.log(`   Requested clock-out: ${r.clockOut}`);
      }
      console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    const notFound = results.filter(r => !r.found);
    const canUpdate = results.filter(r => r.found && r.updateField && !r.updateField.includes('ALREADY') && !r.updateField.includes('first'));
    const alreadyDone = results.filter(r => r.found && r.updateField === 'ALREADY COMPLETED');
    const needsBreakReturn = results.filter(r => r.found && r.updateField?.includes('first'));
    const noRecord = results.filter(r => r.found && !r.updateField);

    console.log(`Total employees: ${results.length}`);
    console.log(`  ✓ Can update clock-out: ${canUpdate.length}`);
    console.log(`  ⚠️ Already completed: ${alreadyDone.length}`);
    console.log(`  ⚠️ Needs break return first: ${needsBreakReturn.length}`);
    console.log(`  ⚠️ No clock-in record: ${noRecord.length}`);
    console.log(`  ❌ Not found: ${notFound.length}`);

    if (notFound.length > 0) {
      console.log('\nNot found employees:');
      notFound.forEach(r => console.log(`  - ${r.searchName}`));
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

findEmployees();
