const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchedules() {
  console.log('=== CHECKING SCHEDULE DATA ===\n');

  // Check schedules for January 2026 with template details
  const result = await pool.query(`
    SELECT s.id, s.employee_id, TO_CHAR(s.schedule_date, 'YYYY-MM-DD') as date,
           s.shift_start, s.shift_end, s.shift_template_id, s.status, s.company_id,
           st.code as template_code, st.name as template_name, st.company_id as template_company,
           e.name as employee_name
    FROM schedules s
    JOIN employees e ON s.employee_id = e.id
    LEFT JOIN shift_templates st ON s.shift_template_id = st.id
    WHERE s.schedule_date BETWEEN '2026-01-01' AND '2026-01-31'
    ORDER BY e.name, s.schedule_date
    LIMIT 50
  `);

  let currentEmployee = '';
  for (const r of result.rows) {
    if (r.employee_name !== currentEmployee) {
      console.log(`\n--- ${r.employee_name} (Company: ${r.company_id}) ---`);
      currentEmployee = r.employee_name;
    }
    const mismatch = r.company_id !== r.template_company ? ' *** MISMATCH ***' : '';
    console.log(`  ${r.date} | ${r.shift_start}-${r.shift_end} | Template: ${r.template_code || 'NONE'} (ID:${r.shift_template_id}, Co:${r.template_company})${mismatch}`);
  }

  // Check if templates are being matched correctly
  console.log('\n\n=== TEMPLATE MATCHING CHECK ===');
  const templates = await pool.query(`
    SELECT id, company_id, code, start_time, end_time, is_off
    FROM shift_templates
    WHERE is_active = true
    ORDER BY company_id, start_time
  `);

  console.log('\nActive Templates:');
  for (const t of templates.rows) {
    console.log(`  ID:${t.id} | Company:${t.company_id} | ${t.code} | ${t.start_time}-${t.end_time} | Off:${t.is_off}`);
  }

  // Check for schedules where template company doesn't match schedule company
  console.log('\n\n=== COMPANY MISMATCH CHECK ===');
  const mismatchResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM schedules s
    JOIN shift_templates st ON s.shift_template_id = st.id
    WHERE s.company_id != st.company_id
  `);
  console.log('Schedules with company mismatch:', mismatchResult.rows[0].count);

  await pool.end();
}

checkSchedules().catch(console.error);
