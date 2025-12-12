const pool = require('../db');

async function seedDepartments() {
  try {
    console.log('Seeding departments...');

    // First, check if departments exist
    const existing = await pool.query('SELECT * FROM departments');
    console.log('Existing departments:', existing.rows.length);

    if (existing.rows.length === 0) {
      // Insert departments
      const result = await pool.query(`
        INSERT INTO departments (name, salary_type, company_id) VALUES
          ('Office', 'basic_allowance_bonus_ot', 1),
          ('Indoor Sales', 'basic_commission', 1),
          ('Outdoor Sales', 'basic_commission_allowance_bonus', 1),
          ('Driver', 'basic_upsell_outstation_ot_trip', 1)
        RETURNING *
      `);
      console.log('Departments created:', result.rows);
    } else {
      console.log('Departments already exist:', existing.rows);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding departments:', error);
    process.exit(1);
  }
}

seedDepartments();
