const express = require('express');
const cors = require('cors');
require('dotenv').config();

const feedbackRoutes = require('./routes/feedback');
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const departmentRoutes = require('./routes/departments');
const payrollRoutes = require('./routes/payroll');
const payrollNewRoutes = require('./routes/payrollNew');
const contributionsRoutes = require('./routes/contributions');
const leaveRoutes = require('./routes/leave');
const claimsRoutes = require('./routes/claims');
const resignationsRoutes = require('./routes/resignations');
const essRoutes = require('./routes/ess');
const lettersRoutes = require('./routes/letters');
const adminUsersRoutes = require('./routes/adminUsers');
const probationRoutes = require('./routes/probation');
const companiesRoutes = require('./routes/companies');

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
app.use(express.json());

// Routes
app.use('/api/feedback', feedbackRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/payroll-v2', payrollNewRoutes);  // New payroll system
app.use('/api/contributions', contributionsRoutes);  // Government contributions
app.use('/api/leave', leaveRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/resignations', resignationsRoutes);
app.use('/api/ess', essRoutes);  // Employee Self-Service Portal
app.use('/api/letters', lettersRoutes);  // HR Letters/Notices
app.use('/api/admin-users', adminUsersRoutes);  // Admin User Management
app.use('/api/probation', probationRoutes);  // Probation Management
app.use('/api/companies', companiesRoutes);  // Company Management (Multi-tenant)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
