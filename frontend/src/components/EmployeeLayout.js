import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import './EmployeeLayout.css';

function EmployeeLayout({ children }) {
  const navigate = useNavigate();
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const info = localStorage.getItem('employeeInfo');
    if (info) {
      setEmployeeInfo(JSON.parse(info));
    }

    fetchUnreadCount();
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await essApi.getUnreadCount();
      setUnreadCount(res.data.count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeInfo');
    navigate('/employee/login');
  };

  const navItems = [
    { path: '/employee/dashboard', label: 'Dashboard', icon: 'home' },
    { path: '/employee/profile', label: 'My Profile', icon: 'person' },
    { path: '/employee/payslips', label: 'Salary Records', icon: 'receipt' },
    { path: '/employee/leave', label: 'Leave', icon: 'calendar' },
    { path: '/employee/claims', label: 'Claims', icon: 'wallet' },
    { path: '/employee/letters', label: 'HR Documents', icon: 'document' },
    { path: '/employee/notifications', label: 'Notifications', icon: 'bell', badge: unreadCount },
  ];

  return (
    <div className="ess-layout">
      <aside className={`ess-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="ess-sidebar-header">
          <img src="/logo.png" alt="AA Alive" className="ess-logo" />
          <span className="ess-brand">Employee Portal</span>
        </div>

        <nav className="ess-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `ess-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="ess-nav-icon">{getIcon(item.icon)}</span>
              <span className="ess-nav-label">{item.label}</span>
              {item.badge > 0 && <span className="ess-nav-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="ess-sidebar-footer">
          {employeeInfo && (
            <div className="ess-user-info">
              <div className="ess-user-avatar">{employeeInfo.name?.charAt(0).toUpperCase()}</div>
              <div className="ess-user-details">
                <span className="ess-user-name">{employeeInfo.name}</span>
                <span className="ess-user-id">{employeeInfo.employee_id}</span>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className="ess-logout-btn">
            Logout
          </button>
        </div>
      </aside>

      <button
        className="ess-mobile-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? 'X' : '='}
      </button>

      <main className="ess-main">
        {children}
      </main>

      {isMobileMenuOpen && (
        <div className="ess-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}
    </div>
  );
}

function getIcon(name) {
  const icons = {
    home: '🏠',
    person: '👤',
    receipt: '📄',
    calendar: '📅',
    wallet: '💰',
    document: '📋',
    bell: '🔔',
  };
  return icons[name] || '📌';
}

export default EmployeeLayout;
