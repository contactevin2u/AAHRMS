const https = require('https');

const data = JSON.stringify({
  employee_id: 'TEST-NEW01',
  ic_number: '880101-01-1234'
});

const options = {
  hostname: 'hrms-backend-1alt.onrender.com',
  port: 443,
  path: '/api/ess/login-ic',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const response = JSON.parse(body);
      console.log('');
      console.log('=== LOGIN RESPONSE ===');
      console.log('requiresPasswordChange:', response.requiresPasswordChange);
      console.log('employee.name:', response.employee?.name);
      console.log('employee.employee_id:', response.employee?.employee_id);
      console.log('token received:', response.token ? 'Yes' : 'No');

      if (response.requiresPasswordChange) {
        console.log('');
        console.log('SUCCESS! User should be redirected to Change Password page.');
      }
    } catch (e) {
      console.log('Response:', body);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
