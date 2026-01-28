const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Exact values from the image
const imageData = [
  { name: 'LAU JIA CHENG', basic: 10000, commission: 0, allowance: 500, overtime: 0, bonus: 0, gross: 10500, epf_ee: 1100, epf_er: 1200, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 928.45, net: 8429.90, claim: 0 },
  { name: 'EVIN LIM', basic: 8750, commission: 6000, allowance: 2500, overtime: 1750, bonus: 0, gross: 19000, epf_ee: 1776, epf_er: 1628, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 2736.10, net: 14594.25, claim: 0 },
  { name: 'LEONG XIA HWEI', basic: 4300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 4300, epf_ee: 473, epf_er: 559, socso_ee: 21.25, socso_er: 74.35, eis_ee: 8.50, eis_er: 8.50, pcb: 67.85, net: 3729.40, claim: 44.45 },
  { name: 'MICHELLE CHEAN MEI TZEE', basic: 4100, commission: 8878, allowance: 0, overtime: 0, bonus: 4000, gross: 16978, epf_ee: 1870, epf_er: 2040, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 828.50, net: 14237.85, claim: 51.05 },
  { name: 'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH', basic: 0, commission: 25170, allowance: 0, overtime: 0, bonus: 1000, gross: 26170, epf_ee: 2879, epf_er: 3141, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0, net: 23249.35, claim: 8191.23 },
  { name: 'HIDAYAH BINTI MUSTAPA', basic: 0, commission: 10227, allowance: 0, overtime: 0, bonus: 0, gross: 10227, epf_ee: 1133, epf_er: 1236, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0, net: 9052.35, claim: 273.43 },
  { name: 'RAJA NUR SYAKIRAH BINTI RAJA SHURAN', basic: 0, commission: 14378, allowance: 0, overtime: 0, bonus: 0, gross: 14378, epf_ee: 1584, epf_er: 1728, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0, net: 12752.35, claim: 526.50 },
  { name: 'NUR SYIFA ATHIRAH BINTI HAMDAN', basic: 4000, commission: 0, allowance: 200, overtime: 0, bonus: 3000, gross: 7200, epf_ee: 770, epf_er: 840, socso_ee: 19.75, socso_er: 69.15, eis_ee: 7.90, eis_er: 7.90, pcb: 595.85, net: 5806.50, claim: 0 },
  { name: 'NUR AZLINA BINTI AHMAD APANDI', basic: 3300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3300, epf_ee: 363, epf_er: 429, socso_ee: 16.25, socso_er: 56.85, eis_ee: 6.50, eis_er: 6.50, pcb: 0, net: 2914.25, claim: 0 },
  { name: 'SITI FATIMAH BINTI PARSON', basic: 2600, commission: 0, allowance: 500, overtime: 87.5, bonus: 1000, gross: 4187.50, epf_ee: 396, epf_er: 468, socso_ee: 12.75, socso_er: 44.65, eis_ee: 5.10, eis_er: 5.10, pcb: 0, net: 3773.65, claim: 0 },
  { name: 'NUR HASLIZA ZAINAL ABIDIN', basic: 1800, commission: 0, allowance: 200, overtime: 0, bonus: 300, gross: 2300, epf_ee: 231, epf_er: 273, socso_ee: 8.75, socso_er: 30.65, eis_ee: 3.50, eis_er: 3.50, pcb: 0, net: 2056.75, claim: 0 },
  { name: 'ALIA NATASHA BINTI NORZAIN', basic: 5000, commission: 0, allowance: 950, overtime: 600, bonus: 1000, gross: 7550, epf_ee: 770, epf_er: 840, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 262.85, net: 6475.50, claim: 0 },
  { name: 'TAN HUI YANG', basic: 0, commission: 14277, allowance: 0, overtime: 0, bonus: 0, gross: 14277, epf_ee: 1573, epf_er: 1716, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0, net: 12662.35, claim: 0 },
  { name: 'NASHRATUN NABILAH BINTI SABRI', basic: 0, commission: 17114, allowance: 0, overtime: 0, bonus: 0, gross: 17114, epf_ee: 1892, epf_er: 2064, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0, net: 15180.35, claim: 516.62 },
  { name: 'CONNIE HUI KANG YI', basic: 4700, commission: 1700, allowance: 0, overtime: 0, bonus: 0, gross: 6400, epf_ee: 704, epf_er: 768, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 194.00, net: 5460.35, claim: 27.60 },
  { name: 'WAN NUR NAJIHAH', basic: 3800, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3800, epf_ee: 418, epf_er: 494, socso_ee: 18.75, socso_er: 65.65, eis_ee: 7.50, eis_er: 7.50, pcb: 0, net: 3355.75, claim: 0 },
  { name: 'SOFEA ZULAIKHA', basic: 0, commission: 8749, allowance: 0, overtime: 0, bonus: 0, gross: 8749, epf_ee: 968, epf_er: 1056, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, pcb: 0, net: 7739.35, claim: 0 },
  { name: 'CHUN PENG', basic: 3500, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3500, epf_ee: 385, epf_er: 455, socso_ee: 17.25, socso_er: 60.85, eis_ee: 6.90, eis_er: 6.90, pcb: 0, net: 3090.85, claim: 0 },
  { name: 'ULRIKA LEE PEI HANG', basic: 3096.77, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3096.77, epf_ee: 341, epf_er: 403, socso_ee: 15.25, socso_er: 53.35, eis_ee: 6.10, eis_er: 6.10, pcb: 0, net: 2734.42, claim: 0 },
  { name: 'NURUL ANISHA BINTI INDRAWATY', basic: 1341.94, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1341.94, epf_ee: 150, epf_er: 177, socso_ee: 6.75, socso_er: 23.65, eis_ee: 2.70, eis_er: 2.70, pcb: 0, net: 1182.49, claim: 0 },
  { name: 'LAU YU JUN', basic: 1383.87, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1383.87, epf_ee: 154, epf_er: 182, socso_ee: 6.75, socso_er: 23.65, eis_ee: 2.70, eis_er: 2.70, pcb: 0, net: 1220.42, claim: 30 }
];

async function run() {
  console.log('=== Fixing Payroll to Match Image ===\n');

  // Get all payroll items for AA Alive Jan 2026
  const items = await pool.query(`
    SELECT pi.id, e.name as employee_name
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pr.company_id = 1 AND pr.month = 1 AND pr.year = 2026
    ORDER BY e.name
  `);

  let updated = 0;

  for (const img of imageData) {
    const imgNameParts = img.name.toUpperCase().split(' ').filter(p => p.length > 2);

    const dbItem = items.rows.find(row => {
      const dbNameUpper = row.employee_name.toUpperCase();
      let matchCount = 0;
      for (const part of imgNameParts) {
        if (dbNameUpper.includes(part)) matchCount++;
      }
      return matchCount >= 2 || (imgNameParts.length === 1 && dbNameUpper.includes(imgNameParts[0]));
    });

    if (dbItem) {
      await pool.query(`
        UPDATE payroll_items SET
          basic_salary = $1,
          commission_amount = $2,
          fixed_allowance = $3,
          ot_amount = $4,
          bonus = $5,
          gross_salary = $6,
          epf_employee = $7,
          epf_employer = $8,
          socso_employee = $9,
          socso_employer = $10,
          eis_employee = $11,
          eis_employer = $12,
          pcb = $13,
          net_pay = $14,
          claims_amount = $15
        WHERE id = $16
      `, [
        img.basic, img.commission, img.allowance, img.overtime, img.bonus,
        img.gross, img.epf_ee, img.epf_er, img.socso_ee, img.socso_er,
        img.eis_ee, img.eis_er, img.pcb, img.net, img.claim, dbItem.id
      ]);
      console.log(`Updated: ${dbItem.employee_name}`);
      updated++;
    }
  }

  console.log(`\nTotal updated: ${updated}`);
  console.log('\nDone!');
  pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  pool.end();
});
