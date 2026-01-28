/**
 * Test the statutory calculator against the image data
 */

const { calculateStatutory, calculateNetPay } = require('../utils/statutoryCalculator');

// Image data for verification
const imageData = [
  { name: 'Lau Jia Cheng', basic: 10000, commission: 0, allowance: 500, overtime: 0, bonus: 0, gross: 10500, epf_ee: 1100, epf_er: 1200, socso_ee: 29.75, eis_ee: 11.90, pcb: 928.45, net: 8429.90 },
  { name: 'Evin Lim', basic: 8750, commission: 6000, allowance: 2500, overtime: 1750, bonus: 0, gross: 19000, epf_ee: 1628, epf_er: 1776, socso_ee: 29.75, eis_ee: 11.90, pcb: 2736.10, net: 14594.25 },
  { name: 'Leong Xia Hwei', basic: 4300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 4300, epf_ee: 473, epf_er: 559, socso_ee: 21.25, eis_ee: 8.50, pcb: 67.85, net: 3729.40 },
  { name: 'Michelle Chean', basic: 4100, commission: 8878, allowance: 0, overtime: 0, bonus: 4000, gross: 16978, epf_ee: 1870, epf_er: 2040, socso_ee: 29.75, eis_ee: 11.90, pcb: 828.50, net: 14237.85 },
  { name: 'Rafina', basic: 0, commission: 25170, allowance: 0, overtime: 0, bonus: 1000, gross: 26170, epf_ee: 2879, epf_er: 3141, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, net: 23249.35 },
  { name: 'Hidayah', basic: 0, commission: 10227, allowance: 0, overtime: 0, bonus: 0, gross: 10227, epf_ee: 1133, epf_er: 1236, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, net: 9052.35 },
  { name: 'Raja Nur Syakirah', basic: 0, commission: 14378, allowance: 0, overtime: 0, bonus: 0, gross: 14378, epf_ee: 1584, epf_er: 1728, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, net: 12752.35 },
  { name: 'Nur Syifa Athirah', basic: 4000, commission: 0, allowance: 200, overtime: 0, bonus: 3000, gross: 7200, epf_ee: 770, epf_er: 840, socso_ee: 19.75, eis_ee: 7.90, pcb: 595.85, net: 5806.50 },
  { name: 'Nur Azlina', basic: 3300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3300, epf_ee: 363, epf_er: 429, socso_ee: 16.25, eis_ee: 6.50, pcb: 0, net: 2914.25 },
  { name: 'Siti Fatimah', basic: 2600, commission: 0, allowance: 500, overtime: 87.5, bonus: 1000, gross: 4187.50, epf_ee: 396, epf_er: 468, socso_ee: 12.75, eis_ee: 5.10, pcb: 0, net: 3773.65 },
  { name: 'Nur Hasliza', basic: 1800, commission: 0, allowance: 200, overtime: 0, bonus: 300, gross: 2300, epf_ee: 231, epf_er: 273, socso_ee: 8.75, eis_ee: 3.50, pcb: 0, net: 2056.75 },
  { name: 'Alia Natasha', basic: 5000, commission: 950, allowance: 0, overtime: 600, bonus: 1000, gross: 7550, epf_ee: 770, epf_er: 840, socso_ee: 29.75, eis_ee: 11.90, pcb: 262.85, net: 6475.50 },
  { name: 'Tan Hui Yang', basic: 0, commission: 14277, allowance: 0, overtime: 0, bonus: 0, gross: 14277, epf_ee: 1573, epf_er: 1716, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, net: 12662.35 },
  { name: 'Nashratun', basic: 0, commission: 17114, allowance: 0, overtime: 0, bonus: 0, gross: 17114, epf_ee: 1892, epf_er: 2064, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, net: 15180.35 },
  { name: 'Connie', basic: 4700, commission: 1700, allowance: 0, overtime: 0, bonus: 0, gross: 6400, epf_ee: 704, epf_er: 768, socso_ee: 29.75, eis_ee: 11.90, pcb: 194.00, net: 5460.35 },
  { name: 'Wan Nur Najihah', basic: 3800, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3800, epf_ee: 418, epf_er: 494, socso_ee: 18.75, eis_ee: 7.50, pcb: 0, net: 3355.75 },
  { name: 'Sofea Zulaikha', basic: 0, commission: 8749, allowance: 0, overtime: 0, bonus: 0, gross: 8749, epf_ee: 968, epf_er: 1056, socso_ee: 29.75, eis_ee: 11.90, pcb: 0, net: 7739.35 },
  { name: 'Chun Peng', basic: 3500, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3500, epf_ee: 385, epf_er: 455, socso_ee: 17.25, eis_ee: 6.90, pcb: 0, net: 3090.85 },
  { name: 'Ulrika Lee', basic: 3096.77, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3096.77, epf_ee: 341, epf_er: 403, socso_ee: 15.25, eis_ee: 6.10, pcb: 0, net: 2734.42 },
  { name: 'Nurul Anisha', basic: 1341.94, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1341.94, epf_ee: 150, epf_er: 177, socso_ee: 6.75, eis_ee: 2.70, pcb: 0, net: 1182.49 },
  { name: 'Lau Yu Jun', basic: 1383.87, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1383.87, epf_ee: 154, epf_er: 182, socso_ee: 6.75, eis_ee: 2.70, pcb: 0, net: 1220.42 },
];

console.log('=== TESTING STATUTORY CALCULATOR ===\n');
console.log('Comparing calculated values with image values:\n');

let allMatch = true;
const results = [];

for (const emp of imageData) {
  const calc = calculateStatutory({
    basic: emp.basic,
    commission: emp.commission,
    allowance: emp.allowance,
    overtime: emp.overtime,
    bonus: emp.bonus
  });

  const mismatches = [];

  // Check EPF
  if (calc.epf.employee !== emp.epf_ee) {
    mismatches.push(`EPF_EE: calc=${calc.epf.employee} vs img=${emp.epf_ee}`);
  }
  if (calc.epf.employer !== emp.epf_er) {
    mismatches.push(`EPF_ER: calc=${calc.epf.employer} vs img=${emp.epf_er}`);
  }

  // Check SOCSO
  if (calc.socso.employee !== emp.socso_ee) {
    mismatches.push(`SOCSO_EE: calc=${calc.socso.employee} vs img=${emp.socso_ee}`);
  }

  // Check EIS
  if (calc.eis.employee !== emp.eis_ee) {
    mismatches.push(`EIS_EE: calc=${calc.eis.employee} vs img=${emp.eis_ee}`);
  }

  if (mismatches.length > 0) {
    console.log(`${emp.name}: MISMATCH`);
    mismatches.forEach(m => console.log(`  - ${m}`));
    allMatch = false;
  } else {
    console.log(`${emp.name}: OK`);
  }

  results.push({
    name: emp.name,
    image: { epf_ee: emp.epf_ee, epf_er: emp.epf_er, socso_ee: emp.socso_ee, eis_ee: emp.eis_ee },
    calculated: { epf_ee: calc.epf.employee, epf_er: calc.epf.employer, socso_ee: calc.socso.employee, eis_ee: calc.eis.employee },
    match: mismatches.length === 0
  });
}

console.log('\n' + (allMatch ? 'ALL CALCULATIONS MATCH!' : 'SOME CALCULATIONS DO NOT MATCH'));

// Summary
const matching = results.filter(r => r.match).length;
const total = results.length;
console.log(`\nSummary: ${matching}/${total} employees match (${((matching/total)*100).toFixed(1)}%)`);
