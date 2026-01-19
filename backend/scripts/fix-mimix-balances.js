/**
 * Fix Mimix leave balances - delete wrong ones and create correct ones
 */

require('dotenv').config();
const pool = require('../db');

async function fix() {
  console.log('=== Fixing Mimix Leave Balances ===\n');

  try {
    // 1. Delete incorrect balances for Mimix employees (linked to AA Alive leave types)
    const deleteResult = await pool.query(`
      DELETE FROM leave_balances
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = 3)
      AND leave_type_id IN (SELECT id FROM leave_types WHERE company_id = 1)
      AND year = 2026
      RETURNING id
    `);
    console.log('Deleted', deleteResult.rowCount, 'incorrect balance records');

    // 2. Get Mimix leave types
    const mimixTypes = await pool.query('SELECT * FROM leave_types WHERE company_id = 3 ORDER BY code');
    console.log('\nMimix leave types:', mimixTypes.rows.map(t => t.code + ' (ID:' + t.id + ', days:' + t.default_days_per_year + ')').join(', '));

    // 3. Get all active Mimix employees
    const employees = await pool.query(`
      SELECT id, name, join_date, gender
      FROM employees
      WHERE company_id = 3 AND status = 'active'
    `);
    console.log('Found', employees.rows.length, 'Mimix employees\n');

    // 4. Create balances for each employee
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const emp of employees.rows) {
      for (const lt of mimixTypes.rows) {
        try {
          // Skip gender-restricted leave types
          if (lt.gender_restriction) {
            if (lt.gender_restriction === 'female' && emp.gender !== 'female') {
              skipped++;
              continue;
            }
            if (lt.gender_restriction === 'male' && emp.gender !== 'male') {
              skipped++;
              continue;
            }
          }

          // Calculate entitled days
          let entitledDays = lt.default_days_per_year || 0;

          // Check if balance already exists
          const existing = await pool.query(
            'SELECT id FROM leave_balances WHERE employee_id = $1 AND leave_type_id = $2 AND year = 2026',
            [emp.id, lt.id]
          );

          if (existing.rows.length === 0) {
            await pool.query(`
              INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days, used_days, carried_forward)
              VALUES ($1, $2, 2026, $3, 0, 0)
            `, [emp.id, lt.id, entitledDays]);
            created++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error('Error for', emp.name, lt.code, ':', err.message);
          failed++;
        }
      }
    }

    console.log('Created', created, 'new balance records');
    console.log('Skipped:', skipped, '(already exists or gender restricted)');
    console.log('Failed:', failed);

    // 5. Verify
    const verifyCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM leave_balances lb
      JOIN employees e ON lb.employee_id = e.id
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE e.company_id = 3 AND lt.company_id = 3 AND lb.year = 2026
    `);
    console.log('\nVerification: Mimix employees now have', verifyCount.rows[0].count, 'correct balance records');

    // Sample check
    const sample = await pool.query(`
      SELECT e.name, lt.code, lb.entitled_days
      FROM leave_balances lb
      JOIN employees e ON lb.employee_id = e.id
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE e.company_id = 3 AND lt.company_id = 3 AND lb.year = 2026
      LIMIT 10
    `);
    console.log('\nSample balances:');
    console.table(sample.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    console.log('\n✅ Done!');
  }
}

fix();
