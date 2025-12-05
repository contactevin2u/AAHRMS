import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeeNotifications.css';

function EmployeeNotifications() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await essApi.getNotifications({});
      setNotifications(res.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await essApi.markNotificationRead(id);
      setNotifications(notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await essApi.markAllNotificationsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return d.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTypeIcon = (type) => {
    const icons = {
      leave: '🏖️',
      payroll: '💰',
      claim: '📝',
      announcement: '📢',
      system: '⚙️',
      reminder: '⏰'
    };
    return icons[type] || '📌';
  };

  const getTypeClass = (type) => {
    const classes = {
      leave: 'type-leave',
      payroll: 'type-payroll',
      claim: 'type-claim',
      announcement: 'type-announcement',
      system: 'type-system',
      reminder: 'type-reminder'
    };
    return classes[type] || '';
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <EmployeeLayout>
      <div className="ess-notifications">
        <header className="ess-page-header">
          <div>
            <h1>Notifications</h1>
            <p>Stay updated with important announcements and updates</p>
          </div>
          {unreadCount > 0 && (
            <button className="mark-all-btn" onClick={handleMarkAllRead}>
              Mark All as Read
            </button>
          )}
        </header>

        {/* Filter Tabs */}
        <div className="notification-tabs">
          <button
            className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({notifications.length})
          </button>
          <button
            className={`tab-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {loading ? (
          <div className="ess-loading">Loading notifications...</div>
        ) : filteredNotifications.length === 0 ? (
          <div className="no-data-card">
            <div className="empty-icon">🔔</div>
            <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
          </div>
        ) : (
          <div className="notifications-list">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                onClick={() => !notification.is_read && handleMarkRead(notification.id)}
              >
                <div className={`notification-icon ${getTypeClass(notification.type)}`}>
                  {getTypeIcon(notification.type)}
                </div>
                <div className="notification-content">
                  <div className="notification-header">
                    <h3 className="notification-title">{notification.title}</h3>
                    <span className="notification-time">{formatDate(notification.created_at)}</span>
                  </div>
                  {notification.message && (
                    <p className="notification-message">{notification.message}</p>
                  )}
                  <div className="notification-meta">
                    <span className={`notification-type ${getTypeClass(notification.type)}`}>
                      {notification.type}
                    </span>
                    {!notification.is_read && <span className="unread-dot"></span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeNotifications;
