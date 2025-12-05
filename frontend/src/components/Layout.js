import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Layout.css';

function Layout({ children }) {
  const navigate = useNavigate();
  const [adminInfo, setAdminInfo] = useState(null);

  useEffect(() => {
    const storedInfo = localStorage.getItem('adminInfo');
    if (storedInfo) {
      setAdminInfo(JSON.parse(storedInfo));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminInfo');
    navigate('/');
  };

  // Check if user has permission to see a menu item
  const hasPermission = (permission) => {
    if (!adminInfo) return true; // Show all if no info (fallback)
    if (adminInfo.role === 'super_admin') return true;
    if (adminInfo.permissions?.all === true) return true;
    return adminInfo.permissions?.[permission] === true;
  };

  // Check if user can access user management (super_admin, boss, director only)
  const canManageUsers = () => {
    if (!adminInfo) return false;
    return ['super_admin', 'boss', 'director'].includes(adminInfo.role);
  };

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="AA Alive" className="logo-img" />
          <h2>AA Alive</h2>
          {adminInfo && (
            <div className="admin-info">
              <span className="admin-name">{adminInfo.name || adminInfo.username}</span>
              <span className="admin-role">{adminInfo.role_display_name || adminInfo.role}</span>
            </div>
          )}
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

          <NavLink to="/admin/leave" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📅</span>
            <span>Leave</span>
          </NavLink>

          <NavLink to="/admin/claims" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📝</span>
            <span>Claims</span>
          </NavLink>

          <NavLink to="/admin/payroll-v2" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">💰</span>
            <span>Payroll</span>
          </NavLink>

          <NavLink to="/admin/contributions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🏛️</span>
            <span>Contributions</span>
          </NavLink>

          <NavLink to="/admin/resignations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">👋</span>
            <span>Resignations</span>
          </NavLink>

          <NavLink to="/admin/letters" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📋</span>
            <span>HR Letters</span>
          </NavLink>

          <NavLink to="/admin/departments" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🏢</span>
            <span>Departments</span>
          </NavLink>

          <NavLink to="/admin/feedback" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">💬</span>
            <span>Feedback</span>
          </NavLink>

          {canManageUsers() && (
            <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">👤</span>
              <span>User Management</span>
            </NavLink>
          )}
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
