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

// New Payroll System (v2)
export const payrollV2Api = {
  // Payroll Runs
  getRuns: (params) => api.get('/payroll-v2/runs', { params }),
  getRun: (id) => api.get(`/payroll-v2/runs/${id}`),
  createRun: (data) => api.post('/payroll-v2/runs', data),
  deleteRun: (id) => api.delete(`/payroll-v2/runs/${id}`),
  finalizeRun: (id) => api.post(`/payroll-v2/runs/${id}/finalize`),
  getBankFile: (id) => api.get(`/payroll-v2/runs/${id}/bank-file`, { responseType: 'blob' }),

  // Payroll Items
  updateItem: (id, data) => api.put(`/payroll-v2/items/${id}`, data),
  getItemPayslip: (id) => api.get(`/payroll-v2/items/${id}/payslip`),
};

// Leave Management
export const leaveApi = {
  // Leave Types
  getTypes: () => api.get('/leave/types'),
  createType: (data) => api.post('/leave/types', data),

  // Leave Balances
  getBalances: (params) => api.get('/leave/balances', { params }),
  getEmployeeBalances: (employeeId, params) => api.get(`/leave/balances/${employeeId}`, { params }),
  initializeBalances: (employeeId, data) => api.post(`/leave/balances/initialize/${employeeId}`, data),
  updateBalance: (id, data) => api.put(`/leave/balances/${id}`, data),

  // Leave Requests
  getRequests: (params) => api.get('/leave/requests', { params }),
  getPendingCount: () => api.get('/leave/requests/pending-count'),
  createRequest: (data) => api.post('/leave/requests', data),
  approveRequest: (id) => api.post(`/leave/requests/${id}/approve`),
  rejectRequest: (id, data) => api.post(`/leave/requests/${id}/reject`, data),
  cancelRequest: (id) => api.post(`/leave/requests/${id}/cancel`),
  deleteRequest: (id) => api.delete(`/leave/requests/${id}`),

  // Public Holidays
  getHolidays: (params) => api.get('/leave/holidays', { params }),
  createHoliday: (data) => api.post('/leave/holidays', data),
  deleteHoliday: (id) => api.delete(`/leave/holidays/${id}`),

  // For Payroll
  getUnpaidForPayroll: (params) => api.get('/leave/unpaid-for-payroll', { params }),
};

// Claims
export const claimsApi = {
  getAll: (params) => api.get('/claims', { params }),
  getPendingCount: () => api.get('/claims/pending-count'),
  getSummary: (params) => api.get('/claims/summary', { params }),
  getCategories: () => api.get('/claims/categories'),
  getForPayroll: (params) => api.get('/claims/for-payroll', { params }),

  create: (data) => api.post('/claims', data),
  update: (id, data) => api.put(`/claims/${id}`, data),
  delete: (id) => api.delete(`/claims/${id}`),

  approve: (id) => api.post(`/claims/${id}/approve`),
  reject: (id, data) => api.post(`/claims/${id}/reject`, data),
  bulkApprove: (claimIds) => api.post('/claims/bulk-approve', { claim_ids: claimIds }),
  linkToPayroll: (data) => api.post('/claims/link-to-payroll', data),
};

// Contributions (Government Payments)
export const contributionsApi = {
  getSummary: (runId) => api.get(`/contributions/summary/${runId}`),
  getDetails: (runId) => api.get(`/contributions/details/${runId}`),
  getReport: (params) => api.get('/contributions/report', { params }),

  // Export files for government submission
  exportEPF: (runId) => api.get(`/contributions/export/epf/${runId}`, { responseType: 'blob' }),
  exportSOCSO: (runId) => api.get(`/contributions/export/socso/${runId}`, { responseType: 'blob' }),
  exportEIS: (runId) => api.get(`/contributions/export/eis/${runId}`, { responseType: 'blob' }),
  exportPCB: (runId) => api.get(`/contributions/export/pcb/${runId}`, { responseType: 'blob' }),
};

// Resignations
export const resignationsApi = {
  getAll: (params) => api.get('/resignations', { params }),
  getOne: (id) => api.get(`/resignations/${id}`),
  create: (data) => api.post('/resignations', data),
  update: (id, data) => api.put(`/resignations/${id}`, data),
  delete: (id) => api.delete(`/resignations/${id}`),

  process: (id, data) => api.post(`/resignations/${id}/process`, data),
  cancel: (id) => api.post(`/resignations/${id}/cancel`),
  calculateSettlement: (data) => api.post('/resignations/calculate-settlement', data),
};

export default api;
