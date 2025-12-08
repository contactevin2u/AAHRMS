/**
 * Tenant Isolation Middleware
 * Ensures data is properly scoped to the user's company
 */

// Middleware to require company context (blocks system-level super_admin from accessing company-specific routes)
const requireCompanyContext = (req, res, next) => {
  // Super admin without company_id can access all companies via separate routes
  // For company-specific routes, they should specify a company context
  if (req.admin && req.admin.role === 'super_admin' && !req.companyId) {
    // Allow super_admin to pass through - they can see all data
    return next();
  }

  if (!req.companyId) {
    return res.status(403).json({
      error: 'Company context required',
      message: 'This action requires a valid company context'
    });
  }

  next();
};

// Middleware that enforces strict company context (even super_admin must have company_id)
const requireStrictCompanyContext = (req, res, next) => {
  if (!req.companyId) {
    return res.status(403).json({
      error: 'Company context required',
      message: 'This action requires a valid company context'
    });
  }
  next();
};

// Helper function to get company filter for queries
// Returns empty object for super_admin (can see all), or {company_id: X} for company users
const getCompanyFilter = (req) => {
  // Super admin without specific company_id can see all
  if (req.admin && req.admin.role === 'super_admin' && !req.companyId) {
    return null; // null means no filter (see all)
  }
  return req.companyId;
};

// Helper to build SQL WHERE clause for company filtering
// Returns { clause: 'AND company_id = $X', params: [companyId], nextParamIndex: X+1 }
// or { clause: '', params: [], nextParamIndex: X } for super_admin
const buildCompanyFilter = (req, paramIndex = 1) => {
  const companyId = getCompanyFilter(req);

  if (companyId === null) {
    return {
      clause: '',
      params: [],
      nextParamIndex: paramIndex
    };
  }

  return {
    clause: `AND company_id = $${paramIndex}`,
    params: [companyId],
    nextParamIndex: paramIndex + 1
  };
};

// Middleware to allow super_admin to impersonate/access a specific company
// Super admin can pass ?company_id=X in query to access a specific company
const allowCompanyOverride = (req, res, next) => {
  // Only super_admin can override company context
  if (req.admin && req.admin.role === 'super_admin') {
    // Check if company_id is provided in query or body
    const overrideCompanyId = req.query.company_id || req.body.company_id;
    if (overrideCompanyId) {
      req.companyId = parseInt(overrideCompanyId);
    }
  }
  next();
};

// Check if user is system-level super_admin (no company_id)
const isSuperAdmin = (req) => {
  return req.admin && req.admin.role === 'super_admin' && !req.admin.company_id;
};

// Check if user can manage companies (only system-level super_admin)
const requireSystemAdmin = (req, res, next) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Only system administrators can perform this action'
    });
  }
  next();
};

module.exports = {
  requireCompanyContext,
  requireStrictCompanyContext,
  getCompanyFilter,
  buildCompanyFilter,
  allowCompanyOverride,
  isSuperAdmin,
  requireSystemAdmin
};
