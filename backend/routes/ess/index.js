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
const clockinRoutes = require('./clockin');
const benefitsRoutes = require('./benefits');
const schedulesRoutes = require('./schedules');
const shiftSwapRoutes = require('./shiftSwap');

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

// Clock-in routes
router.use('/clockin', clockinRoutes);

// Benefits In Kind routes (AA Alive only)
router.use('/benefits', benefitsRoutes);

// Schedules routes (Mimix/outlet-based companies)
router.use('/schedules', schedulesRoutes);

// Shift Swap routes (outlet employees can swap shifts)
router.use('/shift-swap', shiftSwapRoutes);

module.exports = router;
