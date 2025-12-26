/**
 * Jest Test Setup
 *
 * This file runs before all tests and sets up the test environment.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock console.error to reduce noise in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    // Filter out expected errors during tests
    if (args[0]?.includes?.('Error:')) {
      return;
    }
    originalError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalError;
});
