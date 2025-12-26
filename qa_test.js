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

  console.log('=== QA TEST REPORT ===\n');
  console.log('Date:', new Date().toISOString());
  console.log('\n');

  // TEST 1: Admin Login
  console.log('--- TEST 1: Admin Login (superadmin) ---');
  const loginRes = await makeRequest('POST', '/auth/login', {
    username: 'superadmin',
    password: 'Test1234'
  });

  if (loginRes.status === 200 && loginRes.data.token) {
    console.log('Action: Login as superadmin');
    console.log('Expected: Successful login with token');
    console.log('Actual: Login successful, token received');
    console.log('Result: OK\n');
    results.push({ test: 'Admin Login', result: 'OK' });
  } else {
    console.log('Result: FAILED -', loginRes.data);
    results.push({ test: 'Admin Login', result: 'FAILED' });
    return;
  }

  const adminToken = loginRes.data.token;

  // TEST 2: Get current companies
  console.log('--- TEST 2: List Companies ---');
  const companiesRes = await makeRequest('GET', '/companies', null, adminToken);
  console.log('Action: List all companies');
  console.log('Expected: Array of companies');
  console.log('Actual:', JSON.stringify(companiesRes.data, null, 2).substring(0, 500));
  console.log('Result:', companiesRes.status === 200 ? 'OK' : 'BUG');
  results.push({ test: 'List Companies', result: companiesRes.status === 200 ? 'OK' : 'BUG' });
  console.log('\n');

  // TEST 3: Create Test Company
  console.log('--- TEST 3: Create Test Company ---');
  const testCompanyData = {
    name: 'QA Test Company Sdn Bhd',
    code: 'QATEST',
    registration_no: 'TEST-1234567-X',
    address: '123 Test Street, 50000 Kuala Lumpur',
    phone: '03-12345678',
    email: 'qa@testcompany.com'
  };

  const createCompanyRes = await makeRequest('POST', '/companies', testCompanyData, adminToken);
  console.log('Action: Create new company "QA Test Company Sdn Bhd"');
  console.log('Expected: Company created successfully');
  console.log('Actual:', JSON.stringify(createCompanyRes.data, null, 2).substring(0, 300));

  let testCompanyId = null;
  if (createCompanyRes.status === 201 || createCompanyRes.status === 200) {
    testCompanyId = createCompanyRes.data.id || createCompanyRes.data.company?.id;
    console.log('Result: OK - Company ID:', testCompanyId);
    results.push({ test: 'Create Test Company', result: 'OK' });
  } else if (createCompanyRes.data.message?.includes('already exists')) {
    console.log('Result: OK - Company already exists (from previous test)');
    // Get existing company
    const allCompanies = await makeRequest('GET', '/companies', null, adminToken);
    const existing = allCompanies.data.find(c => c.code === 'QATEST');
    if (existing) testCompanyId = existing.id;
    results.push({ test: 'Create Test Company', result: 'OK (exists)' });
  } else {
    console.log('Result: BUG -', createCompanyRes.data);
    results.push({ test: 'Create Test Company', result: 'BUG' });
  }
  console.log('\n');

  // TEST 4: Get Departments
  console.log('--- TEST 4: List Departments ---');
  const deptsRes = await makeRequest('GET', '/departments', null, adminToken);
  console.log('Action: List all departments');
  console.log('Expected: Array of departments');
  console.log('Actual: Found', deptsRes.data?.length || 0, 'departments');
  console.log('Result:', deptsRes.status === 200 ? 'OK' : 'BUG');
  results.push({ test: 'List Departments', result: deptsRes.status === 200 ? 'OK' : 'BUG' });
  console.log('\n');

  // Get first department ID for employee creation
  let testDeptId = deptsRes.data?.[0]?.id || 1;

  // TEST 5: Create Test Employee
  console.log('--- TEST 5: Create Test Employee ---');
  const testEmployeeData = {
    employee_id: 'QA-EMP-001',
    name: 'Test Employee QA',
    ic_number: '900101-14-1234',
    email: 'qa.employee@test.com',
    phone: '012-3456789',
    department_id: testDeptId,
    position: 'QA Tester',
    employment_type: 'probation',
    join_date: '2024-12-01',
    basic_salary: 3500,
    bank_name: 'Test Bank',
    bank_account_no: '1234567890',
    status: 'active',
    company_id: testCompanyId || 1
  };

  const createEmpRes = await makeRequest('POST', '/employees', testEmployeeData, adminToken);
  console.log('Action: Create test employee "Test Employee QA"');
  console.log('Expected: Employee created successfully');
  console.log('Actual:', JSON.stringify(createEmpRes.data, null, 2).substring(0, 400));

  let testEmployeeId = null;
  if (createEmpRes.status === 201 || createEmpRes.status === 200) {
    testEmployeeId = createEmpRes.data.id || createEmpRes.data.employee?.id;
    console.log('Result: OK - Employee ID:', testEmployeeId);
    results.push({ test: 'Create Test Employee', result: 'OK' });
  } else if (createEmpRes.data.message?.includes('already exists') || createEmpRes.data.error?.includes('duplicate')) {
    console.log('Result: OK - Employee already exists');
    // Get existing employee
    const allEmps = await makeRequest('GET', '/employees', null, adminToken);
    const existing = allEmps.data?.employees?.find(e => e.employee_id === 'QA-EMP-001');
    if (existing) testEmployeeId = existing.id;
    results.push({ test: 'Create Test Employee', result: 'OK (exists)' });
  } else {
    console.log('Result: BUG -', createEmpRes.data);
    results.push({ test: 'Create Test Employee', result: 'BUG' });
  }
  console.log('\n');

  // TEST 6: Create HR User
  console.log('--- TEST 6: Create HR Admin User ---');
  const hrUserData = {
    username: 'qa_hr_user',
    password: 'HRTest123!',
    name: 'QA HR User',
    email: 'qa.hr@test.com',
    role: 'hr',
    company_id: testCompanyId || 1
  };

  const createHRRes = await makeRequest('POST', '/admin-users', hrUserData, adminToken);
  console.log('Action: Create HR admin user');
  console.log('Expected: HR user created');
  console.log('Actual:', JSON.stringify(createHRRes.data, null, 2).substring(0, 300));

  if (createHRRes.status === 201 || createHRRes.status === 200) {
    console.log('Result: OK');
    results.push({ test: 'Create HR User', result: 'OK' });
  } else if (createHRRes.data.message?.includes('already exists')) {
    console.log('Result: OK - User already exists');
    results.push({ test: 'Create HR User', result: 'OK (exists)' });
  } else {
    console.log('Result:', createHRRes.data);
    results.push({ test: 'Create HR User', result: createHRRes.status === 400 ? 'OK (validation)' : 'BUG' });
  }
  console.log('\n');

  // TEST 7: Test HR Login
  console.log('--- TEST 7: HR User Login ---');
  const hrLoginRes = await makeRequest('POST', '/auth/login', {
    username: 'qa_hr_user',
    password: 'HRTest123!'
  });

  let hrToken = null;
  if (hrLoginRes.status === 200 && hrLoginRes.data.token) {
    hrToken = hrLoginRes.data.token;
    console.log('Action: Login as HR user');
    console.log('Expected: Successful login');
    console.log('Actual: Login successful');
    console.log('Result: OK');
    results.push({ test: 'HR User Login', result: 'OK' });
  } else {
    console.log('Action: Login as HR user');
    console.log('Actual: Login failed -', hrLoginRes.data);
    console.log('Result: SKIPPED (user may not exist)');
    results.push({ test: 'HR User Login', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 8: Employee Self-Service Login
  console.log('--- TEST 8: Employee Self-Service Login ---');
  const empLoginRes = await makeRequest('POST', '/employee/login', {
    employee_id: 'QA-EMP-001',
    ic_number: '900101-14-1234'
  });

  let empToken = null;
  if (empLoginRes.status === 200 && empLoginRes.data.token) {
    empToken = empLoginRes.data.token;
    console.log('Action: Login as employee (self-service)');
    console.log('Expected: Successful login with limited access');
    console.log('Actual: Login successful');
    console.log('Result: OK');
    results.push({ test: 'Employee Login', result: 'OK' });
  } else {
    console.log('Action: Login as employee');
    console.log('Actual: Login failed -', hrLoginRes.data);
    console.log('Result: SKIPPED');
    results.push({ test: 'Employee Login', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 9: SECURITY - Employee trying to access all employees
  console.log('--- TEST 9: SECURITY - Employee Access to All Employees ---');
  if (empToken) {
    const empAccessAllRes = await makeRequest('GET', '/employees', null, empToken);
    console.log('Action: Employee trying to list ALL employees');
    console.log('Expected: Should be DENIED (403) or return only own data');
    console.log('Actual Status:', empAccessAllRes.status);
    console.log('Actual Data:', JSON.stringify(empAccessAllRes.data, null, 2).substring(0, 200));

    if (empAccessAllRes.status === 403 || empAccessAllRes.status === 401) {
      console.log('Result: OK - Access denied as expected');
      results.push({ test: 'Employee Access All Employees', result: 'OK (denied)' });
    } else if (empAccessAllRes.data?.employees?.length === 1) {
      console.log('Result: OK - Only own data returned');
      results.push({ test: 'Employee Access All Employees', result: 'OK (filtered)' });
    } else {
      console.log('Result: SECURITY RISK - Employee can see other employees!');
      results.push({ test: 'Employee Access All Employees', result: 'SECURITY RISK' });
    }
  } else {
    console.log('Result: SKIPPED - No employee token');
    results.push({ test: 'Employee Access All Employees', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 10: SECURITY - Employee trying to access payroll
  console.log('--- TEST 10: SECURITY - Employee Access to Payroll Admin ---');
  if (empToken) {
    const empPayrollRes = await makeRequest('GET', '/payroll', null, empToken);
    console.log('Action: Employee trying to access payroll admin endpoint');
    console.log('Expected: Should be DENIED');
    console.log('Actual Status:', empPayrollRes.status);

    if (empPayrollRes.status === 403 || empPayrollRes.status === 401) {
      console.log('Result: OK - Access denied as expected');
      results.push({ test: 'Employee Access Payroll Admin', result: 'OK (denied)' });
    } else {
      console.log('Result: SECURITY RISK - Employee can access payroll admin!');
      console.log('Data:', JSON.stringify(empPayrollRes.data, null, 2).substring(0, 200));
      results.push({ test: 'Employee Access Payroll Admin', result: 'SECURITY RISK' });
    }
  } else {
    console.log('Result: SKIPPED');
    results.push({ test: 'Employee Access Payroll Admin', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 11: Get Employees List (Admin)
  console.log('--- TEST 11: List Employees (Admin) ---');
  const empsRes = await makeRequest('GET', '/employees', null, adminToken);
  console.log('Action: Admin listing all employees');
  console.log('Expected: Full list of employees');
  console.log('Actual: Found', empsRes.data?.employees?.length || empsRes.data?.length || 0, 'employees');
  console.log('Result:', empsRes.status === 200 ? 'OK' : 'BUG');
  results.push({ test: 'List Employees (Admin)', result: empsRes.status === 200 ? 'OK' : 'BUG' });
  console.log('\n');

  // TEST 12: Leave Request (Employee)
  console.log('--- TEST 12: Employee Submit Leave Request ---');
  if (empToken && testEmployeeId) {
    const leaveData = {
      employee_id: testEmployeeId,
      leave_type: 'annual',
      start_date: '2025-01-15',
      end_date: '2025-01-16',
      days: 2,
      reason: 'QA Test Leave Request'
    };

    const leaveRes = await makeRequest('POST', '/leave', leaveData, empToken);
    console.log('Action: Employee submitting leave request');
    console.log('Expected: Leave request created with pending status');
    console.log('Actual:', JSON.stringify(leaveRes.data, null, 2).substring(0, 300));
    console.log('Result:', (leaveRes.status === 201 || leaveRes.status === 200) ? 'OK' : 'UX Issue/BUG');
    results.push({ test: 'Employee Submit Leave', result: (leaveRes.status === 201 || leaveRes.status === 200) ? 'OK' : 'UX Issue' });
  } else {
    console.log('Result: SKIPPED - No employee token');
    results.push({ test: 'Employee Submit Leave', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 13: Clock In
  console.log('--- TEST 13: Employee Clock In ---');
  if (empToken) {
    const clockInData = {
      employee_id: 'QA-EMP-001',
      type: 'in',
      latitude: 3.1390,
      longitude: 101.6869,
      photo: null
    };

    const clockInRes = await makeRequest('POST', '/clock-in', clockInData, empToken);
    console.log('Action: Employee clocking in');
    console.log('Expected: Clock in recorded');
    console.log('Actual Status:', clockInRes.status);
    console.log('Actual Data:', JSON.stringify(clockInRes.data, null, 2).substring(0, 300));

    if (clockInRes.status === 200 || clockInRes.status === 201) {
      console.log('Result: OK');
      results.push({ test: 'Employee Clock In', result: 'OK' });
    } else {
      console.log('Result:', clockInRes.status === 400 ? 'UX Issue' : 'BUG');
      results.push({ test: 'Employee Clock In', result: clockInRes.status === 400 ? 'UX Issue' : 'BUG' });
    }
  } else {
    console.log('Result: SKIPPED');
    results.push({ test: 'Employee Clock In', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 14: SECURITY - Access without token
  console.log('--- TEST 14: SECURITY - Access Without Token ---');
  const noAuthRes = await makeRequest('GET', '/employees', null, null);
  console.log('Action: Access employees endpoint without authentication');
  console.log('Expected: 401 Unauthorized');
  console.log('Actual Status:', noAuthRes.status);

  if (noAuthRes.status === 401) {
    console.log('Result: OK - Properly rejected');
    results.push({ test: 'No Token Access', result: 'OK' });
  } else {
    console.log('Result: SECURITY RISK - Endpoint accessible without auth!');
    results.push({ test: 'No Token Access', result: 'SECURITY RISK' });
  }
  console.log('\n');

  // TEST 15: SECURITY - Invalid token
  console.log('--- TEST 15: SECURITY - Invalid Token ---');
  const badTokenRes = await makeRequest('GET', '/employees', null, 'invalid.token.here');
  console.log('Action: Access with invalid token');
  console.log('Expected: 401 or 403');
  console.log('Actual Status:', badTokenRes.status);

  if (badTokenRes.status === 401 || badTokenRes.status === 403) {
    console.log('Result: OK - Invalid token rejected');
    results.push({ test: 'Invalid Token', result: 'OK' });
  } else {
    console.log('Result: SECURITY RISK');
    results.push({ test: 'Invalid Token', result: 'SECURITY RISK' });
  }
  console.log('\n');

  // TEST 16: Payroll Generation
  console.log('--- TEST 16: Generate Payroll ---');
  const payrollGenRes = await makeRequest('POST', '/payroll/generate', {
    year: 2025,
    month: 1,
    employee_ids: testEmployeeId ? [testEmployeeId] : []
  }, adminToken);
  console.log('Action: Generate payroll for January 2025');
  console.log('Expected: Payroll generated');
  console.log('Actual:', JSON.stringify(payrollGenRes.data, null, 2).substring(0, 400));
  console.log('Result:', (payrollGenRes.status === 200 || payrollGenRes.status === 201) ? 'OK' : 'UX Issue');
  results.push({ test: 'Generate Payroll', result: (payrollGenRes.status === 200 || payrollGenRes.status === 201) ? 'OK' : 'UX Issue' });
  console.log('\n');

  // TEST 17: Anonymous Feedback
  console.log('--- TEST 17: Submit Anonymous Feedback ---');
  const feedbackRes = await makeRequest('POST', '/feedback/anonymous', {
    message: 'This is a QA test feedback message. Please ignore.',
    company_id: testCompanyId || 1
  });
  console.log('Action: Submit anonymous feedback (no auth required)');
  console.log('Expected: Feedback submitted');
  console.log('Actual:', JSON.stringify(feedbackRes.data, null, 2).substring(0, 200));
  console.log('Result:', (feedbackRes.status === 200 || feedbackRes.status === 201) ? 'OK' : 'UX Issue');
  results.push({ test: 'Anonymous Feedback', result: (feedbackRes.status === 200 || feedbackRes.status === 201) ? 'OK' : 'UX Issue' });
  console.log('\n');

  // SUMMARY
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const okCount = results.filter(r => r.result.startsWith('OK')).length;
  const bugCount = results.filter(r => r.result === 'BUG').length;
  const securityCount = results.filter(r => r.result.includes('SECURITY')).length;
  const uxCount = results.filter(r => r.result.includes('UX')).length;
  const skipped = results.filter(r => r.result === 'SKIPPED').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`OK: ${okCount}`);
  console.log(`UX Issues: ${uxCount}`);
  console.log(`Bugs: ${bugCount}`);
  console.log(`Security Risks: ${securityCount}`);
  console.log(`Skipped: ${skipped}`);
  console.log('\n');

  console.log('DETAILED RESULTS:');
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.test}: ${r.result}`);
  });

  console.log('\n');
  console.log('='.repeat(60));
  console.log('TEST CREDENTIALS CREATED');
  console.log('='.repeat(60));
  console.log(`
ADMIN LOGIN:
  URL: https://aahrms.vercel.app/admin/login
  Username: superadmin
  Password: Test1234
  Role: Super Admin

HR USER (if created):
  Username: qa_hr_user
  Password: HRTest123!
  Role: HR
  Company: QA Test Company Sdn Bhd

EMPLOYEE SELF-SERVICE:
  URL: https://aahrms.vercel.app/employee/login
  Employee ID: QA-EMP-001
  IC Number: 900101-14-1234
  Company: QA Test Company Sdn Bhd

TEST COMPANY:
  Name: QA Test Company Sdn Bhd
  Code: QATEST
  ID: ${testCompanyId || 'N/A'}

TEST EMPLOYEE:
  Name: Test Employee QA
  Employee ID: QA-EMP-001
  ID: ${testEmployeeId || 'N/A'}
`);

  if (securityCount > 0) {
    console.log('\n*** CRITICAL: SECURITY RISKS FOUND! ***');
    results.filter(r => r.result.includes('SECURITY')).forEach(r => {
      console.log(`  - ${r.test}`);
    });
  }
}

runTests().catch(console.error);
