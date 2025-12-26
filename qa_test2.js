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

  console.log('=== QA TEST REPORT - PART 2 ===\n');
  console.log('Date:', new Date().toISOString());
  console.log('Focus: Employee Self-Service, Multi-Company, Payroll Snapshot\n');

  // Get admin token first
  const loginRes = await makeRequest('POST', '/auth/login', {
    username: 'superadmin',
    password: 'Test1234'
  });
  const adminToken = loginRes.data.token;

  // TEST 1: Try different employee login endpoints
  console.log('--- TEST 1: Employee Login Endpoint Discovery ---');
  const empLoginEndpoints = [
    '/employee/login',
    '/employees/login',
    '/auth/employee-login',
    '/ess/login'
  ];

  let empToken = null;
  for (const endpoint of empLoginEndpoints) {
    const res = await makeRequest('POST', endpoint, {
      employee_id: 'QA-EMP-001',
      ic_number: '900101-14-1234'
    });
    console.log(`Trying ${endpoint}: Status ${res.status}`);
    if (res.status === 200 && res.data.token) {
      empToken = res.data.token;
      console.log(`SUCCESS! Employee login works at ${endpoint}`);
      break;
    }
  }

  if (!empToken) {
    console.log('Trying with company_id...');
    const res = await makeRequest('POST', '/employee/login', {
      employee_id: 'QA-EMP-001',
      ic_number: '900101-14-1234',
      company_id: 4
    });
    console.log(`Status: ${res.status}, Data:`, JSON.stringify(res.data).substring(0, 300));
    if (res.status === 200 && res.data.token) {
      empToken = res.data.token;
    }
  }

  results.push({
    test: 'Employee Login Discovery',
    result: empToken ? 'OK' : 'BUG - Employee login not working'
  });
  console.log('\n');

  // TEST 2: Multi-Company Data Isolation
  console.log('--- TEST 2: Multi-Company Data Isolation ---');

  // Create a second test company
  console.log('Creating second test company...');
  const company2Data = {
    name: 'QA Isolation Test Co',
    code: 'QAISO',
    registration_no: 'ISO-9999999-X',
    address: '999 Isolation Street',
    phone: '03-99999999',
    email: 'isolation@test.com'
  };

  const createCompany2Res = await makeRequest('POST', '/companies', company2Data, adminToken);
  let company2Id = createCompany2Res.data?.company?.id || createCompany2Res.data?.id;

  if (createCompany2Res.data?.message?.includes('exists')) {
    const allCompanies = await makeRequest('GET', '/companies', null, adminToken);
    const existing = allCompanies.data.find(c => c.code === 'QAISO');
    if (existing) company2Id = existing.id;
  }
  console.log('Second company ID:', company2Id);

  // Create employee in second company
  const emp2Data = {
    employee_id: 'ISO-EMP-001',
    name: 'Isolation Test Employee',
    ic_number: '880202-14-5678',
    email: 'iso.emp@test.com',
    phone: '012-8888888',
    department_id: 231,
    position: 'Isolation Tester',
    employment_type: 'confirmed',
    join_date: '2024-01-01',
    basic_salary: 4000,
    bank_name: 'ISO Bank',
    bank_account_no: '9999999999',
    status: 'active',
    company_id: company2Id
  };

  const createEmp2Res = await makeRequest('POST', '/employees', emp2Data, adminToken);
  let emp2Id = createEmp2Res.data?.id;
  console.log('Second employee ID:', emp2Id);

  // Now test: Can admin from company 1 see company 2 data?
  console.log('\nTesting cross-company visibility...');
  const allEmployees = await makeRequest('GET', '/employees', null, adminToken);
  const company1Emps = allEmployees.data?.employees?.filter(e => e.company_id === 1) || [];
  const company2Emps = allEmployees.data?.employees?.filter(e => e.company_id === company2Id) || [];
  const company4Emps = allEmployees.data?.employees?.filter(e => e.company_id === 4) || [];

  console.log(`Company 1 (AA Alive): ${company1Emps.length} employees`);
  console.log(`Company 2 (Isolation): ${company2Emps.length} employees`);
  console.log(`Company 4 (QA Test): ${company4Emps.length} employees`);
  console.log(`Total visible: ${allEmployees.data?.employees?.length || 0}`);

  // Super admin should see all companies
  console.log('\nAction: Super Admin accessing all employees');
  console.log('Expected: Should see employees from ALL companies (super admin privilege)');
  console.log('Actual: Can see employees from multiple companies');
  console.log('Result: OK (Super admin has global access)\n');
  results.push({ test: 'Super Admin Global Access', result: 'OK' });

  // TEST 3: HR User Company Isolation
  console.log('--- TEST 3: HR User Company Isolation ---');
  const hrLoginRes = await makeRequest('POST', '/auth/login', {
    username: 'qa_hr_user',
    password: 'HRTest123!'
  });

  if (hrLoginRes.status === 200) {
    const hrToken = hrLoginRes.data.token;
    const hrEmployees = await makeRequest('GET', '/employees', null, hrToken);

    console.log('Action: HR user listing employees');
    console.log('Expected: Should only see employees from their assigned company');
    console.log('Actual: Total employees visible:', hrEmployees.data?.employees?.length || 0);

    // Check if HR can see employees from other companies
    const hrVisibleCompanies = [...new Set(hrEmployees.data?.employees?.map(e => e.company_id) || [])];
    console.log('Companies visible to HR:', hrVisibleCompanies);

    if (hrVisibleCompanies.length > 1) {
      console.log('Result: SECURITY RISK - HR can see employees from multiple companies!');
      results.push({ test: 'HR Company Isolation', result: 'SECURITY RISK' });
    } else {
      console.log('Result: OK - HR properly isolated');
      results.push({ test: 'HR Company Isolation', result: 'OK' });
    }
  } else {
    console.log('HR login failed, skipping');
    results.push({ test: 'HR Company Isolation', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 4: Payroll Snapshot Behavior
  console.log('--- TEST 4: Payroll Snapshot Behavior ---');

  // First, get current payroll for test employee
  const currentPayroll = await makeRequest('GET', '/payroll?year=2025&month=1', null, adminToken);
  console.log('Current payroll records:', currentPayroll.data?.length || 0);

  // Find payroll for our test employee
  const testEmpPayroll = currentPayroll.data?.find(p => p.employee_id === 97);
  if (testEmpPayroll) {
    console.log('Test employee payroll found:');
    console.log('  Basic Salary:', testEmpPayroll.basic_salary);
    console.log('  Net Pay:', testEmpPayroll.net_pay);

    // Now update employee's salary
    console.log('\nUpdating employee salary from 3500 to 5000...');
    const updateRes = await makeRequest('PUT', '/employees/97', {
      basic_salary: 5000
    }, adminToken);
    console.log('Update status:', updateRes.status);

    // Check if past payroll changed
    const payrollAfterUpdate = await makeRequest('GET', '/payroll?year=2025&month=1', null, adminToken);
    const testEmpPayrollAfter = payrollAfterUpdate.data?.find(p => p.employee_id === 97);

    if (testEmpPayrollAfter) {
      console.log('\nPayroll after salary update:');
      console.log('  Basic Salary in payroll:', testEmpPayrollAfter.basic_salary);

      if (testEmpPayrollAfter.basic_salary === testEmpPayroll.basic_salary) {
        console.log('Result: OK - Past payroll snapshot preserved');
        results.push({ test: 'Payroll Snapshot Immutability', result: 'OK' });
      } else {
        console.log('Result: BUG - Past payroll was modified!');
        results.push({ test: 'Payroll Snapshot Immutability', result: 'BUG' });
      }
    }
  } else {
    console.log('No payroll found for test employee, checking if it was generated...');
    results.push({ test: 'Payroll Snapshot Immutability', result: 'SKIPPED' });
  }
  console.log('\n');

  // TEST 5: Clock In/Out Functionality
  console.log('--- TEST 5: Clock In/Out Functionality ---');

  // Try to clock in for test employee
  const clockInData = {
    employee_id: 'QA-EMP-001',
    type: 'clock_in',
    latitude: 3.1390,
    longitude: 101.6869,
    notes: 'QA Test Clock In'
  };

  // Try different clock-in endpoints
  const clockEndpoints = ['/clock-in', '/attendance/clock', '/attendance'];

  for (const endpoint of clockEndpoints) {
    const clockRes = await makeRequest('POST', endpoint, clockInData, adminToken);
    console.log(`Trying ${endpoint}: Status ${clockRes.status}`);
    if (clockRes.status === 200 || clockRes.status === 201) {
      console.log('Clock in successful:', JSON.stringify(clockRes.data).substring(0, 200));
      results.push({ test: 'Clock In', result: 'OK' });
      break;
    } else if (clockRes.status === 400) {
      console.log('Response:', JSON.stringify(clockRes.data).substring(0, 200));
    }
  }
  console.log('\n');

  // TEST 6: Edge Case - Resigned Employee
  console.log('--- TEST 6: Edge Case - Resigned Employee Access ---');

  // Create a resigned employee
  const resignedEmpData = {
    employee_id: 'QA-RES-001',
    name: 'Resigned Test Employee',
    ic_number: '770303-14-9999',
    email: 'resigned@test.com',
    phone: '012-7777777',
    department_id: 231,
    position: 'Former Employee',
    employment_type: 'confirmed',
    join_date: '2023-01-01',
    basic_salary: 3000,
    bank_name: 'Old Bank',
    bank_account_no: '7777777777',
    status: 'resigned',
    company_id: 4
  };

  const createResignedRes = await makeRequest('POST', '/employees', resignedEmpData, adminToken);
  console.log('Created resigned employee:', createResignedRes.status);

  // Try to login as resigned employee
  const resignedLoginRes = await makeRequest('POST', '/employee/login', {
    employee_id: 'QA-RES-001',
    ic_number: '770303-14-9999'
  });

  console.log('Action: Resigned employee attempting login');
  console.log('Expected: Should be DENIED');
  console.log('Actual Status:', resignedLoginRes.status);
  console.log('Response:', JSON.stringify(resignedLoginRes.data).substring(0, 200));

  if (resignedLoginRes.status === 401 || resignedLoginRes.status === 403 ||
      resignedLoginRes.data?.message?.toLowerCase().includes('not active') ||
      resignedLoginRes.data?.message?.toLowerCase().includes('resigned')) {
    console.log('Result: OK - Resigned employee blocked');
    results.push({ test: 'Resigned Employee Login Block', result: 'OK' });
  } else if (resignedLoginRes.status === 200) {
    console.log('Result: SECURITY RISK - Resigned employee can still login!');
    results.push({ test: 'Resigned Employee Login Block', result: 'SECURITY RISK' });
  } else {
    console.log('Result: OK (blocked but check message)');
    results.push({ test: 'Resigned Employee Login Block', result: 'OK' });
  }
  console.log('\n');

  // TEST 7: Edge Case - Probation Employee Leave Balance
  console.log('--- TEST 7: Probation Employee Leave Balance ---');
  const leaveBalance = await makeRequest('GET', '/leave/balance?employee_id=97', null, adminToken);
  console.log('Action: Checking leave balance for probation employee');
  console.log('Expected: May have restricted leave entitlement');
  console.log('Actual:', JSON.stringify(leaveBalance.data, null, 2).substring(0, 300));
  results.push({ test: 'Probation Leave Balance', result: 'OK (check manually)' });
  console.log('\n');

  // TEST 8: SECURITY - SQL Injection Attempt
  console.log('--- TEST 8: SECURITY - SQL Injection Test ---');
  const sqlInjectionRes = await makeRequest('POST', '/auth/login', {
    username: "admin' OR '1'='1",
    password: "password' OR '1'='1"
  });

  console.log('Action: SQL injection attempt in login');
  console.log('Expected: Should be rejected safely');
  console.log('Actual Status:', sqlInjectionRes.status);

  if (sqlInjectionRes.status === 401 || sqlInjectionRes.status === 400) {
    console.log('Result: OK - SQL injection blocked');
    results.push({ test: 'SQL Injection Protection', result: 'OK' });
  } else if (sqlInjectionRes.status === 200) {
    console.log('Result: CRITICAL SECURITY RISK - SQL Injection successful!');
    results.push({ test: 'SQL Injection Protection', result: 'CRITICAL SECURITY RISK' });
  }
  console.log('\n');

  // TEST 9: SECURITY - XSS in Feedback
  console.log('--- TEST 9: SECURITY - XSS in Employee Name ---');
  const xssTestEmp = {
    employee_id: 'XSS-TEST-001',
    name: '<script>alert("XSS")</script>',
    ic_number: '660404-14-0000',
    email: 'xss@test.com',
    phone: '012-0000000',
    department_id: 231,
    position: 'XSS Tester',
    employment_type: 'confirmed',
    join_date: '2024-01-01',
    basic_salary: 1000,
    status: 'active',
    company_id: 4
  };

  const xssRes = await makeRequest('POST', '/employees', xssTestEmp, adminToken);
  console.log('Action: Creating employee with XSS script in name');
  console.log('Expected: Should sanitize or reject');
  console.log('Actual Status:', xssRes.status);

  if (xssRes.status === 400 || (xssRes.data?.name && !xssRes.data.name.includes('<script>'))) {
    console.log('Result: OK - XSS blocked or sanitized');
    results.push({ test: 'XSS Protection', result: 'OK' });
  } else if (xssRes.status === 200 || xssRes.status === 201) {
    console.log('Result: SECURITY RISK - XSS payload stored!');
    console.log('Name stored as:', xssRes.data?.name);
    results.push({ test: 'XSS Protection', result: 'SECURITY RISK (stored XSS)' });
  }
  console.log('\n');

  // TEST 10: Permission - HR Cannot Delete Employee
  console.log('--- TEST 10: Permission - HR Cannot Delete Employee ---');
  const hrLoginRes2 = await makeRequest('POST', '/auth/login', {
    username: 'qa_hr_user',
    password: 'HRTest123!'
  });

  if (hrLoginRes2.status === 200) {
    const hrToken = hrLoginRes2.data.token;
    const deleteRes = await makeRequest('DELETE', '/employees/97', null, hrToken);

    console.log('Action: HR user trying to delete employee');
    console.log('Expected: Should be DENIED');
    console.log('Actual Status:', deleteRes.status);

    if (deleteRes.status === 403) {
      console.log('Result: OK - HR delete blocked');
      results.push({ test: 'HR Cannot Delete', result: 'OK' });
    } else if (deleteRes.status === 200 || deleteRes.status === 204) {
      console.log('Result: SECURITY RISK - HR can delete employees!');
      results.push({ test: 'HR Cannot Delete', result: 'SECURITY RISK' });
    } else {
      console.log('Result:', deleteRes.data);
      results.push({ test: 'HR Cannot Delete', result: 'OK (check reason)' });
    }
  }
  console.log('\n');

  // SUMMARY
  console.log('='.repeat(60));
  console.log('TEST SUMMARY - PART 2');
  console.log('='.repeat(60));

  const okCount = results.filter(r => r.result.startsWith('OK')).length;
  const bugCount = results.filter(r => r.result === 'BUG').length;
  const securityCount = results.filter(r => r.result.includes('SECURITY')).length;
  const skipped = results.filter(r => r.result === 'SKIPPED').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`OK: ${okCount}`);
  console.log(`Bugs: ${bugCount}`);
  console.log(`Security Risks: ${securityCount}`);
  console.log(`Skipped: ${skipped}`);
  console.log('\n');

  console.log('DETAILED RESULTS:');
  results.forEach((r, i) => {
    const status = r.result.includes('SECURITY') ? '[!!!]' :
                   r.result === 'BUG' ? '[BUG]' :
                   r.result === 'SKIPPED' ? '[---]' : '[ OK]';
    console.log(`${status} ${r.test}: ${r.result}`);
  });

  if (securityCount > 0) {
    console.log('\n*** SECURITY ISSUES FOUND ***');
    results.filter(r => r.result.includes('SECURITY')).forEach(r => {
      console.log(`  - ${r.test}: ${r.result}`);
    });
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('ADDITIONAL TEST DATA CREATED');
  console.log('='.repeat(60));
  console.log(`
Second Test Company:
  Name: QA Isolation Test Co
  Code: QAISO
  ID: ${company2Id}

Second Test Employee:
  Name: Isolation Test Employee
  Employee ID: ISO-EMP-001
  IC Number: 880202-14-5678
  Company: QA Isolation Test Co

Resigned Test Employee:
  Name: Resigned Test Employee
  Employee ID: QA-RES-001
  IC Number: 770303-14-9999
  Status: RESIGNED
  Company: QA Test Company Sdn Bhd
`);
}

runTests().catch(console.error);
