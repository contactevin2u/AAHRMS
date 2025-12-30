import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import './ESSDashboard.css';

function ESSDashboard() {
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      setEmployeeInfo(JSON.parse(storedInfo));
    }
    fetchDashboard();
    fetchProfileStatus();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await essApi.getDashboard();
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileStatus = async () => {
    try {
      const res = await essApi.getProfileCompletionStatus();
      setProfileStatus(res.data);
    } catch (error) {
      console.error('Error fetching profile status:', error);
    }
  };

  const features = employeeInfo?.features || {};

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div className="ess-dashboard">
        {/* Welcome Section */}
        <div className="welcome-section">
          <h1>{getGreeting()}, {employeeInfo?.name?.split(' ')[0] || 'there'}!</h1>
          <p>{new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {/* Profile Completion Reminder */}
        {profileStatus && !profileStatus.complete && (
          <Link to="/ess/profile" className="profile-reminder-card">
            <div className="reminder-icon">!</div>
            <div className="reminder-content">
              <h3>Complete Your Profile</h3>
              <p>
                {profileStatus.completed_count} of {profileStatus.total_required} required fields completed
              </p>
              {profileStatus.days_remaining !== null && profileStatus.days_remaining > 0 && (
                <span className="reminder-deadline">{profileStatus.days_remaining} days remaining</span>
              )}
              {profileStatus.days_remaining !== null && profileStatus.days_remaining <= 0 && (
                <span className="reminder-deadline overdue">Overdue - Please complete now</span>
              )}
            </div>
            <div className="reminder-progress">
              <div
                className="progress-fill"
                style={{ width: `${Math.round((profileStatus.completed_count / profileStatus.total_required) * 100)}%` }}
              ></div>
            </div>
            <span className="reminder-arrow">&#8594;</span>
          </Link>
        )}

        {/* Quick Actions */}
        <div className="quick-actions">
          {features.clockIn && (
            <Link to="/ess/clock-in" className="action-card clock-in">
              <span className="action-icon">&#x23F0;</span>
              <span className="action-label">Clock In</span>
            </Link>
          )}
          {features.leave && (
            <Link to="/ess/leave" className="action-card">
              <span className="action-icon">&#x1F4C5;</span>
              <span className="action-label">Apply Leave</span>
            </Link>
          )}
          {features.claims && (
            <Link to="/ess/claims" className="action-card">
              <span className="action-icon">&#x1F4DD;</span>
              <span className="action-label">Submit Claim</span>
            </Link>
          )}
          {features.payslips && (
            <Link to="/ess/payslips" className="action-card">
              <span className="action-icon">&#x1F4B5;</span>
              <span className="action-label">View Payslip</span>
            </Link>
          )}
        </div>

        {/* Stats Cards */}
        <div className="stats-section">
          <h2>Your Summary</h2>
          <div className="stats-grid">
            {features.leave && dashboardData?.leave && (
              <div className="stat-card">
                <div className="stat-icon">&#x1F3D6;&#xFE0F;</div>
                <div className="stat-content">
                  <span className="stat-value">{dashboardData.leave.balance || 0}</span>
                  <span className="stat-label">Leave Balance</span>
                </div>
              </div>
            )}
            {features.claims && dashboardData?.claims && (
              <div className="stat-card">
                <div className="stat-icon">&#x1F4B3;</div>
                <div className="stat-content">
                  <span className="stat-value">{dashboardData.claims.pending || 0}</span>
                  <span className="stat-label">Pending Claims</span>
                </div>
              </div>
            )}
            {features.notifications && dashboardData?.notifications && (
              <div className="stat-card">
                <div className="stat-icon">&#x1F514;</div>
                <div className="stat-content">
                  <span className="stat-value">{dashboardData.notifications.unread || 0}</span>
                  <span className="stat-label">Notifications</span>
                </div>
              </div>
            )}
            {features.clockIn && dashboardData?.attendance && (
              <div className="stat-card">
                <div className="stat-icon">&#x2705;</div>
                <div className="stat-content">
                  <span className="stat-value">{dashboardData.attendance.daysWorked || 0}</span>
                  <span className="stat-label">Days This Month</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 && (
          <div className="activity-section">
            <h2>Recent Activity</h2>
            <div className="activity-list">
              {dashboardData.recentActivity.slice(0, 5).map((activity, index) => (
                <div key={index} className="activity-item">
                  <span className="activity-icon">
                    {activity.type === 'leave' && '&#x1F4C5;'}
                    {activity.type === 'claim' && '&#x1F4DD;'}
                    {activity.type === 'letter' && '&#x1F4E8;'}
                    {activity.type === 'payslip' && '&#x1F4B5;'}
                  </span>
                  <div className="activity-content">
                    <span className="activity-title">{activity.title}</span>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                  <span className={`activity-status ${activity.status}`}>
                    {activity.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Company Announcements */}
        {dashboardData?.announcements && dashboardData.announcements.length > 0 && (
          <div className="announcements-section">
            <h2>Announcements</h2>
            {dashboardData.announcements.slice(0, 3).map((announcement, index) => (
              <div key={index} className="announcement-card">
                <h3>{announcement.title}</h3>
                <p>{announcement.preview}</p>
                <span className="announcement-date">{announcement.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSDashboard;
