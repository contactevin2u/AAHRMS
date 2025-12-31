/**
 * ESS Role Permission Middleware
 * Handles role-based access control for ESS features
 */

const pool = require('../db');

// Constants for employee roles
const ROLES = {
  STAFF: 'staff',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  DIRECTOR: 'director'
};

// Company IDs
const COMPANIES = {
  AA_ALIVE: 1,
  MIMIX: 3
};

/**
 * Check if employee is a supervisor for a given outlet
 */
const isSupervisor = (employee, outletId) => {
  return employee.employee_role === ROLES.SUPERVISOR &&
         employee.outlet_id === parseInt(outletId);
};

/**
 * Check if employee is a manager for a given outlet
 * Managers can manage multiple outlets via employee_outlets table
 */
const isManager = async (employee, outletId) => {
  if (employee.employee_role !== ROLES.MANAGER) return false;

  // Check if manager is assigned to this outlet
  const result = await pool.query(
    'SELECT 1 FROM employee_outlets WHERE employee_id = $1 AND outlet_id = $2',
    [employee.id, outletId]
  );
  return result.rows.length > 0;
};

/**
 * Check if employee can approve for a given outlet
 */
const canApproveForOutlet = async (employee, outletId) => {
  return isSupervisor(employee, outletId) || await isManager(employee, outletId);
};

/**
 * Check if employee has supervisor or manager role
 */
const isSupervisorOrManager = (employee) => {
  return [ROLES.SUPERVISOR, ROLES.MANAGER].includes(employee.employee_role);
};

/**
 * Check if employee can view team data (supervisor/manager only)
 */
const canViewTeam = (employee) => {
  return isSupervisorOrManager(employee);
};

/**
 * Check if company is Mimix (outlet-based)
 */
const isMimixCompany = (companyId) => {
  return parseInt(companyId) === COMPANIES.MIMIX;
};

/**
 * Get outlet IDs that employee can manage
 * - Supervisor: own outlet only
 * - Manager: all assigned outlets
 */
const getManagedOutlets = async (employee) => {
  if (employee.employee_role === ROLES.SUPERVISOR) {
    return employee.outlet_id ? [employee.outlet_id] : [];
  }

  if (employee.employee_role === ROLES.MANAGER) {
    const result = await pool.query(
      'SELECT outlet_id FROM employee_outlets WHERE employee_id = $1',
      [employee.id]
    );
    return result.rows.map(r => r.outlet_id);
  }

  return [];
};

/**
 * Get employees under supervisor/manager's scope
 */
const getTeamEmployeeIds = async (employee) => {
  const outletIds = await getManagedOutlets(employee);
  if (outletIds.length === 0) return [];

  const result = await pool.query(
    `SELECT id FROM employees
     WHERE outlet_id = ANY($1)
     AND id != $2
     AND status = 'active'`,
    [outletIds, employee.id]
  );
  return result.rows.map(r => r.id);
};

/**
 * Middleware to require supervisor or manager role
 */
const requireSupervisorOrManager = (req, res, next) => {
  if (!isSupervisorOrManager(req.employee)) {
    return res.status(403).json({ error: 'Access denied. Supervisor or Manager role required.' });
  }
  next();
};

/**
 * Middleware to require Mimix company (for outlet-specific features)
 */
const requireMimixCompany = (req, res, next) => {
  if (!isMimixCompany(req.employee.company_id)) {
    return res.status(403).json({ error: 'This feature is only available for outlet-based companies.' });
  }
  next();
};

/**
 * Get approval level based on employee role and company
 * AA Alive: Employee -> Admin (approval_level starts at 3)
 * Mimix Staff: Employee -> Supervisor -> Admin (approval_level starts at 1)
 * Mimix Supervisor: Supervisor -> Manager -> Admin (approval_level starts at 2)
 */
const getInitialApprovalLevel = (employee) => {
  if (!isMimixCompany(employee.company_id)) {
    // AA Alive: Skip to admin level
    return 3;
  }

  if (employee.employee_role === ROLES.SUPERVISOR) {
    // Supervisor's own requests skip supervisor level
    return 2;
  }

  // Regular staff starts at supervisor level
  return 1;
};

/**
 * Build permission flags for employee
 */
const buildPermissionFlags = async (employee) => {
  const isMimix = isMimixCompany(employee.company_id);
  const isSupOrMgr = isSupervisorOrManager(employee);
  const managedOutlets = isSupOrMgr ? await getManagedOutlets(employee) : [];

  return {
    employee_role: employee.employee_role || ROLES.STAFF,
    can_approve_leave: isSupOrMgr && isMimix,
    can_approve_ot: isSupOrMgr && isMimix,
    can_approve_swaps: isSupOrMgr && isMimix,
    can_view_team: isSupOrMgr,
    managed_outlets: managedOutlets,
    is_mimix: isMimix
  };
};

module.exports = {
  ROLES,
  COMPANIES,
  isSupervisor,
  isManager,
  canApproveForOutlet,
  isSupervisorOrManager,
  canViewTeam,
  isMimixCompany,
  getManagedOutlets,
  getTeamEmployeeIds,
  requireSupervisorOrManager,
  requireMimixCompany,
  getInitialApprovalLevel,
  buildPermissionFlags
};
