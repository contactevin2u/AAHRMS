import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { isSupervisorOrManager, canApproveOT, canViewTeamLeave, canApproveShiftSwap, canApproveClaims } from '../../utils/permissions';
import './ESSDashboard.css';

function ESSDashboard() {
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      const info = JSON.parse(storedInfo);
      setEmployeeInfo(info);

      // Fetch pending approvals for supervisors/managers
      if (isSupervisorOrManager(info)) {
        fetchPendingApprovals(info);
      }
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

  const fetchPendingApprovals = async (info) => {
    try {
      const approvals = { leave: 0, ot: 0, swap: 0, claims: 0 };

      // Fetch pending leave approvals
      if (canViewTeamLeave(info)) {
        try {
          const leaveRes = await essApi.getTeamPendingLeave();
          approvals.leave = leaveRes.data?.length || 0;
        } catch (e) {
          console.error('Error fetching leave approvals:', e);
        }
      }

      // Fetch pending OT approvals
      if (canApproveOT(info)) {
        try {
          const otRes = await essApi.getPendingOT();
          approvals.ot = otRes.data?.length || 0;
        } catch (e) {
          console.error('Error fetching OT approvals:', e);
        }
      }

      // Fetch pending shift swap approvals
      if (canApproveShiftSwap(info)) {
        try {
          const swapRes = await essApi.getPendingSwapApprovals();
          approvals.swap = swapRes.data?.length || 0;
        } catch (e) {
          console.error('Error fetching swap approvals:', e);
        }
      }

      // Fetch pending claims approvals
      if (canApproveClaims(info)) {
        try {
          const claimsRes = await essApi.getTeamPendingClaims();
          approvals.claims = claimsRes.data?.length || 0;
        } catch (e) {
          console.error('Error fetching claims approvals:', e);
        }
      }

      setPendingApprovals(approvals);
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
    }
  };

  const features = employeeInfo?.features || {};
  const showApprovalSection = isSupervisorOrManager(employeeInfo) && pendingApprovals &&
    (pendingApprovals.leave > 0 || pendingApprovals.ot > 0 || pendingApprovals.swap > 0 || pendingApprovals.claims > 0);

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

        {/* Pending Approvals Section for Supervisors/Managers */}
        {showApprovalSection && (
          <div className="pending-approvals-section">
            <h2>Pending Approvals</h2>
            <div className="approvals-grid">
              {pendingApprovals.leave > 0 && (
                <Link to="/ess/leave" className="approval-card leave">
                  <div className="approval-badge">{pendingApprovals.leave}</div>
                  <div className="approval-icon">&#x1F4C5;</div>
                  <span className="approval-label">Leave Requests</span>
                </Link>
              )}
              {pendingApprovals.ot > 0 && (
                <Link to="/ess/ot-approval" className="approval-card ot">
                  <div className="approval-badge">{pendingApprovals.ot}</div>
                  <div className="approval-icon">&#x23F0;</div>
                  <span className="approval-label">OT Approvals</span>
                </Link>
              )}
              {pendingApprovals.swap > 0 && (
                <Link to="/ess/calendar" className="approval-card swap">
                  <div className="approval-badge">{pendingApprovals.swap}</div>
                  <div className="approval-icon">&#x1F504;</div>
                  <span className="approval-label">Shift Swaps</span>
                </Link>
              )}
              {pendingApprovals.claims > 0 && (
                <Link to="/ess/claims" className="approval-card claims">
                  <div className="approval-badge">{pendingApprovals.claims}</div>
                  <div className="approval-icon">&#x1F4B3;</div>
                  <span className="approval-label">Claims</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions - Links to main pages only */}
        <div className="quick-actions">
          {features.clockIn && (
            <Link to="/ess/attendance" className="action-card clock-in">
              <span className="action-icon">&#x23F0;</span>
              <span className="action-label">Attendance</span>
            </Link>
          )}
          {features.leave && (
            <Link to="/ess/leave" className="action-card">
              <span className="action-icon">&#x1F4C5;</span>
              <span className="action-label">Leave</span>
            </Link>
          )}
          {features.claims && (
            <Link to="/ess/claims" className="action-card">
              <span className="action-icon">&#x1F4DD;</span>
              <span className="action-label">Claims</span>
            </Link>
          )}
          {features.payslips && (
            <Link to="/ess/payslips" className="action-card">
              <span className="action-icon">&#x1F4B5;</span>
              <span className="action-label">Payslips</span>
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
