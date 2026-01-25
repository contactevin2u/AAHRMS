/**
 * Centralized Error Handling Middleware
 *
 * This module provides a standardized way to handle errors across the application.
 * It includes custom error classes, error handling middleware, and async wrapper utilities.
 */

// Custom Error Classes
class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', technicalMessage = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.technicalMessage = technicalMessage; // For logging only
  }
}

class TechnicalError extends AppError {
  constructor(message = 'Something went wrong. Please contact technician.', technicalMessage = null) {
    super(message, 500, 'TECHNICAL_ERROR');
    this.technicalMessage = technicalMessage; // For logging only
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

// Error Response Formatter
const formatErrorResponse = (err, includeStack = false) => {
  const response = {
    success: false,
    error: {
      message: err.message,
      code: err.errorCode || 'INTERNAL_ERROR',
      timestamp: err.timestamp || new Date().toISOString()
    }
  };

  // Add validation errors if present
  if (err.errors && err.errors.length > 0) {
    response.error.details = err.errors;
  }

  // Add resource info for NotFoundError
  if (err.resource) {
    response.error.resource = err.resource;
  }

  // Include stack trace in development
  if (includeStack && err.stack) {
    response.error.stack = err.stack;
  }

  return response;
};

// PostgreSQL Error Handler
const handleDatabaseError = (err) => {
  // Unique constraint violation
  if (err.code === '23505') {
    const match = err.detail?.match(/Key \((.+)\)=\((.+)\) already exists/);
    if (match) {
      return new ConflictError(`${match[1]} '${match[2]}' already exists`);
    }
    return new ConflictError('A record with this value already exists');
  }

  // Foreign key violation
  if (err.code === '23503') {
    return new ValidationError('Referenced record does not exist');
  }

  // Not null violation
  if (err.code === '23502') {
    const column = err.column || 'A required field';
    return new ValidationError(`${column} is required`);
  }

  // Check constraint violation
  if (err.code === '23514') {
    return new ValidationError(`Data validation failed: ${err.constraint || 'constraint violation'}`);
  }

  // Invalid input syntax
  if (err.code === '22P02') {
    return new ValidationError(`Invalid data format: ${err.message}`);
  }

  // Numeric value out of range
  if (err.code === '22003') {
    return new ValidationError('Numeric value out of range');
  }

  // String data too long
  if (err.code === '22001') {
    return new ValidationError('Text value too long for field');
  }

  // Invalid datetime format
  if (err.code === '22007' || err.code === '22008') {
    return new ValidationError('Invalid date/time format');
  }

  // Connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return new TechnicalError('Unable to connect to server. Please contact technician.', err.message);
  }

  // Connection timeout
  if (err.code === 'ETIMEDOUT' || err.code === '57P01') {
    return new TechnicalError('Server connection timeout. Please try again or contact technician.', err.message);
  }

  // Default - show user-friendly message, log technical details
  console.error('Unhandled PostgreSQL error code:', err.code, 'Message:', err.message);
  return new TechnicalError('Something went wrong. Please try again or contact technician.', `Database error (${err.code}): ${err.message}`);
};

// JWT Error Handler
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    return new AuthenticationError('Token has expired');
  }
  if (err.name === 'NotBeforeError') {
    return new AuthenticationError('Token not yet valid');
  }
  return err;
};

// Main Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  // Log the error with more detail
  console.error('Error:', {
    message: err.message,
    code: err.errorCode || err.code,
    pgCode: err.code,
    pgDetail: err.detail,
    pgHint: err.hint,
    pgColumn: err.column,
    pgTable: err.table,
    pgConstraint: err.constraint,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    stack: err.stack
  });

  // Handle specific error types
  let error = err;

  // Cloudinary errors (check for Cloudinary-specific properties)
  if (err.http_code || (err.message && err.message.toLowerCase().includes('cloudinary'))) {
    console.error('Cloudinary error:', err.message);
    error = new TechnicalError(
      'Photo upload failed. Please try again or contact technician.',
      err.message
    );
  }
  // PostgreSQL errors
  else if (err.code && typeof err.code === 'string' && err.code.match(/^[0-9A-Z]{5}$/)) {
    error = handleDatabaseError(err);
  }
  // JWT errors
  else if (err.name && err.name.includes('Token') || err.name === 'JsonWebTokenError') {
    error = handleJWTError(err);
  }

  // Syntax errors (invalid JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = new ValidationError('Invalid JSON in request body');
  }

  // Default to 500 if no status code
  const statusCode = error.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Format response
  const response = formatErrorResponse(error, isDevelopment);

  // For 500 errors, always show user-friendly message
  if (statusCode === 500) {
    // If it's not already a user-friendly TechnicalError, make it one
    if (!error.isOperational || error.errorCode === 'INTERNAL_ERROR') {
      response.error.message = 'Something went wrong. Please try again or contact technician.';
      response.error.code = 'TECHNICAL_ERROR';
    }
  }

  res.status(statusCode).json(response);
};

// 404 Handler for undefined routes
const notFoundHandler = (req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl}`));
};

// Async Handler Wrapper - eliminates try-catch in route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation Helper
const validateRequired = (fields, data) => {
  const errors = [];

  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push({
        field,
        message: `${field} is required`
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Missing required fields', errors);
  }
};

// Export everything
module.exports = {
  // Error Classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  TechnicalError,
  RateLimitError,

  // Middleware
  errorHandler,
  notFoundHandler,

  // Utilities
  asyncHandler,
  validateRequired,
  formatErrorResponse
};
