const https = require('https');

const BASE_URL = 'hrms-backend-1alt.onrender.com';

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  const results = [];

  console.log('=== QA TEST REPORT - PART 3 ===\n');
  console.log('Date:', new Date().toISOString());
  console.log('Focus: Clock-in, Final Security Checks, Cleanup\n');

  // Get admin token first
  const loginRes = await makeRequest('POST', '/auth/login', {
    username: 'superadmin',
    password: 'Test1234'
  });
  const adminToken = loginRes.data.token;

  // TEST 1: Correct Clock-In API Format
  console.log('--- TEST 1: Clock In with Correct Format ---');
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const clockInData = {
    employee_id: 'QA-EMP-001',
    clock_in_time: now,
    work_date: today,
    latitude: 3.1390,
    longitude: 101.6869,
    photo_url: null,
    notes: 'QA Test Clock In'
  };

  const clockInRes = await makeRequest('POST', '/clock-in', clockInData, adminToken);
  console.log('Action: Clock in with proper fields');
  console.log('Actual Status:', clockInRes.status);
  console.log('Response:', JSON.stringify(clockInRes.data, null, 2).substring(0, 400));

  if (clockInRes.status === 200 || clockInRes.status === 201) {
    console.log('Result: OK - Clock in recorded');
    results.push({ test: 'Clock In', result: 'OK' });
  } else if (clockInRes.status === 400 && clockInRes.data?.error?.includes('already')) {
    console.log('Result: OK - Already clocked in today');
    results.push({ test: 'Clock In', result: 'OK (already clocked in)' });
  } else {
    console.log('Result: BUG or UX Issue');
    results.push({ test: 'Clock In', result: 'UX Issue - check API requirements' });
  }
  console.log('\n');

  // TEST 2: Clock Out
  console.log('--- TEST 2: Clock Out ---');
  const clockOutData = {
    employee_id: 'QA-EMP-001',
    clock_out_time: new Date(Date.now() + 3600000).toISOString(),
    work_date: today
  };

  const clockOutRes = await makeRequest('POST', '/clock-out', clockOutData, adminToken);
  console.log('Action: Clock out');
  console.log('Actual Status:', clockOutRes.status);
  console.log('Response:', JSON.stringify(clockOutRes.data, null, 2).substring(0, 300));
  results.push({ test: 'Clock Out', result: (clockOutRes.status === 200 || clockOutRes.status === 201) ? 'OK' : 'UX Issue' });
  console.log('\n');

  // TEST 3: Verify XSS Employee was stored
  console.log('--- TEST 3: Verify XSS Test Data ---');
  const empsRes = await makeRequest('GET', '/employees?search=XSS', null, adminToken);
  const xssEmp = empsRes.data?.employees?.find(e => e.employee_id === 'XSS-TEST-001');

  if (xssEmp) {
    console.log('XSS Employee found in database:');
    console.log('  Name stored as:', xssEmp.name);

    if (xssEmp.name.includes('<script>')) {
      console.log('CONFIRMED: XSS payload stored in database without sanitization');
      console.log('This is a SECURITY RISK - XSS attacks possible');
      results.push({ test: 'XSS Stored Confirmed', result: 'SECURITY RISK' });
    }
  } else {
    console.log('XSS employee not found');
    results.push({ test: 'XSS Stored Check', result: 'OK (not stored)' });
  }
  console.log('\n');

  // TEST 4: Verify HR Deletion worked (check if employee 97 still exists)
  console.log('--- TEST 4: Verify HR Deletion Result ---');
  const emp97Check = await makeRequest('GET', '/employees/97', null, adminToken);
  console.log('Check employee 97 status:', emp97Check.status);

  if (emp97Check.status === 404) {
    console.log('CONFIRMED: HR user was able to DELETE employee 97');
    console.log('This is a SECURITY RISK - HR should not be able to delete');
    results.push({ test: 'HR Deletion Confirmed', result: 'SECURITY RISK' });
  } else {
    console.log('Employee 97 still exists');
    console.log('Employee data:', JSON.stringify(emp97Check.data, null, 2).substring(0, 200));
    results.push({ test: 'HR Deletion Check', result: 'OK (not deleted)' });
  }
  console.log('\n');

  // TEST 5: List all test data created
  console.log('--- TEST 5: Summary of All Test Data ---');

  // Get all companies
  const companiesRes = await makeRequest('GET', '/companies', null, adminToken);
  console.log('ALL COMPANIES:');
  companiesRes.data?.forEach(c => {
    console.log(`  [${c.id}] ${c.name} (${c.code}) - ${c.employee_count || 0} employees`);
  });
  console.log('');

  // Get test employees
  const allEmps = await makeRequest('GET', '/employees', null, adminToken);
  const testEmps = allEmps.data?.employees?.filter(e =>
    e.employee_id?.startsWith('QA-') ||
    e.employee_id?.startsWith('ISO-') ||
    e.employee_id?.startsWith('XSS-')
  ) || [];

  console.log('TEST EMPLOYEES CREATED:');
  testEmps.forEach(e => {
    console.log(`  [${e.id}] ${e.employee_id} - ${e.name}`);
    console.log(`      Company: ${e.company_id}, Status: ${e.status}`);
    console.log(`      IC: ${e.ic_number}`);
  });
  console.log('');

  // Get admin users
  const adminUsersRes = await makeRequest('GET', '/admin-users', null, adminToken);
  console.log('ADMIN USERS:');
  adminUsersRes.data?.forEach(u => {
    console.log(`  [${u.id}] ${u.username} - ${u.role} (${u.name})`);
  });
  console.log('\n');

  // TEST 6: Auto-generation test - check claims
  console.log('--- TEST 6: Claims Auto-approval Test ---');
  const claimData = {
    employee_id: 97,
    amount: 50.00,
    category: 'transport',
    description: 'QA Test Claim - should be pending',
    claim_date: today
  };

  const claimRes = await makeRequest('POST', '/claims', claimData, adminToken);
  console.log('Action: Submit claim');
  console.log('Status:', claimRes.status);
  console.log('Response:', JSON.stringify(claimRes.data, null, 2).substring(0, 300));

  if (claimRes.data?.status === 'pending') {
    console.log('Result: OK - Claim created as pending (requires approval)');
    results.push({ test: 'Claim Auto-approval', result: 'OK (pending)' });
  } else if (claimRes.data?.status === 'approved') {
    console.log('Result: UX Issue - Claim auto-approved (may be intended)');
    results.push({ test: 'Claim Auto-approval', result: 'UX Issue (auto-approved)' });
  }
  console.log('\n');

  // FINAL SUMMARY
  console.log('='.repeat(70));
  console.log('FINAL QA TEST REPORT');
  console.log('='.repeat(70));
  console.log('');

  console.log('TEST RESULTS SUMMARY:');
  results.forEach((r, i) => {
    const icon = r.result.includes('SECURITY') ? '!!' :
                 r.result.includes('BUG') ? 'XX' :
                 r.result.includes('OK') ? 'OK' : '--';
    console.log(`  [${icon}] ${r.test}: ${r.result}`);
  });

  console.log('');
  console.log('='.repeat(70));
  console.log('SECURITY ISSUES FOUND');
  console.log('='.repeat(70));
  const securityIssues = results.filter(r => r.result.includes('SECURITY'));
  if (securityIssues.length > 0) {
    securityIssues.forEach(s => {
      console.log(`  [CRITICAL] ${s.test}`);
    });
  } else {
    console.log('  No critical security issues in this batch');
  }
}

runTests().catch(console.error);
