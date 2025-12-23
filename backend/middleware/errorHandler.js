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
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
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
    return new ValidationError(`${err.column} is required`);
  }

  // Check constraint violation
  if (err.code === '23514') {
    return new ValidationError('Data validation failed');
  }

  // Invalid input syntax
  if (err.code === '22P02') {
    return new ValidationError('Invalid data format');
  }

  // Connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return new DatabaseError('Unable to connect to database');
  }

  return new DatabaseError('Database operation failed');
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
  // Log the error
  console.error('Error:', {
    message: err.message,
    code: err.errorCode || err.code,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Handle specific error types
  let error = err;

  // PostgreSQL errors
  if (err.code && typeof err.code === 'string' && err.code.match(/^[0-9A-Z]{5}$/)) {
    error = handleDatabaseError(err);
  }

  // JWT errors
  if (err.name && err.name.includes('Token') || err.name === 'JsonWebTokenError') {
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

  // Don't expose internal error details in production
  if (statusCode === 500 && !isDevelopment && !error.isOperational) {
    response.error.message = 'An unexpected error occurred';
    response.error.code = 'INTERNAL_ERROR';
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
  RateLimitError,

  // Middleware
  errorHandler,
  notFoundHandler,

  // Utilities
  asyncHandler,
  validateRequired,
  formatErrorResponse
};
