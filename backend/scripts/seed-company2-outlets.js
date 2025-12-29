/**
 * Seed outlets for Company 2 (Mimix A Sdn Bhd)
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hrms_user:Ut4Dfaz6CFcOBQ4932kwSACiRJ3zKJd9@dpg-d4k5tfmuk2gs73fldph0-a.singapore-postgres.render.com/hrms_db_e2uv',
  ssl: { rejectUnauthorized: false }
});

const COMPANY_ID = 2; // Mimix A Sdn Bhd

const OUTLETS = [
  { name: 'Mimix A - Subang Perdana', address: 'Subang Perdana, Selangor' },
  { name: 'Marina Charisma - PJ New Town', address: 'PJ New Town, Petaling Jaya' },
  { name: 'Miksu Boba - Wangsa Melawati', address: 'Wangsa Melawati, Kuala Lumpur' },
  { name: 'Langkah ATD - Taman Putra', address: 'Taman Putra, Kuala Lumpur' },
  { name: 'Langkah BTR - Bandar Tun Razak', address: 'Bandar Tun Razak, Kuala Lumpur' },
  { name: 'Langkah ATS - Sri Jati', address: 'Sri Jati, Kuala Lumpur' },
  { name: 'Langkah SLS - Puchong Utama', address: 'Puchong Utama, Selangor' },
  { name: 'Langkah SLS - Putrajaya', address: 'Putrajaya' },
  { name: 'Langkah MSB - Taman Paramount', address: 'Taman Paramount, Petaling Jaya' },
  { name: 'Kopi Antarabangsa - Aicha', address: 'Aicha' },
  { name: 'Minuman Aisu - Aisu', address: 'Aisu' }
];

async function seedOutlets() {
  const client = await pool.connect();

  try {
    console.log('Seeding outlets for Company 2 (Mimix A Sdn Bhd)...\n');

    // First check if Company 2 exists
    const companyCheck = await client.query(
      'SELECT id, name FROM companies WHERE id = $1',
      [COMPANY_ID]
    );

    if (companyCheck.rows.length === 0) {
      console.log('Company 2 not found. Creating Mimix A Sdn Bhd...');
      await client.query(
        `INSERT INTO companies (id, name, code) VALUES ($1, 'Mimix A Sdn Bhd', 'MIMIX')
         ON CONFLICT (id) DO NOTHING`,
        [COMPANY_ID]
      );
      console.log('Company 2 created.\n');
    } else {
      console.log(`Found company: ${companyCheck.rows[0].name}\n`);
    }

    let created = 0;
    let skipped = 0;

    for (const outlet of OUTLETS) {
      // Check if outlet already exists
      const existing = await client.query(
        'SELECT id FROM outlets WHERE company_id = $1 AND name = $2',
        [COMPANY_ID, outlet.name]
      );

      if (existing.rows.length > 0) {
        console.log(`[SKIP] ${outlet.name} - already exists`);
        skipped++;
        continue;
      }

      // Create outlet
      await client.query(
        'INSERT INTO outlets (company_id, name, address) VALUES ($1, $2, $3)',
        [COMPANY_ID, outlet.name, outlet.address]
      );
      console.log(`[OK] ${outlet.name}`);
      created++;
    }

    console.log(`\n========================================`);
    console.log(`Created: ${created} outlets`);
    console.log(`Skipped: ${skipped} outlets (already exist)`);
    console.log(`========================================`);

    // Show all outlets for Company 2
    const allOutlets = await client.query(
      'SELECT id, name, address FROM outlets WHERE company_id = $1 ORDER BY name',
      [COMPANY_ID]
    );

    console.log(`\nAll outlets for Company 2:`);
    allOutlets.rows.forEach((o, i) => {
      console.log(`  ${i + 1}. ${o.name} (${o.address})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

seedOutlets();
