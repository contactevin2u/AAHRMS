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

  // Check if employee needs clock-in/attendance feature
  // Mimix: always enabled
  // AA Alive: only if clock_in_required = true (handle boolean, string, or number)
  const clockInRequired = employeeInfo?.clock_in_required === true ||
                          employeeInfo?.clock_in_required === 'true' ||
                          employeeInfo?.clock_in_required === 1;
  const showAttendance = isMimix || clockInRequired;

  // Check if employee should see schedule/calendar
  // Mimix: always enabled
  // AA Alive: only for Indoor Sales staff or Indoor Sales Manager
  const isIndoorSales = employeeInfo?.position === 'Indoor Sales' || employeeInfo?.position === 'Manager';
  const showCalendar = isMimix || (isIndoorSales && clockInRequired);

  // Check if employee is supervisor/manager (can see team management features)
  const isSupOrMgr = isSupervisorOrManager(employeeInfo);
  // AA Alive: Indoor Sales Manager can manage schedules (position 'Manager' OR role 'manager')
  const isIndoorSalesManager = !isMimix &&
    (employeeInfo?.position === 'Manager' || employeeInfo?.employee_role === 'manager');
  const showTeamFeatures = isSupOrMgr || isIndoorSalesManager;

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
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="ess-main">
        {children}
      </main>

      {/* Bottom Navigation - 5 items max for mobile */}
      <nav className="ess-bottom-nav">
        <NavLink
          to="/ess/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F3E0;</span>
          <span className="nav-label">Home</span>
        </NavLink>

        {/* Team Overview for Mimix Managers */}
        {isMimix && showTeamFeatures && (
          <NavLink
            to="/ess/manager-overview"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x1F465;</span>
            <span className="nav-label">Team</span>
          </NavLink>
        )}

        {showAttendance && (
          <NavLink
            to="/ess/attendance"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x23F0;</span>
            <span className="nav-label">Clock In</span>
          </NavLink>
        )}

        {showCalendar && (
          <NavLink
            to="/ess/schedule"
            className={({ isActive }) => `nav-item ${isActive || location.pathname.includes('/ess/calendar') || location.pathname.includes('/ess/team-schedule') ? 'active' : ''}`}
          >
            <span className="nav-icon">&#x1F5D3;</span>
            <span className="nav-label">Schedule</span>
          </NavLink>
        )}

        <NavLink
          to="/ess/requests"
          className={({ isActive }) => `nav-item ${isActive || location.pathname.includes('/ess/leave') || location.pathname.includes('/ess/claims') || location.pathname.includes('/ess/ot-approval') ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F4CB;</span>
          <span className="nav-label">Requests</span>
        </NavLink>

        <NavLink
          to="/ess/profile"
          className={({ isActive }) => `nav-item ${isActive || location.pathname.includes('/ess/payslips') ? 'active' : ''}`}
        >
          <span className="nav-icon">&#x1F464;</span>
          <span className="nav-label">Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default ESSLayout;
