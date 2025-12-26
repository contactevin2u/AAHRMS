/**
 * Test Helpers
 *
 * Common utilities and mock data for tests.
 */

const jwt = require('jsonwebtoken');

// Generate a valid JWT token for testing
const generateTestToken = (payload = {}) => {
  const defaultPayload = {
    id: 1,
    username: 'testadmin',
    role: 'hr',
    name: 'Test Admin',
    company_id: 1
  };

  return jwt.sign(
    { ...defaultPayload, ...payload },
    process.env.JWT_SECRET || 'test-secret-key-for-testing',
    { expiresIn: '1h' }
  );
};

// Generate super admin token
const generateSuperAdminToken = () => {
  return generateTestToken({
    role: 'super_admin',
    company_id: null
  });
};

// Generate employee token
const generateEmployeeToken = (employeeId = 1) => {
  return jwt.sign(
    {
      id: employeeId,
      employee_id: 'EMP001',
      name: 'Test Employee',
      email: 'employee@test.com',
      role: 'employee',
      company_id: 1
    },
    process.env.JWT_SECRET || 'test-secret-key-for-testing',
    { expiresIn: '1h' }
  );
};

// Mock employee data
const mockEmployee = {
  employee_id: 'EMP001',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '0123456789',
  ic_number: '901234-56-7890',
  department_id: 1,
  position: 'Manager',
  join_date: '2024-01-15',
  status: 'active',
  bank_name: 'Maybank',
  bank_account_no: '1234567890',
  bank_account_holder: 'John Doe',
  default_basic_salary: 5000,
  employment_type: 'confirmed'
};

// Mock department data
const mockDepartment = {
  name: 'Office',
  description: 'Office Department',
  salary_type: 'fixed'
};

// Mock leave request data
const mockLeaveRequest = {
  leave_type_id: 1,
  start_date: '2024-03-01',
  end_date: '2024-03-03',
  reason: 'Personal leave'
};

// Mock claim data
const mockClaim = {
  claim_date: '2024-02-15',
  category: 'transport',
  description: 'Fuel expense',
  amount: 150.00
};

// Mock feedback data
const mockFeedback = {
  category: 'suggestion',
  content: 'Improve the leave application process',
  is_anonymous: true
};

// Mock admin user data
const mockAdminUser = {
  username: 'testadmin',
  password: 'Test1234',
  name: 'Test Admin',
  role: 'hr',
  email: 'admin@test.com'
};

// Mock database pool
const createMockPool = () => {
  return {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  };
};

// Response matchers
const expectSuccessResponse = (response) => {
  expect(response.status).toBeLessThan(400);
  expect(response.body).toBeDefined();
};

const expectErrorResponse = (response, statusCode, errorCode = null) => {
  expect(response.status).toBe(statusCode);
  expect(response.body.success).toBe(false);
  expect(response.body.error).toBeDefined();
  if (errorCode) {
    expect(response.body.error.code).toBe(errorCode);
  }
};

module.exports = {
  generateTestToken,
  generateSuperAdminToken,
  generateEmployeeToken,
  mockEmployee,
  mockDepartment,
  mockLeaveRequest,
  mockClaim,
  mockFeedback,
  mockAdminUser,
  createMockPool,
  expectSuccessResponse,
  expectErrorResponse
};
