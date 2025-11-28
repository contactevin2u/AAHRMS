import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { feedbackApi, employeeApi, payrollApi } from '../api';
import Layout from '../components/Layout';
import './AdminDashboard.css';

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [payrollSummary, setPayrollSummary] = useState(null);
  const [recentFeedback, setRecentFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [empStats, fbStats, payroll, feedback] = await Promise.all([
        employeeApi.getStats(),
        feedbackApi.getStats(),
        payrollApi.getSummary(currentYear, currentMonth),
        feedbackApi.getAll({ limit: 5 })
      ]);
      setStats(empStats.data);
      setFeedbackStats(fbStats.data);
      setPayrollSummary(payroll.data);
      setRecentFeedback(feedback.data.feedback || feedback.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-MY', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="dashboard-page">
          <div className="loading">☕ Loading dashboard...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="dashboard-page">
        <header className="page-header">
          <div>
            <h1>📊 Dashboard</h1>
            <p>Welcome back! Here's your HRMS overview</p>
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Employee Stats */}
          <div className="dashboard-card employees-card">
            <div className="card-header">
              <h3>👥 Employees</h3>
              <button onClick={() => navigate('/admin/employees')} className="view-all-btn">
                View All →
              </button>
            </div>
            <div className="stats-row">
              <div className="stat-item highlight">
                <span className="stat-value">{stats?.overview?.active || 0}</span>
                <span className="stat-label">Active</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats?.overview?.total || 0}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats?.overview?.inactive || 0}</span>
                <span className="stat-label">Inactive</span>
              </div>
            </div>
            {stats?.byDepartment && stats.byDepartment.length > 0 && (
              <div className="department-breakdown">
                <h4>By Department</h4>
                <div className="dept-list">
                  {stats.byDepartment.map(d => (
                    <div key={d.name} className="dept-item">
                      <span>{d.name}</span>
                      <span className="dept-count">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payroll Summary */}
          <div className="dashboard-card payroll-card">
            <div className="card-header">
              <h3>💰 Payroll - {currentDate.toLocaleString('en-MY', { month: 'long', year: 'numeric' })}</h3>
              <button onClick={() => navigate('/admin/payroll')} className="view-all-btn">
                View All →
              </button>
            </div>
            {payrollSummary?.summary ? (
              <>
                <div className="payroll-total">
                  <span className="total-label">Total Payroll</span>
                  <span className="total-value">{formatCurrency(payrollSummary.summary.total_payroll)}</span>
                </div>
                <div className="payroll-breakdown">
                  <div className="breakdown-item">
                    <span>Basic Salary</span>
                    <span>{formatCurrency(payrollSummary.summary.total_basic)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Commission</span>
                    <span>{formatCurrency(payrollSummary.summary.total_commission)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Allowance</span>
                    <span>{formatCurrency(payrollSummary.summary.total_allowance)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Employees Processed</span>
                    <span>{payrollSummary.summary.total_employees}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="no-payroll">
                <p>No payroll generated yet for this month</p>
                <button onClick={() => navigate('/admin/payroll')} className="generate-btn">
                  ⚡ Generate Payroll
                </button>
              </div>
            )}
          </div>

          {/* Feedback Overview */}
          <div className="dashboard-card feedback-card">
            <div className="card-header">
              <h3>💬 Anonymous Feedback</h3>
              <button onClick={() => navigate('/admin/feedback')} className="view-all-btn">
                View All →
              </button>
            </div>
            <div className="stats-row">
              <div className="stat-item highlight">
                <span className="stat-value">{feedbackStats?.overview?.unread || 0}</span>
                <span className="stat-label">Unread</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{feedbackStats?.overview?.total || 0}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{feedbackStats?.overview?.last_week || 0}</span>
                <span className="stat-label">This Week</span>
              </div>
            </div>
            {recentFeedback.length > 0 && (
              <div className="recent-feedback">
                <h4>Recent</h4>
                {recentFeedback.slice(0, 3).map(fb => (
                  <div key={fb.id} className={`feedback-item ${!fb.is_read ? 'unread' : ''}`}>
                    <p>{fb.message.substring(0, 80)}{fb.message.length > 80 ? '...' : ''}</p>
                    <span className="feedback-date">{formatDate(fb.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="dashboard-card actions-card">
            <h3>⚡ Quick Actions</h3>
            <div className="actions-grid">
              <button onClick={() => navigate('/admin/employees')} className="action-btn">
                <span className="action-icon">➕</span>
                <span>Add Employee</span>
              </button>
              <button onClick={() => navigate('/admin/payroll')} className="action-btn">
                <span className="action-icon">💵</span>
                <span>Process Payroll</span>
              </button>
              <button onClick={() => navigate('/admin/departments')} className="action-btn">
                <span className="action-icon">⚙️</span>
                <span>Salary Config</span>
              </button>
              <button onClick={() => navigate('/admin/feedback')} className="action-btn">
                <span className="action-icon">💬</span>
                <span>View Feedback</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default AdminDashboard;
