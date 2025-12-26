/**
 * Error Handler Middleware Tests
 */

const {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateRequired
} = require('../../middleware/errorHandler');

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an error with message and status code', () => {
      const error = new AppError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    it('should include error code when provided', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');

      expect(error.errorCode).toBe('TEST_ERROR');
    });
  });

  describe('ValidationError', () => {
    it('should create a 400 error with validation details', () => {
      const errors = [{ field: 'name', message: 'Name is required' }];
      const error = new ValidationError('Validation failed', errors);

      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual(errors);
    });
  });

  describe('AuthenticationError', () => {
    it('should create a 401 error', () => {
      const error = new AuthenticationError();

      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Authentication required');
    });

    it('should use custom message when provided', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create a 403 error', () => {
      const error = new AuthorizationError();

      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('should create a 404 error with resource name', () => {
      const error = new NotFoundError('Employee');

      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('NOT_FOUND');
      expect(error.message).toBe('Employee not found');
      expect(error.resource).toBe('Employee');
    });
  });

  describe('ConflictError', () => {
    it('should create a 409 error', () => {
      const error = new ConflictError('Email already exists');

      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('CONFLICT_ERROR');
      expect(error.message).toBe('Email already exists');
    });
  });

  describe('DatabaseError', () => {
    it('should create a 500 error', () => {
      const error = new DatabaseError();

      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('DATABASE_ERROR');
    });
  });
});

describe('errorHandler middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      path: '/api/test',
      method: 'GET'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  it('should handle AppError correctly', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'Test error',
          code: 'TEST_ERROR'
        })
      })
    );
  });

  it('should handle ValidationError with details', () => {
    const errors = [{ field: 'email', message: 'Invalid email' }];
    const error = new ValidationError('Validation failed', errors);

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          details: errors
        })
      })
    );
  });

  it('should handle unknown errors as 500', () => {
    const error = new Error('Unknown error');

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
  });
});

describe('notFoundHandler middleware', () => {
  it('should create NotFoundError for undefined routes', () => {
    const mockReq = { originalUrl: '/api/nonexistent' };
    const mockRes = {};
    const mockNext = jest.fn();

    notFoundHandler(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    const error = mockNext.mock.calls[0][0];
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Route /api/nonexistent not found');
  });
});

describe('asyncHandler', () => {
  it('should pass resolved value through', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const wrapped = asyncHandler(mockFn);

    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();

    await wrapped(mockReq, mockRes, mockNext);

    expect(mockFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should catch and pass errors to next', async () => {
    const error = new Error('Test error');
    const mockFn = jest.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(mockFn);

    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();

    await wrapped(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });
});

describe('validateRequired', () => {
  it('should not throw when all fields present', () => {
    const data = { name: 'John', email: 'john@test.com' };

    expect(() => {
      validateRequired(['name', 'email'], data);
    }).not.toThrow();
  });

  it('should throw ValidationError when fields missing', () => {
    const data = { name: 'John' };

    expect(() => {
      validateRequired(['name', 'email'], data);
    }).toThrow(ValidationError);
  });

  it('should include all missing fields in error', () => {
    const data = {};

    try {
      validateRequired(['name', 'email'], data);
    } catch (error) {
      expect(error.errors).toHaveLength(2);
      expect(error.errors[0].field).toBe('name');
      expect(error.errors[1].field).toBe('email');
    }
  });

  it('should treat empty strings as missing', () => {
    const data = { name: '', email: 'test@test.com' };

    expect(() => {
      validateRequired(['name', 'email'], data);
    }).toThrow(ValidationError);
  });
});
