import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests (supports both admin and employee tokens)
api.interceptors.request.use((config) => {
  // Check which token to use based on the URL path
  let token = null;

  if (config.url?.startsWith('/ess')) {
    token = localStorage.getItem('employeeToken');
  } else if (config.url?.startsWith('/driver-claims')) {
    token = localStorage.getItem('driverClaimsToken');
  } else {
    token = localStorage.getItem('adminToken');

    // For super_admin, add selected company header
    const adminInfo = localStorage.getItem('adminInfo');
    if (adminInfo) {
      const info = JSON.parse(adminInfo);
      if (info.role === 'super_admin') {
        const selectedCompanyId = localStorage.getItem('selectedCompanyId');
        if (selectedCompanyId) {
          config.headers['X-Company-Id'] = selectedCompanyId;
        }
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors - attempt token refresh on 401 before redirecting
// 401 = not authenticated (need to login)
// 403 = authenticated but not permitted (don't logout, just show error)
let isRefreshing = false;
let refreshSubscribers = [];

const onRefreshed = (token) => {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      const requestUrl = error.config?.url || '';

      const isLoginPage = path === '/ess/login' || path === '/' || path === '/login' || path === '/driver-claims/login';
      const isLoginRequest = requestUrl.includes('/login') || requestUrl.includes('/ess/login');
      const isRefreshRequest = requestUrl.includes('/refresh');

      if (isLoginPage || isLoginRequest || isRefreshRequest) {
        return Promise.reject(error);
      }

      // For ESS routes, attempt token refresh
      if (path.startsWith('/ess') && localStorage.getItem('employeeToken')) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const res = await api.post('/ess/auth/refresh');
            const newToken = res.data.token;
            localStorage.setItem('employeeToken', newToken);
            isRefreshing = false;
            onRefreshed(newToken);
            // Retry the original request
            error.config.headers.Authorization = `Bearer ${newToken}`;
            return api(error.config);
          } catch (refreshError) {
            isRefreshing = false;
            refreshSubscribers = [];
            localStorage.removeItem('employeeToken');
            localStorage.removeItem('employeeInfo');
            window.location.href = '/ess/login';
            return Promise.reject(refreshError);
          }
        } else {
          // Queue requests while refreshing
          return new Promise((resolve) => {
            refreshSubscribers.push((token) => {
              error.config.headers.Authorization = `Bearer ${token}`;
              resolve(api(error.config));
            });
          });
        }
      }

      if (path.startsWith('/ess')) {
        localStorage.removeItem('employeeToken');
        localStorage.removeItem('employeeInfo');
        window.location.href = '/ess/login';
      } else if (path.startsWith('/driver-claims')) {
        localStorage.removeItem('driverClaimsToken');
        localStorage.removeItem('driverClaimsAdmin');
        window.location.href = '/driver-claims/login';
      } else if (path.startsWith('/admin')) {
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// Auto-refresh ESS token every 4 hours to prevent expiry during active use
setInterval(async () => {
  const token = localStorage.getItem('employeeToken');
  const path = window.location.pathname;
  if (token && path.startsWith('/ess')) {
    try {
      const res = await api.post('/ess/auth/refresh');
      localStorage.setItem('employeeToken', res.data.token);
    } catch (e) {
      // Silent fail - will refresh on next 401
    }
  }
}, 4 * 60 * 60 * 1000); // 4 hours

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
  quickAdd: (data) => api.post('/employees/quick-add', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  patch: (id, data) => api.patch(`/employees/${id}`, data), // Partial update for inline editing
  delete: (id) => api.delete(`/employees/${id}`),
  getStats: () => api.get('/employees/stats/overview'),
  getBirthdays: (params) => api.get('/employees/birthdays', { params }),
  bulkImport: (employees) => api.post('/employees/bulk-import', { employees }),
  bulkUpdate: (employee_ids, updates) => api.put('/employees/bulk-update', { employee_ids, updates }),
  bulkDelete: (employee_ids) => api.post('/employees/bulk-delete', { employee_ids }),
  resetPassword: (id) => api.post(`/employees/${id}/reset-password`),
  getPasswordStatus: (params) => api.get('/employees/password-status/check', { params }),
  // Manager outlet assignment
  getEmployeeOutlets: (id) => api.get(`/employees/${id}/outlets`),
  updateEmployeeOutlets: (id, outlet_ids) => api.put(`/employees/${id}/outlets`, { outlet_ids }),
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

// Unified Payroll System (merged V1+V2)
export const payrollV2Api = {
  // Company payroll settings
  getSettings: () => api.get('/payroll/settings'),
  updateSettings: (data) => api.put('/payroll/settings', data),

  // Payroll Runs
  getRuns: (params) => api.get('/payroll/runs', { params }),
  getRun: (id) => api.get(`/payroll/runs/${id}`),
  createRun: (data) => api.post('/payroll/runs', data),
  createAllOutlets: (data) => api.post('/payroll/runs/all-outlets', data),
  createAllDepartments: (data) => api.post('/payroll/runs/all-departments', data),
  deleteRun: (id) => api.delete(`/payroll/runs/${id}`),
  deleteAllDrafts: (month, year) => api.delete(`/payroll/runs/drafts/${year}/${month}`),
  finalizeRun: (id) => api.post(`/payroll/runs/${id}/finalize`),
  publishDraftPayslips: (id) => api.post(`/payroll/runs/${id}/publish-draft-payslips`),
  getBankFile: (id, format = 'csv') => api.get(`/payroll/runs/${id}/bank-file`, {
    params: { format },
    responseType: 'blob'
  }),
  getPerkesoFile: (id, exclude = []) => api.get(`/payroll/runs/${id}/perkeso-file`, {
    params: exclude.length ? { exclude: exclude.join(',') } : {},
    responseType: 'blob'
  }),
  getEpfFile: (id, exclude = []) => api.get(`/payroll/runs/${id}/epf-file`, {
    params: exclude.length ? { exclude: exclude.join(',') } : {},
    responseType: 'blob'
  }),
  getSalaryReport: (id, format = 'csv') => api.get(`/payroll/runs/${id}/salary-report`, {
    params: { format },
    responseType: format === 'csv' ? 'blob' : 'json'
  }),
  getSalaryReportJson: (id) => api.get(`/payroll/runs/${id}/salary-report`, { params: { format: 'json' } }),

  // OT Summary (before running payroll)
  getOTSummary: (year, month, params) => api.get(`/payroll/ot-summary/${year}/${month}`, { params }),

  // Payroll Items
  updateItem: (id, data) => api.put(`/payroll/items/${id}`, data),
  deleteItem: (id) => api.delete(`/payroll/items/${id}`),
  getItemPayslip: (id) => api.get(`/payroll/items/${id}/payslip`),
  recalculateItem: (id) => api.post(`/payroll/items/${id}/recalculate`),
  recalculateAll: (runId) => api.post(`/payroll/runs/${runId}/recalculate-all`),
  addEmployees: (runId, employeeIds) => api.post(`/payroll/runs/${runId}/add-employees`, { employee_ids: employeeIds }),
  getAttendanceDetails: (id) => api.get(`/payroll/items/${id}/attendance-details`),
  reorderItems: (runId, items) => api.put(`/payroll/runs/${runId}/reorder`, { items }),

  // AI Payroll Assistant
  aiAnalyze: (data) => api.post('/payroll/ai/analyze', data),
  aiApply: (data) => api.post('/payroll/ai/apply', data),
  aiCompare: (data) => api.post('/payroll/ai/compare', data),
  aiPreviewCalculation: (data) => api.post('/payroll/ai/preview-calculation', data),
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
  initializeAllBalances: (data) => api.post('/leave/balances/initialize-all', data),
  updateBalance: (id, data) => api.put(`/leave/balances/${id}`, data),

  // Leave Balance Table (for Leave Balance Management page)
  getBalancesTable: (params) => api.get('/leave/balances-table', { params }),
  getUnpaidMonthly: (employeeId, year) => api.get(`/leave/unpaid-monthly/${employeeId}`, { params: { year } }),

  // Leave Requests (with multi-level approval)
  getRequests: (params) => api.get('/leave/requests', { params }),
  getPendingCount: () => api.get('/leave/requests/pending-count'),
  createRequest: (data) => api.post('/leave/requests', data),
  approveRequest: (id, data) => api.post(`/leave/requests/${id}/approve`, data),
  supervisorApprove: (id) => api.post(`/leave/requests/${id}/supervisor-approve`),
  directorApprove: (id) => api.post(`/leave/requests/${id}/director-approve`),
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
  getPendingCount: (params) => api.get('/claims/pending-count', { params }),
  getSummary: (params) => api.get('/claims/summary', { params }),
  getCategories: () => api.get('/claims/categories'),
  getRestrictions: () => api.get('/claims/restrictions'),
  getForPayroll: (params) => api.get('/claims/for-payroll', { params }),

  create: (data) => api.post('/claims', data),
  update: (id, data) => api.put(`/claims/${id}`, data),
  delete: (id) => api.delete(`/claims/${id}`),

  approve: (id) => api.post(`/claims/${id}/approve`),
  reject: (id, data) => api.post(`/claims/${id}/reject`, data),
  revert: (id) => api.post(`/claims/${id}/revert`),
  bulkApprove: (claimIds) => api.post('/claims/bulk-approve', { claim_ids: claimIds }),
  linkToPayroll: (data) => api.post('/claims/link-to-payroll', data),
};

// Salary Advances
export const advancesApi = {
  getAll: (params) => api.get('/advances', { params }),
  getSummary: (params) => api.get('/advances/summary', { params }),
  getPending: (employeeId, params) => api.get(`/advances/pending/${employeeId}`, { params }),

  create: (data) => api.post('/advances', data),
  update: (id, data) => api.put(`/advances/${id}`, data),
  cancel: (id) => api.post(`/advances/${id}/cancel`),
  recordDeduction: (id, data) => api.post(`/advances/${id}/deduct`, data),
  getHistory: (id) => api.get(`/advances/${id}/history`),
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

  // Approval workflow
  approve: (id) => api.post(`/resignations/${id}/approve`),
  reject: (id, data) => api.post(`/resignations/${id}/reject`, data),
  withdraw: (id) => api.post(`/resignations/${id}/withdraw`),

  // Exit clearance
  getClearance: (id) => api.get(`/resignations/${id}/clearance`),
  updateClearanceItem: (id, itemId, data) => api.put(`/resignations/${id}/clearance/${itemId}`, data),
  generateClearance: (id) => api.post(`/resignations/${id}/clearance/generate`),

  // Notice waiver
  waiveNotice: (id, data) => api.post(`/resignations/${id}/waive-notice`, data),

  // Leave entitlement
  getLeaveEntitlement: (id) => api.get(`/resignations/${id}/leave-entitlement`),

  // Settlement
  getSettlement: (id, params) => api.get(`/resignations/${id}/settlement`, { params }),
  saveSettlement: (id, data) => api.post(`/resignations/${id}/settlement`, data),
  calculateSettlement: (data) => api.post('/resignations/calculate-settlement', data),

  // Process & cleanup
  process: (id, data) => api.post(`/resignations/${id}/process`, data),
  cancel: (id) => api.post(`/resignations/${id}/cancel`),
  checkLeaves: (id) => api.get(`/resignations/${id}/check-leaves`),
  cleanupLeaves: (id) => api.post(`/resignations/${id}/cleanup-leaves`),
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

  // AI Features
  aiImprove: (content, letterType) => api.post('/letters/ai/improve', { content, letterType }),
  aiTone: (content, tone, letterType) => api.post('/letters/ai/tone', { content, tone, letterType }),
  aiTranslate: (content, targetLanguage) => api.post('/letters/ai/translate', { content, targetLanguage }),
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

// Clock In/Out Records (4-action per day: clock_in_1, clock_out_1, clock_in_2, clock_out_2)
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

// Attendance API (alias for clockInApi with additional methods)
export const attendanceApi = {
  getAll: (params) => api.get('/clock-in', { params }),
  getEmployeeMonthly: (employeeId, year, month) => api.get(`/clock-in/employee/${employeeId}/monthly/${year}/${month}`),
  getOTForPayroll: (year, month) => api.get(`/clock-in/ot-for-payroll/${year}/${month}`),
  approve: (id) => api.post(`/clock-in/${id}/approve`),
  reject: (id, reason) => api.post(`/clock-in/${id}/reject`, { notes: reason }),
  bulkApprove: (record_ids) => api.post('/clock-in/bulk-approve', { record_ids }),
  delete: (id) => api.delete(`/clock-in/${id}`),
  // Manual attendance management
  calculateHours: (data) => api.post('/clock-in/calculate-hours', data),
  createManual: (data) => api.post('/clock-in/manual', data),
  editHours: (id, data) => api.patch(`/clock-in/${id}/hours`, data),
  approveWithoutSchedule: (id, data) => api.post(`/clock-in/${id}/approve-without-schedule`, data),
  // OT Approval
  approveOT: (id) => api.post(`/clock-in/${id}/approve-ot`),
  bulkApproveOT: (record_ids) => api.post('/clock-in/bulk-approve-ot', { record_ids }),
  rejectOT: (id, reason) => api.post(`/clock-in/${id}/reject-ot`, { reason }),
  // Summary (grouped by outlet > position > employee)
  getSummary: (params) => api.get('/clock-in/summary', { params }),
  // Approve with schedule assignment (for records without schedule)
  approveWithSchedule: (id, data) => api.post(`/clock-in/${id}/approve-with-schedule`, data),
  // Recalculate work hours for a month (fixes overnight shifts)
  recalculate: (data) => api.post('/clock-in/recalculate', data),
  exportExcel: (params) => api.get('/clock-in/export-excel', { params, responseType: 'blob' }),
};

// Benefits In Kind (BIK) - for AA Alive
export const benefitsApi = {
  getAll: (params) => api.get('/benefits-in-kind', { params }),
  getByEmployee: (employeeId) => api.get(`/benefits-in-kind/employee/${employeeId}`),
  getOne: (id) => api.get(`/benefits-in-kind/${id}`),
  create: (data) => api.post('/benefits-in-kind', data),
  update: (id, data) => api.put(`/benefits-in-kind/${id}`, data),
  returnBenefit: (id, data) => api.post(`/benefits-in-kind/${id}/return`, data),
  delete: (id) => api.delete(`/benefits-in-kind/${id}`),
  getPayrollSummary: (year) => api.get(`/benefits-in-kind/summary/payroll/${year}`),

  // Benefit Types
  getTypes: () => api.get('/benefits-in-kind/types/all'),
  createType: (data) => api.post('/benefits-in-kind/types', data),
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

// Positions (for both department-based and outlet-based companies)
export const positionsApi = {
  getAll: (params) => api.get('/positions', { params }),
  getOne: (id) => api.get(`/positions/${id}`),
  create: (data) => api.post('/positions', data),
  update: (id, data) => api.put(`/positions/${id}`, data),
  delete: (id) => api.delete(`/positions/${id}`),
};

// Schedules (for Mimix - outlet-based companies)
export const schedulesApi = {
  getAll: (params) => api.get('/schedules', { params }),
  getCalendar: (year, month, outletId) => api.get('/schedules/calendar', { params: { year, month, outlet_id: outletId } }),
  getEmployeeSchedule: (employeeId, year, month) => api.get(`/schedules/employees/${employeeId}/month/${year}/${month}`),
  create: (data) => api.post('/schedules', data),
  bulkCreate: (data) => api.post('/schedules/bulk', data),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  delete: (id) => api.delete(`/schedules/${id}`),

  // Extra Shift Requests
  getExtraShiftRequests: (params) => api.get('/schedules/extra-shift-requests', { params }),
  approveExtraShift: (id) => api.post(`/schedules/extra-shift-requests/${id}/approve`),
  rejectExtraShift: (id, reason) => api.post(`/schedules/extra-shift-requests/${id}/reject`, { rejection_reason: reason }),

  // Shift Swap Requests (Admin)
  getSwapRequests: (params) => api.get('/shift-swap', { params }),
  getPendingSwapRequests: (outletId) => api.get('/shift-swap/pending', { params: { outlet_id: outletId } }),
  getPendingSwapCount: () => api.get('/shift-swap/pending-count'),
  approveSwap: (id) => api.post(`/shift-swap/${id}/approve`),
  rejectSwap: (id, reason) => api.post(`/shift-swap/${id}/reject`, { reason }),

  // Shift Templates (Indoor Sales)
  getTemplates: () => api.get('/schedules/templates'),
  createTemplate: (data) => api.post('/schedules/templates', data),
  updateTemplate: (id, data) => api.put(`/schedules/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/schedules/templates/${id}`),

  // Weekly Roster (Outlet-based)
  getWeeklyRoster: (outletId, startDate) => api.get('/schedules/roster/weekly', { params: { outlet_id: outletId, start_date: startDate } }),
  assignShift: (data) => api.post('/schedules/roster/assign', data),
  bulkAssignShifts: (outletId, assignments) => api.post('/schedules/roster/bulk-assign', { outlet_id: outletId, assignments }),
  clearSchedule: (employeeId, date) => api.delete('/schedules/roster/clear', { data: { employee_id: employeeId, schedule_date: date } }),

  // Department-based Roster (Indoor Sales)
  getDepartmentRoster: (departmentId, startDate) => api.get('/schedules/roster/department/weekly', { params: { department_id: departmentId, start_date: startDate } }),
  getDepartmentMonthRoster: (departmentId, month) => api.get('/schedules/roster/department/monthly', { params: { department_id: departmentId, month } }),
  assignDepartmentShift: (data) => api.post('/schedules/roster/department/assign', data),
  bulkAssignDepartmentShifts: (departmentId, assignments) => api.post('/schedules/roster/department/bulk-assign', { department_id: departmentId, assignments }),
  copyMonthSchedule: (departmentId, fromMonth, toMonth) => api.post('/schedules/roster/department/copy-month', { department_id: departmentId, from_month: fromMonth, to_month: toMonth }),

  // Permissions
  getPermissions: () => api.get('/schedules/permissions'),
};

// Commission API (Indoor Sales - Department-based)
export const commissionApi = {
  // Department Sales
  getSales: (params) => api.get('/commission/sales', { params }),
  getSalesById: (id) => api.get(`/commission/sales/${id}`),
  saveSales: (data) => api.post('/commission/sales', data),
  calculateCommissions: (id) => api.post(`/commission/sales/${id}/calculate`),
  finalizeSales: (id) => api.post(`/commission/sales/${id}/finalize`),
  revertSales: (id) => api.post(`/commission/sales/${id}/revert`),
  deleteSales: (id) => api.delete(`/commission/sales/${id}`),

  // Commission Payouts
  getEmployeePayouts: (employeeId, year) => api.get(`/commission/payouts/employee/${employeeId}`, { params: { year } }),

  // Indoor Sales Departments
  getIndoorSalesDepartments: () => api.get('/commission/departments'),
};

// Payroll AI Assistant
export const payrollAIApi = {
  getSettings: () => api.get('/payroll/ai/settings'),
  chat: (message, conversationHistory = []) => api.post('/payroll/ai/settings-assistant', {
    message,
    conversation_history: conversationHistory
  }),
  getChangeLogs: (params) => api.get('/payroll/ai/change-logs', { params }),
  getChangeLog: (id) => api.get(`/payroll/ai/change-logs/${id}`),
};

// Public Holidays Management
export const publicHolidaysApi = {
  getAll: (params) => api.get('/public-holidays', { params }),
  getByYear: (companyId) => api.get('/public-holidays/by-year', { params: { company_id: companyId } }),
  create: (data) => api.post('/public-holidays', data),
  update: (id, data) => api.put(`/public-holidays/${id}`, data),
  delete: (id) => api.delete(`/public-holidays/${id}`),
  toggleExtraPay: (id) => api.patch(`/public-holidays/${id}/toggle-extra-pay`),
  bulkExtraPay: (holidayIds, extraPay) => api.patch('/public-holidays/bulk-extra-pay', { holiday_ids: holidayIds, extra_pay: extraPay }),
  importMalaysia: (companyId, year) => api.post('/public-holidays/import-malaysia', { company_id: companyId, year }),
  getDuplicates: (companyId) => api.get('/public-holidays/duplicates', { params: { company_id: companyId } }),
  removeDuplicates: (companyId) => api.delete('/public-holidays/remove-duplicates', { params: { company_id: companyId } }),
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

  // Login history
  getLoginHistory: (params) => api.get('/admin-users/login-history', { params }),

  // Profile management
  getMyProfile: () => api.get('/admin-users/me/profile'),
  updateMyProfile: (data) => api.put('/admin-users/me/profile', data),
  changePassword: (currentPassword, newPassword) => api.post('/admin-users/me/change-password', { currentPassword, newPassword }),
  updateUserProfile: (id, data) => api.put(`/admin-users/profile/${id}`, data),
};

// =====================================================
// AA ALIVE DRIVER SYNC API
// =====================================================
export const aaaliveApi = {
  // Test API connection
  test: (date) => api.get('/admin/aaalive/test', { params: { date } }),

  // Get shifts from OrderOps
  getShifts: (date) => api.get('/admin/aaalive/shifts', { params: { date } }),
  getShiftsRange: (start, end) => api.get('/admin/aaalive/shifts', { params: { start, end } }),

  // Get HRMS drivers
  getDrivers: () => api.get('/admin/aaalive/drivers'),

  // Sync driver attendance
  sync: (date) => api.post('/admin/aaalive/sync', { date }),
  syncRange: (start, end) => api.post('/admin/aaalive/sync', { start, end }),
};

// =====================================================
// EMPLOYEE SELF-SERVICE (ESS) API
// =====================================================

// ESS API with cookie credentials for HttpOnly token
const essApiConfig = { withCredentials: true };

export const essApi = {
  // Authentication
  login: (login, password) => api.post('/ess/login', { login, password }, essApiConfig),
  loginIC: (employee_id, ic_number) => api.post('/ess/login-ic', { employee_id, ic_number }, essApiConfig),
  loginByName: (name, ic_number) => api.post('/ess/login-name', { name, ic_number }, essApiConfig),
  logout: () => api.post('/ess/logout', {}, essApiConfig),
  me: () => api.get('/ess/me', essApiConfig),
  forgotPassword: (email) => api.post('/ess/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post('/ess/reset-password', { token, newPassword }),
  setPassword: (data) => api.post('/ess/set-password', data),
  changePassword: (currentPassword, newPassword, newUsername = null) => api.post('/ess/change-password', { currentPassword, newPassword, newUsername }, essApiConfig),

  // Dashboard
  getDashboard: () => api.get('/ess/dashboard', essApiConfig),

  // Clock-in (4-action structure)
  clockIn: (data) => api.post('/ess/clockin/in', data, essApiConfig),
  clockOut: (data) => api.post('/ess/clockin/out', data, essApiConfig),
  clockAction: (data) => api.post('/ess/clockin/action', data, essApiConfig),
  getClockInStatus: () => api.get('/ess/clockin/status', essApiConfig),
  getClockInHistory: (params) => api.get('/ess/clockin/history', { params, ...essApiConfig }),

  // Profile
  getProfile: () => api.get('/ess/profile', essApiConfig),
  updateProfile: (data) => api.put('/ess/profile', data, essApiConfig),
  getProfileCompletionStatus: () => api.get('/ess/profile/completion-status', essApiConfig),
  completeProfile: () => api.post('/ess/profile/complete', {}, essApiConfig),
  uploadProfilePicture: (imageData) => api.post('/ess/profile/picture', { image: imageData }, essApiConfig),
  deleteProfilePicture: () => api.delete('/ess/profile/picture', essApiConfig),
  setPresetAvatar: (avatarUrl) => api.post('/ess/profile/preset-avatar', { avatar_url: avatarUrl }, essApiConfig),

  // Payslips
  getPayslips: (params) => api.get('/ess/payslips', { params, ...essApiConfig }),
  getPayslip: (id) => api.get(`/ess/payslips/${id}`, essApiConfig),

  // Leave
  getLeaveBalance: () => api.get('/ess/leave/balance', essApiConfig),
  getLeaveHistory: (params) => api.get('/ess/leave/history', { params, ...essApiConfig }),
  getLeaveTypes: () => api.get('/ess/leave/types', essApiConfig),
  applyLeave: (data) => api.post('/ess/leave/apply', data, essApiConfig),
  applyLeaveWithFile: (formData) => api.post('/ess/leave/apply', formData, {
    ...essApiConfig,
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  cancelLeaveRequest: (id) => api.post(`/ess/leave/${id}/cancel`, {}, essApiConfig),
  revertLeave: (id) => api.post(`/ess/leave/${id}/revert`, {}, essApiConfig),

  // Team Leave (Supervisor/Manager)
  getTeamPendingLeave: () => api.get('/ess/leave/team-pending', essApiConfig),
  getTeamPendingLeaveCount: () => api.get('/ess/leave/team-pending-count', essApiConfig),
  approveLeave: (id) => api.post(`/ess/leave/${id}/approve`, {}, essApiConfig),
  rejectLeave: (id, reason) => api.post(`/ess/leave/${id}/reject`, { reason }, essApiConfig),

  // Team Attendance (Supervisor/Manager)
  getTeamAttendance: (date) => api.get('/ess/clockin/team-attendance', { params: { date }, ...essApiConfig }),
  getPendingOT: () => api.get('/ess/clockin/pending-ot', essApiConfig),
  getPendingOTCount: () => api.get('/ess/clockin/pending-ot-count', essApiConfig),
  approveOT: (id) => api.post(`/ess/clockin/${id}/approve-ot`, {}, essApiConfig),
  rejectOT: (id, reason) => api.post(`/ess/clockin/${id}/reject-ot`, { reason }, essApiConfig),

  // Team Shift Swap (Supervisor/Manager)
  getPendingSwapApprovals: () => api.get('/ess/shift-swap/pending-approvals', essApiConfig),
  getPendingSwapCount: () => api.get('/ess/shift-swap/pending-approvals-count', essApiConfig),
  supervisorApproveSwap: (id) => api.post(`/ess/shift-swap/${id}/supervisor-approve`, {}, essApiConfig),
  supervisorRejectSwap: (id, reason) => api.post(`/ess/shift-swap/${id}/supervisor-reject`, { reason }, essApiConfig),

  // Claims
  getClaims: (params) => api.get('/ess/claims', { params, ...essApiConfig }),
  submitClaim: (data) => api.post('/ess/claims', data, essApiConfig),
  verifyReceipt: (data) => api.post('/ess/claims/verify-receipt', data, essApiConfig),
  getTeamPendingClaims: () => api.get('/ess/claims/team-pending', essApiConfig),
  approveClaim: (id, data) => api.post(`/ess/claims/${id}/supervisor-approve`, data, essApiConfig),
  rejectClaim: (id, data) => api.post(`/ess/claims/${id}/supervisor-reject`, data, essApiConfig),

  // Notifications
  getNotifications: (params) => api.get('/ess/notifications', { params, ...essApiConfig }),
  markNotificationRead: (id) => api.put(`/ess/notifications/${id}/read`, {}, essApiConfig),
  markAllNotificationsRead: () => api.put('/ess/notifications/read-all', {}, essApiConfig),
  getUnreadCount: () => api.get('/ess/notifications/unread-count', essApiConfig),

  // Letters / HR Documents
  getLetters: (params) => api.get('/ess/letters', { params, ...essApiConfig }),
  getLetter: (id) => api.get(`/ess/letters/${id}`, essApiConfig),
  getUnreadLettersCount: () => api.get('/ess/letters/unread/count', essApiConfig),
  getLetterPDF: (id) => `${API_URL}/ess/letters/${id}/pdf`, // Returns URL for direct download

  // Benefits In Kind (AA Alive only)
  getBenefits: () => api.get('/ess/benefits', essApiConfig),
  getBenefitsHistory: (params) => api.get('/ess/benefits/history', { params, ...essApiConfig }),

  // Schedules (Mimix only)
  getTodaySchedule: () => api.get('/ess/schedules/today', essApiConfig),
  getMySchedule: (year, month) => api.get('/ess/schedules/my-schedule', { params: { year, month }, ...essApiConfig }),
  getPublicHolidays: (year, month) => api.get('/ess/schedules/public-holidays', { params: { year, month }, ...essApiConfig }),
  getExtraShiftRequests: (params) => api.get('/ess/schedules/extra-shift-requests', { params, ...essApiConfig }),
  submitExtraShiftRequest: (data) => api.post('/ess/schedules/extra-shift-requests', data, essApiConfig),
  cancelExtraShiftRequest: (id) => api.delete(`/ess/schedules/extra-shift-requests/${id}`, essApiConfig),

  // Team Schedules (Supervisor/Manager only)
  getTeamEmployees: () => api.get('/ess/schedules/team-employees', essApiConfig),
  getShiftTemplates: () => api.get('/ess/schedules/shift-templates', essApiConfig),
  getWeeklyStats: (params) => api.get('/ess/schedules/weekly-stats', { params, ...essApiConfig }),
  getTeamSchedules: (params) => api.get('/ess/schedules/team-schedules', { params, ...essApiConfig }),
  createTeamSchedule: (data) => api.post('/ess/schedules/team-schedules', data, essApiConfig),
  createTeamSchedulesBulk: (schedules) => api.post('/ess/schedules/team-schedules/bulk', { schedules }, essApiConfig),
  updateTeamSchedule: (id, data) => api.put(`/ess/schedules/team-schedules/${id}`, data, essApiConfig),
  deleteTeamSchedule: (id) => api.delete(`/ess/schedules/team-schedules/${id}`, essApiConfig),
  getTeamExtraShiftRequests: () => api.get('/ess/schedules/team-extra-shift-requests', essApiConfig),
  approveExtraShift: (id) => api.post(`/ess/schedules/team-extra-shift-requests/${id}/approve`, {}, essApiConfig),
  rejectExtraShift: (id, reason) => api.post(`/ess/schedules/team-extra-shift-requests/${id}/reject`, { reason }, essApiConfig),

  // Shift Swap (Outlet employees)
  getOutletCalendar: (year, month) => api.get('/ess/shift-swap/outlet-calendar', { params: { year, month }, ...essApiConfig }),
  getDateStaff: (date) => api.get('/ess/shift-swap/date-staff', { params: { date }, ...essApiConfig }),
  getOutletColleagues: () => api.get('/ess/shift-swap/outlet-colleagues', essApiConfig),
  getMyShifts: () => api.get('/ess/shift-swap/my-shifts', essApiConfig),
  getColleagueShifts: (colleagueId) => api.get(`/ess/shift-swap/colleague-shifts/${colleagueId}`, essApiConfig),
  getSwapRequests: () => api.get('/ess/shift-swap/my-requests', essApiConfig),
  createSwapRequest: (data) => api.post('/ess/shift-swap/request', data, essApiConfig),
  respondToSwap: (id, response) => api.post(`/ess/shift-swap/${id}/respond`, { response }, essApiConfig),
  cancelSwapRequest: (id) => api.delete(`/ess/shift-swap/${id}`, essApiConfig),

  // Indoor Sales - Weekly Roster
  getMyWeeklyRoster: (startDate) => api.get('/ess/schedules/my-weekly-roster', { params: { start_date: startDate }, ...essApiConfig }),

  // Indoor Sales - Commission
  getMyCommission: (year) => api.get('/ess/schedules/my-commission', { params: { year }, ...essApiConfig }),
  getMyCommissionDetail: (year, month) => api.get(`/ess/schedules/my-commission/${year}/${month}`, essApiConfig),

  // Manager Overview (Manager only - all outlets)
  getManagerOverview: () => api.get('/ess/manager-overview', essApiConfig),
  getOutletStaff: (outletId) => api.get(`/ess/manager-overview/outlet/${outletId}/staff`, essApiConfig),
  getOutletAttendance: (outletId, date) => api.get(`/ess/manager-overview/outlet/${outletId}/attendance`, { params: { date }, ...essApiConfig }),
  managerQuickAddEmployee: (data) => api.post('/ess/manager-overview/quick-add', data, essApiConfig),
};

// Payroll Config (Admin Settings Page)
export const payrollConfigApi = {
  getConfig: () => api.get('/admin/payroll-config'),
  updateConfig: (data) => api.put('/admin/payroll-config', data),
  getOTRules: () => api.get('/admin/payroll-config/ot-rules'),
  createOTRule: (data) => api.post('/admin/payroll-config/ot-rules', data),
  updateOTRule: (id, data) => api.put(`/admin/payroll-config/ot-rules/${id}`, data),
  deleteOTRule: (id) => api.delete(`/admin/payroll-config/ot-rules/${id}`),
  getEmployeeOverrides: (params) => api.get('/admin/payroll-config/employee-overrides', { params }),
  updateEmployeeOverride: (id, data) => api.put(`/admin/payroll-config/employee-overrides/${id}`, data),
  bulkUpdateOverrides: (employee_ids, updates) => api.put('/admin/payroll-config/employee-overrides/bulk', { employee_ids, updates }),
  getEarningTypes: () => api.get('/admin/payroll-config/earning-types'),
  updateAllowanceTaxable: (id, is_taxable) => api.patch(`/admin/payroll-config/allowance-types/${id}/taxable`, { is_taxable }),
  updateCommissionTaxable: (id, is_taxable) => api.patch(`/admin/payroll-config/commission-types/${id}/taxable`, { is_taxable }),
  getAutomation: () => api.get('/admin/payroll-config/automation'),
  updateAutomation: (data) => api.put('/admin/payroll-config/automation', data),
  getStatutoryReference: () => api.get('/admin/payroll-config/statutory-reference'),
};

export const analyticsApi = {
  getAvailablePeriods: () => api.get('/analytics/available-periods'),
  getPayrollOverview: (params) => api.get('/analytics/payroll-overview', { params }),
  getDepartmentBreakdown: (params) => api.get('/analytics/department-breakdown', { params }),
  getSalaryRanking: (params) => api.get('/analytics/salary-ranking', { params }),
  getMonthlyTrend: (months = 12) => api.get('/analytics/monthly-trend', { params: { months } }),
  getStatutoryBreakdown: (params) => api.get('/analytics/statutory-breakdown', { params }),
  getOTAnalysis: (params) => api.get('/analytics/ot-analysis', { params }),
  getHeadcount: () => api.get('/analytics/headcount'),
  getAttendanceSummary: () => api.get('/analytics/attendance-summary'),
  getAiInsights: () => api.get('/analytics/ai-insights'),
};

// Driver Claims Portal
export const driverClaimsApi = {
  login: (credentials) => api.post('/driver-claims/login', credentials),
  getSummary: (params) => api.get('/driver-claims/summary', { params }),
  getByDriver: (params) => api.get('/driver-claims/by-driver', { params }),
  getDriverClaims: (employeeId, params) => api.get(`/driver-claims/driver/${employeeId}`, { params }),
  approve: (data) => api.post('/driver-claims/approve', data),
  reject: (id, data) => api.post(`/driver-claims/reject/${id}`, data),
  bulkReject: (data) => api.post('/driver-claims/bulk-reject', data),
  release: (data) => api.post('/driver-claims/release', data),
  getPendingSignature: (employeeId) => api.get(`/driver-claims/pending-signature/${employeeId}`),
  sign: (employeeId, data) => api.post(`/driver-claims/sign/${employeeId}`, data),
  getHistory: (params) => api.get('/driver-claims/history', { params }),
};

export default api;
