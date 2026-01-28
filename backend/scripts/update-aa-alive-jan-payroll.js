const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Target payroll data from the image
const imageData = [
  { name: 'LAU JIA CHENG', basic: 10000, commission: 0, allowance: 500, overtime: 0, bonus: 0, gross: 10500, epf_ee: 1100, epf_er: 1200, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 928.45, net: 8429.90, claim: 0 },
  { name: 'EVIN LIM', basic: 8750, commission: 6000, allowance: 2500, overtime: 1750, bonus: 0, gross: 19000, epf_ee: 1776, epf_er: 1628, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 2736.10, net: 14594.25, claim: 0 },
  { name: 'LEONG XIA HWEI', basic: 4300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 4300, epf_ee: 473, epf_er: 559, socso_ee: 21.25, socso_er: 74.35, eis_ee: 8.50, eis_er: 8.50, perkeso: 29.75, pcb: 67.85, net: 3729.40, claim: 44.45 },
  { name: 'MICHELLE CHEAN MEI TZEE', basic: 4100, commission: 8878, allowance: 0, overtime: 0, bonus: 4000, gross: 16978, epf_ee: 1870, epf_er: 2040, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 828.50, net: 14237.85, claim: 51.05 },
  { name: 'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH', basic: 0, commission: 25170, allowance: 0, overtime: 0, bonus: 1000, gross: 26170, epf_ee: 2879, epf_er: 3141, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 0, net: 23249.35, claim: 8191.23 },
  { name: 'HIDAYAH BINTI MUSTAPA', basic: 0, commission: 10227, allowance: 0, overtime: 0, bonus: 0, gross: 10227, epf_ee: 1133, epf_er: 1236, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 0, net: 9052.35, claim: 273.43 },
  { name: 'RAJA NUR SYAKIRAH BINTI RAJA SHURAN', basic: 0, commission: 14378, allowance: 0, overtime: 0, bonus: 0, gross: 14378, epf_ee: 1584, epf_er: 1728, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 0, net: 12752.35, claim: 526.50 },
  { name: 'NUR SYIFA ATHIRAH BINTI HAMDAN', basic: 4000, commission: 0, allowance: 200, overtime: 0, bonus: 3000, gross: 7200, epf_ee: 770, epf_er: 840, socso_ee: 19.75, socso_er: 69.15, eis_ee: 7.90, eis_er: 7.90, perkeso: 27.65, pcb: 595.85, net: 5806.50, claim: 0 },
  { name: 'NUR AZLINA', basic: 3300, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3300, epf_ee: 363, epf_er: 429, socso_ee: 16.25, socso_er: 56.85, eis_ee: 6.50, eis_er: 6.50, perkeso: 22.75, pcb: 0, net: 2914.25, claim: 0 },
  { name: 'SITI FATIMAH BINTI PARSON', basic: 2600, commission: 0, allowance: 500, overtime: 87.5, bonus: 1000, gross: 4187.50, epf_ee: 396, epf_er: 468, socso_ee: 12.75, socso_er: 44.65, eis_ee: 5.10, eis_er: 5.10, perkeso: 17.85, pcb: 0, net: 3773.65, claim: 0 },
  { name: 'NUR HASLIZA ZAINAL ABIDIN', basic: 1800, commission: 0, allowance: 200, overtime: 0, bonus: 300, gross: 2300, epf_ee: 231, epf_er: 273, socso_ee: 8.75, socso_er: 30.65, eis_ee: 3.50, eis_er: 3.50, perkeso: 12.25, pcb: 0, net: 2056.75, claim: 0 },
  { name: 'ALIA NATASHA BINTI NORZAIN', basic: 5000, commission: 0, allowance: 950, overtime: 600, bonus: 1000, gross: 7550, epf_ee: 770, epf_er: 840, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 262.85, net: 6475.50, claim: 0 },
  { name: 'TAN HUI YANG', basic: 0, commission: 14277, allowance: 0, overtime: 0, bonus: 0, gross: 14277, epf_ee: 1573, epf_er: 1716, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 0, net: 12662.35, claim: 0 },
  { name: 'NASHRATUN NABILAH BINTI SABRI', basic: 0, commission: 17114, allowance: 0, overtime: 0, bonus: 0, gross: 17114, epf_ee: 1892, epf_er: 2064, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 0, net: 15180.35, claim: 516.62 },
  { name: 'CONNIE HUI KANG YI', basic: 4700, commission: 1700, allowance: 0, overtime: 0, bonus: 0, gross: 6400, epf_ee: 704, epf_er: 768, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 194.00, net: 5460.35, claim: 27.60 },
  { name: 'WAN NUR NAJIHAH', basic: 3800, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3800, epf_ee: 418, epf_er: 494, socso_ee: 18.75, socso_er: 65.65, eis_ee: 7.50, eis_er: 7.50, perkeso: 26.25, pcb: 0, net: 3355.75, claim: 0 },
  { name: 'SOFEA ZULAIKHA', basic: 0, commission: 8749, allowance: 0, overtime: 0, bonus: 0, gross: 8749, epf_ee: 968, epf_er: 1056, socso_ee: 29.75, socso_er: 104.15, eis_ee: 11.90, eis_er: 11.90, perkeso: 41.65, pcb: 0, net: 7739.35, claim: 0 },
  { name: 'CHUN PENG', basic: 3500, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3500, epf_ee: 385, epf_er: 455, socso_ee: 17.25, socso_er: 60.85, eis_ee: 6.90, eis_er: 6.90, perkeso: 24.15, pcb: 0, net: 3090.85, claim: 0 },
  { name: 'ULRIKA LEE PEI HANG', basic: 3096.77, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 3096.77, epf_ee: 341, epf_er: 403, socso_ee: 15.25, socso_er: 53.35, eis_ee: 6.10, eis_er: 6.10, perkeso: 21.35, pcb: 0, net: 2734.42, claim: 0 },
  { name: 'NURUL ANISHA BINTI INDRAWATY', basic: 1341.94, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1341.94, epf_ee: 150, epf_er: 177, socso_ee: 6.75, socso_er: 23.65, eis_ee: 2.70, eis_er: 2.70, perkeso: 9.45, pcb: 0, net: 1182.49, claim: 0 },
  { name: 'LAU YU JUN', basic: 1383.87, commission: 0, allowance: 0, overtime: 0, bonus: 0, gross: 1383.87, epf_ee: 154, epf_er: 182, socso_ee: 6.75, socso_er: 23.65, eis_ee: 2.70, eis_er: 2.70, perkeso: 9.45, pcb: 0, net: 1220.42, claim: 30 }
];

async function run() {
  try {
    // Get all payroll items for AA Alive Jan 2026
    const items = await pool.query(`
      SELECT pi.id, e.name as employee_name, pi.*
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = 1 AND pr.month = 1 AND pr.year = 2026
      ORDER BY e.name
    `);

    console.log('Total items in DB:', items.rows.length);
    console.log('Matching and updating records...\n');

    const differences = [];

    for (const img of imageData) {
      // Find matching employee in database by checking if names contain each other's key parts
      const imgNameParts = img.name.toUpperCase().split(' ').filter(p => p.length > 2);

      const dbItem = items.rows.find(row => {
        const dbNameUpper = row.employee_name.toUpperCase();
        // Check if at least 2 significant parts match
        let matchCount = 0;
        for (const part of imgNameParts) {
          if (dbNameUpper.includes(part)) matchCount++;
        }
        return matchCount >= 2 || (imgNameParts.length === 1 && dbNameUpper.includes(imgNameParts[0]));
      });

      if (dbItem) {
        console.log(`Match: "${dbItem.employee_name}" -> "${img.name}"`);

        // Record differences
        const diff = { name: dbItem.employee_name, changes: [] };

        if (parseFloat(dbItem.basic_salary) !== img.basic) diff.changes.push(`basic: ${dbItem.basic_salary} -> ${img.basic}`);
        if (parseFloat(dbItem.commission_amount || 0) !== img.commission) diff.changes.push(`commission: ${dbItem.commission_amount || 0} -> ${img.commission}`);
        if (parseFloat(dbItem.fixed_allowance || 0) !== img.allowance) diff.changes.push(`allowance: ${dbItem.fixed_allowance || 0} -> ${img.allowance}`);
        if (parseFloat(dbItem.ot_amount || 0) !== img.overtime) diff.changes.push(`overtime: ${dbItem.ot_amount || 0} -> ${img.overtime}`);
        if (parseFloat(dbItem.bonus || 0) !== img.bonus) diff.changes.push(`bonus: ${dbItem.bonus || 0} -> ${img.bonus}`);
        if (parseFloat(dbItem.gross_salary) !== img.gross) diff.changes.push(`gross: ${dbItem.gross_salary} -> ${img.gross}`);
        if (parseFloat(dbItem.epf_employee) !== img.epf_ee) diff.changes.push(`epf_ee: ${dbItem.epf_employee} -> ${img.epf_ee}`);
        if (parseFloat(dbItem.epf_employer) !== img.epf_er) diff.changes.push(`epf_er: ${dbItem.epf_employer} -> ${img.epf_er}`);
        if (parseFloat(dbItem.socso_employee) !== img.socso_ee) diff.changes.push(`socso_ee: ${dbItem.socso_employee} -> ${img.socso_ee}`);
        if (parseFloat(dbItem.socso_employer) !== img.socso_er) diff.changes.push(`socso_er: ${dbItem.socso_employer} -> ${img.socso_er}`);
        if (parseFloat(dbItem.eis_employee) !== img.eis_ee) diff.changes.push(`eis_ee: ${dbItem.eis_employee} -> ${img.eis_ee}`);
        if (parseFloat(dbItem.eis_employer) !== img.eis_er) diff.changes.push(`eis_er: ${dbItem.eis_employer} -> ${img.eis_er}`);
        if (parseFloat(dbItem.pcb || 0) !== img.pcb) diff.changes.push(`pcb: ${dbItem.pcb || 0} -> ${img.pcb}`);
        if (parseFloat(dbItem.net_pay) !== img.net) diff.changes.push(`net: ${dbItem.net_pay} -> ${img.net}`);
        if (parseFloat(dbItem.claims_amount || 0) !== img.claim) diff.changes.push(`claim: ${dbItem.claims_amount || 0} -> ${img.claim}`);

        if (diff.changes.length > 0) {
          differences.push(diff);
        }

        // Update the record
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

        console.log(`  Updated ID ${dbItem.id}`);
      } else {
        console.log(`NO MATCH for: "${img.name}"`);
      }
    }

    console.log('\n========================================');
    console.log('DIFFERENCES (Before vs After):');
    console.log('========================================\n');

    for (const diff of differences) {
      console.log(`${diff.name}:`);
      for (const change of diff.changes) {
        console.log(`  - ${change}`);
      }
      console.log('');
    }

    console.log('Updates complete!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    pool.end();
  }
}

run();
