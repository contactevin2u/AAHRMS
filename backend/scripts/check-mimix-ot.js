require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkMimixOT() {
  try {
    // Check all Mimix clock records in Jan 2026
    const result = await pool.query(`
      SELECT
        e.name as employee_name,
        cir.work_date,
        cir.clock_in_1,
        cir.clock_out_1,
        cir.total_work_hours,
        cir.ot_hours,
        cir.ot_minutes,
        cir.ot_approved,
        cir.status
      FROM clock_in_records cir
      JOIN employees e ON cir.employee_id = e.id
      WHERE e.company_id = 3
        AND cir.work_date >= '2026-01-01'
        AND cir.clock_out_1 IS NOT NULL
      ORDER BY cir.work_date DESC
      LIMIT 20
    `);

    console.log('Mimix Clock Records (Jan 2026):');
    console.log('================================');
    if (result.rows.length === 0) {
      console.log('No clock records found');
    } else {
      result.rows.forEach(r => {
        const approvalStatus = r.ot_approved === true ? 'YES' : r.ot_approved === false ? 'NO' : 'PENDING';
        console.log(`${r.employee_name.padEnd(20)} | ${r.work_date} | ${r.clock_in_1}-${r.clock_out_1} | Work: ${r.total_work_hours || 0}h | OT: ${r.ot_hours || 0}h (${r.ot_minutes || 0}m) | Approved: ${approvalStatus}`);
      });
    }

    // Check records with any OT
    const otRecords = await pool.query(`
      SELECT
        e.name as employee_name,
        cir.work_date,
        cir.clock_in_1,
        cir.clock_out_1,
        cir.total_work_hours,
        cir.ot_hours,
        cir.ot_minutes,
        cir.ot_approved
      FROM clock_in_records cir
      JOIN employees e ON cir.employee_id = e.id
      WHERE e.company_id = 3
        AND cir.work_date >= '2026-01-01'
        AND (cir.ot_hours > 0 OR cir.ot_minutes > 0)
      ORDER BY cir.work_date DESC
      LIMIT 15
    `);

    console.log('\n\nRecords with OT (ot_hours > 0 or ot_minutes > 0):');
    console.log('==================================================');
    if (otRecords.rows.length === 0) {
      console.log('No OT records found');
    } else {
      otRecords.rows.forEach(r => {
        const approvalStatus = r.ot_approved === true ? 'YES' : r.ot_approved === false ? 'NO' : 'PENDING';
        console.log(`${r.employee_name.padEnd(20)} | ${r.work_date} | ${r.clock_in_1}-${r.clock_out_1} | OT: ${r.ot_hours || 0}h (${r.ot_minutes || 0}m) | Approved: ${approvalStatus}`);
      });
    }

    // Summary
    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE ot_approved = true) as approved_count,
        COUNT(*) FILTER (WHERE ot_approved = false) as rejected_count,
        COUNT(*) FILTER (WHERE ot_approved IS NULL AND (ot_hours > 0 OR ot_minutes > 0)) as pending_count,
        SUM(COALESCE(ot_minutes, 0)) as total_ot_minutes
      FROM clock_in_records cir
      JOIN employees e ON cir.employee_id = e.id
      WHERE e.company_id = 3
        AND cir.work_date >= '2026-01-01'
    `);

    console.log('\n\nOT Approval Summary (Jan 2026):');
    console.log(`Total records: ${summary.rows[0].total_records}`);
    console.log(`Approved OT: ${summary.rows[0].approved_count}, Rejected: ${summary.rows[0].rejected_count}, Pending: ${summary.rows[0].pending_count}`);
    console.log(`Total OT minutes (all records): ${summary.rows[0].total_ot_minutes || 0}`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkMimixOT();
