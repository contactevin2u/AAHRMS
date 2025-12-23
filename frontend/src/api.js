import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests (supports both admin and employee tokens)
api.interceptors.request.use((config) => {
  // Check which token to use based on the URL path
  let token = null;

  if (config.url?.startsWith('/ess')) {
    token = localStorage.getItem('employeeToken');
  } else {
    token = localStorage.getItem('adminToken');
  }

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
      const path = window.location.pathname;

      if (path.startsWith('/ess')) {
        localStorage.removeItem('employeeToken');
        window.location.href = '/ess/login';
      } else if (path.startsWith('/admin')) {
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export const feedbackApi = {
  submit: (data) => api.post('/feedback/submit', data),
  getAll: (params) => api.get('/feedback/all', { params }),
  markAsRead: (id, isRead) => api.patch(`/feedback/${id}/read`, { is_read: isRead }),
  markRead: (id) => api.patch(`/feedback/${id}/read`, { is_read: true }),
  updateNotes: (id, notes) => api.patch(`/feedback/${id}/notes`, { admin_notes: notes }),
  delete: (id) => api.delete(`/feedback/${id}`),
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
  bulkUpdate: (employee_ids, updates) => api.put('/employees/bulk-update', { employee_ids, updates }),
  bulkDelete: (employee_ids) => api.post('/employees/bulk-delete', { employee_ids }),
};

export const departmentApi = {
  getAll: () => api.get('/departments'),
  getOne: (id) => api.get(`/departments/${id}`),
  updateSalaryConfig: (id, data) => api.put(`/departments/${id}/salary-config`, data),
  seed: () => api.post('/departments/seed'),
  getPayrollComponents: (id) => api.get(`/departments/${id}/payroll-components`),
  getWithComponents: () => api.get('/departments/with-components'),
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

// HR Letters
export const lettersApi = {
  getAll: (params) => api.get('/letters', { params }),
  getOne: (id) => api.get(`/letters/${id}`),
  create: (data) => api.post('/letters', data),
  update: (id, data) => api.put(`/letters/${id}`, data),
  delete: (id) => api.delete(`/letters/${id}`),

  getEmployeeLetters: (employeeId) => api.get(`/letters/employee/${employeeId}`),
  getTemplates: () => api.get('/letters/templates/all'),
  getTemplatesByType: (type) => api.get(`/letters/templates/type/${type}`),
  getStats: () => api.get('/letters/stats/summary'),
};

// Probation Management
export const probationApi = {
  getPending: () => api.get('/probation/pending'),
  getAll: (params) => api.get('/probation/all', { params }),
  confirm: (id, data) => api.post(`/probation/${id}/confirm`, data),
  extend: (id, data) => api.post(`/probation/${id}/extend`, data),
  getHistory: (id) => api.get(`/probation/${id}/history`),
};

// Commission & Allowance (Earnings)
export const earningsApi = {
  // Commission Types
  getCommissionTypes: () => api.get('/earnings/commission-types'),
  createCommissionType: (data) => api.post('/earnings/commission-types', data),
  updateCommissionType: (id, data) => api.put(`/earnings/commission-types/${id}`, data),
  deleteCommissionType: (id) => api.delete(`/earnings/commission-types/${id}`),

  // Allowance Types
  getAllowanceTypes: () => api.get('/earnings/allowance-types'),
  createAllowanceType: (data) => api.post('/earnings/allowance-types', data),
  updateAllowanceType: (id, data) => api.put(`/earnings/allowance-types/${id}`, data),
  deleteAllowanceType: (id) => api.delete(`/earnings/allowance-types/${id}`),

  // Employee Commissions
  getEmployeeCommissions: (employeeId) => api.get(`/earnings/employees/${employeeId}/commissions`),
  addEmployeeCommission: (employeeId, data) => api.post(`/earnings/employees/${employeeId}/commissions`, data),
  updateEmployeeCommission: (employeeId, commissionId, data) => api.put(`/earnings/employees/${employeeId}/commissions/${commissionId}`, data),
  removeEmployeeCommission: (employeeId, commissionId) => api.delete(`/earnings/employees/${employeeId}/commissions/${commissionId}`),
  bulkSaveCommissions: (employeeId, commissions) => api.post(`/earnings/employees/${employeeId}/commissions/bulk`, { commissions }),

  // Employee Allowances
  getEmployeeAllowances: (employeeId) => api.get(`/earnings/employees/${employeeId}/allowances`),
  addEmployeeAllowance: (employeeId, data) => api.post(`/earnings/employees/${employeeId}/allowances`, data),
  updateEmployeeAllowance: (employeeId, allowanceId, data) => api.put(`/earnings/employees/${employeeId}/allowances/${allowanceId}`, data),
  removeEmployeeAllowance: (employeeId, allowanceId) => api.delete(`/earnings/employees/${employeeId}/allowances/${allowanceId}`),
  bulkSaveAllowances: (employeeId, allowances) => api.post(`/earnings/employees/${employeeId}/allowances/bulk`, { allowances }),
};

// Sales Records (for Indoor Sales commission calculation)
export const salesApi = {
  getAll: (params) => api.get('/sales', { params }),
  getEmployeeMonthly: (employeeId, year, month) => api.get(`/sales/employee/${employeeId}/monthly/${year}/${month}`),
  getIndoorSalesData: (year, month) => api.get(`/sales/indoor-sales/${year}/${month}`),
  create: (data) => api.post('/sales', data),
  bulkCreate: (records) => api.post('/sales/bulk', { records }),
  update: (id, data) => api.put(`/sales/${id}`, data),
  delete: (id) => api.delete(`/sales/${id}`),
};

// Clock In/Out Records
export const clockInApi = {
  getAll: (params) => api.get('/clock-in', { params }),
  getEmployeeMonthly: (employeeId, year, month) => api.get(`/clock-in/employee/${employeeId}/monthly/${year}/${month}`),
  getOTForPayroll: (year, month) => api.get(`/clock-in/ot-for-payroll/${year}/${month}`),
  create: (data) => api.post('/clock-in', data),
  clockOut: (id, data) => api.put(`/clock-in/${id}/clock-out`, data),
  approve: (id) => api.post(`/clock-in/${id}/approve`),
  reject: (id, notes) => api.post(`/clock-in/${id}/reject`, { notes }),
  bulkApprove: (record_ids) => api.post('/clock-in/bulk-approve', { record_ids }),
  delete: (id) => api.delete(`/clock-in/${id}`),
};

// Outlets (for Mimix A)
export const outletsApi = {
  getAll: () => api.get('/outlets'),
  getOne: (id) => api.get(`/outlets/${id}`),
  create: (data) => api.post('/outlets', data),
  update: (id, data) => api.put(`/outlets/${id}`, data),
  delete: (id) => api.delete(`/outlets/${id}`),
  seed: () => api.post('/outlets/seed'),
};

// Company Management
export const companiesApi = {
  getAll: () => api.get('/companies'),
  getOne: (id) => api.get(`/companies/${id}`),
  create: (data) => api.post('/companies', data),
  update: (id, data) => api.put(`/companies/${id}`, data),
  updateStatus: (id, status) => api.patch(`/companies/${id}/status`, { status }),
  createAdmin: (id, data) => api.post(`/companies/${id}/admin`, data),
  getAdmins: (id) => api.get(`/companies/${id}/admins`),
  getStats: (id) => api.get(`/companies/${id}/stats`),
  getCurrentInfo: () => api.get('/companies/current/info'),
};

// Admin User Management
export const adminUsersApi = {
  getAll: () => api.get('/admin-users'),
  getOne: (id) => api.get(`/admin-users/${id}`),
  create: (data) => api.post('/admin-users', data),
  update: (id, data) => api.put(`/admin-users/${id}`, data),
  delete: (id) => api.delete(`/admin-users/${id}`),
  resetPassword: (id, newPassword) => api.post(`/admin-users/${id}/reset-password`, { newPassword }),

  getRoles: () => api.get('/admin-users/roles/all'),
  getRole: (id) => api.get(`/admin-users/roles/${id}`),
  createRole: (data) => api.post('/admin-users/roles', data),
  updateRole: (id, data) => api.put(`/admin-users/roles/${id}`, data),
  deleteRole: (id) => api.delete(`/admin-users/roles/${id}`),
  getPermissionsList: () => api.get('/admin-users/permissions/list'),

  getMyPermissions: () => api.get('/admin-users/me/permissions'),

  // Profile management
  getMyProfile: () => api.get('/admin-users/me/profile'),
  updateMyProfile: (data) => api.put('/admin-users/me/profile', data),
  changePassword: (currentPassword, newPassword) => api.post('/admin-users/me/change-password', { currentPassword, newPassword }),
  updateUserProfile: (id, data) => api.put(`/admin-users/profile/${id}`, data),
};

// =====================================================
// EMPLOYEE SELF-SERVICE (ESS) API
// =====================================================

export const essApi = {
  // Authentication
  login: (credentials) => api.post('/ess/login', credentials),
  loginIC: (employee_id, ic_number) => api.post('/ess/login-ic', { employee_id, ic_number }),
  forgotPassword: (email) => api.post('/ess/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post('/ess/reset-password', { token, newPassword }),
  setPassword: (data) => api.post('/ess/set-password', data),

  // Dashboard
  getDashboard: () => api.get('/ess/dashboard'),

  // Clock-in
  clockIn: (data) => api.post('/ess/clockin/in', data),
  clockOut: (data) => api.post('/ess/clockin/out', data),
  getClockInStatus: () => api.get('/ess/clockin/status'),
  getClockInHistory: (params) => api.get('/ess/clockin/history', { params }),

  // Profile
  getProfile: () => api.get('/ess/profile'),

  // Payslips
  getPayslips: (params) => api.get('/ess/payslips', { params }),
  getPayslip: (id) => api.get(`/ess/payslips/${id}`),

  // Leave
  getLeaveBalance: () => api.get('/ess/leave/balance'),
  getLeaveHistory: (params) => api.get('/ess/leave/history', { params }),
  getLeaveTypes: () => api.get('/ess/leave/types'),
  applyLeave: (data) => api.post('/ess/leave/apply', data),

  // Claims
  getClaims: (params) => api.get('/ess/claims', { params }),
  submitClaim: (data) => api.post('/ess/claims', data),

  // Notifications
  getNotifications: (params) => api.get('/ess/notifications', { params }),
  markNotificationRead: (id) => api.put(`/ess/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put('/ess/notifications/read-all'),
  getUnreadCount: () => api.get('/ess/notifications/unread-count'),

  // Letters / HR Documents
  getLetters: (params) => api.get('/ess/letters', { params }),
  getLetter: (id) => api.get(`/ess/letters/${id}`),
  getUnreadLettersCount: () => api.get('/ess/letters/unread/count'),
};

export default api;
