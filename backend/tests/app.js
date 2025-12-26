/**
 * Express App for Testing
 *
 * This creates a test instance of the Express app without starting the server.
 * It allows Supertest to make requests without needing a running server.
 */

const express = require('express');
const cors = require('cors');

// Import error handling middleware
const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const authRoutes = require('../routes/auth');
const employeeRoutes = require('../routes/employees');
const departmentRoutes = require('../routes/departments');
const leaveRoutes = require('../routes/leave');
const claimsRoutes = require('../routes/claims');
const feedbackRoutes = require('../routes/feedback');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/feedback', feedbackRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

module.exports = app;
