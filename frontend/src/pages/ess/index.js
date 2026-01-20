// ESS (Employee Self-Service) Pages
//
// Main Pages (5 navigation items - mobile optimized):
// - Home (Dashboard), Clock In (Attendance), Schedule, Requests, Profile
//
// Support Pages:
// - Login, ChangePassword, Notifications, Letters, Benefits, Payslips
//
// Supervisor/Manager Pages:
// - TeamSchedule, OTApproval

// Auth
export { default as ESSLogin } from './ESSLogin';
export { default as ESSChangePassword } from './ESSChangePassword';

// Main 5 Navigation Pages
export { default as ESSDashboard } from './ESSDashboard';
export { default as ESSAttendance } from './ESSAttendance';  // Clock-In
export { default as ESSSchedule } from './ESSSchedule';      // My Schedule + Team (tabs)
export { default as ESSRequests } from './ESSRequests';      // Leave + Claims + OT (tabs)
export { default as ESSProfile } from './ESSProfile';

// Legacy/Support Pages (still accessible via direct URL)
export { default as ESSCalendar } from './ESSCalendar';      // Redirects to Schedule
export { default as ESSLeave } from './ESSLeave';
export { default as ESSClaims } from './ESSClaims';
export { default as ESSPayslips } from './ESSPayslips';
export { default as ESSNotifications } from './ESSNotifications';
export { default as ESSLetters } from './ESSLetters';
export { default as ESSBenefits } from './ESSBenefits';

// Supervisor/Manager Pages
export { default as ESSTeamSchedule } from './ESSTeamSchedule';
export { default as ESSOTApproval } from './ESSOTApproval';
export { default as ESSManagerOverview } from './ESSManagerOverview';
