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
// Shift swap disabled - employees must work assigned shifts only
// const shiftSwapRoutes = require('./shiftSwap');
const managerOverviewRoutes = require('./managerOverview');
const otApprovalRoutes = require('./otApproval');

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

// Shift swap disabled - employees must work assigned shifts only
// router.use('/shift-swap', shiftSwapRoutes);

// Manager Overview routes (managers only)
router.use('/manager-overview', managerOverviewRoutes);

// OT Batch Approval routes (supervisors/managers only)
router.use('/ot-approvals', otApprovalRoutes);

module.exports = router;
