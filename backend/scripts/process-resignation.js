const pool = require('../db');

async function processResignation(resignationId) {
  if (!resignationId) {
    console.log('Usage: node scripts/process-resignation.js <resignation_id>');
    console.log('Example: node scripts/process-resignation.js 3');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`PROCESSING RESIGNATION #${resignationId}`);
  console.log('='.repeat(70));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get resignation details
    const resResult = await client.query(`
      SELECT r.*, e.name, e.status as emp_status, o.name as outlet_name
      FROM resignations r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN outlets o ON e.outlet_id = o.id
      WHERE r.id = $1
    `, [resignationId]);

    if (resResult.rows.length === 0) {
      throw new Error(`Resignation #${resignationId} not found`);
    }

    const r = resResult.rows[0];

    if (r.status === 'completed') {
      throw new Error(`Resignation #${resignationId} already processed`);
    }

    if (r.status === 'cancelled') {
      throw new Error(`Resignation #${resignationId} was cancelled`);
    }

    console.log(`\nEmployee: ${r.name}`);
    console.log(`Outlet: ${r.outlet_name}`);
    console.log(`Last Working Day: ${r.last_working_day.toISOString().slice(0, 10)}`);

    // Update resignation status
    await client.query(`
      UPDATE resignations
      SET status = 'completed',
          settlement_status = 'completed',
          settlement_date = CURRENT_DATE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [resignationId]);
    console.log('\n✓ Resignation status -> completed');

    // Update employee status
    await client.query(`
      UPDATE employees
      SET status = 'inactive',
          employment_status = 'resigned',
          resign_date = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [r.employee_id, r.last_working_day]);
    console.log('✓ Employee status -> inactive (resigned)');

    // Delete future schedules
    const scheduleResult = await client.query(`
      DELETE FROM schedules
      WHERE employee_id = $1 AND schedule_date > $2
      RETURNING id
    `, [r.employee_id, r.last_working_day]);
    console.log(`✓ Deleted ${scheduleResult.rowCount} future schedule(s)`);

    // Cancel future leave requests
    const leaveResult = await client.query(`
      UPDATE leave_requests
      SET status = 'cancelled',
          remarks = COALESCE(remarks, '') || ' [Auto-cancelled due to resignation]',
          updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $1
        AND start_date > $2
        AND status IN ('pending', 'approved')
      RETURNING id, status
    `, [r.employee_id, r.last_working_day]);
    console.log(`✓ Cancelled ${leaveResult.rowCount} future leave request(s)`);

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(70));
    console.log(`SUCCESS: ${r.name} resignation processed`);
    console.log('='.repeat(70));
    console.log('\nEmployee can no longer clock in.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
  }

  process.exit(0);
}

const resignationId = process.argv[2];
processResignation(resignationId).catch(e => { console.error(e); process.exit(1); });
