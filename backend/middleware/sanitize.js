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
 * @returns {object} - Sanitized data or throws error
 */
function sanitizeEmployeeData(data) {
  const sanitized = {};

  // Required string fields
  const stringFields = [
    'name', 'email', 'employee_id', 'ic_number', 'phone',
    'address', 'bank_name', 'bank_account', 'position',
    'emergency_contact_name', 'emergency_contact_phone', 'notes'
  ];

  stringFields.forEach(field => {
    if (data[field] !== undefined) {
      sanitized[field] = typeof data[field] === 'string'
        ? escapeHtml(data[field].trim())
        : data[field];
    }
  });

  // Numeric fields - ensure they're numbers
  const numericFields = [
    'basic_salary', 'department_id', 'company_id', 'outlet_id',
    'epf_employee_rate', 'epf_employer_rate'
  ];

  numericFields.forEach(field => {
    if (data[field] !== undefined) {
      sanitized[field] = data[field];
    }
  });

  // Boolean fields
  const booleanFields = ['is_resident', 'epf_employee_fixed', 'epf_employer_fixed'];

  booleanFields.forEach(field => {
    if (data[field] !== undefined) {
      sanitized[field] = data[field];
    }
  });

  // Date fields
  const dateFields = ['join_date', 'probation_end_date', 'resignation_date', 'last_working_date'];

  dateFields.forEach(field => {
    if (data[field] !== undefined) {
      sanitized[field] = data[field];
    }
  });

  // Enum fields
  if (data.status) sanitized.status = data.status;
  if (data.employment_type) sanitized.employment_type = data.employment_type;
  if (data.pay_type) sanitized.pay_type = data.pay_type;

  return sanitized;
}

module.exports = {
  escapeHtml,
  sanitizeObject,
  sanitizeFields,
  sanitizeBody,
  sanitizeEmployeeData
};
