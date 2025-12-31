const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function testSupervisorApproval() {
  try {
    // 1. Find a supervisor and a staff member from the same outlet
    console.log('=== FINDING SUPERVISOR AND STAFF FROM SAME OUTLET ===\n');

    const supervisorResult = await pool.query(`
      SELECT e.id, e.employee_id, e.name, e.ic_number, e.outlet_id, o.name as outlet_name
      FROM employees e
      JOIN outlets o ON e.outlet_id = o.id
      WHERE e.company_id = 3
        AND e.employee_role = 'supervisor'
        AND e.status = 'active'
      LIMIT 1
    `);

    if (supervisorResult.rows.length === 0) {
      console.log('No supervisor found!');
      return;
    }

    const supervisor = supervisorResult.rows[0];
    console.log('Supervisor:', supervisor.employee_id, '-', supervisor.name);
    console.log('Outlet:', supervisor.outlet_name);
    console.log('IC (for login):', supervisor.ic_number);

    // Find a staff member from the same outlet
    const staffResult = await pool.query(`
      SELECT e.id, e.employee_id, e.name, e.ic_number
      FROM employees e
      WHERE e.company_id = 3
        AND e.outlet_id = $1
        AND e.employee_role = 'staff'
        AND e.status = 'active'
        AND e.id != $2
      LIMIT 1
    `, [supervisor.outlet_id, supervisor.id]);

    if (staffResult.rows.length === 0) {
      console.log('No staff found in this outlet!');
      return;
    }

    const staff = staffResult.rows[0];
    console.log('\nStaff member:', staff.employee_id, '-', staff.name);

    // 2. Check for existing pending claims
    console.log('\n=== CHECKING EXISTING PENDING CLAIMS ===\n');

    const pendingClaims = await pool.query(`
      SELECT c.id, c.category, c.amount, c.status, e.employee_id, e.name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE e.outlet_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at DESC
      LIMIT 5
    `, [supervisor.outlet_id]);

    if (pendingClaims.rows.length > 0) {
      console.log('Found', pendingClaims.rows.length, 'pending claims:');
      pendingClaims.rows.forEach(c => {
        console.log(`  Claim #${c.id}: ${c.category} - RM${c.amount} by ${c.employee_id}`);
      });
    } else {
      console.log('No pending claims found. Creating a test claim...');

      // Create a test claim
      const newClaim = await pool.query(`
        INSERT INTO claims (employee_id, claim_date, category, amount, description, status, created_at)
        VALUES ($1, CURRENT_DATE, 'Transport', 25.00, 'Test claim for supervisor approval', 'pending', NOW())
        RETURNING id, category, amount
      `, [staff.id]);

      console.log('\nCreated test claim:');
      console.log(`  Claim #${newClaim.rows[0].id}: ${newClaim.rows[0].category} - RM${newClaim.rows[0].amount}`);
    }

    // 3. Get final list of pending claims
    const finalPending = await pool.query(`
      SELECT c.id, c.category, c.amount, e.employee_id, e.name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE e.outlet_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `, [supervisor.outlet_id]);

    console.log('\n' + '='.repeat(60));
    console.log('=== TEST SUPERVISOR APPROVAL ===');
    console.log('='.repeat(60));
    console.log('\n1. LOGIN AS SUPERVISOR:');
    console.log('   URL: /ess/login');
    console.log('   Employee ID:', supervisor.employee_id);
    console.log('   IC Number:', supervisor.ic_number);

    console.log('\n2. GO TO CLAIMS PAGE');
    console.log('   You should see "Team Pending" section');

    console.log('\n3. PENDING CLAIMS TO APPROVE:');
    finalPending.rows.forEach(c => {
      console.log(`   - Claim #${c.id}: ${c.category} RM${c.amount} by ${c.employee_id} (${c.name})`);
    });

    console.log('\n4. CLICK APPROVE OR REJECT');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

testSupervisorApproval();
