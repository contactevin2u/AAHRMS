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
  DIRECTOR: 'director',
  BOSS: 'boss'
};

// Company IDs
const COMPANIES = {
  AA_ALIVE: 1,
  MIMIX: 3
};

// Position hierarchy levels (higher number = higher rank)
// admin > manager > supervisor > assistant supervisor > crew/part timer/cashier
const POSITION_HIERARCHY = {
  // Admin roles (from admin_users table) - handled separately
  'admin': 100,
  'super_admin': 100,
  'boss': 100,
  'director': 90,

  // Manager level
  'manager': 80,

  // Supervisor level
  'supervisor': 60,

  // Assistant supervisor level
  'assistant supervisor': 40,
  'assistant_supervisor': 40,
  'asst supervisor': 40,
  'asst. supervisor': 40,

  // Crew level (all equal)
  'ft service crew': 20,
  'full time service crew': 20,
  'service crew': 20,
  'part timer': 20,
  'part time': 20,
  'pt': 20,
  'cashier': 20,
  'barista': 20,
  'crew': 20,
  'staff': 20,

  // Default for unknown positions
  'default': 10
};

/**
 * Get hierarchy level for a position/role
 * Checks both employee_role and position name
 */
const getHierarchyLevel = (employeeRole, positionName, positionRole) => {
  // First check position role from positions table (most specific)
  if (positionRole) {
    const role = positionRole.toLowerCase();
    if (POSITION_HIERARCHY[role] !== undefined) {
      return POSITION_HIERARCHY[role];
    }
  }

  // Then check employee_role
  if (employeeRole) {
    const role = employeeRole.toLowerCase();
    if (POSITION_HIERARCHY[role] !== undefined) {
      return POSITION_HIERARCHY[role];
    }
  }

  // Then check position name
  if (positionName) {
    const name = positionName.toLowerCase().trim();
    if (POSITION_HIERARCHY[name] !== undefined) {
      return POSITION_HIERARCHY[name];
    }

    // Check for partial matches
    for (const [key, level] of Object.entries(POSITION_HIERARCHY)) {
      if (name.includes(key) || key.includes(name)) {
        return level;
      }
    }
  }

  return POSITION_HIERARCHY['default'];
};

/**
 * Check if approver can approve for target employee based on hierarchy
 * Approver must have HIGHER hierarchy level than target
 */
const canApproveBasedOnHierarchy = async (approverId, targetEmployeeId) => {
  // Get approver info with position details
  const approverResult = await pool.query(`
    SELECT e.id, e.employee_role, e.position, p.role as position_role, p.name as position_name
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    WHERE e.id = $1
  `, [approverId]);

  if (approverResult.rows.length === 0) {
    return { canApprove: false, reason: 'Approver not found' };
  }

  const approver = approverResult.rows[0];

  // Get target employee info with position details
  const targetResult = await pool.query(`
    SELECT e.id, e.employee_role, e.position, e.name, p.role as position_role, p.name as position_name
    FROM employees e
    LEFT JOIN positions p ON e.position_id = p.id
    WHERE e.id = $1
  `, [targetEmployeeId]);

  if (targetResult.rows.length === 0) {
    return { canApprove: false, reason: 'Target employee not found' };
  }

  const target = targetResult.rows[0];

  // Get hierarchy levels
  const approverLevel = getHierarchyLevel(approver.employee_role, approver.position || approver.position_name, approver.position_role);
  const targetLevel = getHierarchyLevel(target.employee_role, target.position || target.position_name, target.position_role);

  // Approver must have HIGHER level than target
  if (approverLevel <= targetLevel) {
    return {
      canApprove: false,
      reason: `You cannot approve requests for ${target.name}. Your position level (${approverLevel}) must be higher than theirs (${targetLevel}).`
    };
  }

  return { canApprove: true };
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
 * Check if employee is boss or director level (highest approval authority)
 * Boss/Director can approve at any level
 */
const isBossOrDirector = (employee) => {
  const role = (employee.employee_role || '').toLowerCase();
  const position = (employee.position || '').toLowerCase();
  return role === 'boss' || role === 'director' ||
         position.includes('boss') || position.includes('director') ||
         position.includes('owner');
};

/**
 * Check if employee can approve claims for Mimix
 * For Mimix: Only boss/director can approve claims (not supervisor/manager)
 * For other companies: supervisor/manager can approve
 */
const canApproveClaimsForMimix = (employee) => {
  if (!isMimixCompany(employee.company_id)) {
    // Non-Mimix: supervisor/manager can approve
    return isSupervisorOrManager(employee);
  }
  // Mimix: Only boss/director can approve claims
  return isBossOrDirector(employee);
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
 * Check if company is AA Alive
 */
const isAAAliveCompany = (companyId) => {
  return parseInt(companyId) === COMPANIES.AA_ALIVE;
};

/**
 * Get outlet IDs that employee can manage
 * - Supervisor: own outlet only
 * - Manager: all assigned outlets
 */
const getManagedOutlets = async (employee) => {
  if (employee.employee_role === ROLES.SUPERVISOR) {
    // Supervisor: own outlet, fallback to employee_outlets if outlet_id is null
    if (employee.outlet_id) return [employee.outlet_id];
    const result = await pool.query(
      'SELECT outlet_id FROM employee_outlets WHERE employee_id = $1',
      [employee.id]
    );
    return result.rows.map(r => r.outlet_id);
  }

  if (employee.employee_role === ROLES.MANAGER) {
    const result = await pool.query(
      'SELECT outlet_id FROM employee_outlets WHERE employee_id = $1',
      [employee.id]
    );
    const outlets = result.rows.map(r => r.outlet_id);
    // Fallback: include manager's own outlet_id if not already in list
    if (employee.outlet_id && !outlets.includes(employee.outlet_id)) {
      outlets.push(employee.outlet_id);
    }
    return outlets;
  }

  return [];
};

/**
 * Get department IDs that employee can manage (for AA Alive)
 * - Supervisor/Manager: own department
 * - Can be extended with employee_departments table in future
 */
const getManagedDepartments = async (employee) => {
  // Check if designated schedule manager (e.g., Rafina) - can manage all departments
  const isDesignatedManager = await isAAAliveIndoorSalesManager(employee);
  if (isDesignatedManager && !isSupervisorOrManager(employee)) {
    // Designated schedule managers can manage all departments in their company
    const result = await pool.query('SELECT id FROM departments WHERE company_id = $1', [employee.company_id]);
    return result.rows.map(r => r.id);
  }

  if (!isSupervisorOrManager(employee)) {
    return [];
  }

  // For now, supervisor/manager can manage their own department
  return employee.department_id ? [employee.department_id] : [];
};

/**
 * Check if supervisor/manager can approve for a specific employee
 * @param {Object} approver - The supervisor/manager employee
 * @param {Object} targetEmployee - The employee whose request needs approval (with outlet_id, company_id)
 */
const canApproveForEmployee = async (approver, targetEmployee) => {
  // Must be supervisor or manager
  if (!isSupervisorOrManager(approver)) {
    return false;
  }

  // Must be same company
  if (approver.company_id !== targetEmployee.company_id) {
    return false;
  }

  // For Mimix (outlet-based), check outlet scope
  if (isMimixCompany(approver.company_id)) {
    const managedOutlets = await getManagedOutlets(approver);
    return managedOutlets.includes(parseInt(targetEmployee.outlet_id));
  }

  // For non-Mimix companies, supervisor/manager can approve for their department
  // (This is a fallback - AA Alive uses admin approval flow)
  return true;
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
 * Check if employee is AA Alive Indoor Sales Manager
 * Indoor Sales Manager position can manage schedules and approve OT
 */
const isAAAliveIndoorSalesManager = async (employee) => {
  if (isMimixCompany(employee.company_id)) return false;

  // Check if employee has schedule management permission
  const result = await pool.query(
    `SELECT position, employee_id, employee_role FROM employees WHERE id = $1`,
    [employee.id]
  );

  if (result.rows.length === 0) return false;

  const { position, employee_id, employee_role } = result.rows[0];

  // AA Alive: Indoor Sales Manager or Manager position
  if (employee_role === ROLES.MANAGER && (position === 'Indoor Sales' || position === 'Manager')) {
    return true;
  }

  // Specific AA Alive employees with schedule management access (e.g., Office staff managing schedules)
  const scheduleManagers = ['RAFINA'];
  if (scheduleManagers.includes(employee_id)) {
    return true;
  }

  return false;
};

/**
 * Build permission flags for employee
 */
const buildPermissionFlags = async (employee) => {
  const isMimix = isMimixCompany(employee.company_id);
  const isSupOrMgr = isSupervisorOrManager(employee);
  const isBossDir = isBossOrDirector(employee);
  const canApproveOTLeave = isSupOrMgr || isBossDir;

  // Get managed outlets - boss/director gets all outlets
  let managedOutlets = [];
  if (isBossDir && isMimix) {
    const pool = require('../db');
    const allOutletsResult = await pool.query(
      'SELECT id FROM outlets WHERE company_id = $1',
      [employee.company_id]
    );
    managedOutlets = allOutletsResult.rows.map(r => r.id);
  } else if (isSupOrMgr) {
    managedOutlets = await getManagedOutlets(employee);
  }

  // AA Alive Indoor Sales Manager can also approve OT and manage schedules
  const isIndoorSalesManager = await isAAAliveIndoorSalesManager(employee);

  return {
    employee_role: employee.employee_role || ROLES.STAFF,
    can_approve_leave: (canApproveOTLeave && isMimix) || isIndoorSalesManager,
    can_approve_ot: (canApproveOTLeave && isMimix) || isIndoorSalesManager,
    can_approve_swaps: canApproveOTLeave && isMimix,
    can_approve_claims: canApproveClaimsForMimix(employee),
    can_view_team: canApproveOTLeave,
    can_manage_schedule: (canApproveOTLeave && isMimix) || isIndoorSalesManager,
    managed_outlets: managedOutlets,
    is_mimix: isMimix,
    is_boss_or_director: isBossDir,
    is_indoor_sales_manager: isIndoorSalesManager
  };
};

module.exports = {
  ROLES,
  COMPANIES,
  POSITION_HIERARCHY,
  isSupervisor,
  isManager,
  canApproveForOutlet,
  canApproveForEmployee,
  canApproveBasedOnHierarchy,
  getHierarchyLevel,
  isSupervisorOrManager,
  isBossOrDirector,
  canApproveClaimsForMimix,
  canViewTeam,
  isMimixCompany,
  isAAAliveCompany,
  getManagedOutlets,
  getManagedDepartments,
  getTeamEmployeeIds,
  requireSupervisorOrManager,
  requireMimixCompany,
  getInitialApprovalLevel,
  buildPermissionFlags,
  isAAAliveIndoorSalesManager
};
