/**
 * Setup Script: Payroll Schedules, OT Rules, Transfers, Final Settlement
 *
 * This script runs migration 002 which sets up:
 * 1. OT rules for AA Alive and Mimix
 * 2. Payroll period configurations (pay schedules)
 * 3. Employee transfer tracking
 * 4. Final settlement calculation fields
 *
 * Run with: node scripts/setup-payroll-schedules.js
 */

const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting migration 002-payroll-schedules...\n');

    // Read and execute migration SQL
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../db/migrations/002-payroll-schedules.sql'),
      'utf8'
    );

    await client.query(migrationSQL);
    console.log('Migration SQL executed successfully!\n');

  } catch (error) {
    if (error.code === '42701') {
      console.log('Some columns already exist (this is OK)');
    } else if (error.code === '42P07') {
      console.log('Some tables already exist (this is OK)');
    } else if (error.code === '23505') {
      console.log('Some records already exist (this is OK)');
    } else {
      console.error('Migration error:', error.message);
      console.error('Error code:', error.code);
    }
  } finally {
    client.release();
  }
}

async function verifySeedData() {
  const client = await pool.connect();

  try {
    console.log('=== Verifying Seed Data ===\n');

    // Check OT rules
    const otRules = await client.query(`
      SELECT r.*, c.name as company_name, d.name as department_name
      FROM ot_rules r
      JOIN companies c ON r.company_id = c.id
      LEFT JOIN departments d ON r.department_id = d.id
      ORDER BY c.id, r.id
    `);

    console.log('OT Rules:');
    if (otRules.rows.length === 0) {
      console.log('  (none found - will seed manually)');
    } else {
      for (const r of otRules.rows) {
        console.log(`  [${r.company_name}] ${r.department_name || 'All Depts'}: ${r.name}`);
        console.log(`    - Normal hours: ${r.normal_hours_per_day}hrs, OT threshold: ${r.ot_threshold_hours}hrs`);
        console.log(`    - OT rates: Normal ${r.ot_normal_multiplier}x, PH ${r.ot_ph_multiplier}x${r.ot_ph_after_hours_multiplier ? `, PH after hours ${r.ot_ph_after_hours_multiplier}x` : ''}`);
      }
    }

    // Check payroll period configs
    const periodConfigs = await client.query(`
      SELECT p.*, c.name as company_name, d.name as department_name
      FROM payroll_period_configs p
      JOIN companies c ON p.company_id = c.id
      LEFT JOIN departments d ON p.department_id = d.id
      ORDER BY c.id, p.id
    `);

    console.log('\nPayroll Period Configs:');
    if (periodConfigs.rows.length === 0) {
      console.log('  (none found - will seed manually)');
    } else {
      for (const p of periodConfigs.rows) {
        console.log(`  [${p.company_name}] ${p.department_name || 'Default'}: ${p.name}`);
        console.log(`    - Period: ${p.period_type} (${p.period_start_day}-${p.period_end_day || 'EOM'})`);
        console.log(`    - Payment: Day ${p.payment_day}, Offset ${p.payment_month_offset} month(s)`);
        if (p.commission_period_offset !== 0) {
          console.log(`    - Commission: ${p.commission_period_offset} month offset`);
        }
      }
    }

    // Check new columns in payroll_runs
    const prColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payroll_runs'
      AND column_name IN ('period_start_date', 'period_end_date', 'payment_due_date', 'period_label')
    `);
    console.log('\nPayroll Runs Columns Added:', prColumns.rows.map(r => r.column_name).join(', ') || 'none');

    // Check new columns in resignations
    const resColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'resignations'
      AND column_name IN ('prorated_salary', 'pending_claims_amount', 'settlement_breakdown')
    `);
    console.log('Resignations Columns Added:', resColumns.rows.map(r => r.column_name).join(', ') || 'none');

    // Check employee_transfers table
    const transfersTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'employee_transfers'
      ) as exists
    `);
    console.log('Employee Transfers Table:', transfersTable.rows[0].exists ? 'Created' : 'Missing');

    console.log('\n=== Migration Complete ===\n');

  } finally {
    client.release();
  }
}

async function seedMissingData() {
  const client = await pool.connect();

  try {
    // Check if OT rules exist
    const otCount = await client.query('SELECT COUNT(*) FROM ot_rules');

    if (parseInt(otCount.rows[0].count) === 0) {
      console.log('Seeding OT rules manually...\n');

      // Get company IDs
      const companies = await client.query("SELECT id, name FROM companies");

      for (const company of companies.rows) {
        if (company.name.includes('AA Alive') || company.name.includes('AALIVE')) {
          // Get Driver department
          const driver = await client.query(
            "SELECT id FROM departments WHERE name = 'Driver' AND company_id = $1",
            [company.id]
          );

          if (driver.rows.length > 0) {
            await client.query(`
              INSERT INTO ot_rules (company_id, department_id, name, normal_hours_per_day, includes_break,
                break_duration_minutes, ot_threshold_hours, ot_normal_multiplier, ot_ph_multiplier, rounding_method)
              VALUES ($1, $2, 'AA Alive Driver OT', 9.00, TRUE, 60, 9.00, 1.00, 2.00, 'minute')
              ON CONFLICT (company_id, department_id) DO NOTHING
            `, [company.id, driver.rows[0].id]);
            console.log(`  Created OT rule for AA Alive Driver`);
          }
        }

        if (company.name.includes('Mimix') || company.name.includes('MIMIX')) {
          await client.query(`
            INSERT INTO ot_rules (company_id, department_id, name, normal_hours_per_day, ot_threshold_hours,
              ot_normal_multiplier, ot_ph_multiplier, ot_ph_after_hours_multiplier, rounding_method)
            VALUES ($1, NULL, 'Mimix Standard OT', 8.00, 8.00, 1.50, 2.00, 3.00, 'minute')
            ON CONFLICT (company_id, department_id) DO NOTHING
          `, [company.id]);
          console.log(`  Created OT rule for Mimix`);
        }
      }
    }

    // Check if payroll period configs exist
    const periodCount = await client.query('SELECT COUNT(*) FROM payroll_period_configs');

    if (parseInt(periodCount.rows[0].count) === 0) {
      console.log('\nSeeding payroll period configs manually...\n');

      // Get AA Alive company
      const aaAlive = await client.query(
        "SELECT id FROM companies WHERE name LIKE '%AA Alive%' OR code = 'AALIVE' LIMIT 1"
      );

      if (aaAlive.rows.length > 0) {
        const companyId = aaAlive.rows[0].id;

        // Get departments
        const depts = await client.query(
          "SELECT id, name FROM departments WHERE company_id = $1",
          [companyId]
        );

        for (const dept of depts.rows) {
          let config = null;

          switch (dept.name) {
            case 'Driver':
              config = {
                name: 'Driver Schedule',
                period_type: 'calendar_month',
                start: 1, end: 0,
                pay_day: 5, pay_offset: 1,
                comm_offset: 0,
                notes: 'Standard monthly payroll, payment by 5th of following month'
              };
              break;
            case 'Office':
              config = {
                name: 'Office Schedule',
                period_type: 'calendar_month',
                start: 1, end: 0,
                pay_day: 25, pay_offset: 0,
                comm_offset: 0,
                notes: 'Full month salary projected on 25th'
              };
              break;
            case 'Outdoor Sales':
              config = {
                name: 'Outdoor Sales Schedule',
                period_type: 'calendar_month',
                start: 1, end: 0,
                pay_day: 25, pay_offset: 0,
                comm_offset: -1,
                notes: 'Basic salary current month, commission from previous month'
              };
              break;
            case 'Indoor Sales':
              config = {
                name: 'Indoor Sales Schedule',
                period_type: 'mid_month',
                start: 15, end: 14,
                pay_day: 25, pay_offset: 0,
                comm_offset: 0,
                notes: 'Period: 15th of previous month to 14th of current month'
              };
              break;
          }

          if (config) {
            await client.query(`
              INSERT INTO payroll_period_configs
                (company_id, department_id, name, period_type, period_start_day, period_end_day,
                 payment_day, payment_month_offset, commission_period_offset, notes)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (company_id, department_id) DO NOTHING
            `, [
              companyId, dept.id, config.name, config.period_type,
              config.start, config.end, config.pay_day, config.pay_offset,
              config.comm_offset, config.notes
            ]);
            console.log(`  Created period config for ${dept.name}`);
          }
        }
      }
    }

  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('Payroll Schedules & OT Rules Setup');
    console.log('===================================\n');

    await runMigration();
    await seedMissingData();
    await verifySeedData();

    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

main();
