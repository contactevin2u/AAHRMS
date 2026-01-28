const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Image values for comparison (EPF, SOCSO, EIS, PCB, Claims)
const imageValues = {
  'LAU JIA CHENG': { epf_ee: 1100, epf_er: 1200, socso_ee: 29.75, eis_ee: 11.90, pcb: 928.45, claim: 0 },
  'EVIN LIM': { epf_ee: 1776, epf_er: 1628, socso_ee: 29.75, eis_ee: 11.90, pcb: 2736.10, claim: 0 },
  'LEONG XIA HWEI': { epf_ee: 473, epf_er: 559, socso_ee: 21.25, eis_ee: 8.50, pcb: 67.85, claim: 44.45 },
  'MICHELLE CHEAN MEI TZEE': { epf_ee: 1870, epf_er: 2040, socso_ee: 29.75, eis_ee: 11.90, pcb: 828.50, claim: 51.05 },
  'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH': { epf_ee: 2879, epf_er: 3141, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, claim: 8191.23 },
  'HIDAYAH BINTI MUSTAPA': { epf_ee: 1133, epf_er: 1236, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, claim: 273.43 },
  'RAJA NUR SYAKIRAH BINTI RAJA SHURAN': { epf_ee: 1584, epf_er: 1728, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, claim: 526.50 },
  'NUR SYIFA ATHIRAH BINTI HAMDAN': { epf_ee: 770, epf_er: 840, socso_ee: 19.75, eis_ee: 7.90, pcb: 595.85, claim: 0 },
  'NUR AZLINA BINTI AHMAD APANDI': { epf_ee: 363, epf_er: 429, socso_ee: 16.25, eis_ee: 6.50, pcb: 0, claim: 0 },
  'SITI FATIMAH BINTI PARSON': { epf_ee: 396, epf_er: 468, socso_ee: 12.75, eis_ee: 5.10, pcb: 0, claim: 0 },
  'NUR HASLIZA ZAINAL ABIDIN': { epf_ee: 231, epf_er: 273, socso_ee: 8.75, eis_ee: 3.50, pcb: 0, claim: 0 },
  'ALIA NATASHA BINTI NORZAIN': { epf_ee: 770, epf_er: 840, socso_ee: 29.75, eis_ee: 11.90, pcb: 262.85, claim: 0 },
  'TAN HUI YANG': { epf_ee: 1573, epf_er: 1716, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, claim: 0 },
  'NASHRATUN NABILAH BINTI SABRI': { epf_ee: 1892, epf_er: 2064, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, claim: 516.62 },
  'CONNIE HUI KANG YI': { epf_ee: 704, epf_er: 768, socso_ee: 29.75, eis_ee: 11.90, pcb: 194.00, claim: 27.60 },
  'Wan Nur Najihah Binti Wan Nawang': { epf_ee: 418, epf_er: 494, socso_ee: 18.75, eis_ee: 7.50, pcb: 0, claim: 0 },
  'SOFEA ZULAIKHA PUTRI': { epf_ee: 968, epf_er: 1056, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, claim: 0 },
  'LIM CHUN PENG': { epf_ee: 385, epf_er: 455, socso_ee: 17.25, eis_ee: 6.90, pcb: 0, claim: 0 },
  'ULRIKA LEE PEI HANG': { epf_ee: 341, epf_er: 403, socso_ee: 15.25, eis_ee: 6.10, pcb: 0, claim: 0 },
  'NURUL ANISHA BINTI INDRAWATY': { epf_ee: 150, epf_er: 177, socso_ee: 6.75, eis_ee: 2.70, pcb: 0, claim: 0 },
  'LAU YU JUN': { epf_ee: 154, epf_er: 182, socso_ee: 6.75, eis_ee: 2.70, pcb: 0, claim: 30 }
};

async function run() {
  const items = await pool.query(`
    SELECT e.name, pi.epf_employee, pi.epf_employer, pi.socso_employee, pi.eis_employee, pi.pcb, pi.claims_amount
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pr.company_id = 1 AND pr.month = 1 AND pr.year = 2026
    ORDER BY e.name
  `);

  console.log('Comparing DB values with Image values:\n');
  let allMatch = true;

  for (const row of items.rows) {
    const img = imageValues[row.name];
    if (!img) continue;

    const mismatches = [];
    if (parseFloat(row.epf_employee) !== img.epf_ee) mismatches.push(`EPF_EE: DB=${row.epf_employee} vs IMG=${img.epf_ee}`);
    if (parseFloat(row.epf_employer) !== img.epf_er) mismatches.push(`EPF_ER: DB=${row.epf_employer} vs IMG=${img.epf_er}`);
    if (parseFloat(row.socso_employee) !== img.socso_ee) mismatches.push(`SOCSO_EE: DB=${row.socso_employee} vs IMG=${img.socso_ee}`);
    if (parseFloat(row.eis_employee) !== img.eis_ee) mismatches.push(`EIS_EE: DB=${row.eis_employee} vs IMG=${img.eis_ee}`);
    if (parseFloat(row.pcb || 0) !== img.pcb) mismatches.push(`PCB: DB=${row.pcb || 0} vs IMG=${img.pcb}`);
    if (parseFloat(row.claims_amount || 0) !== img.claim) mismatches.push(`CLAIM: DB=${row.claims_amount || 0} vs IMG=${img.claim}`);

    if (mismatches.length > 0) {
      console.log(`${row.name}: MISMATCH`);
      mismatches.forEach(m => console.log(`  - ${m}`));
      allMatch = false;
    } else {
      console.log(`${row.name}: OK`);
    }
  }

  console.log('\n' + (allMatch ? 'ALL VALUES MATCH!' : 'SOME VALUES DO NOT MATCH'));
  pool.end();
}
run();
