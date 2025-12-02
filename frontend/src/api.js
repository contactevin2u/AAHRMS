import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('adminToken');
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export const feedbackApi = {
  submit: (data) => api.post('/feedback/submit', data),
  getAll: (params) => api.get('/feedback/all', { params }),
  markAsRead: (id, isRead) => api.patch(`/feedback/${id}/read`, { is_read: isRead }),
  updateNotes: (id, notes) => api.patch(`/feedback/${id}/notes`, { admin_notes: notes }),
  getStats: () => api.get('/feedback/stats'),
};

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  setup: (data) => api.post('/auth/setup', data),
};

export const employeeApi = {
  getAll: (params) => api.get('/employees', { params }),
  getOne: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
  getStats: () => api.get('/employees/stats/overview'),
  bulkImport: (employees) => api.post('/employees/bulk-import', { employees }),
};

export const departmentApi = {
  getAll: () => api.get('/departments'),
  getOne: (id) => api.get(`/departments/${id}`),
  updateSalaryConfig: (id, data) => api.put(`/departments/${id}/salary-config`, data),
};

export const payrollApi = {
  getAll: (params) => api.get('/payroll', { params }),
  getOne: (id) => api.get(`/payroll/${id}`),
  generate: (data) => api.post('/payroll/generate', data),
  getAvailableEmployees: (year, month) => api.get(`/payroll/available-employees/${year}/${month}`),
  update: (id, data) => api.put(`/payroll/${id}`, data),
  delete: (id) => api.delete(`/payroll/${id}`),
  calculate: (data) => api.post('/payroll/calculate', data),
  calculateStatutory: (data) => api.post('/payroll/calculate-statutory', data),
  getSummary: (year, month) => api.get(`/payroll/summary/${year}/${month}`),
  getPayslip: (id) => api.get(`/payroll/${id}/payslip`),
  getPayslips: (year, month) => api.get(`/payroll/payslips/${year}/${month}`),
};

export default api;
