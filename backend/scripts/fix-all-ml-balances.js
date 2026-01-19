/**
 * Fix ML (Medical Leave) Balances for ALL companies
 * Sets all ML entitled days to 14 for all employees
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixAllMLBalances() {
  const client = await pool.connect();

  try {
    console.log('Starting ML balance fix for ALL companies...\n');

    const currentYear = new Date().getFullYear();

    // Check all leave types
    const allTypesResult = await client.query(`
      SELECT id, code, name, company_id FROM leave_types ORDER BY company_id, code
    `);
    console.log('All leave types:');
    allTypesResult.rows.forEach(t => {
      console.log(`  ${t.code} - ${t.name} (Company: ${t.company_id || 'Global'})`);
    });

    // Get all companies
    const companiesResult = await client.query(`SELECT id, name FROM companies`);
    console.log('\nCompanies:');
    companiesResult.rows.forEach(c => console.log(`  ${c.id}: ${c.name}`));

    // Find or create ML leave type for each company that doesn't have one
    for (const company of companiesResult.rows) {
      const existingML = await client.query(`
        SELECT id FROM leave_types WHERE code = 'ML' AND company_id = $1
      `, [company.id]);

      let mlTypeId;
      if (existingML.rows.length === 0) {
        // Create ML leave type for this company
        const createResult = await client.query(`
          INSERT INTO leave_types (code, name, default_days_per_year, is_paid, requires_attachment, company_id)
          VALUES ('ML', 'Medical Leave', 14, true, true, $1)
          RETURNING id
        `, [company.id]);
        mlTypeId = createResult.rows[0].id;
        console.log(`\nCreated ML leave type for ${company.name} (ID: ${mlTypeId})`);
      } else {
        mlTypeId = existingML.rows[0].id;
        console.log(`\nML leave type exists for ${company.name} (ID: ${mlTypeId})`);
      }

      // Update existing balances to 14 days
      const updateResult = await client.query(`
        UPDATE leave_balances
        SET entitled_days = 14
        WHERE leave_type_id = $1 AND year = $2
        RETURNING employee_id
      `, [mlTypeId, currentYear]);
      console.log(`  Updated ${updateResult.rowCount} existing ML balances`);

      // Create missing balances for employees
      const missingResult = await client.query(`
        SELECT e.id, e.name, e.employee_id
        FROM employees e
        LEFT JOIN leave_balances lb ON e.id = lb.employee_id
          AND lb.leave_type_id = $1 AND lb.year = $2
        WHERE lb.id IS NULL
          AND e.status = 'active'
          AND e.company_id = $3
      `, [mlTypeId, currentYear, company.id]);

      console.log(`  Found ${missingResult.rows.length} employees without ML balance`);

      for (const emp of missingResult.rows) {
        await client.query(`
          INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days, used_days, carried_forward)
          VALUES ($1, $2, $3, 14, 0, 0)
        `, [emp.id, mlTypeId, currentYear]);
      }
      console.log(`  Created ${missingResult.rows.length} new ML balances`);
    }

    // Final summary
    console.log('\n--- Final Summary ---');
    const finalResult = await client.query(`
      SELECT c.name as company, COUNT(*) as total_ml_balances,
        COUNT(CASE WHEN lb.entitled_days = 14 THEN 1 END) as correct
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      JOIN employees e ON lb.employee_id = e.id
      JOIN companies c ON e.company_id = c.id
      WHERE lt.code = 'ML' AND lb.year = $1
      GROUP BY c.name
    `, [currentYear]);

    finalResult.rows.forEach(r => {
      console.log(`${r.company}: ${r.total_ml_balances} ML balances (${r.correct} correct)`);
    });

    console.log('\nDone!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAllMLBalances();
