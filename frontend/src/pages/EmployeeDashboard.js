import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeeDashboard.css';

function EmployeeDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await essApi.getDashboard();
      setDashboard(res.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getMonthName = (month) => {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month] || '';
  };

  if (loading) {
    return (
      <EmployeeLayout>
        <div className="ess-loading">Loading dashboard...</div>
      </EmployeeLayout>
    );
  }

  if (error) {
    return (
      <EmployeeLayout>
        <div className="ess-error">{error}</div>
      </EmployeeLayout>
    );
  }

  return (
    <EmployeeLayout>
      <div className="ess-dashboard">
        <header className="ess-page-header">
          <h1>Welcome, {dashboard?.employee?.name || 'Employee'}</h1>
          <p>{dashboard?.employee?.position} - {dashboard?.employee?.department_name}</p>
        </header>

        <div className="ess-dashboard-grid">
          {/* Latest Payslip Card */}
          <div className="ess-card payslip-card" onClick={() => navigate('/ess/payslips')}>
            <div className="ess-card-header">
              <span className="ess-card-icon">💰</span>
              <h3>Latest Payslip</h3>
            </div>
            {dashboard?.latestPayslip ? (
              <div className="ess-card-body">
                <div className="payslip-month">
                  {getMonthName(dashboard.latestPayslip.month)} {dashboard.latestPayslip.year}
                </div>
                <div className="payslip-amount">
                  <span className="label">Net Pay</span>
                  <span className="amount">{formatCurrency(dashboard.latestPayslip.net_pay)}</span>
                </div>
                <div className="payslip-gross">
                  Gross: {formatCurrency(dashboard.latestPayslip.gross_salary)}
                </div>
              </div>
            ) : (
              <div className="ess-card-body">
                <p className="no-data">No payslip available yet</p>
              </div>
            )}
            <div className="ess-card-footer">
              View All Payslips →
            </div>
          </div>

          {/* Leave Balance Card */}
          <div className="ess-card leave-card" onClick={() => navigate('/ess/leave')}>
            <div className="ess-card-header">
              <span className="ess-card-icon">📅</span>
              <h3>Leave Balance</h3>
            </div>
            <div className="ess-card-body">
              {dashboard?.leaveBalances?.length > 0 ? (
                <div className="leave-balances">
                  {dashboard.leaveBalances.slice(0, 3).map((lb, idx) => (
                    <div key={idx} className="leave-item">
                      <span className="leave-type">{lb.code}</span>
                      <span className="leave-days">
                        {parseFloat(lb.entitled_days) + parseFloat(lb.carried_forward || 0) - parseFloat(lb.used_days)} days
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data">No leave balance data</p>
              )}
              {dashboard?.pendingLeaveRequests > 0 && (
                <div className="pending-badge">
                  {dashboard.pendingLeaveRequests} pending request(s)
                </div>
              )}
            </div>
            <div className="ess-card-footer">
              Manage Leave →
            </div>
          </div>

          {/* Claims Card */}
          <div className="ess-card claims-card" onClick={() => navigate('/ess/claims')}>
            <div className="ess-card-header">
              <span className="ess-card-icon">🧾</span>
              <h3>Claims</h3>
            </div>
            <div className="ess-card-body">
              <div className="claims-info">
                <span className="claims-pending">
                  {dashboard?.pendingClaims || 0} Pending
                </span>
              </div>
              <p className="claims-desc">Submit and track your expense claims</p>
            </div>
            <div className="ess-card-footer">
              Submit Claim →
            </div>
          </div>

          {/* Notifications Card */}
          <div className="ess-card notifications-card" onClick={() => navigate('/ess/notifications')}>
            <div className="ess-card-header">
              <span className="ess-card-icon">🔔</span>
              <h3>Notifications</h3>
              {dashboard?.unreadNotifications > 0 && (
                <span className="notification-badge">{dashboard.unreadNotifications}</span>
              )}
            </div>
            <div className="ess-card-body">
              <p className="notifications-desc">
                {dashboard?.unreadNotifications > 0
                  ? `You have ${dashboard.unreadNotifications} unread notification(s)`
                  : 'No new notifications'}
              </p>
            </div>
            <div className="ess-card-footer">
              View All →
            </div>
          </div>

          {/* Profile Card */}
          <div className="ess-card profile-card" onClick={() => navigate('/ess/profile')}>
            <div className="ess-card-header">
              <span className="ess-card-icon">👤</span>
              <h3>My Profile</h3>
            </div>
            <div className="ess-card-body">
              <div className="profile-info">
                <p><strong>Employee ID:</strong> {dashboard?.employee?.employee_id}</p>
                <p><strong>Department:</strong> {dashboard?.employee?.department_name}</p>
              </div>
            </div>
            <div className="ess-card-footer">
              View Full Profile →
            </div>
          </div>
        </div>
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeDashboard;
