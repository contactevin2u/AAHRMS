import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AnonymousFeedback from './pages/AnonymousFeedback';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/admin/login" replace />;
}

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<AnonymousFeedback />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
