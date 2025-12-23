/**
 * ESS (Employee Self-Service) Routes
 *
 * This module combines all ESS sub-routes into a single router.
 * Refactored from the original 778-line ess.js file.
 */

const express = require('express');
const router = express.Router();

// Import sub-routes
const authRoutes = require('./auth');
const profileRoutes = require('./profile');
const payslipsRoutes = require('./payslips');
const leaveRoutes = require('./leave');
const claimsRoutes = require('./claims');
const notificationsRoutes = require('./notifications');
const lettersRoutes = require('./letters');
const dashboardRoutes = require('./dashboard');

// Mount sub-routes
// Auth routes (login, password reset, etc.) - no prefix needed
router.use('/', authRoutes);

// Profile routes
router.use('/profile', profileRoutes);

// Payslips routes
router.use('/payslips', payslipsRoutes);

// Leave routes
router.use('/leave', leaveRoutes);

// Claims routes
router.use('/claims', claimsRoutes);

// Notifications routes
router.use('/notifications', notificationsRoutes);

// Letters routes
router.use('/letters', lettersRoutes);

// Dashboard routes
router.use('/dashboard', dashboardRoutes);

module.exports = router;
