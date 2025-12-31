import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AnonymousFeedback from './pages/AnonymousFeedback';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees/index';
import Payroll from './pages/Payroll';
import PayrollV2 from './pages/PayrollV2';
import SalaryEntry from './pages/SalaryEntry';
import Payslip from './pages/Payslip';
import Departments from './pages/Departments';
import Outlets from './pages/Outlets';
import Feedback from './pages/Feedback';
import Leave from './pages/Leave';
import Claims from './pages/Claims';
import Resignations from './pages/Resignations';
import Contributions from './pages/Contributions';
import Letters from './pages/Letters';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import MyProfile from './pages/MyProfile';
import CompanyManagement from './pages/CompanyManagement';
import Settings from './pages/Settings';
import SalesEntry from './pages/SalesEntry';
import Attendance from './pages/Attendance';
import BenefitsInKind from './pages/BenefitsInKind';
import Analytics from './pages/Analytics';
// Employee Self-Service (ESS) imports - Legacy
import EmployeeLogin from './pages/EmployeeLogin';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeProfile from './pages/EmployeeProfile';
import EmployeePayslips from './pages/EmployeePayslips';
import EmployeeLeave from './pages/EmployeeLeave';
import EmployeeClaims from './pages/EmployeeClaims';
import EmployeeNotifications from './pages/EmployeeNotifications';
import EmployeeLetters from './pages/EmployeeLetters';
// Mimix Staff Portal - Legacy
import MimixLogin from './pages/MimixLogin';
import StaffClockIn from './pages/StaffClockIn';
// New Unified ESS PWA (6 main pages + auth + support pages)
import { ESSLogin, ESSChangePassword, ESSDashboard, ESSAttendance, ESSBenefits, ESSProfile, ESSCalendar, ESSLeave, ESSPayslips, ESSClaims, ESSNotifications, ESSLetters } from './pages/ess';
import Schedules from './pages/Schedules';
import './App.css';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/" replace />;
}

function EmployeeProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  return token ? children : <Navigate to="/employee/login" replace />;
}

function StaffProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  return token ? children : <Navigate to="/staff/login" replace />;
}

// ESS Protected Route (unified)
function ESSProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  return token ? children : <Navigate to="/ess/login" replace />;
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
              <PayrollV2 />
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
        <Route
          path="/admin/contributions"
          element={
            <ProtectedRoute>
              <Contributions />
            </ProtectedRoute>
          }
        />
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
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute>
              <RoleManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/profile"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/companies"
          element={
            <ProtectedRoute>
              <CompanyManagement />
            </ProtectedRoute>
          }
        />
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
          path="/admin/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />

        {/* Employee Self-Service (ESS) Routes */}
        <Route path="/employee/login" element={<EmployeeLogin />} />
        <Route
          path="/employee/dashboard"
          element={
            <EmployeeProtectedRoute>
              <EmployeeDashboard />
            </EmployeeProtectedRoute>
          }
        />
        <Route
          path="/employee/profile"
          element={
            <EmployeeProtectedRoute>
              <EmployeeProfile />
            </EmployeeProtectedRoute>
          }
        />
        <Route
          path="/employee/payslips"
          element={
            <EmployeeProtectedRoute>
              <EmployeePayslips />
            </EmployeeProtectedRoute>
          }
        />
        <Route
          path="/employee/leave"
          element={
            <EmployeeProtectedRoute>
              <EmployeeLeave />
            </EmployeeProtectedRoute>
          }
        />
        <Route
          path="/employee/claims"
          element={
            <EmployeeProtectedRoute>
              <EmployeeClaims />
            </EmployeeProtectedRoute>
          }
        />
        <Route
          path="/employee/notifications"
          element={
            <EmployeeProtectedRoute>
              <EmployeeNotifications />
            </EmployeeProtectedRoute>
          }
        />
        <Route
          path="/employee/letters"
          element={
            <EmployeeProtectedRoute>
              <EmployeeLetters />
            </EmployeeProtectedRoute>
          }
        />

        {/* Mimix Staff Portal Routes - Legacy */}
        <Route path="/staff/login" element={<MimixLogin />} />
        <Route
          path="/staff/clockin"
          element={
            <StaffProtectedRoute>
              <StaffClockIn />
            </StaffProtectedRoute>
          }
        />

        {/* Unified ESS PWA Routes */}
        <Route path="/ess/login" element={<ESSLogin />} />
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
        {/* Redirect /ess/schedule to /ess/calendar (schedule is inside calendar) */}
        <Route path="/ess/schedule" element={<Navigate to="/ess/calendar" replace />} />
        <Route
          path="/ess/calendar"
          element={
            <ESSProtectedRoute>
              <ESSCalendar />
            </ESSProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
