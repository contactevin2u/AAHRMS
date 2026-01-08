// ESS (Employee Self-Service) Pages
//
// Main Pages (6 navigation items):
// - Dashboard, Attendance, Leave, Claims, Calendar, Profile
//
// Support Pages:
// - Login, ChangePassword, Notifications, Letters, Benefits, Payslips
//
// Supervisor/Manager Pages:
// - TeamSchedule, OTApproval

// Auth
export { default as ESSLogin } from './ESSLogin';
export { default as ESSChangePassword } from './ESSChangePassword';

// Main 6 Navigation Pages
export { default as ESSDashboard } from './ESSDashboard';
export { default as ESSAttendance } from './ESSAttendance';  // Includes Clock-In
export { default as ESSLeave } from './ESSLeave';
export { default as ESSClaims } from './ESSClaims';
export { default as ESSCalendar } from './ESSCalendar';      // Includes Schedule
export { default as ESSProfile } from './ESSProfile';

// Support Pages
export { default as ESSPayslips } from './ESSPayslips';
export { default as ESSNotifications } from './ESSNotifications';
export { default as ESSLetters } from './ESSLetters';
export { default as ESSBenefits } from './ESSBenefits';

// Supervisor/Manager Pages
export { default as ESSTeamSchedule } from './ESSTeamSchedule';
export { default as ESSOTApproval } from './ESSOTApproval';
export { default as ESSManagerOverview } from './ESSManagerOverview';

// Deprecated (redirected to main pages)
// ESSClockIn -> use ESSAttendance
// ESSSchedule -> use ESSCalendar
