const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixSchedules() {
  console.log('=== FIXING SCHEDULES ===');

  // Update schedules with template ID 8 (FD - Full Day 09:00-18:00)
  const updated = await pool.query(`
    UPDATE schedules
    SET shift_template_id = 8
    WHERE company_id = 3
      AND shift_template_id IS NULL
      AND shift_start = '09:00:00'
      AND shift_end = '18:00:00'
    RETURNING id
  `);
  console.log('Fixed', updated.rowCount, 'schedules with FD template');

  // Check remaining
  const remaining = await pool.query(`
    SELECT COUNT(*) as count FROM schedules WHERE shift_template_id IS NULL
  `);
  console.log('Remaining schedules without template:', remaining.rows[0].count);

  // Verify all templates
  console.log('\n=== SHIFT TEMPLATES ===');
  const templates = await pool.query(`
    SELECT id, company_id, code, name, start_time, end_time, is_off
    FROM shift_templates
    WHERE is_active = true
    ORDER BY company_id, start_time
  `);
  for (const t of templates.rows) {
    console.log(`ID: ${t.id} | Company: ${t.company_id} | ${t.code} (${t.name}) | ${t.start_time}-${t.end_time} | Off: ${t.is_off}`);
  }

  await pool.end();
}

fixSchedules().catch(console.error);
