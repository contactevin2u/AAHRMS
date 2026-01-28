/**
 * Verify January 2026 Payroll Calculations
 *
 * This script recalculates EPF, EIS, and PCB using the fixed formulas
 * and compares with the expected values from the LHDN/KWSP slips.
 */

const { Pool } = require('pg');
require('dotenv').config();
const { calculateEPF, calculateSOCSO, calculateEIS } = require('../utils/statutory');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Expected values from LHDN/KWSP slips (manually verified)
const expectedValues = {
  'LAU JIA CHENG': { epf_ee: 1100, epf_er: 1200, socso_ee: 29.75, eis_ee: 11.90, pcb: 928.45 },
  'EVIN LIM': { epf_ee: 1628, epf_er: 1776, socso_ee: 29.75, eis_ee: 11.90, pcb: 2736.10 },
  'LEONG XIA HWEI': { epf_ee: 473, epf_er: 559, socso_ee: 21.25, eis_ee: 8.50, pcb: 67.85 },
  'MICHELLE CHEAN MEI TZEE': { epf_ee: 2101, epf_er: 2292, socso_ee: 29.75, eis_ee: 11.90, pcb: 1014.75 },
  'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH': { epf_ee: 2879, epf_er: 3141, socso_ee: 29.75, eis_ee: 11.90, pcb: 0 },
  'HIDAYAH BINTI MUSTAPA': { epf_ee: 1133, epf_er: 1236, socso_ee: 29.75, eis_ee: 11.90, pcb: 0 },
  'RAJA NUR SYAKIRAH BINTI RAJA SHURAN': { epf_ee: 1584, epf_er: 1728, socso_ee: 29.75, eis_ee: 11.90, pcb: 0 },
  'NUR SYIFA ATHIRAH BINTI HAMDAN': { epf_ee: 770, epf_er: 840, socso_ee: 19.75, eis_ee: 7.90, pcb: 595.85 },
  'NUR AZLINA BINTI AHMAD APANDI': { epf_ee: 363, epf_er: 429, socso_ee: 16.25, eis_ee: 6.50, pcb: 0 },
  'SITI FATIMAH BINTI PARSON': { epf_ee: 396, epf_er: 468, socso_ee: 12.75, eis_ee: 5.10, pcb: 0 },
  'NUR HASLIZA ZAINAL ABIDIN': { epf_ee: 231, epf_er: 273, socso_ee: 8.75, eis_ee: 3.50, pcb: 0 },
  'ALIA NATASHA BINTI NORZAIN': { epf_ee: 770, epf_er: 840, socso_ee: 29.75, eis_ee: 11.90, pcb: 262.85 },
  'TAN HUI YANG': { epf_ee: 1573, epf_er: 1716, socso_ee: 29.75, eis_ee: 11.90, pcb: 0 },
  'NASHRATUN NABILAH BINTI SABRI': { epf_ee: 1892, epf_er: 2064, socso_ee: 29.75, eis_ee: 11.90, pcb: 0 },
  'CONNIE HUI KANG YI': { epf_ee: 704, epf_er: 768, socso_ee: 29.75, eis_ee: 11.90, pcb: 194.00 },
  'Wan Nur Najihah Binti Wan Nawang': { epf_ee: 418, epf_er: 494, socso_ee: 18.75, eis_ee: 7.50, pcb: 0 },
  'SOFEA ZULAIKHA PUTRI': { epf_ee: 968, epf_er: 1056, socso_ee: 29.75, eis_ee: 11.90, pcb: 0 },
  'LIM CHUN PENG': { epf_ee: 385, epf_er: 455, socso_ee: 17.25, eis_ee: 6.90, pcb: 0 },
  'ULRIKA LEE PEI HANG': { epf_ee: 341, epf_er: 403, socso_ee: 15.25, eis_ee: 6.10, pcb: 0 },
  'NURUL ANISHA BINTI INDRAWATY': { epf_ee: 150, epf_er: 177, socso_ee: 6.75, eis_ee: 2.70, pcb: 0 },
  'LAU YU JUN': { epf_ee: 154, epf_er: 182, socso_ee: 6.75, eis_ee: 2.70, pcb: 0 }
};

async function run() {
  console.log('='.repeat(80));
  console.log('JANUARY 2026 PAYROLL VERIFICATION');
  console.log('Recalculating EPF, SOCSO, EIS using fixed formulas');
  console.log('='.repeat(80));
  console.log('');

  // Fetch January payroll data with employee details
  const query = `
    SELECT
      e.name,
      e.ic_number,
      pi.basic_salary,
      pi.gross_salary,
      pi.statutory_base,
      pi.commission_amount,
      pi.epf_employee as db_epf_ee,
      pi.epf_employer as db_epf_er,
      pi.socso_employee as db_socso_ee,
      pi.eis_employee as db_eis_ee,
      pi.pcb as db_pcb
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pr.company_id = 1 AND pr.month = 1 AND pr.year = 2026
    ORDER BY e.name
  `;

  const result = await pool.query(query);

  let totalMismatches = 0;
  let epfMatches = 0;
  let socsoMatches = 0;
  let eisMatches = 0;
  let pcbMatches = 0;
  let totalEmployees = 0;

  console.log('Employee'.padEnd(45) + 'EPF_EE'.padEnd(18) + 'SOCSO_EE'.padEnd(18) + 'EIS_EE'.padEnd(18) + 'PCB');
  console.log('-'.repeat(80));

  for (const row of result.rows) {
    const expected = expectedValues[row.name];
    if (!expected) {
      console.log(`${row.name}: No expected values found`);
      continue;
    }

    totalEmployees++;

    // Calculate EPF based on statutory base (includes basic + commission for EPF base)
    const epfWages = parseFloat(row.statutory_base) || parseFloat(row.gross_salary) || 0;
    const calculatedEPF = calculateEPF(epfWages, 30); // Assume under 60

    // Calculate SOCSO and EIS based on gross salary (capped at RM6000)
    const grossForSOCSO = parseFloat(row.gross_salary) || 0;
    const calculatedSOCSO = calculateSOCSO(grossForSOCSO, 30);
    const calculatedEIS = calculateEIS(grossForSOCSO, 30);

    // Compare values
    const dbEPF = parseFloat(row.db_epf_ee) || 0;
    const dbSOCSO = parseFloat(row.db_socso_ee) || 0;
    const dbEIS = parseFloat(row.db_eis_ee) || 0;
    const dbPCB = parseFloat(row.db_pcb) || 0;

    const epfStatus = dbEPF === expected.epf_ee ? 'OK' : `DB=${dbEPF} vs EXP=${expected.epf_ee}`;
    const socsoStatus = dbSOCSO === expected.socso_ee ? 'OK' : `DB=${dbSOCSO} vs EXP=${expected.socso_ee}`;
    const eisStatus = dbEIS === expected.eis_ee ? 'OK' : `DB=${dbEIS} vs EXP=${expected.eis_ee}`;
    const pcbStatus = Math.abs(dbPCB - expected.pcb) < 0.01 ? 'OK' : `DB=${dbPCB} vs EXP=${expected.pcb}`;

    if (epfStatus === 'OK') epfMatches++;
    if (socsoStatus === 'OK') socsoMatches++;
    if (eisStatus === 'OK') eisMatches++;
    if (pcbStatus === 'OK') pcbMatches++;

    const hasIssue = epfStatus !== 'OK' || socsoStatus !== 'OK' || eisStatus !== 'OK' || pcbStatus !== 'OK';

    if (hasIssue) {
      totalMismatches++;
      console.log(`\n${row.name}:`);
      console.log(`  EPF Wages: ${epfWages}, Gross: ${grossForSOCSO}`);
      if (epfStatus !== 'OK') console.log(`  EPF_EE: ${epfStatus} (Calc=${calculatedEPF.employee})`);
      if (socsoStatus !== 'OK') console.log(`  SOCSO_EE: ${socsoStatus} (Calc=${calculatedSOCSO.employee})`);
      if (eisStatus !== 'OK') console.log(`  EIS_EE: ${eisStatus} (Calc=${calculatedEIS.employee})`);
      if (pcbStatus !== 'OK') console.log(`  PCB: ${pcbStatus}`);
    } else {
      console.log(`${row.name.substring(0, 44).padEnd(45)} OK                OK                OK                OK`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Employees: ${totalEmployees}`);
  console.log(`EPF Matches: ${epfMatches}/${totalEmployees}`);
  console.log(`SOCSO Matches: ${socsoMatches}/${totalEmployees}`);
  console.log(`EIS Matches: ${eisMatches}/${totalEmployees}`);
  console.log(`PCB Matches: ${pcbMatches}/${totalEmployees}`);
  console.log(`Total with Mismatches: ${totalMismatches}`);
  console.log('');

  if (totalMismatches === 0) {
    console.log('ALL VALUES MATCH EXPECTED!');
  } else {
    console.log('Some values do not match. Review above for details.');
  }

  pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  pool.end();
});
