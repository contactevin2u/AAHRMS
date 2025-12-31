/**
 * ESS Permission Utilities
 * Role-based access control helpers for frontend
 */

// Company IDs
const COMPANIES = {
  AA_ALIVE: 1,
  MIMIX: 3
};

// Employee roles
const ROLES = {
  STAFF: 'staff',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  DIRECTOR: 'director'
};

/**
 * Check if employee info has permissions object
 * Permissions are included in login response from backend
 */
export const getPermissions = (employeeInfo) => {
  return employeeInfo?.permissions || {
    employee_role: ROLES.STAFF,
    can_approve_leave: false,
    can_approve_ot: false,
    can_approve_swaps: false,
    can_view_team: false,
    managed_outlets: [],
    is_mimix: false
  };
};

/**
 * Check if employee is from Mimix (outlet-based company)
 */
export const isMimixCompany = (employeeInfo) => {
  return parseInt(employeeInfo?.company_id) === COMPANIES.MIMIX;
};

/**
 * Check if employee is from AA Alive (department-based company)
 */
export const isAAAliveCompany = (employeeInfo) => {
  return parseInt(employeeInfo?.company_id) === COMPANIES.AA_ALIVE;
};

/**
 * Check if employee has supervisor or manager role
 */
export const isSupervisorOrManager = (employeeInfo) => {
  const role = employeeInfo?.employee_role || employeeInfo?.permissions?.employee_role;
  return [ROLES.SUPERVISOR, ROLES.MANAGER].includes(role);
};

/**
 * Check if employee can view team data (leave, attendance, etc.)
 */
export const canViewTeam = (employeeInfo) => {
  return getPermissions(employeeInfo).can_view_team;
};

/**
 * Check if employee can view team leave requests
 * Only supervisors/managers at Mimix companies
 */
export const canViewTeamLeave = (employeeInfo) => {
  const permissions = getPermissions(employeeInfo);
  return permissions.can_approve_leave;
};

/**
 * Check if employee can view team attendance
 * Only supervisors/managers at Mimix companies
 */
export const canViewTeamAttendance = (employeeInfo) => {
  return isSupervisorOrManager(employeeInfo) && isMimixCompany(employeeInfo);
};

/**
 * Check if employee can approve overtime
 * Only supervisors/managers at Mimix companies
 */
export const canApproveOT = (employeeInfo) => {
  const permissions = getPermissions(employeeInfo);
  return permissions.can_approve_ot;
};

/**
 * Check if employee can approve shift swaps
 * Only supervisors/managers at Mimix companies
 */
export const canApproveShiftSwap = (employeeInfo) => {
  const permissions = getPermissions(employeeInfo);
  return permissions.can_approve_swaps;
};

/**
 * Check if clock-in feature is available
 * Only for Mimix (outlet-based companies)
 */
export const hasClockInFeature = (employeeInfo) => {
  return employeeInfo?.features?.clockIn || isMimixCompany(employeeInfo);
};

/**
 * Check if schedule feature is available
 * Only for Mimix (outlet-based companies)
 */
export const hasScheduleFeature = (employeeInfo) => {
  return isMimixCompany(employeeInfo);
};

/**
 * Check if benefits feature is available
 * Only for AA Alive company
 */
export const hasBenefitsFeature = (employeeInfo) => {
  return employeeInfo?.features?.benefitsInKind || isAAAliveCompany(employeeInfo);
};

/**
 * Get employee's role display name
 */
export const getRoleDisplayName = (employeeInfo) => {
  const role = employeeInfo?.employee_role || employeeInfo?.permissions?.employee_role || ROLES.STAFF;
  const roleNames = {
    [ROLES.STAFF]: 'Staff',
    [ROLES.SUPERVISOR]: 'Supervisor',
    [ROLES.MANAGER]: 'Manager',
    [ROLES.DIRECTOR]: 'Director'
  };
  return roleNames[role] || 'Staff';
};

/**
 * Get managed outlet IDs for supervisor/manager
 */
export const getManagedOutlets = (employeeInfo) => {
  return getPermissions(employeeInfo).managed_outlets || [];
};

/**
 * Check if there are any pending approvals that need attention
 * Used for showing badge/alert on dashboard
 */
export const hasPendingApprovals = (employeeInfo, counts = {}) => {
  if (!isSupervisorOrManager(employeeInfo)) return false;
  if (!isMimixCompany(employeeInfo)) return false;

  const total = (counts.leaveCount || 0) + (counts.otCount || 0) + (counts.swapCount || 0);
  return total > 0;
};

export { COMPANIES, ROLES };
