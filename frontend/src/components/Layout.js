import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import './Layout.css';

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminInfo, setAdminInfo] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const storedInfo = localStorage.getItem('adminInfo');
    if (storedInfo) {
      setAdminInfo(JSON.parse(storedInfo));
    }
  }, []);

  // Auto-expand section based on current route
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/employees') || path.includes('/leave') || path.includes('/claims')) {
      setExpandedSection('people');
    } else if (path.includes('/payroll') || path.includes('/salary') || path.includes('/contributions') || path.includes('/sales')) {
      setExpandedSection('payroll');
    } else if (path.includes('/resignations') || path.includes('/letters') || path.includes('/departments') || path.includes('/outlets')) {
      setExpandedSection('hr');
    } else if (path.includes('/users') || path.includes('/roles') || path.includes('/companies') || path.includes('/settings')) {
      setExpandedSection('system');
    }
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminInfo');
    navigate('/');
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Permission checks
  const canManageUsers = () => {
    if (!adminInfo) return false;
    return ['super_admin', 'boss', 'director'].includes(adminInfo.role);
  };

  const isSuperAdmin = () => {
    if (!adminInfo) return false;
    return adminInfo.role === 'super_admin';
  };

  const usesOutlets = () => {
    return adminInfo?.company_grouping_type === 'outlet';
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="layout">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <span className="mobile-title">{adminInfo?.company_name || 'HRMS'}</span>
      </div>

      {/* Overlay for mobile */}
      {mobileMenuOpen && <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />}

      <nav className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="brand">
            {usesOutlets() ? (
              <img src="/mixue-logo.png" alt="Mixue" className="logo-img" />
            ) : (
              <img src="/logo.png" alt="AA HRMS" className="logo-img" />
            )}
            <div className="brand-text">
              <h2>{adminInfo?.company_name || 'HRMS'}</h2>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="user-card">
          <div className="user-avatar">{getInitials(adminInfo?.name)}</div>
          <div className="user-details">
            <span className="user-name">{adminInfo?.name || 'Admin'}</span>
            <span className="user-role">{adminInfo?.role_display_name || adminInfo?.role}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="nav-container">
          {/* Dashboard - Always visible */}
          <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </NavLink>

          {/* PEOPLE SECTION */}
          <div className="nav-section">
            <button className={`section-header ${expandedSection === 'people' ? 'expanded' : ''}`} onClick={() => toggleSection('people')}>
              <span className="section-icon">👥</span>
              <span>People</span>
              <span className="expand-icon">{expandedSection === 'people' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'people' && (
              <div className="section-items">
                <NavLink to="/admin/employees" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  Employees
                </NavLink>
                <NavLink to="/admin/leave" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  Leave
                </NavLink>
                <NavLink to="/admin/claims" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  Claims
                </NavLink>
              </div>
            )}
          </div>

          {/* PAYROLL SECTION */}
          <div className="nav-section">
            <button className={`section-header ${expandedSection === 'payroll' ? 'expanded' : ''}`} onClick={() => toggleSection('payroll')}>
              <span className="section-icon">💰</span>
              <span>Payroll</span>
              <span className="expand-icon">{expandedSection === 'payroll' ? '−' : '+'}</span>
            </button>
            {expandedSection === 'payroll' && (
              <div className="section-items">
                <NavLink to="/admin/payroll-v2" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  Run Payroll
                </NavLink>
                <NavLink to="/admin/contributions" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  Contributions
                </NavLink>
                {!usesOutlets() && (
                  <NavLink to="/admin/sales-entry" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                    Sales Entry
                  </NavLink>
                )}
              </div>
            )}
          </div>

          {/* HR ADMIN SECTION */}
          {!usesOutlets() && (
            <div className="nav-section">
              <button className={`section-header ${expandedSection === 'hr' ? 'expanded' : ''}`} onClick={() => toggleSection('hr')}>
                <span className="section-icon">📋</span>
                <span>HR Admin</span>
                <span className="expand-icon">{expandedSection === 'hr' ? '−' : '+'}</span>
              </button>
              {expandedSection === 'hr' && (
                <div className="section-items">
                  <NavLink to="/admin/resignations" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                    Resignations
                  </NavLink>
                  <NavLink to="/admin/letters" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                    HR Letters
                  </NavLink>
                  <NavLink to="/admin/departments" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                    Departments
                  </NavLink>
                  <NavLink to="/admin/feedback" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                    Feedback
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* Outlets for Mimix */}
          {usesOutlets() && (
            <NavLink to="/admin/outlets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              <span className="nav-icon">🏪</span>
              <span>Outlets</span>
            </NavLink>
          )}

          {/* SYSTEM SECTION - Only for authorized users */}
          {(canManageUsers() || isSuperAdmin()) && (
            <div className="nav-section">
              <button className={`section-header ${expandedSection === 'system' ? 'expanded' : ''}`} onClick={() => toggleSection('system')}>
                <span className="section-icon">⚙️</span>
                <span>System</span>
                <span className="expand-icon">{expandedSection === 'system' ? '−' : '+'}</span>
              </button>
              {expandedSection === 'system' && (
                <div className="section-items">
                  <NavLink to="/admin/settings" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                    Settings
                  </NavLink>
                  {canManageUsers() && (
                    <NavLink to="/admin/users" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                      Users
                    </NavLink>
                  )}
                  {isSuperAdmin() && (
                    <>
                      <NavLink to="/admin/roles" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                        Roles
                      </NavLink>
                      <NavLink to="/admin/companies" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                        Companies
                      </NavLink>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Settings for non-admin users */}
          {!canManageUsers() && !isSuperAdmin() && (
            <NavLink to="/admin/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              <span className="nav-icon">⚙️</span>
              <span>Settings</span>
            </NavLink>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <NavLink to="/admin/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
            <span className="nav-icon">👤</span>
            <span>My Profile</span>
          </NavLink>
          <button onClick={handleLogout} className="logout-btn">
            <span className="nav-icon">🚪</span>
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
