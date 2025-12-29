/**
 * Seed 11 Mimix A outlets
 * Run: node scripts/seed-mimix-outlets.js
 */

require('dotenv').config();
const pool = require('../db');

const MIMIX_COMPANY_ID = 3; // Mimix A Sdn Bhd

const outlets = [
  { name: 'Mimix A IOI Mall Putrajaya', address: 'IOI Mall Putrajaya, Putrajaya' },
  { name: 'Mimix A IOI City Mall', address: 'IOI City Mall, Putrajaya' },
  { name: 'Mimix A Mid Valley', address: 'Mid Valley Megamall, Kuala Lumpur' },
  { name: 'Mimix A Sunway Pyramid', address: 'Sunway Pyramid, Bandar Sunway, Selangor' },
  { name: 'Mimix A One Utama', address: '1 Utama Shopping Centre, Petaling Jaya, Selangor' },
  { name: 'Mimix A KLCC', address: 'Suria KLCC, Kuala Lumpur' },
  { name: 'Mimix A Pavilion KL', address: 'Pavilion Kuala Lumpur, Bukit Bintang' },
  { name: 'Mimix A Johor Bahru', address: 'Johor Bahru City Centre, Johor' },
  { name: 'Mimix A Penang', address: 'Gurney Plaza, George Town, Penang' },
  { name: 'Mimix A Ipoh', address: 'Ipoh Parade, Ipoh, Perak' },
  { name: 'Mimix A Kota Kinabalu', address: 'Imago Shopping Mall, Kota Kinabalu, Sabah' }
];

async function seedOutlets() {
  const client = await pool.connect();

  try {
    console.log('Starting Mimix A outlets seeding...\n');

    // Check if company exists
    const companyCheck = await client.query(
      'SELECT id, name FROM companies WHERE id = $1',
      [MIMIX_COMPANY_ID]
    );

    if (companyCheck.rows.length === 0) {
      console.log('Error: Company ID 3 (Mimix A) not found!');
      console.log('Please create the company first.');
      return;
    }

    console.log(`Found company: ${companyCheck.rows[0].name}\n`);

    // Check existing outlets
    const existingOutlets = await client.query(
      'SELECT name FROM outlets WHERE company_id = $1',
      [MIMIX_COMPANY_ID]
    );

    const existingNames = new Set(existingOutlets.rows.map(o => o.name));
    console.log(`Existing outlets: ${existingOutlets.rows.length}`);

    let created = 0;
    let skipped = 0;

    for (const outlet of outlets) {
      if (existingNames.has(outlet.name)) {
        console.log(`⏭️  Skipping (exists): ${outlet.name}`);
        skipped++;
        continue;
      }

      await client.query(
        'INSERT INTO outlets (company_id, name, address) VALUES ($1, $2, $3)',
        [MIMIX_COMPANY_ID, outlet.name, outlet.address]
      );

      console.log(`✅ Created: ${outlet.name}`);
      created++;
    }

    console.log('\n--- Summary ---');
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total outlets now: ${created + existingOutlets.rows.length}`);

    // List all outlets
    const allOutlets = await client.query(
      'SELECT id, name FROM outlets WHERE company_id = $1 ORDER BY name',
      [MIMIX_COMPANY_ID]
    );

    console.log('\n--- All Mimix A Outlets ---');
    allOutlets.rows.forEach((o, i) => {
      console.log(`${i + 1}. [ID: ${o.id}] ${o.name}`);
    });

  } catch (error) {
    console.error('Error seeding outlets:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedOutlets();
