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

  // Check if user is super admin (for role management)
  const isSuperAdmin = () => {
    if (!adminInfo) return false;
    return adminInfo.role === 'super_admin';
  };

  // Check if company uses outlets instead of departments
  const usesOutlets = () => {
    return adminInfo?.company_grouping_type === 'outlet';
  };

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          {usesOutlets() ? (
            <img src="/mixue-logo.png" alt="Mixue" className="logo-img" style={{ maxHeight: '60px' }} />
          ) : (
            <img src="/logo.png" alt="AA HRMS" className="logo-img" />
          )}
          <h2>{adminInfo?.company_name || 'HRMS'}</h2>
          {adminInfo && (
            <div className="admin-info">
              <span className="admin-name">{adminInfo.name || adminInfo.username}</span>
              <span className="admin-role">{adminInfo.role_display_name || adminInfo.role}</span>
              {adminInfo.company_name && (
                <span className="admin-company" style={{ fontSize: '11px', color: '#90caf9', marginTop: '4px', display: 'block' }}>
                  {adminInfo.company_name}
                </span>
              )}
              {isSuperAdmin() && !adminInfo.company_id && (
                <span className="admin-company" style={{ fontSize: '11px', color: '#ffd54f', marginTop: '4px', display: 'block' }}>
                  System Admin
                </span>
              )}
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

          {!usesOutlets() && (
            <NavLink to="/admin/sales-entry" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">📈</span>
              <span>Sales Entry</span>
            </NavLink>
          )}

          <NavLink to="/admin/contributions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🏛️</span>
            <span>Contributions</span>
          </NavLink>

          {!usesOutlets() && (
            <NavLink to="/admin/resignations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">👋</span>
              <span>Resignations</span>
            </NavLink>
          )}

          {!usesOutlets() && (
            <NavLink to="/admin/letters" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">📋</span>
              <span>HR Letters</span>
            </NavLink>
          )}

          {usesOutlets() ? (
            <NavLink to="/admin/outlets" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">🏪</span>
              <span>Outlets</span>
            </NavLink>
          ) : (
            <NavLink to="/admin/departments" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">🏢</span>
              <span>Departments</span>
            </NavLink>
          )}

          <NavLink to="/admin/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </NavLink>

          {!usesOutlets() && (
            <NavLink to="/admin/feedback" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">💬</span>
              <span>Feedback</span>
            </NavLink>
          )}

          {canManageUsers() && (
            <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">👤</span>
              <span>User Management</span>
            </NavLink>
          )}

          {isSuperAdmin() && (
            <NavLink to="/admin/roles" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">🔐</span>
              <span>Role Management</span>
            </NavLink>
          )}

          {isSuperAdmin() && (
            <NavLink to="/admin/companies" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">🏬</span>
              <span>Companies</span>
            </NavLink>
          )}
        </div>

        <div className="sidebar-footer">
          <NavLink to="/admin/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">⚙️</span>
            <span>My Profile</span>
          </NavLink>
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
