const pool = require('../db');

async function check() {
  // Find employee
  const emp = await pool.query(`
    SELECT e.id, e.name, e.company_id, e.status, e.email, c.name as company_name,
           e.employment_type, e.work_type
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    WHERE e.name ILIKE '%goh%xiao%' OR e.name ILIKE '%xiao%hui%'
  `);

  if (emp.rows.length === 0) {
    console.log('Employee not found');
    process.exit(0);
  }

  console.log('=== EMPLOYEE ===');
  const e = emp.rows[0];
  console.log('ID:', e.id);
  console.log('Name:', e.name);
  console.log('Company:', e.company_name, '(ID:', e.company_id, ')');
  console.log('Status:', e.status);
  console.log('Email:', e.email);
  console.log('Employment Type:', e.employment_type);
  console.log('Work Type:', e.work_type);

  // Check recent claims
  const claims = await pool.query(`
    SELECT id, amount, category, status, created_at::text, claim_date::text, rejection_reason
    FROM claims
    WHERE employee_id = $1
    ORDER BY created_at DESC
    LIMIT 5
  `, [e.id]);

  console.log('\n=== RECENT CLAIMS ===');
  if (claims.rows.length === 0) {
    console.log('No claims found');
  } else {
    claims.rows.forEach(c => {
      console.log(`ID: ${c.id} | RM${c.amount} | ${c.category} | ${c.status} | Date: ${c.claim_date}`);
      if (c.rejection_reason) console.log(`  Rejection: ${c.rejection_reason}`);
    });
  }

  // Check company claim settings
  const settings = await pool.query(`
    SELECT claims_enabled, claims_require_receipt_above, claims_auto_approve, claims_auto_approve_max_amount
    FROM companies WHERE id = $1
  `, [e.company_id]);

  console.log('\n=== COMPANY CLAIM SETTINGS ===');
  if (settings.rows.length > 0) {
    const s = settings.rows[0];
    console.log('Claims enabled:', s.claims_enabled);
    console.log('Require receipt above:', s.claims_require_receipt_above);
    console.log('Auto approve:', s.claims_auto_approve);
    console.log('Auto approve max:', s.claims_auto_approve_max_amount);
  }

  // Check employee features
  const features = await pool.query(`
    SELECT
      COALESCE((c.ess_features->>'claims')::boolean, true) as claims_feature
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    WHERE e.id = $1
  `, [e.id]);

  console.log('\n=== ESS FEATURES ===');
  if (features.rows.length > 0) {
    console.log('Claims feature enabled:', features.rows[0].claims_feature);
  }

  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
