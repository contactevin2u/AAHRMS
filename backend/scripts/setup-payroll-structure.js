/**
 * Setup Script: Multi-Company Payroll Structure
 *
 * This script sets up:
 * 1. AA Alive Sdn Bhd (Company ID 1) with 5 departments
 * 2. Mimix A Sdn Bhd (Company ID 2) with 1 General department
 * 3. Department payroll components for each department
 *
 * Run with: node scripts/setup-payroll-structure.js
 */

const pool = require('../db');

// Define payroll components for each department
const AA_ALIVE_DEPARTMENTS = [
  {
    name: 'Office',
    payroll_structure_code: 'office',
    salary_type: 'basic_allowance_bonus_ot',
    components: [
      { component_name: 'basic_salary', is_enabled: true, is_required: true, display_order: 1, calculation_type: 'fixed' },
      { component_name: 'allowance', is_enabled: true, is_required: false, display_order: 2, calculation_type: 'fixed' },
      { component_name: 'bonus', is_enabled: true, is_required: false, display_order: 3, calculation_type: 'fixed' },
      { component_name: 'commission', is_enabled: true, is_required: false, display_order: 4, calculation_type: 'fixed' }
    ]
  },
  {
    name: 'Indoor Sales',
    payroll_structure_code: 'indoor_sales',
    salary_type: 'basic_commission',
    components: [
      {
        component_name: 'basic_salary',
        is_enabled: true,
        is_required: true,
        default_value: 4000,
        display_order: 1,
        calculation_type: 'compare_higher',
        calculation_config: { compare_with: 'commission', description: 'Takes higher of basic RM4000 or 6% commission' }
      },
      {
        component_name: 'commission',
        is_enabled: true,
        is_required: false,
        display_order: 2,
        calculation_type: 'percentage',
        calculation_config: { rate: 6, base: 'total_sales', description: '6% of total monthly sales' }
      }
    ]
  },
  {
    name: 'Outdoor Sales',
    payroll_structure_code: 'outdoor_sales',
    salary_type: 'basic_commission_allowance_bonus',
    components: [
      { component_name: 'basic_salary', is_enabled: true, is_required: true, display_order: 1, calculation_type: 'fixed' },
      { component_name: 'commission', is_enabled: true, is_required: false, display_order: 2, calculation_type: 'fixed' },
      { component_name: 'allowance', is_enabled: true, is_required: false, display_order: 3, calculation_type: 'fixed' },
      { component_name: 'bonus', is_enabled: true, is_required: false, display_order: 4, calculation_type: 'fixed' },
      { component_name: 'other_earnings', is_enabled: true, is_required: false, display_order: 5, calculation_type: 'fixed', calculation_config: { label: 'Benefits on Side' } }
    ]
  },
  {
    name: 'Driver',
    payroll_structure_code: 'driver',
    salary_type: 'basic_upsell_outstation_ot_trip',
    components: [
      { component_name: 'basic_salary', is_enabled: true, is_required: true, display_order: 1, calculation_type: 'fixed' },
      { component_name: 'trade_commission', is_enabled: true, is_required: false, display_order: 2, calculation_type: 'fixed', calculation_config: { label: 'Upsell Commission' } },
      { component_name: 'outstation_amount', is_enabled: true, is_required: false, display_order: 3, calculation_type: 'fixed', calculation_config: { label: 'Outstation Allowance' } },
      { component_name: 'ot_amount', is_enabled: true, is_required: false, display_order: 4, calculation_type: 'hourly', calculation_config: { requires_clock_in: true } },
      { component_name: 'trip_commission', is_enabled: true, is_required: false, display_order: 5, calculation_type: 'per_trip' }
    ]
  },
  {
    name: 'Packer',
    payroll_structure_code: 'packer',
    salary_type: 'basic_allowance_ot_bonus',
    components: [
      { component_name: 'basic_salary', is_enabled: true, is_required: true, display_order: 1, calculation_type: 'fixed' },
      { component_name: 'allowance', is_enabled: true, is_required: false, display_order: 2, calculation_type: 'fixed' },
      { component_name: 'ot_amount', is_enabled: true, is_required: false, display_order: 3, calculation_type: 'hourly', calculation_config: { rate: 1.0, description: 'OT at 1.0x rate' } },
      { component_name: 'bonus', is_enabled: true, is_required: false, display_order: 4, calculation_type: 'fixed' }
    ]
  }
];

const MIMIX_DEPARTMENTS = [
  {
    name: 'General',
    payroll_structure_code: 'mimix_general',
    salary_type: 'basic_allowance_ot_bonus',
    components: [
      { component_name: 'basic_salary', is_enabled: true, is_required: true, display_order: 1, calculation_type: 'fixed' },
      { component_name: 'allowance', is_enabled: true, is_required: false, display_order: 2, calculation_type: 'fixed' },
      { component_name: 'ot_amount', is_enabled: true, is_required: false, display_order: 3, calculation_type: 'hourly', calculation_config: { requires_clock_in: true } },
      { component_name: 'bonus', is_enabled: true, is_required: false, display_order: 4, calculation_type: 'fixed' }
    ]
  }
];

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');

    // Read and execute migration SQL
    const fs = require('fs');
    const path = require('path');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../db/migrations/001-payroll-structure.sql'),
      'utf8'
    );

    await client.query(migrationSQL);
    console.log('Migration SQL executed successfully');

  } catch (error) {
    if (error.code === '42701') {
      console.log('Some columns already exist (this is OK)');
    } else {
      console.error('Migration error:', error.message);
    }
  } finally {
    client.release();
  }
}

async function setupCompany1() {
  const client = await pool.connect();

  try {
    console.log('\n=== Setting up AA Alive Sdn Bhd (Company ID: 1) ===');

    // Check if company 1 exists
    const existing = await client.query('SELECT * FROM companies WHERE id = 1');

    if (existing.rows.length === 0) {
      // Create company 1
      await client.query(`
        INSERT INTO companies (id, name, code, status, settings)
        VALUES (1, 'AA Alive Sdn Bhd', 'AALIVE', 'active', $1)
      `, [JSON.stringify({
        clock_in_enabled: true,
        clock_in_departments: [], // Will be updated after departments are created
        ot_calculation_method: 'manual',
        indoor_sales_basic: 4000,
        indoor_sales_commission_rate: 6
      })]);
      console.log('Created company: AA Alive Sdn Bhd');
    } else {
      // Update company 1
      await client.query(`
        UPDATE companies
        SET name = 'AA Alive Sdn Bhd',
            code = COALESCE(code, 'AALIVE'),
            settings = COALESCE(settings, '{}')::jsonb || $1::jsonb
        WHERE id = 1
      `, [JSON.stringify({
        clock_in_enabled: true,
        ot_calculation_method: 'manual',
        indoor_sales_basic: 4000,
        indoor_sales_commission_rate: 6
      })]);
      console.log('Updated company: AA Alive Sdn Bhd');
    }

    // Setup departments
    let driverDeptId = null;

    for (const dept of AA_ALIVE_DEPARTMENTS) {
      // Check if department exists
      const existingDept = await client.query(
        'SELECT id FROM departments WHERE name = $1 AND company_id = 1',
        [dept.name]
      );

      let deptId;

      if (existingDept.rows.length > 0) {
        // Update existing department
        deptId = existingDept.rows[0].id;
        await client.query(
          `UPDATE departments
           SET payroll_structure_code = $1, salary_type = $2
           WHERE id = $3`,
          [dept.payroll_structure_code, dept.salary_type, deptId]
        );
        console.log(`Updated department: ${dept.name} (ID: ${deptId})`);
      } else {
        // Create new department
        const result = await client.query(
          `INSERT INTO departments (name, payroll_structure_code, salary_type, company_id)
           VALUES ($1, $2, $3, 1)
           RETURNING id`,
          [dept.name, dept.payroll_structure_code, dept.salary_type]
        );
        deptId = result.rows[0].id;
        console.log(`Created department: ${dept.name} (ID: ${deptId})`);
      }

      if (dept.name === 'Driver') {
        driverDeptId = deptId;
      }

      // Setup payroll components for this department
      for (const comp of dept.components) {
        await client.query(`
          INSERT INTO department_payroll_components
          (department_id, company_id, component_name, is_enabled, is_required, default_value, calculation_type, calculation_config, display_order)
          VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (department_id, component_name)
          DO UPDATE SET
            is_enabled = EXCLUDED.is_enabled,
            is_required = EXCLUDED.is_required,
            default_value = EXCLUDED.default_value,
            calculation_type = EXCLUDED.calculation_type,
            calculation_config = EXCLUDED.calculation_config,
            display_order = EXCLUDED.display_order,
            updated_at = NOW()
        `, [
          deptId,
          comp.component_name,
          comp.is_enabled,
          comp.is_required,
          comp.default_value || null,
          comp.calculation_type,
          JSON.stringify(comp.calculation_config || {}),
          comp.display_order
        ]);
      }
      console.log(`  - Added ${dept.components.length} payroll components`);
    }

    // Update company settings with Driver department ID for clock-in
    if (driverDeptId) {
      await client.query(`
        UPDATE companies
        SET settings = settings || $1::jsonb
        WHERE id = 1
      `, [JSON.stringify({ clock_in_departments: [driverDeptId] })]);
      console.log(`Set clock-in requirement for Driver department (ID: ${driverDeptId})`);
    }

    console.log('AA Alive Sdn Bhd setup complete!');

  } finally {
    client.release();
  }
}

async function setupCompany2() {
  const client = await pool.connect();

  try {
    console.log('\n=== Setting up Mimix A Sdn Bhd (Company ID: 2) ===');

    // Check if company 2 exists
    const existing = await client.query('SELECT * FROM companies WHERE id = 2');

    if (existing.rows.length === 0) {
      // Create company 2
      await client.query(`
        INSERT INTO companies (id, name, code, status, settings)
        VALUES (2, 'Mimix A Sdn Bhd', 'MIMIX', 'active', $1)
      `, [JSON.stringify({
        clock_in_enabled: true,
        clock_in_departments: [], // All departments (empty means all)
        ot_calculation_method: 'clock_in',
        default_ot_rate: 1.5
      })]);
      console.log('Created company: Mimix A Sdn Bhd');
    } else {
      // Update company 2
      await client.query(`
        UPDATE companies
        SET name = 'Mimix A Sdn Bhd',
            code = COALESCE(code, 'MIMIX'),
            settings = COALESCE(settings, '{}')::jsonb || $1::jsonb
        WHERE id = 2
      `, [JSON.stringify({
        clock_in_enabled: true,
        clock_in_departments: [],
        ot_calculation_method: 'clock_in',
        default_ot_rate: 1.5
      })]);
      console.log('Updated company: Mimix A Sdn Bhd');
    }

    // Reset sequence if needed
    await client.query(`
      SELECT setval('companies_id_seq', (SELECT MAX(id) FROM companies))
    `);

    // Setup departments
    for (const dept of MIMIX_DEPARTMENTS) {
      // Check if department exists
      const existingDept = await client.query(
        'SELECT id FROM departments WHERE name = $1 AND company_id = 2',
        [dept.name]
      );

      let deptId;

      if (existingDept.rows.length > 0) {
        // Update existing department
        deptId = existingDept.rows[0].id;
        await client.query(
          `UPDATE departments
           SET payroll_structure_code = $1, salary_type = $2
           WHERE id = $3`,
          [dept.payroll_structure_code, dept.salary_type, deptId]
        );
        console.log(`Updated department: ${dept.name} (ID: ${deptId})`);
      } else {
        // Create new department
        const result = await client.query(
          `INSERT INTO departments (name, payroll_structure_code, salary_type, company_id)
           VALUES ($1, $2, $3, 2)
           RETURNING id`,
          [dept.name, dept.payroll_structure_code, dept.salary_type]
        );
        deptId = result.rows[0].id;
        console.log(`Created department: ${dept.name} (ID: ${deptId})`);
      }

      // Setup payroll components for this department
      for (const comp of dept.components) {
        await client.query(`
          INSERT INTO department_payroll_components
          (department_id, company_id, component_name, is_enabled, is_required, default_value, calculation_type, calculation_config, display_order)
          VALUES ($1, 2, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (department_id, component_name)
          DO UPDATE SET
            is_enabled = EXCLUDED.is_enabled,
            is_required = EXCLUDED.is_required,
            default_value = EXCLUDED.default_value,
            calculation_type = EXCLUDED.calculation_type,
            calculation_config = EXCLUDED.calculation_config,
            display_order = EXCLUDED.display_order,
            updated_at = NOW()
        `, [
          deptId,
          comp.component_name,
          comp.is_enabled,
          comp.is_required,
          comp.default_value || null,
          comp.calculation_type,
          JSON.stringify(comp.calculation_config || {}),
          comp.display_order
        ]);
      }
      console.log(`  - Added ${dept.components.length} payroll components`);
    }

    // Copy leave types from company 1 to company 2
    await client.query(`
      INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id)
      SELECT code, name, is_paid, default_days_per_year, description, 2
      FROM leave_types
      WHERE company_id = 1
      ON CONFLICT DO NOTHING
    `);
    console.log('Copied leave types from AA Alive to Mimix A');

    // Copy letter templates from company 1 to company 2
    await client.query(`
      INSERT INTO letter_templates (letter_type, name, subject, content, is_active, company_id)
      SELECT letter_type, name, subject, content, is_active, 2
      FROM letter_templates
      WHERE company_id = 1
      ON CONFLICT DO NOTHING
    `);
    console.log('Copied letter templates from AA Alive to Mimix A');

    console.log('Mimix A Sdn Bhd setup complete!');

  } finally {
    client.release();
  }
}

async function createMimixAdmin() {
  const client = await pool.connect();
  const bcrypt = require('bcryptjs');

  try {
    console.log('\n=== Creating Mimix A Admin User ===');

    // Check if admin already exists
    const existing = await client.query(
      "SELECT id FROM admin_users WHERE username = 'mimix_admin'"
    );

    if (existing.rows.length > 0) {
      console.log('Mimix admin already exists, skipping...');
      return;
    }

    // Create admin user for Mimix A
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Mimix2024', salt);

    await client.query(`
      INSERT INTO admin_users (username, password_hash, name, email, role, status, company_id)
      VALUES ('mimix_admin', $1, 'Mimix Admin', 'admin@mimix.com', 'boss', 'active', 2)
    `, [passwordHash]);

    console.log('Created Mimix admin user:');
    console.log('  Username: mimix_admin');
    console.log('  Password: Mimix2024');
    console.log('  Company: Mimix A Sdn Bhd');

  } finally {
    client.release();
  }
}

async function displaySummary() {
  const client = await pool.connect();

  try {
    console.log('\n=== Setup Summary ===\n');

    // List companies
    const companies = await client.query(`
      SELECT id, name, code, status
      FROM companies
      ORDER BY id
    `);

    console.log('Companies:');
    for (const c of companies.rows) {
      console.log(`  ${c.id}. ${c.name} (${c.code}) - ${c.status}`);
    }

    // List departments with components
    console.log('\nDepartments & Payroll Components:');

    const departments = await client.query(`
      SELECT d.id, d.name, d.payroll_structure_code, c.name as company_name
      FROM departments d
      JOIN companies c ON d.company_id = c.id
      ORDER BY c.id, d.name
    `);

    for (const d of departments.rows) {
      console.log(`\n  [${d.company_name}] ${d.name} (${d.payroll_structure_code || 'no code'})`);

      const components = await client.query(`
        SELECT component_name, is_enabled, is_required, calculation_type
        FROM department_payroll_components
        WHERE department_id = $1
        ORDER BY display_order
      `, [d.id]);

      for (const comp of components.rows) {
        const status = comp.is_required ? '[Required]' : '[Optional]';
        console.log(`    - ${comp.component_name} ${status} (${comp.calculation_type || 'fixed'})`);
      }
    }

    console.log('\n=== Setup Complete! ===\n');

  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('Multi-Company Payroll Structure Setup');
    console.log('=====================================\n');

    await runMigration();
    await setupCompany1();
    await setupCompany2();
    await createMimixAdmin();
    await displaySummary();

    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

main();
