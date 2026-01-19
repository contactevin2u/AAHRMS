const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixMismatch() {
  console.log('=== FIXING TEMPLATE COMPANY MISMATCH ===\n');

  // Fix Mimix (company 3) schedules that use template ID 1 (WORK from company 1)
  // They should use template ID 8 (FD from company 3) for 09:00-18:00 shifts
  const result1 = await pool.query(`
    UPDATE schedules
    SET shift_template_id = 8
    WHERE company_id = 3
      AND shift_template_id = 1
      AND shift_start = '09:00:00'
      AND shift_end = '18:00:00'
    RETURNING id
  `);
  console.log('Fixed', result1.rowCount, 'Mimix schedules (WORK -> FD template)');

  // Verify no more mismatches
  const remaining = await pool.query(`
    SELECT COUNT(*) as count
    FROM schedules s
    JOIN shift_templates st ON s.shift_template_id = st.id
    WHERE s.company_id != st.company_id
  `);
  console.log('\nRemaining mismatches:', remaining.rows[0].count);

  // Show sample of fixed data
  console.log('\n=== SAMPLE FIXED DATA ===');
  const sample = await pool.query(`
    SELECT s.employee_id, TO_CHAR(s.schedule_date, 'YYYY-MM-DD') as date,
           s.shift_start, s.shift_end, s.company_id,
           st.code, st.company_id as template_company,
           e.name
    FROM schedules s
    JOIN employees e ON s.employee_id = e.id
    JOIN shift_templates st ON s.shift_template_id = st.id
    WHERE s.company_id = 3 AND s.shift_start = '09:00:00' AND s.shift_end = '18:00:00'
    ORDER BY s.schedule_date DESC
    LIMIT 10
  `);

  for (const r of sample.rows) {
    console.log(`${r.name} | ${r.date} | ${r.shift_start}-${r.shift_end} | Template: ${r.code} (Co:${r.template_company})`);
  }

  await pool.end();
}

fixMismatch().catch(console.error);
