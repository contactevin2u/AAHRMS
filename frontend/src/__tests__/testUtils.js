import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, AppProvider, EmployeeProvider } from '../context';

// All providers wrapper for testing
const AllProviders = ({ children }) => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <EmployeeProvider>
            {children}
          </EmployeeProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

// Custom render with all providers
const customRender = (ui, options) =>
  render(ui, { wrapper: AllProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Helper to mock API responses
export const mockApiResponse = (data, status = 200) => {
  return Promise.resolve({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {}
  });
};

// Helper to mock API error
export const mockApiError = (message, status = 400) => {
  const error = new Error(message);
  error.response = {
    data: { error: message },
    status
  };
  return Promise.reject(error);
};

// Mock employee data
export const mockEmployee = {
  id: 1,
  employee_id: 'EMP001',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '0123456789',
  department_id: 1,
  department_name: 'Office',
  position: 'Manager',
  status: 'active',
  employment_type: 'confirmed',
  join_date: '2024-01-15',
  default_basic_salary: 5000
};

// Mock department data
export const mockDepartment = {
  id: 1,
  name: 'Office',
  description: 'Office Department'
};

// Mock user data
export const mockUser = {
  id: 1,
  username: 'admin',
  name: 'Admin User',
  role: 'hr',
  company_id: 1
};
