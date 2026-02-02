import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import AnonymousFeedback from './pages/AnonymousFeedback';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees/index';
import EmployeeEdit from './pages/Employees/EmployeeEdit';
import EmployeeAdd from './pages/Employees/EmployeeAdd';
import Payroll from './pages/Payroll';
import PayrollUnified from './pages/PayrollUnified';
import PayrollCalculationGuide from './pages/PayrollCalculationGuide';
import AIChangeLogs from './pages/AIChangeLogs';
import SalaryEntry from './pages/SalaryEntry';
import Payslip from './pages/Payslip';
import Departments from './pages/Departments';
import Outlets from './pages/Outlets';
import Feedback from './pages/Feedback';
import Leave from './pages/Leave';
import LeaveBalances from './pages/LeaveBalances';
import Claims from './pages/Claims';
import Resignations from './pages/Resignations';
import Letters from './pages/Letters';
import UserAccess from './pages/UserAccess';
import MyProfile from './pages/MyProfile';
import Settings from './pages/Settings';
import SalesEntry from './pages/SalesEntry';
import Attendance from './pages/Attendance';
import BenefitsInKind from './pages/BenefitsInKind';
import Analytics from './pages/Analytics';
// Legacy imports removed - using unified ESS portal
// Mimix Staff Portal - redirects to ESS
import MimixLogin from './pages/MimixLogin';
// New Unified ESS PWA (5 main nav items + auth + support pages)
import { ESSLogin, ESSChangePassword, ESSDashboard, ESSAttendance, ESSBenefits, ESSProfile, ESSSchedule, ESSRequests, ESSCalendar, ESSLeave, ESSPayslips, ESSClaims, ESSNotifications, ESSLetters, ESSTeamSchedule, ESSOTApproval, ESSManagerOverview } from './pages/ess';
import Schedules from './pages/Schedules';
import IndoorSalesSchedule from './pages/IndoorSalesSchedule';
import IndoorSalesCommission from './pages/IndoorSalesCommission';
import PublicHolidays from './pages/PublicHolidays';
import OutstationAllowance from './pages/OutstationAllowance';
import PayrollSettings from './pages/PayrollSettings';
import './App.css';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/" replace />;
}

// Legacy EmployeeProtectedRoute removed - use ESSProtectedRoute instead

// ESS Protected Route (unified) - includes language provider
function ESSProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  if (!token) {
    return <Navigate to="/ess/login" replace />;
  }
  return <LanguageProvider>{children}</LanguageProvider>;
}

// ESS Public Route (login page) - includes language provider
function ESSPublicRoute({ children }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

// ESS Supervisor Protected Route - for supervisor/manager pages (team schedule, OT approval)
function ESSSupervisorProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  if (!token) {
    return <Navigate to="/ess/login" replace />;
  }

  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const role = employeeInfo?.employee_role;
  const isMimix = parseInt(employeeInfo?.company_id) === 3;

  // Allow supervisor/manager/admin/director for Mimix, or anyone with can_manage_schedule permission
  const canManageSchedule = employeeInfo?.permissions?.can_manage_schedule;
  const hasAccess = (isMimix && ['supervisor', 'manager', 'admin', 'director'].includes(role)) || canManageSchedule;

  if (!hasAccess) {
    return <Navigate to="/ess/dashboard" replace />;
  }

  return <LanguageProvider>{children}</LanguageProvider>;
}

// ESS Manager Protected Route - for manager only pages (team overview)
function ESSManagerProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  if (!token) {
    return <Navigate to="/ess/login" replace />;
  }

  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const role = employeeInfo?.employee_role;
  const isMimix = parseInt(employeeInfo?.company_id) === 3;

  // Only allow manager, admin, director roles for Mimix company
  const hasAccess = isMimix && ['manager', 'admin', 'director'].includes(role);

  if (!hasAccess) {
    return <Navigate to="/ess/dashboard" replace />;
  }

  return <LanguageProvider>{children}</LanguageProvider>;
}

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<AdminLogin />} />
        <Route path="/feedback" element={<AnonymousFeedback />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/employees"
          element={
            <ProtectedRoute>
              <Employees />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/employees/add"
          element={
            <ProtectedRoute>
              <EmployeeAdd />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/employees/edit/:id"
          element={
            <ProtectedRoute>
              <EmployeeEdit />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/salary-entry"
          element={
            <ProtectedRoute>
              <SalaryEntry />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/payroll"
          element={
            <ProtectedRoute>
              <Payroll />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/payslip/:id"
          element={
            <ProtectedRoute>
              <Payslip />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/departments"
          element={
            <ProtectedRoute>
              <Departments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/outlets"
          element={
            <ProtectedRoute>
              <Outlets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/feedback"
          element={
            <ProtectedRoute>
              <Feedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/leave"
          element={
            <ProtectedRoute>
              <Leave />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/claims"
          element={
            <ProtectedRoute>
              <Claims />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/payroll-v2"
          element={
            <ProtectedRoute>
              <PayrollUnified />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/payroll-guide"
          element={
            <ProtectedRoute>
              <PayrollCalculationGuide />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ai-change-logs"
          element={
            <ProtectedRoute>
              <AIChangeLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/resignations"
          element={
            <ProtectedRoute>
              <Resignations />
            </ProtectedRoute>
          }
        />
        {/* Contributions merged into Payroll */}
        <Route path="/admin/contributions" element={<Navigate to="/admin/payroll-v2" replace />} />
        <Route
          path="/admin/letters"
          element={
            <ProtectedRoute>
              <Letters />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <UserAccess />
            </ProtectedRoute>
          }
        />
        {/* Redirects for old routes */}
        <Route path="/admin/password-status" element={<Navigate to="/admin/users" replace />} />
        <Route path="/admin/roles" element={<Navigate to="/admin/users" replace />} />
        <Route
          path="/admin/profile"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />
        {/* Companies merged into Settings */}
        <Route path="/admin/companies" element={<Navigate to="/admin/settings" replace />} />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sales-entry"
          element={
            <ProtectedRoute>
              <SalesEntry />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/attendance"
          element={
            <ProtectedRoute>
              <Attendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/benefits-in-kind"
          element={
            <ProtectedRoute>
              <BenefitsInKind />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/schedules"
          element={
            <ProtectedRoute>
              <Schedules />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/indoor-sales/schedule"
          element={
            <ProtectedRoute>
              <IndoorSalesSchedule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/indoor-sales/commission"
          element={
            <ProtectedRoute>
              <IndoorSalesCommission />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/public-holidays"
          element={
            <ProtectedRoute>
              <PublicHolidays />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/outstation-allowance"
          element={
            <ProtectedRoute>
              <OutstationAllowance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/payroll-settings"
          element={
            <ProtectedRoute>
              <PayrollSettings />
            </ProtectedRoute>
          }
        />

        {/* Legacy Employee Routes - Redirect to unified ESS */}
        <Route path="/employee/login" element={<Navigate to="/ess/login" replace />} />
        <Route path="/employee/dashboard" element={<Navigate to="/ess/dashboard" replace />} />
        <Route path="/employee/profile" element={<Navigate to="/ess/profile" replace />} />
        <Route path="/employee/payslips" element={<Navigate to="/ess/payslips" replace />} />
        <Route path="/employee/leave" element={<Navigate to="/ess/leave" replace />} />
        <Route path="/employee/claims" element={<Navigate to="/ess/claims" replace />} />
        <Route path="/employee/notifications" element={<Navigate to="/ess/notifications" replace />} />
        <Route path="/employee/letters" element={<Navigate to="/ess/letters" replace />} />

        {/* Mimix Staff Portal - Redirect to ESS */}
        <Route path="/staff/login" element={<MimixLogin />} />
        <Route path="/staff/clockin" element={<Navigate to="/ess/attendance" replace />} />

        {/* Unified ESS PWA Routes */}
        <Route path="/ess/login" element={<ESSPublicRoute><ESSLogin /></ESSPublicRoute>} />
        <Route
          path="/ess/change-password"
          element={
            <ESSProtectedRoute>
              <ESSChangePassword />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/dashboard"
          element={
            <ESSProtectedRoute>
              <ESSDashboard />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/profile"
          element={
            <ESSProtectedRoute>
              <ESSProfile />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/payslips"
          element={
            <ESSProtectedRoute>
              <ESSPayslips />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/leave"
          element={
            <ESSProtectedRoute>
              <ESSLeave />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/claims"
          element={
            <ESSProtectedRoute>
              <ESSClaims />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/notifications"
          element={
            <ESSProtectedRoute>
              <ESSNotifications />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/letters"
          element={
            <ESSProtectedRoute>
              <ESSLetters />
            </ESSProtectedRoute>
          }
        />
        {/* Redirect /ess/clock-in to /ess/attendance (clock-in is inside attendance) */}
        <Route path="/ess/clock-in" element={<Navigate to="/ess/attendance" replace />} />
        <Route
          path="/ess/attendance"
          element={
            <ESSProtectedRoute>
              <ESSAttendance />
            </ESSProtectedRoute>
          }
        />
        <Route
          path="/ess/benefits"
          element={
            <ESSProtectedRoute>
              <ESSBenefits />
            </ESSProtectedRoute>
          }
        />
        {/* Combined Schedule page (My + Team tabs) */}
        <Route
          path="/ess/schedule"
          element={
            <ESSProtectedRoute>
              <ESSSchedule />
            </ESSProtectedRoute>
          }
        />
        {/* Legacy calendar route - still accessible */}
        <Route
          path="/ess/calendar"
          element={
            <ESSProtectedRoute>
              <ESSCalendar />
            </ESSProtectedRoute>
          }
        />
        {/* Combined Requests page (Leave + Claims + OT tabs) */}
        <Route
          path="/ess/requests"
          element={
            <ESSProtectedRoute>
              <ESSRequests />
            </ESSProtectedRoute>
          }
        />

        {/* Supervisor/Manager ESS Pages */}
        <Route
          path="/ess/team-schedule"
          element={
            <ESSSupervisorProtectedRoute>
              <ESSTeamSchedule />
            </ESSSupervisorProtectedRoute>
          }
        />
        <Route
          path="/ess/ot-approval"
          element={
            <ESSSupervisorProtectedRoute>
              <ESSOTApproval />
            </ESSSupervisorProtectedRoute>
          }
        />
        {/* Manager Overview - requires manager role (not supervisor) */}
        <Route
          path="/ess/manager-overview"
          element={
            <ESSManagerProtectedRoute>
              <ESSManagerOverview />
            </ESSManagerProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
