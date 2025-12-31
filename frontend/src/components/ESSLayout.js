import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import OfflineBanner from './OfflineBanner';
import { isSupervisorOrManager, isMimixCompany, getRoleDisplayName } from '../utils/permissions';
import './ESSLayout.css';

function ESSLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      setEmployeeInfo(JSON.parse(storedInfo));
    }
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    if (!employeeInfo) return;

    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('employeeToken');
        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/ess/notifications/unread-count`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include'
          }
        );
        if (response.ok) {
          const data = await response.json();
          setUnreadNotifications(data.count || 0);
        }
      } catch (e) {
        console.error('Error fetching notification count:', e);
      }
    };

    fetchUnreadCount();
    // Refresh every 60 seconds
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [employeeInfo]);

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

  // Check if employee is from Mimix (has clock-in/schedule features)
  const isMimix = isMimixCompany(employeeInfo);

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
          <NavLink to="/ess/notifications" className="header-icon-btn">
            <span className="notification-icon">&#x1F514;</span>
            {unreadNotifications > 0 && (
              <span className="notification-badge">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
            )}
          </NavLink>
          <NavLink to="/ess/profile" className="profile-link">
            <div className="user-avatar-small">{getInitials(employeeInfo?.name)}</div>
          </NavLink>
        </div>
      </header>

      {/* Main Content */}
      <main className="ess-main">
        {children}
      </main>

      {/* Bottom Navigation - Simplified 6 items */}
      <nav className="ess-bottom-nav">
        <NavLink
          to="/ess/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F3E0;</span>
          <span className="nav-label">Home</span>
        </NavLink>

        {isMimix && (
          <NavLink
            to="/ess/attendance"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x23F0;</span>
            <span className="nav-label">Attendance</span>
          </NavLink>
        )}

        <NavLink
          to="/ess/leave"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F4C5;</span>
          <span className="nav-label">Leave</span>
        </NavLink>

        <NavLink
          to="/ess/claims"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F4DD;</span>
          <span className="nav-label">Claims</span>
        </NavLink>

        {isMimix && (
          <NavLink
            to="/ess/calendar"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x1F5D3;</span>
            <span className="nav-label">Calendar</span>
          </NavLink>
        )}

        {!isMimix && (
          <NavLink
            to="/ess/payslips"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x1F4B5;</span>
            <span className="nav-label">Pay</span>
          </NavLink>
        )}

        <NavLink
          to="/ess/profile"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F464;</span>
          <span className="nav-label">Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default ESSLayout;
