const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function checkRoles() {
  try {
    // Get all employees with supervisor/manager roles from Mimix (company_id = 3)
    const result = await pool.query(`
      SELECT e.id, e.employee_id, e.name, e.ic_number, e.employee_role, e.position,
             o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.company_id = 3
        AND e.employee_role IN ('supervisor', 'manager')
        AND e.status = 'active'
      ORDER BY e.employee_role, e.name
    `);

    console.log('=== MIMIX SUPERVISORS & MANAGERS ===');
    console.log('Total found:', result.rows.length);
    console.log('');

    const supervisors = result.rows.filter(r => r.employee_role === 'supervisor');
    const managers = result.rows.filter(r => r.employee_role === 'manager');

    console.log('SUPERVISORS (' + supervisors.length + '):');
    supervisors.forEach(s => {
      console.log('  - ' + s.name + ' (' + s.employee_id + ') | IC: ' + s.ic_number + ' | Outlet: ' + (s.outlet_name || 'N/A'));
    });

    console.log('');
    console.log('MANAGERS (' + managers.length + '):');
    managers.forEach(m => {
      console.log('  - ' + m.name + ' (' + m.employee_id + ') | IC: ' + m.ic_number + ' | Outlet: ' + (m.outlet_name || 'N/A'));
    });

    // Also check all unique employee_role values in Mimix
    const roles = await pool.query(`
      SELECT employee_role, COUNT(*) as count
      FROM employees
      WHERE company_id = 3 AND status = 'active'
      GROUP BY employee_role
      ORDER BY count DESC
    `);

    console.log('');
    console.log('=== ALL ROLES IN MIMIX ===');
    roles.rows.forEach(r => {
      console.log('  ' + (r.employee_role || 'NULL') + ': ' + r.count + ' employees');
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

checkRoles();
