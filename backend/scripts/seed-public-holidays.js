/**
 * Seed Malaysia Public Holidays for 2025 and 2026
 * Run: node scripts/seed-public-holidays.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Malaysia Federal Public Holidays
const holidays = [
  // 2025
  { date: '2025-01-01', name: 'New Year\'s Day', year: 2025 },
  { date: '2025-01-29', name: 'Chinese New Year', year: 2025 },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)', year: 2025 },
  { date: '2025-03-31', name: 'Hari Raya Aidilfitri', year: 2025 },
  { date: '2025-04-01', name: 'Hari Raya Aidilfitri (Day 2)', year: 2025 },
  { date: '2025-05-01', name: 'Labour Day', year: 2025 },
  { date: '2025-05-12', name: 'Wesak Day', year: 2025 },
  { date: '2025-06-02', name: 'Yang di-Pertuan Agong Birthday', year: 2025 },
  { date: '2025-06-07', name: 'Hari Raya Haji', year: 2025 },
  { date: '2025-06-27', name: 'Awal Muharram', year: 2025 },
  { date: '2025-08-31', name: 'Merdeka Day (National Day)', year: 2025 },
  { date: '2025-09-05', name: 'Maulidur Rasul', year: 2025 },
  { date: '2025-09-16', name: 'Malaysia Day', year: 2025 },
  { date: '2025-10-20', name: 'Deepavali', year: 2025 },
  { date: '2025-12-25', name: 'Christmas Day', year: 2025 },

  // 2026
  { date: '2026-01-01', name: 'New Year\'s Day', year: 2026 },
  { date: '2026-02-17', name: 'Chinese New Year', year: 2026 },
  { date: '2026-02-18', name: 'Chinese New Year (Day 2)', year: 2026 },
  { date: '2026-03-21', name: 'Hari Raya Aidilfitri', year: 2026 },
  { date: '2026-03-22', name: 'Hari Raya Aidilfitri (Day 2)', year: 2026 },
  { date: '2026-05-01', name: 'Labour Day', year: 2026 },
  { date: '2026-05-27', name: 'Hari Raya Haji', year: 2026 },
  { date: '2026-05-31', name: 'Wesak Day', year: 2026 },
  { date: '2026-06-01', name: 'Yang di-Pertuan Agong Birthday', year: 2026 },
  { date: '2026-06-17', name: 'Awal Muharram', year: 2026 },
  { date: '2026-08-25', name: 'Maulidur Rasul', year: 2026 },
  { date: '2026-08-31', name: 'Merdeka Day (National Day)', year: 2026 },
  { date: '2026-09-16', name: 'Malaysia Day', year: 2026 },
  { date: '2026-11-08', name: 'Deepavali', year: 2026 },
  { date: '2026-12-25', name: 'Christmas Day', year: 2026 },
];

async function seedHolidays() {
  try {
    // Get all companies
    const companies = await pool.query('SELECT id, name FROM companies');

    console.log('Seeding public holidays for companies:');
    companies.rows.forEach(c => console.log('  - ' + c.name + ' (ID: ' + c.id + ')'));

    let inserted = 0;
    let skipped = 0;

    for (const company of companies.rows) {
      for (const holiday of holidays) {
        // Check if already exists
        const existing = await pool.query(
          'SELECT id FROM public_holidays WHERE company_id = $1 AND date = $2',
          [company.id, holiday.date]
        );

        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO public_holidays (company_id, name, date, year, extra_pay)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [company.id, holiday.name, holiday.date, holiday.year]
          );
          inserted++;
        } else {
          skipped++;
        }
      }
    }

    console.log('\nDone!');
    console.log('Inserted: ' + inserted);
    console.log('Skipped (already exists): ' + skipped);

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seedHolidays();
