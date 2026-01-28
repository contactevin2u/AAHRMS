// Analyze the image data to understand EPF, SOCSO, PCB calculation patterns

const imageData = [
  { name: 'Lau Jia Cheng', basic: 10000, commission: 0, allowance: 500, overtime: 0, bonus: 0, gross: 10500, epf_ee: 1100, epf_er: 1200, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 928.45 },
  { name: 'Evin Lim', basic: 8750, commission: 6000, allowance: 2500, overtime: 1750, bonus: 0, gross: 19000, epf_ee: 1776, epf_er: 1628, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 2736.10 },
  { name: 'Leong Xia Hwei', basic: 4300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 4300, epf_ee: 473, epf_er: 559, socso_ee: 21.25, socso_er: 74.35, eis_ee: 8.50, eis_er: 8.50, pcb: 67.85 },
  { name: 'Michelle Chean', basic: 4100, commission: 8878, allowance: 0, overtime: 0, bonus: 4000, gross: 16978, epf_ee: 1870, epf_er: 2040, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 828.50 },
  { name: 'Rafina', basic: 0, commission: 25170, allowance: 0, overtime: 0, bonus: 1000, gross: 26170, epf_ee: 2879, epf_er: 3141, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0 },
  { name: 'Hidayah', basic: 0, commission: 10227, allowance: 0, overtime: 0, bonus: 0, gross: 10227, epf_ee: 1133, epf_er: 1236, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0 },
  { name: 'Raja Nur Syakirah', basic: 0, commission: 14378, allowance: 0, overtime: 0, bonus: 0, gross: 14378, epf_ee: 1584, epf_er: 1728, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0 },
  { name: 'Nur Syifa Athirah', basic: 4000, commission: 0, allowance: 200, overtime: 0, bonus: 3000, gross: 7200, epf_ee: 770, epf_er: 840, socso_ee: 19.75, socso_er: 69.15, eis_ee: 7.90, eis_er: 7.90, pcb: 595.85 },
  { name: 'Nur Azlina', basic: 3300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3300, epf_ee: 363, epf_er: 429, socso_ee: 16.25, socso_er: 56.85, eis_ee: 6.50, eis_er: 6.50, pcb: 0 },
  { name: 'Siti Fatimah', basic: 2600, commission: 0, allowance: 500, overtime: 87.5, bonus: 1000, gross: 4187.50, epf_ee: 396, epf_er: 468, socso_ee: 12.75, socso_er: 44.65, eis_ee: 5.10, eis_er: 5.10, pcb: 0 },
  { name: 'Nur Hasliza', basic: 1800, commission: 0, allowance: 200, overtime: 0, bonus: 300, gross: 2300, epf_ee: 231, epf_er: 273, socso_ee: 8.75, socso_er: 30.65, eis_ee: 3.50, eis_er: 3.50, pcb: 0 },
  { name: 'Alia Natasha', basic: 5000, commission: 0, allowance: 950, overtime: 600, bonus: 1000, gross: 7550, epf_ee: 770, epf_er: 840, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 262.85 },
  { name: 'Tan Hui Yang', basic: 0, commission: 14277, allowance: 0, overtime: 0, bonus: 0, gross: 14277, epf_ee: 1573, epf_er: 1716, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0 },
  { name: 'Nashratun', basic: 0, commission: 17114, allowance: 0, overtime: 0, bonus: 0, gross: 17114, epf_ee: 1892, epf_er: 2064, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0 },
  { name: 'Connie', basic: 4700, commission: 1700, allowance: 0, overtime: 0, bonus: 0, gross: 6400, epf_ee: 704, epf_er: 768, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 194.00 },
  { name: 'Wan Nur Najihah', basic: 3800, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3800, epf_ee: 418, epf_er: 494, socso_ee: 18.75, socso_er: 65.65, eis_ee: 7.50, eis_er: 7.50, pcb: 0 },
  { name: 'Sofea Zulaikha', basic: 0, commission: 8749, allowance: 0, overtime: 0, bonus: 0, gross: 8749, epf_ee: 968, epf_er: 1056, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0 },
  { name: 'Chun Peng', basic: 3500, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3500, epf_ee: 385, epf_er: 455, socso_ee: 17.25, socso_er: 60.85, eis_ee: 6.90, eis_er: 6.90, pcb: 0 },
  { name: 'Ulrika Lee', basic: 3096.77, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3096.77, epf_ee: 341, epf_er: 403, socso_ee: 15.25, socso_er: 53.35, eis_ee: 6.10, eis_er: 6.10, pcb: 0 },
  { name: 'Nurul Anisha', basic: 1341.94, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1341.94, epf_ee: 150, epf_er: 177, socso_ee: 6.75, socso_er: 23.65, eis_ee: 2.70, eis_er: 2.70, pcb: 0 },
  { name: 'Lau Yu Jun', basic: 1383.87, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1383.87, epf_ee: 154, epf_er: 182, socso_ee: 6.75, socso_er: 23.65, eis_ee: 2.70, eis_er: 2.70, pcb: 0 },
];

console.log('=== ANALYZING EPF CALCULATION PATTERN ===\n');

for (const emp of imageData) {
  // Calculate what the EPF base might be
  const epfBaseFromEE = emp.epf_ee / 0.11;  // Reverse calc assuming 11%
  const epfBaseFromER = emp.epf_er / 0.12;  // Reverse calc assuming 12%

  // Different possible bases
  const baseOnly = emp.basic;
  const baseComm = emp.basic + emp.commission;
  const baseCommBonus = emp.basic + emp.commission + emp.bonus;
  const baseCommBonusAllow = emp.basic + emp.commission + emp.bonus + emp.allowance;
  const grossNoOT = emp.gross - emp.overtime;

  console.log(`${emp.name}:`);
  console.log(`  Components: Basic=${emp.basic}, Comm=${emp.commission}, Allow=${emp.allowance}, OT=${emp.overtime}, Bonus=${emp.bonus}`);
  console.log(`  Gross: ${emp.gross}`);
  console.log(`  EPF EE: ${emp.epf_ee}, EPF ER: ${emp.epf_er}`);
  console.log(`  Implied EPF base from EE (11%): ${epfBaseFromEE.toFixed(2)}`);
  console.log(`  Implied EPF base from ER (12%): ${epfBaseFromER.toFixed(2)}`);
  console.log(`  Possible bases:`);
  console.log(`    - Basic only: ${baseOnly}`);
  console.log(`    - Basic + Comm: ${baseComm}`);
  console.log(`    - Basic + Comm + Bonus: ${baseCommBonus}`);
  console.log(`    - Basic + Comm + Bonus + Allow: ${baseCommBonusAllow}`);
  console.log(`    - Gross - OT: ${grossNoOT}`);

  // Find best match
  const bases = [
    { name: 'Basic only', val: baseOnly },
    { name: 'Basic + Comm', val: baseComm },
    { name: 'Basic + Comm + Bonus', val: baseCommBonus },
    { name: 'Basic + Comm + Bonus + Allow', val: baseCommBonusAllow },
    { name: 'Gross - OT', val: grossNoOT },
    { name: 'Gross', val: emp.gross }
  ];

  let bestMatch = null;
  let minDiff = Infinity;

  for (const b of bases) {
    const calcEE = Math.round(b.val * 0.11);
    const diff = Math.abs(calcEE - emp.epf_ee);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = { ...b, calcEE, diff };
    }
  }

  console.log(`  BEST MATCH: ${bestMatch.name} = ${bestMatch.val} -> EPF EE = ${bestMatch.calcEE} (diff: ${bestMatch.diff})`);
  console.log('');
}

console.log('\n=== SOCSO/EIS ANALYSIS ===\n');
console.log('SOCSO appears to follow standard Malaysian contribution tables:');
console.log('- Max EE contribution: RM29.75 (for wages >= RM4,000)');
console.log('- Max ER contribution: RM104.15 (for wages >= RM4,000)');
console.log('- EIS max: EE RM11.90, ER RM11.90 (for wages >= RM5,000)\n');

// Check SOCSO pattern
for (const emp of imageData) {
  if (emp.socso_ee !== 29.75) {
    console.log(`${emp.name}: Gross=${emp.gross}, SOCSO_EE=${emp.socso_ee}, EIS_EE=${emp.eis_ee}`);
  }
}
