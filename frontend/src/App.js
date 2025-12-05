import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AnonymousFeedback from './pages/AnonymousFeedback';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees';
import Payroll from './pages/Payroll';
import PayrollV2 from './pages/PayrollV2';
import SalaryEntry from './pages/SalaryEntry';
import Payslip from './pages/Payslip';
import Departments from './pages/Departments';
import Feedback from './pages/Feedback';
import Leave from './pages/Leave';
import Claims from './pages/Claims';
import Resignations from './pages/Resignations';
import Contributions from './pages/Contributions';
import Letters from './pages/Letters';
import UserManagement from './pages/UserManagement';
// Employee Self-Service (ESS) imports
import EmployeeLogin from './pages/EmployeeLogin';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeProfile from './pages/EmployeeProfile';
import EmployeePayslips from './pages/EmployeePayslips';
import EmployeeLeave from './pages/EmployeeLeave';
import EmployeeClaims from './pages/EmployeeClaims';
import EmployeeNotifications from './pages/EmployeeNotifications';
import EmployeeLetters from './pages/EmployeeLetters';
import './App.css';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/" replace />;
}

function EmployeeProtectedRoute({ children }) {
  const token = localStorage.getItem('employeeToken');
  return token ? children : <Navigate to="/employee/login" replace />;
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
