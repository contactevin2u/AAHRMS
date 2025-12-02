import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Layout.css';

function Layout({ children }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/');
  };

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="AA Alive" className="logo-img" />
          <h2>AA Alive</h2>
        </div>

        <div className="nav-links">
          <NavLink to="/admin/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/admin/employees" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">👥</span>
            <span>Employees</span>
          </NavLink>

          <NavLink to="/admin/salary-entry" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">💵</span>
            <span>Salary Entry</span>
          </NavLink>

          <NavLink to="/admin/payroll" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">💰</span>
            <span>Payroll</span>
          </NavLink>

          <NavLink to="/admin/departments" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🏢</span>
            <span>Departments</span>
          </NavLink>

          <NavLink to="/admin/feedback" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">💬</span>
            <span>Feedback</span>
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-link">
            <span className="nav-icon">👋</span>
            <span>Logout</span>
          </button>
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

export default Layout;
