const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Import centralized error handling
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const feedbackRoutes = require('./routes/feedback');
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const departmentRoutes = require('./routes/departments');
const payrollUnifiedRoutes = require('./routes/payrollUnified');  // Unified payroll engine
const contributionsRoutes = require('./routes/contributions');
const leaveRoutes = require('./routes/leave');
const claimsRoutes = require('./routes/claims');
const resignationsRoutes = require('./routes/resignations');
const essRoutes = require('./routes/ess/index');
const lettersRoutes = require('./routes/letters');
const adminUsersRoutes = require('./routes/adminUsers');
const probationRoutes = require('./routes/probation');
const companiesRoutes = require('./routes/companies');
const earningsRoutes = require('./routes/earnings');
const salesRoutes = require('./routes/sales');
const clockInRoutes = require('./routes/clockIn');
const outletsRoutes = require('./routes/outlets');
const automationRoutes = require('./routes/automation');
const bikRoutes = require('./routes/benefitsInKind');
const retentionRoutes = require('./routes/admin/retention');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - CORS
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://aahrms.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));  // Increased for base64 image uploads
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/feedback', feedbackRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/payroll', payrollUnifiedRoutes);  // Unified payroll engine (merged V1+V2)
app.use('/api/contributions', contributionsRoutes);  // Government contributions
app.use('/api/leave', leaveRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/resignations', resignationsRoutes);
app.use('/api/ess', essRoutes);  // Employee Self-Service Portal
app.use('/api/letters', lettersRoutes);  // HR Letters/Notices
app.use('/api/admin-users', adminUsersRoutes);  // Admin User Management
app.use('/api/probation', probationRoutes);  // Probation Management
app.use('/api/companies', companiesRoutes);  // Company Management (Multi-tenant)
app.use('/api/earnings', earningsRoutes);  // Commission & Allowance Types
app.use('/api/sales', salesRoutes);  // Sales Records (for Indoor Sales commission)
app.use('/api/clock-in', clockInRoutes);  // Clock In/Out Records
app.use('/api/outlets', outletsRoutes);  // Outlets (for Mimix A)
app.use('/api/automation', automationRoutes);  // Automation & Scheduling
app.use('/api/benefits-in-kind', bikRoutes);  // Benefits In Kind (AA Alive)
app.use('/api/admin/retention', retentionRoutes);  // Data Retention Policy Management

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
