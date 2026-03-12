/**
 * Bulk update EPF numbers for AA Alive employees
 * Data extracted from KWSP Draft Form A (March 2026)
 * Employer Ref: 020345365
 */
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// EPF data from Draft Form A - [IC Number, EPF Number, Name]
const epfData = [
  ['020105140076', '25614741', 'CONNIE HUI KANG YI'],
  ['950103125674', '19602012', 'NASHRATUN NABILAH BINTI SABRI'],
  ['960213146192', '20416448', 'LEONG XIA HWEI'],
  ['950623145177', '19440748', 'MUHAMMAD ISMAIZZUL BIN ZAINI'],
  ['000101140986', '24340639', 'RAJA NUR SYAKIRAH BINTI RAJA SHURAN'],
  ['920812065670', '20650421', 'NG YEE SIAN'],
  ['870127495637', '18347793', 'MOHD SAFIAN BIN YUSIN'],
  ['871010086447', '16968813', 'MUHAMMAD NOR ALIF BIN MOHD GHAFAR'],
  ['930220126379', '22492053', 'HABER BIN ABU HASSAN'],
  ['920618126441', '61767658', 'A.R. IQZAT AL. FAYYADH B A.R. AZMI'],
  ['930429125289', '61777978', 'HAFIZ BIN ZAINAL ABIDIN'],
  ['980824145410', '21883791', 'NUR SYIFA ATHIRAH BINTI HAMDAN'],
  ['980629015100', '22043145', 'WONG SHUI QI'],
  ['911202115357', '21551617', 'LAU JIA CHENG'],
  ['910819025242', '21551614', 'EVIN LIM'],
  ['920819015254', '18608587', 'KUAH JAC SZE'],
  ['931220025652', '20515777', 'AW SUI KING'],
  ['981007016680', '21820630', 'ALIA NATASHA BINTI NORZAIN'],
  ['971018136144', '71988863', 'CHIENG SU HUNG'],
  ['001227140222', '22826139', 'LIM YEN THONG'],
  ['880310115312', '18465446', 'CALLYN KAM YEN LING'],
  ['970612125478', '22661325', 'FANNY LAU HUAN YE'],
  ['950420106020', '19400534', 'HONG GUAN LING'],
  ['010602100076', '25079250', 'RAFINA BINTI MUHAMMAD FIRDAUS RAMESH'],
  ['951013075532', '21645430', 'LIM SEOW CHI'],
  ['931124136096', '71869823', 'LAU LEH LIN'],
  ['990712145802', '21720421', 'GOH XIAO HUI'],
  ['990929086540', '21598100', 'MICHELLE CHEAN MEI TZEE'],
  ['940120125466', '19498325', 'SITTI FATIMAH BINTI PARSON'],
  ['000425020024', '22520922', 'TAN CHEE YING'],
  ['990518075564', '22284591', 'HIDAYAH BINTI MUSTAPA'],
  ['981031145562', '21403621', 'NUR AZLINA BINTI AHMAD APANDI'],
  ['990805036074', '24610647', 'PHICHITTRA A/P EH CHUM'],
  ['010927120710', '24164761', 'NUR HASLIZA BINTI ZAINAL ABIDIN'],
  ['871217025609', '16968819', 'FAKHRUL AZIZI BIN TALIB'],
  ['921221126835', '61744920', 'MD IZUWAN BIN YUSIN'],
  ['980830085928', '21386492', 'CHAI YOKE YEE'],
  ['871102065432', '17231239', 'YIP SIEW WAN'],
  ['990405146506', '21815706', 'LEE MAY LEE'],
  ['730515125561', '61581639', 'ZAINAL ABIDIN BIN ABU BAKAR'],
  ['981023435420', '21427470', 'TAN JIA YIN'],
  ['910314105378', '19165304', 'HU SHIAU YIN'],
  // SHI JINQI - no IC in PDF, EPF: 58202600 - will match by name
  ['920428145422', '19934257', 'TAN HUI YANG'],
  ['990929035321', '21915070', 'MOHAMAD SHAHZUWAN AIMAN BIN MD KHARI'],
  ['020112120831', '22268973', 'MOHAMMAD AL- ASRI ZULFADLI BIN ASLIE'],
  ['720506125667', '61222311', 'ASLIE BIN ABU BAKAR'],
  ['021223120863', '62042123', 'AR ADAM MIRZA BIN ARAZMI'],
  ['881124015582', '17125777', 'LIEW HWEE HSIA'],
  ['801207065697', '14472211', 'SALLEH BIN YAAKOB @ ALIAS'],
  ['030217140176', '24727867', 'WAN NUR NAJIHAH BINTI WAN NAWANG'],
  ['030719011374', '23816059', 'SOFEA ZULAIKHA PUTRI BINTI AHMAD REZUAN'],
  ['950305065251', '21164699', 'LIM CHUN PENG'],
  ['870519125299', '17966550', 'MAHADI BIN SAID'],
  ['840822106093', '19127848', 'MOHD SHUKRI BIN NORDIN'],
  ['030123140706', '23576376', 'ULRIKA LEE PEI HANG'],
  ['990412145990', '21719828', 'NURUL ANISHA BINTI INDRAWATY'],
  ['711030105075', '11551601', 'SHAMRI BIN DULAH'],
  ['710927105681', '11579221', 'ZAMZURI BIN ABU BAKAR'],
  ['920725035473', '19082551', 'MUHAMMAD ALIF FARHAN BIN NAZRI'],
  ['930812055367', '21403483', 'MUHAMMAD ASHRAF BIN OTHMAN'],
];

async function updateEpfNumbers() {
  const client = await pool.connect();
  try {
    console.log('Starting EPF number update for AA Alive employees...\n');

    let updated = 0;
    let notFound = [];
    let alreadySet = 0;

    await client.query('BEGIN');

    for (const [ic, epfNo, name] of epfData) {
      // Match by IC number and company_id = 1 (AA Alive)
      const result = await client.query(
        `UPDATE employees
         SET epf_number = $1, updated_at = NOW()
         WHERE ic_number = $2 AND company_id = 1
         RETURNING id, name, epf_number`,
        [epfNo, ic]
      );

      if (result.rowCount > 0) {
        console.log(`✓ Updated: ${result.rows[0].name} → EPF: ${epfNo}`);
        updated++;
      } else {
        // Try matching by removing dashes from IC
        const icNoDash = ic.replace(/-/g, '');
        const result2 = await client.query(
          `UPDATE employees
           SET epf_number = $1, updated_at = NOW()
           WHERE REPLACE(ic_number, '-', '') = $2 AND company_id = 1
           RETURNING id, name, epf_number`,
          [epfNo, icNoDash]
        );

        if (result2.rowCount > 0) {
          console.log(`✓ Updated (IC with dash): ${result2.rows[0].name} → EPF: ${epfNo}`);
          updated++;
        } else {
          notFound.push({ ic, epfNo, name });
        }
      }
    }

    // Handle SHI JINQI separately (no IC in PDF)
    const shiResult = await client.query(
      `UPDATE employees
       SET epf_number = $1, updated_at = NOW()
       WHERE UPPER(name) LIKE '%SHI JINQI%' AND company_id = 1
       RETURNING id, name, epf_number`,
      ['58202600']
    );
    if (shiResult.rowCount > 0) {
      console.log(`✓ Updated (by name): ${shiResult.rows[0].name} → EPF: 58202600`);
      updated++;
    } else {
      notFound.push({ ic: 'N/A', epfNo: '58202600', name: 'SHI JINQI' });
    }

    await client.query('COMMIT');

    console.log(`\n========== SUMMARY ==========`);
    console.log(`Total in PDF: 62 (61 unique employees)`);
    console.log(`Updated: ${updated}`);

    if (notFound.length > 0) {
      console.log(`\nNot found (${notFound.length}):`);
      notFound.forEach(e => {
        console.log(`  ✗ ${e.name} (IC: ${e.ic}, EPF: ${e.epfNo})`);
      });
    }

    // Show current state
    console.log(`\n========== CURRENT EPF STATUS ==========`);
    const allEmployees = await client.query(
      `SELECT name, ic_number, epf_number
       FROM employees
       WHERE company_id = 1 AND status = 'active'
       ORDER BY name`
    );

    let withEpf = 0;
    let withoutEpf = 0;
    allEmployees.rows.forEach(e => {
      if (e.epf_number) {
        withEpf++;
      } else {
        withoutEpf++;
        console.log(`  Missing EPF: ${e.name} (IC: ${e.ic_number})`);
      }
    });
    console.log(`\nWith EPF number: ${withEpf}`);
    console.log(`Without EPF number: ${withoutEpf}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

updateEpfNumbers();
