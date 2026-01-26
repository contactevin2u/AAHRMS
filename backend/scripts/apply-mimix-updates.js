const pool = require('../db');

async function applyUpdates() {
  // Expected assignments based on user's verified list (IC -> expected outlet/role/work_type)
  const expectedAssignments = {
    // Subang Perdana (ID 1)
    '931003146247': { outlet_id: 1, outlet: 'Subang Perdana', role: 'manager' },
    '051127100376': { outlet_id: 1, outlet: 'Subang Perdana', role: 'supervisor' },
    '971102295172': { outlet_id: 1, outlet: 'Subang Perdana', role: 'supervisor' },
    '051101100626': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'full_time' },
    '050225130822': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'full_time' },
    '020916120976': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'full_time' },
    '950407016530': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'full_time' },
    '061023121438': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'full_time' },
    'X5922551': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'full_time' },
    '080401101092': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'part_time' },
    '080301140844': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'part_time' },
    '081005080263': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'part_time' },
    '080609101825': { outlet_id: 1, outlet: 'Subang Perdana', work_type: 'part_time' },

    // Aicha Kuang (ID 10)
    '060727100454': { outlet_id: 10, outlet: 'Aicha Kuang', role: 'supervisor' },
    '000323101130': { outlet_id: 10, outlet: 'Aicha Kuang', work_type: 'full_time' },
    '061227101586': { outlet_id: 10, outlet: 'Aicha Kuang', work_type: 'full_time' },
    '010614141254': { outlet_id: 10, outlet: 'Aicha Kuang', work_type: 'full_time' },
    '050709100910': { outlet_id: 10, outlet: 'Aicha Kuang', work_type: 'full_time' },

    // Bandar Tun Razak (ID 5)
    '000807141219': { outlet_id: 5, outlet: 'Bandar Tun Razak', role: 'supervisor' },
    '041011140916': { outlet_id: 5, outlet: 'Bandar Tun Razak', work_type: 'full_time' },
    '060716140143': { outlet_id: 5, outlet: 'Bandar Tun Razak', work_type: 'full_time' },
    '080329081065': { outlet_id: 5, outlet: 'Bandar Tun Razak', work_type: 'part_time' },
    '081105140200': { outlet_id: 5, outlet: 'Bandar Tun Razak', work_type: 'part_time' },
    '050201101234': { outlet_id: 5, outlet: 'Bandar Tun Razak', work_type: 'part_time' },

    // Taman Paramount (ID 9)
    '950727126376': { outlet_id: 9, outlet: 'Taman Paramount', role: 'supervisor' },
    '960530105108': { outlet_id: 9, outlet: 'Taman Paramount', work_type: 'full_time' },
    'E7282699': { outlet_id: 9, outlet: 'Taman Paramount', work_type: 'full_time' },
    '020520121075': { outlet_id: 9, outlet: 'Taman Paramount', work_type: 'full_time' },
    '040421140287': { outlet_id: 9, outlet: 'Taman Paramount', work_type: 'part_time' },
    'E8321908': { outlet_id: 9, outlet: 'Taman Paramount', work_type: 'part_time' },
    'E3042955': { outlet_id: 9, outlet: 'Taman Paramount', work_type: 'part_time' },

    // Puchong Utama (ID 7)
    '040707101240': { outlet_id: 7, outlet: 'Puchong Utama', role: 'supervisor' },
    '040913080567': { outlet_id: 7, outlet: 'Puchong Utama', role: 'supervisor' },
    '040904141356': { outlet_id: 7, outlet: 'Puchong Utama', work_type: 'full_time' },
    '060531101420': { outlet_id: 7, outlet: 'Puchong Utama', work_type: 'full_time' },
    '050210140331': { outlet_id: 7, outlet: 'Puchong Utama', work_type: 'full_time' },
    '081029102658': { outlet_id: 7, outlet: 'Puchong Utama', work_type: 'full_time' },
    '050706140044': { outlet_id: 7, outlet: 'Puchong Utama', work_type: 'part_time' },
    '040318100025': { outlet_id: 7, outlet: 'Puchong Utama', work_type: 'part_time' },

    // PJ New Town (ID 2)
    '020203090113': { outlet_id: 2, outlet: 'PJ New Town', role: 'manager' },
    '021115131151': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'full_time' },
    '010821121010': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'full_time' },
    '040723060602': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'full_time' },
    '050413140622': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'full_time' },
    '060925140131': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'full_time' },
    '001212050670': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'part_time' },
    '040820101365': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'part_time' },
    '050707140636': { outlet_id: 2, outlet: 'PJ New Town', work_type: 'part_time' },

    // Sri Jati (ID 6)
    '010527121124': { outlet_id: 6, outlet: 'Sri Jati', role: 'manager' },
    '030102141427': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'full_time' },
    '060827120866': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'full_time' },
    '080909040278': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'full_time' },
    '081119140834': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'full_time' },
    '070115011628': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'part_time' },
    '070714070136': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'part_time' },
    '010212100812': { outlet_id: 6, outlet: 'Sri Jati', work_type: 'part_time' },

    // Wangsa Melawati (ID 3)
    '971113435249': { outlet_id: 3, outlet: 'Wangsa Melawati', role: 'manager' },
    '000505040113': { outlet_id: 3, outlet: 'Wangsa Melawati', role: 'supervisor' },
    '980405146187': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'full_time' },
    '060515141107': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'full_time' },
    '000414140055': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'full_time' },
    '000411140055': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'full_time' },
    '050511141506': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'full_time' },
    '080611101111': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'full_time' },
    '050217141580': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'part_time' },
    '080503101157': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'part_time' },
    '001016070770': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'part_time' },
    '080622030646': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'part_time' },
    '970818145298': { outlet_id: 3, outlet: 'Wangsa Melawati', work_type: 'part_time' },

    // Putrajaya (ID 12)
    '991109125430': { outlet_id: 12, outlet: 'Putrajaya', role: 'supervisor' },
    '060617160069': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '080703101717': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '081205121269': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '061207160159': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '081228160033': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '081228170033': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '081010100206': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '050302100089': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'full_time' },
    '050905020010': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '051231160088': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '010120050280': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '070201160021': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '031120101554': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '070120101038': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '071024101462': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
    '040527160040': { outlet_id: 12, outlet: 'Putrajaya', work_type: 'part_time' },
  };

  // Get all active employees
  const employees = await pool.query(`
    SELECT e.id, e.name, REPLACE(e.ic_number, '-', '') as ic_number,
           e.employee_role, e.work_type, e.outlet_id, o.name as outlet_name
    FROM employees e
    LEFT JOIN outlets o ON e.outlet_id = o.id
    WHERE e.company_id = 3 AND e.status = 'active'
  `);

  console.log('='.repeat(80));
  console.log('APPLYING EMPLOYEE UPDATES');
  console.log('='.repeat(80));

  let updateCount = 0;
  let errorCount = 0;

  for (const emp of employees.rows) {
    const ic = emp.ic_number;
    const expected = ic ? expectedAssignments[ic] : null;

    if (!expected) continue;

    const needsOutletChange = emp.outlet_id !== expected.outlet_id;
    const needsRoleChange = expected.role && emp.employee_role !== expected.role;
    const needsWorkTypeChange = expected.work_type && emp.work_type !== expected.work_type;

    if (needsOutletChange || needsRoleChange || needsWorkTypeChange) {
      try {
        // Build update query
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (needsOutletChange) {
          updates.push(`outlet_id = $${paramIndex++}`);
          values.push(expected.outlet_id);
        }
        if (needsRoleChange) {
          updates.push(`employee_role = $${paramIndex++}`);
          values.push(expected.role);
        }
        if (needsWorkTypeChange) {
          updates.push(`work_type = $${paramIndex++}`);
          values.push(expected.work_type);
        }

        values.push(emp.id);

        const query = `UPDATE employees SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await pool.query(query, values);

        let changes = [];
        if (needsOutletChange) changes.push(`outlet: ${emp.outlet_name || 'NULL'} -> ${expected.outlet}`);
        if (needsRoleChange) changes.push(`role: ${emp.employee_role || 'staff'} -> ${expected.role}`);
        if (needsWorkTypeChange) changes.push(`type: ${emp.work_type || 'full_time'} -> ${expected.work_type}`);

        console.log(`✓ Updated ${emp.name}: ${changes.join(', ')}`);
        updateCount++;
      } catch (err) {
        console.error(`✗ Failed to update ${emp.name}: ${err.message}`);
        errorCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`COMPLETED: ${updateCount} employees updated, ${errorCount} errors`);
  console.log('='.repeat(80));

  process.exit(0);
}

applyUpdates().catch(e => { console.error(e); process.exit(1); });
