import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeApi, payrollApi, probationApi, leaveApi, claimsApi, outletsApi } from '../api';
import Layout from '../components/Layout';
import './AdminDashboard.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [payrollSummary, setPayrollSummary] = useState(null);
  const [pendingProbations, setPendingProbations] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [pendingClaims, setPendingClaims] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [birthdays, setBirthdays] = useState([]);

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const usesOutlets = adminInfo?.company_grouping_type === 'outlet';

  const isAAAlive = () => {
    const companyId = adminInfo?.role === 'super_admin'
      ? parseInt(localStorage.getItem('selectedCompanyId') || '0')
      : adminInfo?.company_id;
    return companyId === 1;
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const promises = [
        employeeApi.getStats(),
        payrollApi.getSummary(currentYear, currentMonth),
        probationApi.getPending().catch(() => ({ data: [] })),
        leaveApi.getRequests({ status: 'pending', limit: 5 }).catch(() => ({ data: [] })),
        claimsApi.getAll({ status: 'pending', limit: 5 }).catch(() => ({ data: [] }))
      ];

      if (usesOutlets) {
        promises.push(outletsApi.getAll().catch(() => ({ data: [] })));
      }

      // Always fetch birthdays
      promises.push(employeeApi.getBirthdays({ month: currentMonth }).catch(() => ({ data: [] })));

      const results = await Promise.all(promises);

      setStats(results[0].data);
      setPayrollSummary(results[1].data);
      setPendingProbations(results[2].data || []);
      setPendingLeave(Array.isArray(results[3].data) ? results[3].data : results[3].data?.requests || []);
      setPendingClaims(Array.isArray(results[4].data) ? results[4].data : results[4].data?.claims || []);

      if (usesOutlets && results[5]) {
        setOutlets(results[5].data || []);
        setBirthdays(results[6]?.data || []);
      } else {
        setBirthdays(results[5]?.data || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-MY', {
      day: 'numeric',
      month: 'short'
    });
  };

  const getDaysUntil = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getBirthdayDay = (emp) => {
    if (emp.date_of_birth) {
      return new Date(emp.date_of_birth).getDate();
    }
    if (emp.ic_number) {
      const cleaned = emp.ic_number.replace(/[-\s]/g, '');
      if (cleaned.length >= 6) {
        return parseInt(cleaned.substring(4, 6));
      }
    }
    return null;
  };

  // Calculate action items count
  const actionItemsCount = pendingProbations.length + pendingLeave.length + pendingClaims.length;

  // Calculate outlet stats
  const totalOutletStaff = outlets.reduce((sum, o) => sum + (parseInt(o.employee_count) || 0), 0);
  const understaffedOutlets = outlets.filter(o => (parseInt(o.employee_count) || 0) < (parseInt(o.min_staff) || 2));

  if (loading) {
    return (
      <Layout>
        <div className="dashboard">
          <div className="dashboard-loading">Loading dashboard...</div>
        </div>
      </Layout>
    );
  }

  // AA Alive simplified dashboard
  if (isAAAlive()) {
    return (
      <Layout>
        <div className="dashboard">
          <div className="dashboard-header">
            <div>
              <h1>Dashboard</h1>
              <p>{currentDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <div className="dashboard-grid aa-grid">
            {/* Pending Leave */}
            <div className="dashboard-card" onClick={() => navigate('/admin/leave')} style={{ cursor: 'pointer' }}>
              <div className="card-header">
                <h2>Pending Leave</h2>
                {pendingLeave.length > 0 && <span className="badge orange">{pendingLeave.length}</span>}
              </div>
              <div className="card-body">
                {pendingLeave.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <p>No pending leave requests</p>
                  </div>
                ) : (
                  <div className="action-items">
                    {pendingLeave.slice(0, 5).map(leave => (
                      <div key={leave.id} className="action-item">
                        <div className="action-info">
                          <span className="action-name">{leave.employee_name}</span>
                          <span className="action-detail">{leave.leave_type_name || leave.leave_type} - {formatDate(leave.start_date)}</span>
                        </div>
                        <span className="action-badge yellow">Review</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pending Claims */}
            <div className="dashboard-card" onClick={() => navigate('/admin/claims')} style={{ cursor: 'pointer' }}>
              <div className="card-header">
                <h2>Pending Claims</h2>
                {pendingClaims.length > 0 && <span className="badge blue">{pendingClaims.length}</span>}
              </div>
              <div className="card-body">
                {pendingClaims.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <p>No pending claims</p>
                  </div>
                ) : (
                  <div className="action-items">
                    {pendingClaims.slice(0, 5).map(claim => (
                      <div key={claim.id} className="action-item">
                        <div className="action-info">
                          <span className="action-name">{claim.employee_name}</span>
                          <span className="action-detail">{claim.category} - {formatCurrency(claim.amount)}</span>
                        </div>
                        <span className="action-badge blue">Review</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pending Confirmations */}
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Pending Confirmations</h2>
                {pendingProbations.length > 0 && <span className="badge red">{pendingProbations.length}</span>}
              </div>
              <div className="card-body">
                {pendingProbations.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <p>No probations ending soon</p>
                  </div>
                ) : (
                  <div className="action-items">
                    {pendingProbations.slice(0, 5).map(emp => (
                      <div key={emp.id} className="action-item" onClick={() => navigate(`/admin/employees?search=${emp.employee_id}`)}>
                        <div className="action-info">
                          <span className="action-name">{emp.name}</span>
                          <span className="action-detail">
                            Ends {formatDate(emp.probation_end_date)}
                            {getDaysUntil(emp.probation_end_date) <= 7 && (
                              <span className="urgent"> ({getDaysUntil(emp.probation_end_date)} days)</span>
                            )}
                          </span>
                        </div>
                        <span className="action-badge red">Confirm</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Birthdays This Month */}
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Birthdays This Month</h2>
                {birthdays.length > 0 && <span className="badge green">{birthdays.length}</span>}
              </div>
              <div className="card-body">
                {birthdays.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon" style={{ fontSize: '32px' }}>🎂</div>
                    <p>No birthdays this month</p>
                  </div>
                ) : (
                  <div className="action-items">
                    {birthdays.slice(0, 8).map(emp => {
                      const day = getBirthdayDay(emp);
                      return (
                        <div key={emp.id} className="action-item">
                          <div className="action-info">
                            <span className="action-name">{emp.name}</span>
                            <span className="action-detail">{emp.department_name || 'No dept'}</span>
                          </div>
                          {day && <span className="action-badge green">{day}{getDaySuffix(day)}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Default (Mimix / other companies) dashboard - UNCHANGED
  return (
    <Layout>
      <div className="dashboard">
        {/* Header */}
        <div className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>{currentDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="stat-box" onClick={() => navigate('/admin/employees')}>
            <div className="stat-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.overview?.active || 0}</span>
              <span className="stat-label">Active Employees</span>
            </div>
          </div>

          {usesOutlets ? (
            <div className="stat-box" onClick={() => navigate('/admin/outlets')}>
              <div className="stat-icon purple">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div className="stat-content">
                <span className="stat-value">{outlets.length}</span>
                <span className="stat-label">Outlets</span>
              </div>
            </div>
          ) : (
            <div className="stat-box">
              <div className="stat-icon purple">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div className="stat-content">
                <span className="stat-value">{stats?.byDepartment?.length || 0}</span>
                <span className="stat-label">Departments</span>
              </div>
            </div>
          )}

          <div className="stat-box" onClick={() => navigate('/admin/payroll-v2')}>
            <div className="stat-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(payrollSummary?.summary?.total_payroll || 0)}</span>
              <span className="stat-label">This Month Payroll</span>
            </div>
          </div>

          <div className={`stat-box ${actionItemsCount > 0 ? 'has-alert' : ''}`}>
            <div className={`stat-icon ${actionItemsCount > 0 ? 'orange' : 'gray'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{actionItemsCount}</span>
              <span className="stat-label">Items Need Attention</span>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="dashboard-grid">
          {/* Action Required Section */}
          <div className="dashboard-card action-card">
            <div className="card-header">
              <h2>Action Required</h2>
              {actionItemsCount > 0 && <span className="badge orange">{actionItemsCount}</span>}
            </div>
            <div className="card-body">
              {actionItemsCount === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <p>All caught up! No pending items.</p>
                </div>
              ) : (
                <div className="action-list">
                  {/* Pending Leave Requests */}
                  {pendingLeave.length > 0 && (
                    <div className="action-group">
                      <div className="action-group-header" onClick={() => navigate('/admin/leave')}>
                        <span className="action-group-title">
                          <span className="dot yellow"></span>
                          Pending Leave Requests
                        </span>
                        <span className="action-count">{pendingLeave.length}</span>
                      </div>
                      <div className="action-items">
                        {pendingLeave.slice(0, 3).map(leave => (
                          <div key={leave.id} className="action-item" onClick={() => navigate('/admin/leave')}>
                            <div className="action-info">
                              <span className="action-name">{leave.employee_name}</span>
                              <span className="action-detail">{leave.leave_type} - {formatDate(leave.start_date)}</span>
                            </div>
                            <span className="action-badge yellow">Review</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending Claims */}
                  {pendingClaims.length > 0 && (
                    <div className="action-group">
                      <div className="action-group-header" onClick={() => navigate('/admin/claims')}>
                        <span className="action-group-title">
                          <span className="dot blue"></span>
                          Pending Claims
                        </span>
                        <span className="action-count">{pendingClaims.length}</span>
                      </div>
                      <div className="action-items">
                        {pendingClaims.slice(0, 3).map(claim => (
                          <div key={claim.id} className="action-item" onClick={() => navigate('/admin/claims')}>
                            <div className="action-info">
                              <span className="action-name">{claim.employee_name}</span>
                              <span className="action-detail">{claim.claim_type} - {formatCurrency(claim.amount)}</span>
                            </div>
                            <span className="action-badge blue">Review</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Probation Ending */}
                  {pendingProbations.length > 0 && (
                    <div className="action-group">
                      <div className="action-group-header" onClick={() => navigate('/admin/employees?employment_type=probation')}>
                        <span className="action-group-title">
                          <span className="dot red"></span>
                          Probation Ending Soon
                        </span>
                        <span className="action-count">{pendingProbations.length}</span>
                      </div>
                      <div className="action-items">
                        {pendingProbations.slice(0, 3).map(emp => (
                          <div key={emp.id} className="action-item" onClick={() => navigate(`/admin/employees?search=${emp.employee_id}`)}>
                            <div className="action-info">
                              <span className="action-name">{emp.name}</span>
                              <span className="action-detail">
                                Ends {formatDate(emp.probation_end_date)}
                                {getDaysUntil(emp.probation_end_date) <= 7 && (
                                  <span className="urgent"> ({getDaysUntil(emp.probation_end_date)} days)</span>
                                )}
                              </span>
                            </div>
                            <span className="action-badge red">Confirm</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Overview Section */}
          <div className="dashboard-card overview-card">
            <div className="card-header">
              <h2>Overview</h2>
            </div>
            <div className="card-body">
              {/* Employee Breakdown */}
              <div className="overview-section">
                <h3>Employees</h3>
                <div className="overview-stats">
                  <div className="overview-stat">
                    <span className="overview-value">{stats?.overview?.active || 0}</span>
                    <span className="overview-label">Active</span>
                  </div>
                  <div className="overview-stat">
                    <span className="overview-value">{stats?.overview?.on_probation || 0}</span>
                    <span className="overview-label">Probation</span>
                  </div>
                  <div className="overview-stat">
                    <span className="overview-value">{stats?.overview?.confirmed || 0}</span>
                    <span className="overview-label">Confirmed</span>
                  </div>
                  <div className="overview-stat muted">
                    <span className="overview-value">{stats?.overview?.inactive || 0}</span>
                    <span className="overview-label">Inactive</span>
                  </div>
                </div>
              </div>

              {/* Outlet Status for outlet-based companies */}
              {usesOutlets && outlets.length > 0 && (
                <div className="overview-section">
                  <h3>Outlet Staffing</h3>
                  <div className="overview-stats">
                    <div className="overview-stat">
                      <span className="overview-value">{totalOutletStaff}</span>
                      <span className="overview-label">Total Staff</span>
                    </div>
                    <div className="overview-stat">
                      <span className="overview-value">{outlets.length}</span>
                      <span className="overview-label">Outlets</span>
                    </div>
                    <div className={`overview-stat ${understaffedOutlets.length > 0 ? 'warning' : ''}`}>
                      <span className="overview-value">{understaffedOutlets.length}</span>
                      <span className="overview-label">Understaffed</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payroll Summary */}
              {payrollSummary?.summary && (
                <div className="overview-section">
                  <h3>Payroll - {currentDate.toLocaleDateString('en-MY', { month: 'long' })}</h3>
                  <div className="payroll-breakdown">
                    <div className="breakdown-row">
                      <span>Basic Salary</span>
                      <span>{formatCurrency(payrollSummary.summary.total_basic)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span>Allowances</span>
                      <span>{formatCurrency(payrollSummary.summary.total_allowance)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span>Commission</span>
                      <span>{formatCurrency(payrollSummary.summary.total_commission)}</span>
                    </div>
                    <div className="breakdown-row total">
                      <span>Total</span>
                      <span>{formatCurrency(payrollSummary.summary.total_payroll)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="dashboard-card quick-actions-card">
            <div className="card-header">
              <h2>Quick Actions</h2>
            </div>
            <div className="card-body">
              <div className="quick-actions">
                <button className="quick-action" onClick={() => navigate('/admin/employees')}>
                  <div className="action-icon blue">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                  </div>
                  <span>Add Employee</span>
                </button>

                <button className="quick-action" onClick={() => navigate('/admin/payroll-v2')}>
                  <div className="action-icon green">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <span>Run Payroll</span>
                </button>

                <button className="quick-action" onClick={() => navigate('/admin/leave')}>
                  <div className="action-icon yellow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <span>Manage Leave</span>
                </button>

                <button className="quick-action" onClick={() => navigate('/admin/attendance')}>
                  <div className="action-icon purple">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <span>Attendance</span>
                </button>

                {usesOutlets && (
                  <button className="quick-action" onClick={() => navigate('/admin/schedules')}>
                    <div className="action-icon teal">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                      </svg>
                    </div>
                    <span>Schedules</span>
                  </button>
                )}

                <button className="quick-action" onClick={() => navigate('/admin/claims')}>
                  <div className="action-icon orange">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </div>
                  <span>Claims</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function getDaySuffix(day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export default AdminDashboard;
