/**
 * Input Sanitization Middleware
 * Prevents XSS attacks by sanitizing user inputs
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - Input string to sanitize
 * @returns {string} - Sanitized string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize an object's string values recursively
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return escapeHtml(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }
  return sanitized;
}

/**
 * Sanitize specific fields in request body
 * @param {Array<string>} fields - Array of field names to sanitize
 * @returns {Function} - Express middleware
 */
function sanitizeFields(fields) {
  return (req, res, next) => {
    if (req.body) {
      fields.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          req.body[field] = escapeHtml(req.body[field]);
        }
      });
    }
    next();
  };
}

/**
 * Middleware to sanitize all string fields in request body
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

/**
 * Validate and sanitize employee data
 * @param {object} data - Employee data to validate
 * @returns {object} - Sanitized data with only string fields sanitized
 */
function sanitizeEmployeeData(data) {
  if (!data || typeof data !== 'object') return {};

  const sanitized = {};

  // String fields that need XSS sanitization
  const stringFields = [
    'name', 'email', 'employee_id', 'ic_number', 'phone',
    'address', 'bank_name', 'bank_account_no', 'bank_account_holder', 'position',
    'epf_number', 'socso_number', 'tax_number', 'epf_contribution_type',
    'marital_status', 'probation_notes', 'notes'
  ];

  stringFields.forEach(field => {
    if (data[field] !== undefined && data[field] !== null) {
      sanitized[field] = typeof data[field] === 'string'
        ? escapeHtml(data[field].trim())
        : data[field];
    }
  });

  return sanitized;
}

module.exports = {
  escapeHtml,
  sanitizeObject,
  sanitizeFields,
  sanitizeBody,
  sanitizeEmployeeData
};
