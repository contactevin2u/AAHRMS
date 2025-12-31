const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

async function checkPositions() {
  try {
    // Get all unique positions in Mimix
    const positions = await pool.query(`
      SELECT position, COUNT(*) as count
      FROM employees
      WHERE company_id = 3 AND status = 'active' AND position IS NOT NULL
      GROUP BY position
      ORDER BY count DESC
    `);

    console.log('=== ALL POSITIONS IN MIMIX ===');
    positions.rows.forEach(p => {
      console.log('  ' + p.position + ': ' + p.count + ' employees');
    });

    // Find employees with supervisor/manager-like positions
    console.log('\n=== EMPLOYEES WITH SUPERVISOR/MANAGER POSITIONS ===');
    const leaders = await pool.query(`
      SELECT e.id, e.employee_id, e.name, e.ic_number, e.position, e.employee_role,
             o.name as outlet_name
      FROM employees e
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE e.company_id = 3
        AND e.status = 'active'
        AND (
          LOWER(e.position) LIKE '%supervisor%'
          OR LOWER(e.position) LIKE '%manager%'
          OR LOWER(e.position) LIKE '%leader%'
          OR LOWER(e.position) LIKE '%head%'
          OR LOWER(e.position) LIKE '%ketua%'
          OR LOWER(e.position) LIKE '%penyelia%'
        )
      ORDER BY e.position, e.name
    `);

    if (leaders.rows.length === 0) {
      console.log('  No employees found with supervisor/manager positions');
    } else {
      leaders.rows.forEach(l => {
        console.log('  ID:' + l.id + ' | ' + l.employee_id + ' | ' + l.name + ' | Position: ' + l.position + ' | Outlet: ' + (l.outlet_name || 'N/A') + ' | Current Role: ' + l.employee_role);
      });
    }

    // List all outlets
    console.log('\n=== MIMIX OUTLETS ===');
    const outlets = await pool.query(`
      SELECT id, name FROM outlets WHERE company_id = 3 ORDER BY name
    `);
    outlets.rows.forEach(o => {
      console.log('  ID:' + o.id + ' - ' + o.name);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

checkPositions();
