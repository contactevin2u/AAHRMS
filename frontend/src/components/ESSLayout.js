import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import OfflineBanner from './OfflineBanner';
import './ESSLayout.css';

function ESSLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      setEmployeeInfo(JSON.parse(storedInfo));
    }
  }, []);

  const handleLogout = async () => {
    try {
      // Call logout endpoint to clear HttpOnly cookie
      await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/ess/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.error('Logout error:', e);
    }

    // Clear local storage
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeInfo');
    navigate('/ess/login');
  };

  const features = employeeInfo?.features || {};

  // Get company logo based on company
  const getCompanyLogo = () => {
    const companyId = employeeInfo?.company_id;
    if (!companyId) return '/logos/hr-default.png';

    const companyLogos = {
      1: '/logos/aa-alive.png',
      3: '/logos/mixue.png'
    };

    return companyLogos[companyId] || '/logos/hr-default.png';
  };

  // Handle logo error
  const handleLogoError = (e) => {
    e.target.src = '/logos/hr-default.png';
  };

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Count visible nav items to determine layout
  const visibleNavItems = [
    true, // Dashboard always visible
    features.leave,
    features.payslips,
    features.clockIn,
    features.notifications
  ].filter(Boolean).length;

  return (
    <div className="ess-layout">
      <OfflineBanner />

      {/* Header */}
      <header className="ess-header">
        <div className="header-left">
          <img
            src={getCompanyLogo()}
            alt={employeeInfo?.company_name || 'ESS'}
            className="company-logo"
            onError={handleLogoError}
          />
          <span className="company-name">{employeeInfo?.company_name || 'Employee Portal'}</span>
        </div>
        <div className="header-right">
          <NavLink to="/ess/profile" className="profile-link">
            <div className="user-avatar-small">{getInitials(employeeInfo?.name)}</div>
          </NavLink>
        </div>
      </header>

      {/* Main Content */}
      <main className="ess-main">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="ess-bottom-nav">
        <NavLink
          to="/ess/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F3E0;</span>
          <span className="nav-label">Home</span>
        </NavLink>

        {features.leave && (
          <NavLink
            to="/ess/leave"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x1F4C5;</span>
            <span className="nav-label">Leave</span>
          </NavLink>
        )}

        {features.clockIn && (
          <NavLink
            to="/ess/clock-in"
            className={({ isActive }) => `nav-item clock-in-btn ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x23F0;</span>
            <span className="nav-label">Clock In</span>
          </NavLink>
        )}

        {features.payslips && (
          <NavLink
            to="/ess/payslips"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x1F4B5;</span>
            <span className="nav-label">Pay</span>
          </NavLink>
        )}

        <button
          className={`nav-item more-btn ${showMoreMenu ? 'active' : ''}`}
          onClick={() => setShowMoreMenu(!showMoreMenu)}
        >
          <span className="nav-icon">&#x2630;</span>
          <span className="nav-label">More</span>
        </button>
      </nav>

      {/* More Menu Overlay */}
      {showMoreMenu && (
        <>
          <div className="more-overlay" onClick={() => setShowMoreMenu(false)} />
          <div className="more-menu">
            <div className="more-header">
              <div className="user-info">
                <div className="user-avatar">{getInitials(employeeInfo?.name)}</div>
                <div className="user-details">
                  <span className="user-name">{employeeInfo?.name}</span>
                  <span className="user-id">{employeeInfo?.employee_id}</span>
                </div>
              </div>
            </div>
            <div className="more-links">
              <NavLink to="/ess/profile" onClick={() => setShowMoreMenu(false)}>
                <span className="menu-icon">&#x1F464;</span>
                Profile
              </NavLink>
              {features.notifications && (
                <NavLink to="/ess/notifications" onClick={() => setShowMoreMenu(false)}>
                  <span className="menu-icon">&#x1F514;</span>
                  Notifications
                </NavLink>
              )}
              {features.claims && (
                <NavLink to="/ess/claims" onClick={() => setShowMoreMenu(false)}>
                  <span className="menu-icon">&#x1F4DD;</span>
                  Claims
                </NavLink>
              )}
              {features.letters && (
                <NavLink to="/ess/letters" onClick={() => setShowMoreMenu(false)}>
                  <span className="menu-icon">&#x1F4E8;</span>
                  Letters
                </NavLink>
              )}
              {features.benefitsInKind && (
                <NavLink to="/ess/benefits" onClick={() => setShowMoreMenu(false)}>
                  <span className="menu-icon">&#x1F381;</span>
                  Benefits
                </NavLink>
              )}
              <button className="logout-link" onClick={handleLogout}>
                <span className="menu-icon">&#x1F6AA;</span>
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ESSLayout;
