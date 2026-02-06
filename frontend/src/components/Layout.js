import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { companiesApi } from '../api';
import { DEPARTMENT_CONFIG, DEPARTMENT_ORDER } from '../config/departmentConfig';
import './Layout.css';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminInfo, setAdminInfo] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const inactivityTimerRef = React.useRef(null);

  useEffect(() => {
    const storedInfo = localStorage.getItem('adminInfo');
    if (storedInfo) {
      const info = JSON.parse(storedInfo);
      setAdminInfo(info);

      if (info.role === 'super_admin') {
        const savedCompanyId = localStorage.getItem('selectedCompanyId');
        if (savedCompanyId) {
          setSelectedCompanyId(parseInt(savedCompanyId));
        }
        fetchCompanies();
      }
    }
  }, []);

  // Inactivity timeout - auto logout after 15 minutes of no activity
  useEffect(() => {
    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        // Auto logout due to inactivity
        console.log('Auto logout due to inactivity');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminInfo');
        localStorage.removeItem('selectedCompanyId');
        navigate('/', { state: { message: 'You have been logged out due to inactivity' } });
      }, INACTIVITY_TIMEOUT);
    };

    // Events that indicate user activity
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    // Set up event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the initial timer
    resetInactivityTimer();

    // Cleanup
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      activityEvents.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [navigate]);

  const fetchCompanies = async () => {
    try {
      const res = await companiesApi.getAll();
      setCompanies(res.data.filter(c => c.status === 'active'));
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const handleCompanyChange = (companyId) => {
    const id = companyId ? parseInt(companyId) : null;
    setSelectedCompanyId(id);
    if (id) {
      localStorage.setItem('selectedCompanyId', id.toString());
      const company = companies.find(c => c.id === id);
      if (company) {
        const updatedInfo = {
          ...adminInfo,
          company_id: id,
          company_name: company.name,
          company_grouping_type: company.grouping_type
        };
        localStorage.setItem('adminInfo', JSON.stringify(updatedInfo));
        setAdminInfo(updatedInfo);
      }
    } else {
      localStorage.removeItem('selectedCompanyId');
      const updatedInfo = {
        ...adminInfo,
        company_id: null,
        company_name: null,
        company_grouping_type: null
      };
      localStorage.setItem('adminInfo', JSON.stringify(updatedInfo));
      setAdminInfo(updatedInfo);
    }
    window.location.reload();
  };

  // Auto-expand section based on current route
  useEffect(() => {
    const path = location.pathname;

    if (isAAAlive()) {
      // AA Alive: auto-expand department section when on department route
      if (path.includes('/admin/department/')) {
        setExpandedSection('department');
      } else if (path.includes('/payroll') || path.includes('/salary') || path.includes('/contributions') || path.includes('/sales') || path.includes('/payroll-guide') || path.includes('/ai-change-logs') || path.includes('/payroll-settings')) {
        setExpandedSection('payroll');
      }
    } else {
      // Mimix / other companies: original logic
      if (path.includes('/employees') || path.includes('/leave') || path.includes('/claims') || path.includes('/attendance') || path.includes('/schedules')) {
        setExpandedSection('people');
      } else if (path.includes('/payroll') || path.includes('/salary') || path.includes('/contributions') || path.includes('/sales') || path.includes('/payroll-guide') || path.includes('/ai-change-logs') || path.includes('/payroll-settings')) {
        setExpandedSection('payroll');
      } else if (path.includes('/resignations') || path.includes('/letters') || path.includes('/departments') || path.includes('/feedback') || path.includes('/benefits') || path.includes('/public-holidays')) {
        setExpandedSection('hr');
      } else if (path.includes('/users') || path.includes('/roles') || path.includes('/companies') || path.includes('/settings') || path.includes('/password-status')) {
        setExpandedSection('system');
      }
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

  const isAAAlive = () => {
    const companyId = adminInfo?.role === 'super_admin' ? selectedCompanyId : adminInfo?.company_id;
    return companyId === 1;
  };

  const getCompanyLogo = () => {
    const companyId = adminInfo?.role === 'super_admin' ? selectedCompanyId : adminInfo?.company_id;
    if (!companyId) return '/logos/hr-default.png';
    const companyLogos = {
      1: '/logos/aa-alive.png',
      3: '/logos/mixue.png'
    };
    return companyLogos[companyId] || '/logos/hr-default.png';
  };

  const handleLogoError = (e) => {
    e.target.src = '/logos/hr-default.png';
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Render AA Alive sidebar navigation
  const renderAAAliveNav = () => (
    <>
      {/* Dashboard */}
      <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <span className="nav-icon">📊</span>
        <span>Dashboard</span>
      </NavLink>

      <NavLink to="/admin/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <span className="nav-icon">📈</span>
        <span>Analytics</span>
      </NavLink>

      {/* DEPARTMENT SECTION */}
      <div className="nav-section">
        <button className={`section-header ${expandedSection === 'department' ? 'expanded' : ''}`} onClick={() => toggleSection('department')}>
          <span className="section-icon">🏢</span>
          <span>Department</span>
          <span className="expand-icon">{expandedSection === 'department' ? '−' : '+'}</span>
        </button>
        {expandedSection === 'department' && (
          <div className="section-items">
            {DEPARTMENT_ORDER.map(slug => {
              const config = DEPARTMENT_CONFIG[slug];
              return (
                <NavLink
                  key={slug}
                  to={`/admin/department/${slug}`}
                  className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span style={{ marginRight: '6px' }}>{config.icon}</span>
                  {config.name}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>

      {/* PAYROLL - single link */}
      <NavLink to="/admin/payroll-v2" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <span className="nav-icon">💰</span>
        <span>Payroll</span>
      </NavLink>
    </>
  );

  // Render Mimix / default sidebar navigation (unchanged)
  const renderDefaultNav = () => (
    <>
      {/* Dashboard */}
      <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <span className="nav-icon">📊</span>
        <span>Dashboard</span>
      </NavLink>

      <NavLink to="/admin/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <span className="nav-icon">📈</span>
        <span>Analytics</span>
      </NavLink>

      {/* Outlets - Top level for outlet-based companies */}
      {usesOutlets() && (
        <NavLink to="/admin/outlets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
          <span className="nav-icon">🏪</span>
          <span>Outlets</span>
        </NavLink>
      )}

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
            {usesOutlets() && (
              <NavLink to="/admin/schedules" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                Schedules
              </NavLink>
            )}
            <NavLink to="/admin/attendance" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Attendance
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
              Payroll
            </NavLink>
            <NavLink to="/admin/payroll-guide" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Calculation Guide
            </NavLink>
            <NavLink to="/admin/ai-change-logs" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              AI Change History
            </NavLink>
            {!usesOutlets() && (
              <NavLink to="/admin/sales-entry" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                Sales Entry
              </NavLink>
            )}
            <NavLink to="/admin/payroll-settings" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Payroll Settings
            </NavLink>
          </div>
        )}
      </div>

      {/* HR ADMIN SECTION */}
      <div className="nav-section">
        <button className={`section-header ${expandedSection === 'hr' ? 'expanded' : ''}`} onClick={() => toggleSection('hr')}>
          <span className="section-icon">📋</span>
          <span>HR Admin</span>
          <span className="expand-icon">{expandedSection === 'hr' ? '−' : '+'}</span>
        </button>
        {expandedSection === 'hr' && (
          <div className="section-items">
            <NavLink to="/admin/letters" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              HR Letters
            </NavLink>
            <NavLink to="/admin/resignations" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Resignations
            </NavLink>
            <NavLink to="/admin/public-holidays" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Public Holidays
            </NavLink>
            {!usesOutlets() && (
              <NavLink to="/admin/departments" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
                Departments
              </NavLink>
            )}
            <NavLink to="/admin/feedback" className={({ isActive }) => `nav-item sub ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Feedback
            </NavLink>
          </div>
        )}
      </div>

      {/* Indoor Sales for AA Alive - Combined into single link */}
      {isAAAlive() && (
        <NavLink to="/admin/indoor-sales/schedule" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
          <span className="nav-icon">🛒</span>
          <span>Indoor Sales</span>
        </NavLink>
      )}
      {isAAAlive() && (
        <NavLink to="/admin/outstation-allowance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
          <span className="nav-icon">🚛</span>
          <span>Outstation</span>
        </NavLink>
      )}

      {/* SYSTEM SECTION */}
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
                  Users & Access
                </NavLink>
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
    </>
  );

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
            <img src={getCompanyLogo()} alt={adminInfo?.company_name || 'HRMS'} className="logo-img" onError={handleLogoError} />
            <div className="brand-text">
              <h2>{adminInfo?.company_name || 'HRMS'}</h2>
            </div>
          </div>
          {adminInfo?.role === 'super_admin' && companies.length > 0 && (
            <div className="company-selector">
              <select
                value={selectedCompanyId || ''}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="company-dropdown"
              >
                <option value="">-- Select Company --</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          {isAAAlive() ? renderAAAliveNav() : renderDefaultNav()}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          {!isAAAlive() && (
            <NavLink to="/admin/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              <span className="nav-icon">👤</span>
              <span>My Profile</span>
            </NavLink>
          )}
          <button onClick={handleLogout} className="logout-btn aa-logout">
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
