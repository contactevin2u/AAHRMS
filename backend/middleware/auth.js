const jwt = require('jsonwebtoken');
const pool = require('../db');

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;

    // Extract company_id for tenant isolation
    // Super admin (company_id = null) can specify company via header or query param
    if (decoded.role === 'super_admin' && !decoded.company_id) {
      // Allow super_admin to select company context via header or query
      const selectedCompany = req.headers['x-company-id'] || req.query.company_id;
      req.companyId = selectedCompany ? parseInt(selectedCompany) : null;
      req.isSuperAdmin = true;
    } else {
      req.companyId = decoded.company_id;
      req.isSuperAdmin = false;
    }

    // Extract outlet_id for supervisor outlet isolation
    req.outletId = decoded.outlet_id;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// Middleware to check specific permission
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get user's role and permissions
      const result = await pool.query(`
        SELECT au.role, ar.permissions
        FROM admin_users au
        LEFT JOIN admin_roles ar ON au.role = ar.name
        WHERE au.id = $1
      `, [req.admin.id]);

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const { role, permissions } = result.rows[0];

      // Super admin has all permissions
      if (role === 'super_admin' || permissions?.all === true) {
        return next();
      }

      // Check if user has the specific permission
      if (permissions && permissions[permission]) {
        return next();
      }

      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// Middleware to require specific roles
const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await pool.query(
        'SELECT role FROM admin_users WHERE id = $1',
        [req.admin.id]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const userRole = result.rows[0].role;

      // Super admin can access everything
      if (userRole === 'super_admin') {
        return next();
      }

      if (allowedRoles.includes(userRole)) {
        return next();
      }

      return res.status(403).json({ error: 'Insufficient role privileges' });
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ error: 'Role check failed' });
    }
  };
};

// Employee Self-Service authentication
const authenticateEmployee = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ensure this is an employee token (has employee_id and role='employee')
    if (decoded.role !== 'employee') {
      return res.status(403).json({ error: 'Access denied. Employee access required.' });
    }

    req.employee = decoded;
    // Extract company_id for tenant isolation
    req.companyId = decoded.company_id;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = { authenticateAdmin, authenticateEmployee, requirePermission, requireRole };
