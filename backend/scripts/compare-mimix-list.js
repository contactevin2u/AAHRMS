const pool = require('../db');

async function compareList() {
  // User's expected data
  const expectedOutlets = {
    'Mimix A - Subang Perdana': {
      manager: { name: 'MUHAMMAD TAUFIQ SAIFULLAH', ic: '931003146247' },
      supervisors: [
        { name: 'ANIS NATASHA BINTI SATIMAN', ic: null },
        { name: 'NIK NUR AIN SYAHIRAH BT NIK MAT HUSSAIN', ic: null }
      ],
      fullTimers: [
        { name: 'NABILA ADRIANA BINTI MUHAMAD AZLEN', ic: '051101100626', note: 'RESIGN 29/1' },
        { name: 'ALLYCIA LYRICA ANAK STEPHEN', ic: '050225130822', note: 'RESIGN 30/1' },
        { name: 'FEORNIE ASHIRA RUHIMIN', ic: '020916120976' },
        { name: 'NURSYAMSHAFIQAH BINTI NAZRAN', ic: '950407016530' },
        { name: 'PRISSILVIA DUSIL', ic: '061023121438' },
        { name: 'DEA AGUSTINA', ic: 'X5922551' }
      ],
      partTimers: [
        { name: 'NUR FARAH HANIS BINTI MURLIYADY', ic: '080401101092' },
        { name: 'NORHAZIRAH BINTI HAIRI', ic: '080301140844' },
        { name: 'AIDIL HAKIM BIN FARID KAMIL', ic: '081005080263' },
        { name: 'MUHAMMAD SAIFF FAIRUZ BIN MD ISA', ic: '080609101825' }
      ]
    },
    'Kopi Antarabangsa - Aicha': {
      supervisors: [{ name: 'NUR SUHAILAH BINTI SUELMI', ic: '060727100454' }],
      fullTimers: [
        { name: 'NOR FARINA BINTI RUSMAN', ic: '000323101130' },
        { name: 'INTAN NUR SHAZUWIN BINTI MISWAN', ic: '061227101586' },
        { name: 'NURDINI HAZIYAH BINTI ZULKIFLI', ic: '010614141254' },
        { name: 'NOR EZLYNA BINTI WAFI', ic: '050709100910' }
      ],
      partTimers: []
    },
    'Langkah BTR - Bandar Tun Razak': {
      supervisors: [{ name: 'AMEER ISKANDAR BIN MAZLAN', ic: '000807141219' }],
      fullTimers: [
        { name: 'YANG ANTAH AFIQAH BINTI MOHD KAMARULZAMAN', ic: '041011140916' },
        { name: 'ADAM MIKHAEL RIDUWN BIN RIDUWAN', ic: '060716140143' }
      ],
      partTimers: [
        { name: 'MUHAMMAD ROZAIMIE BIN NOR ZAHID', ic: '080329081065' },
        { name: 'NOR SUMAYYAH BINTI AZIM', ic: '081105140200' },
        { name: 'NUR ADILA NATASYA BINTI AHMAD FAIZAL', ic: '050201101234' }
      ]
    },
    'Langkah MSB - Taman Paramount': {
      supervisors: [{ name: 'NUR JANNAH HAFIDHAH BINTI ABDULLAH', ic: '950727126376' }],
      fullTimers: [
        { name: 'NURJANNAH SHADRINNA BINTI ABDULLAH', ic: '960530105108' },
        { name: 'JUJU JUARSIH', ic: 'E7282699' },
        { name: 'NAZRIE BIN SAIREH', ic: '020520121075' }
      ],
      partTimers: [
        { name: 'MUHAMAD AFIQ BIN ANUAR', ic: '040421140287' },
        { name: 'MUTIARA RAMADINI', ic: 'E8321908' },
        { name: 'IKA SARIANA', ic: 'E3042955' }
      ]
    },
    'Langkah SLS - Puchong Utama': {
      supervisors: [
        { name: 'NUR NADIATUN NAJIHAH JUMAAT BINTI ABDUL RAHMAN', ic: '040707101240' },
        { name: 'MUHAMMAD AMMAR NAFIZ BIN KAMAL ARIFFIN', ic: '040913080567' }
      ],
      fullTimers: [
        { name: 'NUR KHADIJAH CAMELIA BINTI ABDUL HASHIM', ic: '040904141356' },
        { name: 'ADRIANA NATASYA BINTI RUSDI', ic: '060531101420' },
        { name: 'WAN ADAM HARITH BIN WAN ISMAILE ANIS', ic: '050210140331' },
        { name: 'SITI NUR IZWANI BINTI RIZWAN', ic: '081029102658' }
      ],
      partTimers: [
        { name: 'NUR NILAM SARI BINTI ABDUL AZIZ', ic: '050706140044' },
        { name: 'MUHAMMAD ZAMIR BIN MOHD ZAIDI', ic: '040318100025' }
      ]
    },
    'Marina Charisma - PJ New Town': {
      manager: { name: 'MUHAMMAD FAKHRULLAH BIN MOHD ZABIDI', ic: '020203090113' },
      fullTimers: [
        { name: 'RAHMAT JUMARI DAUD BIN ABDULLAH', ic: '021115131151' },
        { name: 'SUKMAH LUIS @ JEFRUS', ic: '010821121010' },
        { name: 'AYU NABILA BINTI AZMI', ic: '040723060602' },
        { name: 'NUR DIANA SYANADIA BINTI NOR EFFENDI', ic: '050413140622' },
        { name: 'AMMAR ASHRAF BIN SUHAIMI ARWAN', ic: '060925140131' }
      ],
      partTimers: [
        { name: 'SITI NUR FATIMAH AZ-ZAHRAH BT MOHD ZAINI', ic: '001212050670' },
        { name: 'MUHAMMAD ADAM FIRDAUS BIN MOHD SUKRI', ic: '040820101365' },
        { name: 'LIYA HUMAIRAH BINTI JOHARI', ic: '050707140636' }
      ]
    },
    'Langkah ATS - Sri Jati': {
      manager: { name: 'RANISAH IJES', ic: '010527121124' },
      fullTimers: [
        { name: 'NURUL FIRDAUS', ic: '030102141427' },
        { name: 'SHAREFFA SYAHFIQAH', ic: '060827120866' },
        { name: 'ATIQAH NAJMI BINTI ZAHARUDIN', ic: '080909040278' },
        { name: 'NUR FARISYA ZULAIKHA BINTI ZAHRIZAN', ic: '081119140834' }
      ],
      partTimers: [
        { name: 'INTAN NURISYAH', ic: '070115011628' },
        { name: 'NOR AIN HAWANIS', ic: '070714070136' },
        { name: 'AZ-NUR AMIRAH BINTI AZAHAR', ic: '010212100812' }
      ]
    },
    'Miksu Boba - Wangsa Melawati': {
      manager: { name: 'ALI AZHARI BIN AZMI', ic: '971113435249' },
      supervisors: [{ name: 'MUHAMMAD DANIAL BIN SUKOR', ic: '000505040113' }],
      fullTimers: [
        { name: 'MUHAMMAD DANIAL BIN HANIDAN', ic: '980405146187' },
        { name: 'MUHAMMAD IMAN MIKHAIL NOR NORSIDAN', ic: '060515141107' },
        { name: 'ADAM BIN DAUD', ic: '000414140055' },
        { name: 'NURUL JANNAH BINTI MOHD AZMI', ic: '050511141506' },
        { name: 'ADNAN MUZHAFFAR SHAH BIN MOHD TAMRIN', ic: '080611101111' }
      ],
      partTimers: [
        { name: 'ATHIRAH NABILAH BINTI AZMI SHAH', ic: '050217141580' },
        { name: 'IAN HARIS BIN NOEL HARRIS', ic: '080503101157' },
        { name: 'NUR NAJIHAH BINTI MOHD HAZRI', ic: '001016070770' },
        { name: 'NUR QISSTYNA NAJLA BINTI MOHD ZULKFLEE', ic: '080622030646' },
        { name: 'NUR NIESHA SHAIRA BINTI ABDULLAH', ic: '970818145298' }
      ]
    },
    'Langkah SLD - Mixue Putrajaya (665)': {
      supervisors: [{ name: 'LUSIAH LITOH KYREN LAMBERTUS', ic: '991109125430' }],
      fullTimers: [
        { name: 'AHMAD HARITH IZWAN BIN AHMAD FATHERI', ic: '060617160069' },
        { name: 'MUHAMMAD ZARIF BIN RAHIMI', ic: '080703101717' },
        { name: 'IMMAN BIN MOHD SOFIAN', ic: '081205121269' },
        { name: 'MUHAMMAD HAZIM HAFIZI BIN KHAIRANI', ic: '061207160159' },
        { name: 'IZZ AMMAR BIN ANWARFAKHRI', ic: '081228160033' },
        { name: 'PUTRI BATRISYIA QAISARAH BINTI AHMAD DALDIRI', ic: '081010100206' },
        { name: 'MUHAMAD DANIAL AMSYAR BIN IHSAN', ic: '050302100089' }
      ],
      partTimers: [
        { name: 'NOORAYUNI BINTI ABD SHUKOR', ic: '050905020010' },
        { name: 'NUR DARWISYAH SAFI BINTI ZAIDI', ic: '051231160088' },
        { name: 'NURUL SYAIDATUL AMIRA BINTI KAMARULZAMAN', ic: '010120050280' },
        { name: 'SYED AZHAD FATHI WAFA BIN SYED ASRAF FAHLAWI WAFA', ic: '070201160021' },
        { name: 'PATRICIA AYU ANAK HASIN', ic: '031120101554' },
        { name: 'NUR ANIQAH QISTINA BINTI EDDY HERMAN', ic: '070120101038' },
        { name: 'NURUL HIDAYAH BINTI MUHAMMAD ZAMANHURI', ic: '071024101462' },
        { name: 'SHARIFAH NURSYAMIMI AINA BINTI SYED NORAHIMI', ic: '040527160040' }
      ]
    }
  };

  // Get all employees from DB
  const dbResult = await pool.query(`
    SELECT e.id, e.employee_id, e.name,
           REPLACE(e.ic_number, '-', '') as ic_number,
           e.employee_role, e.work_type, e.status,
           o.name as outlet_name
    FROM employees e
    LEFT JOIN outlets o ON e.outlet_id = o.id
    WHERE e.company_id = 3 AND e.status = 'active'
  `);

  const dbEmployees = dbResult.rows;
  const issues = [];

  console.log('====================================================');
  console.log('       MIMIX EMPLOYEE VERIFICATION REPORT          ');
  console.log('====================================================\n');

  for (const [outletName, expected] of Object.entries(expectedOutlets)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`OUTLET: ${outletName}`);
    console.log('='.repeat(60));

    // Check Manager
    if (expected.manager) {
      const dbMatch = dbEmployees.find(e =>
        e.ic_number === expected.manager.ic ||
        e.name.toUpperCase().includes(expected.manager.name.split(' ')[0].toUpperCase())
      );

      if (!dbMatch) {
        console.log(`\n❌ MANAGER MISSING: ${expected.manager.name} (${expected.manager.ic})`);
        issues.push({ outlet: outletName, type: 'MISSING', role: 'manager', name: expected.manager.name });
      } else if (dbMatch.outlet_name !== outletName) {
        console.log(`\n⚠️  MANAGER WRONG OUTLET: ${expected.manager.name}`);
        console.log(`   Expected: ${outletName}`);
        console.log(`   Actual: ${dbMatch.outlet_name || 'NO OUTLET'}`);
        issues.push({ outlet: outletName, type: 'WRONG_OUTLET', role: 'manager', name: expected.manager.name, actual_outlet: dbMatch.outlet_name });
      } else if (dbMatch.employee_role !== 'manager') {
        console.log(`\n⚠️  MANAGER WRONG ROLE: ${expected.manager.name}`);
        console.log(`   Expected: manager, Actual: ${dbMatch.employee_role || 'staff'}`);
        issues.push({ outlet: outletName, type: 'WRONG_ROLE', name: expected.manager.name, expected: 'manager', actual: dbMatch.employee_role });
      } else {
        console.log(`\n✅ MANAGER: ${dbMatch.name}`);
      }
    }

    // Check Supervisors
    if (expected.supervisors) {
      console.log('\n--- SUPERVISORS ---');
      for (const sup of expected.supervisors) {
        const dbMatch = dbEmployees.find(e =>
          (sup.ic && e.ic_number === sup.ic) ||
          e.name.toUpperCase().includes(sup.name.split(' ')[0].toUpperCase())
        );

        if (!dbMatch) {
          console.log(`❌ MISSING: ${sup.name}`);
          issues.push({ outlet: outletName, type: 'MISSING', role: 'supervisor', name: sup.name });
        } else if (dbMatch.outlet_name !== outletName) {
          console.log(`⚠️  WRONG OUTLET: ${sup.name} -> ${dbMatch.outlet_name || 'NO OUTLET'}`);
          issues.push({ outlet: outletName, type: 'WRONG_OUTLET', role: 'supervisor', name: sup.name });
        } else if (dbMatch.employee_role !== 'supervisor') {
          console.log(`⚠️  WRONG ROLE: ${sup.name} (${dbMatch.employee_role || 'staff'} instead of supervisor)`);
          issues.push({ outlet: outletName, type: 'WRONG_ROLE', name: sup.name, expected: 'supervisor', actual: dbMatch.employee_role });
        } else {
          console.log(`✅ ${dbMatch.name}`);
        }
      }
    }

    // Check Full-Timers
    if (expected.fullTimers && expected.fullTimers.length > 0) {
      console.log('\n--- FULL-TIMERS ---');
      for (const ft of expected.fullTimers) {
        const dbMatch = dbEmployees.find(e =>
          (ft.ic && e.ic_number === ft.ic) ||
          e.name.toUpperCase().includes(ft.name.split(' ')[0].toUpperCase())
        );

        if (!dbMatch) {
          console.log(`❌ MISSING: ${ft.name} (${ft.ic})`);
          issues.push({ outlet: outletName, type: 'MISSING', role: 'full_time', name: ft.name });
        } else if (dbMatch.outlet_name !== outletName) {
          console.log(`⚠️  WRONG OUTLET: ${ft.name} -> ${dbMatch.outlet_name || 'NO OUTLET'}`);
          issues.push({ outlet: outletName, type: 'WRONG_OUTLET', name: ft.name });
        } else {
          let status = '✅';
          let note = '';
          if (dbMatch.work_type !== 'full_time') {
            status = '⚠️ ';
            note = ` [DB: ${dbMatch.work_type}]`;
            issues.push({ outlet: outletName, type: 'WRONG_WORK_TYPE', name: ft.name, expected: 'full_time', actual: dbMatch.work_type });
          }
          console.log(`${status} ${dbMatch.name}${note}${ft.note ? ' ** ' + ft.note + ' **' : ''}`);
        }
      }
    }

    // Check Part-Timers
    if (expected.partTimers && expected.partTimers.length > 0) {
      console.log('\n--- PART-TIMERS ---');
      for (const pt of expected.partTimers) {
        const dbMatch = dbEmployees.find(e =>
          (pt.ic && e.ic_number === pt.ic) ||
          e.name.toUpperCase().includes(pt.name.split(' ')[0].toUpperCase())
        );

        if (!dbMatch) {
          console.log(`❌ MISSING: ${pt.name} (${pt.ic})`);
          issues.push({ outlet: outletName, type: 'MISSING', role: 'part_time', name: pt.name, ic: pt.ic });
        } else if (dbMatch.outlet_name !== outletName) {
          console.log(`⚠️  WRONG OUTLET: ${pt.name} -> ${dbMatch.outlet_name || 'NO OUTLET'}`);
          issues.push({ outlet: outletName, type: 'WRONG_OUTLET', name: pt.name });
        } else {
          let status = '✅';
          let note = '';
          if (dbMatch.work_type !== 'part_time') {
            status = '⚠️ ';
            note = ` [DB: ${dbMatch.work_type || 'full_time'}]`;
            issues.push({ outlet: outletName, type: 'WRONG_WORK_TYPE', name: pt.name, expected: 'part_time', actual: dbMatch.work_type || 'full_time' });
          }
          console.log(`${status} ${dbMatch.name}${note}`);
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('                    SUMMARY OF ISSUES');
  console.log('='.repeat(60));

  const missing = issues.filter(i => i.type === 'MISSING');
  const wrongOutlet = issues.filter(i => i.type === 'WRONG_OUTLET');
  const wrongRole = issues.filter(i => i.type === 'WRONG_ROLE');
  const wrongWorkType = issues.filter(i => i.type === 'WRONG_WORK_TYPE');

  console.log(`\n❌ MISSING EMPLOYEES: ${missing.length}`);
  missing.forEach(i => console.log(`   - ${i.name} (${i.outlet})`));

  console.log(`\n⚠️  WRONG OUTLET: ${wrongOutlet.length}`);
  wrongOutlet.forEach(i => console.log(`   - ${i.name} should be in ${i.outlet}`));

  console.log(`\n⚠️  WRONG ROLE: ${wrongRole.length}`);
  wrongRole.forEach(i => console.log(`   - ${i.name}: should be ${i.expected}, is ${i.actual || 'staff'}`));

  console.log(`\n⚠️  WRONG WORK TYPE: ${wrongWorkType.length}`);
  wrongWorkType.forEach(i => console.log(`   - ${i.name}: should be ${i.expected}, is ${i.actual}`));

  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL ISSUES: ${issues.length}`);
  console.log('='.repeat(60));

  process.exit(0);
}

compareList().catch(e => { console.error(e); process.exit(1); });
