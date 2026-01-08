import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import './ESSManagerOverview.css';

function ESSManagerOverview() {
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedOutlets, setExpandedOutlets] = useState({});
  const [activeTab, setActiveTab] = useState('overview'); // overview, leave, claims, attendance

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await essApi.getManagerOverview();
      setOverviewData(res.data);
      // Expand first outlet by default
      if (res.data.outlets?.length > 0) {
        setExpandedOutlets({ [res.data.outlets[0].id]: true });
      }
    } catch (err) {
      console.error('Error fetching overview:', err);
      setError(err.response?.data?.error || 'Failed to load manager overview');
    } finally {
      setLoading(false);
    }
  };

  const toggleOutlet = (outletId) => {
    setExpandedOutlets(prev => ({
      ...prev,
      [outletId]: !prev[outletId]
    }));
  };

  const expandAll = () => {
    const allExpanded = {};
    overviewData?.outlets?.forEach(o => { allExpanded[o.id] = true; });
    setExpandedOutlets(allExpanded);
  };

  const collapseAll = () => {
    setExpandedOutlets({});
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>Loading manager overview...</p>
        </div>
      </ESSLayout>
    );
  }

  if (error) {
    return (
      <ESSLayout>
        <div className="manager-overview">
          <div className="error-message">{error}</div>
        </div>
      </ESSLayout>
    );
  }

  const { outlets, summary } = overviewData || { outlets: [], summary: {} };

  // Calculate totals for tabs
  const totalPendingLeave = outlets.reduce((sum, o) => sum + o.pending_leave_count, 0);
  const totalPendingClaims = outlets.reduce((sum, o) => sum + o.pending_claims_count, 0);

  return (
    <ESSLayout>
      <div className="manager-overview">
        <header className="overview-header">
          <div>
            <h1>Manager Overview</h1>
            <p>All outlets at a glance</p>
          </div>
        </header>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card outlets">
            <span className="summary-icon">&#x1F3E2;</span>
            <div className="summary-content">
              <span className="summary-value">{summary.total_outlets}</span>
              <span className="summary-label">Outlets</span>
            </div>
          </div>
          <div className="summary-card staff">
            <span className="summary-icon">&#x1F465;</span>
            <div className="summary-content">
              <span className="summary-value">{summary.total_staff}</span>
              <span className="summary-label">Total Staff</span>
            </div>
          </div>
          <div className="summary-card leave">
            <span className="summary-icon">&#x1F4C5;</span>
            <div className="summary-content">
              <span className="summary-value">{summary.pending_leave}</span>
              <span className="summary-label">Pending Leave</span>
            </div>
          </div>
          <div className="summary-card claims">
            <span className="summary-icon">&#x1F4B3;</span>
            <div className="summary-content">
              <span className="summary-value">{summary.pending_claims}</span>
              <span className="summary-label">Pending Claims</span>
            </div>
          </div>
          <div className="summary-card attendance">
            <span className="summary-icon">&#x2705;</span>
            <div className="summary-content">
              <span className="summary-value">{summary.clocked_in_today}</span>
              <span className="summary-label">Clocked In Today</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab-btn ${activeTab === 'leave' ? 'active' : ''}`}
            onClick={() => setActiveTab('leave')}
          >
            Pending Leave {totalPendingLeave > 0 && <span className="badge">{totalPendingLeave}</span>}
          </button>
          <button
            className={`tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
            onClick={() => setActiveTab('claims')}
          >
            Pending Claims {totalPendingClaims > 0 && <span className="badge">{totalPendingClaims}</span>}
          </button>
          <button
            className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            Today's Attendance
          </button>
        </div>

        {/* Expand/Collapse All */}
        <div className="expand-controls">
          <button onClick={expandAll} className="expand-btn">Expand All</button>
          <button onClick={collapseAll} className="expand-btn">Collapse All</button>
        </div>

        {/* Outlets List */}
        <div className="outlets-list">
          {outlets.map(outlet => (
            <div key={outlet.id} className="outlet-card">
              <div className="outlet-header" onClick={() => toggleOutlet(outlet.id)}>
                <div className="outlet-info">
                  <h3>{outlet.name}</h3>
                  <div className="outlet-stats">
                    <span className="stat"><strong>{outlet.staff_count}</strong> staff</span>
                    {outlet.pending_leave_count > 0 && (
                      <span className="stat warning"><strong>{outlet.pending_leave_count}</strong> leave pending</span>
                    )}
                    {outlet.pending_claims_count > 0 && (
                      <span className="stat warning"><strong>{outlet.pending_claims_count}</strong> claims pending</span>
                    )}
                    <span className="stat success"><strong>{outlet.clocked_in_count}</strong> clocked in</span>
                    {outlet.not_clocked_in_count > 0 && (
                      <span className="stat danger"><strong>{outlet.not_clocked_in_count}</strong> not clocked in</span>
                    )}
                  </div>
                </div>
                <span className={`expand-icon ${expandedOutlets[outlet.id] ? 'expanded' : ''}`}>&#x25BC;</span>
              </div>

              {expandedOutlets[outlet.id] && (
                <div className="outlet-content">
                  {/* Overview Tab */}
                  {activeTab === 'overview' && (
                    <div className="tab-content">
                      <h4>Staff List</h4>
                      {outlet.staff.length === 0 ? (
                        <p className="no-data">No active staff in this outlet</p>
                      ) : (
                        <div className="staff-grid">
                          {outlet.staff.map(emp => (
                            <div key={emp.id} className="staff-card">
                              <div className="staff-avatar">
                                {emp.name.charAt(0)}
                              </div>
                              <div className="staff-info">
                                <strong>{emp.name}</strong>
                                <span className="staff-id">{emp.employee_id}</span>
                                <span className={`staff-role ${emp.employee_role}`}>
                                  {emp.position_name || emp.position || emp.employee_role}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pending Leave Tab */}
                  {activeTab === 'leave' && (
                    <div className="tab-content">
                      <h4>Pending Leave Requests</h4>
                      {outlet.pending_leave.length === 0 ? (
                        <p className="no-data">No pending leave requests</p>
                      ) : (
                        <div className="requests-list">
                          {outlet.pending_leave.map(leave => (
                            <div key={leave.id} className="request-card leave">
                              <div className="request-header">
                                <strong>{leave.employee_name}</strong>
                                <span className="request-type">{leave.leave_type_name}</span>
                              </div>
                              <div className="request-details">
                                <span>{formatDate(leave.start_date)} - {formatDate(leave.end_date)}</span>
                                <span className="days">{leave.total_days} day(s)</span>
                              </div>
                              {leave.reason && <p className="request-reason">{leave.reason}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pending Claims Tab */}
                  {activeTab === 'claims' && (
                    <div className="tab-content">
                      <h4>Pending Claims</h4>
                      {outlet.pending_claims.length === 0 ? (
                        <p className="no-data">No pending claims</p>
                      ) : (
                        <div className="requests-list">
                          {outlet.pending_claims.map(claim => (
                            <div key={claim.id} className="request-card claim">
                              <div className="request-header">
                                <strong>{claim.employee_name}</strong>
                                <span className="request-type">{claim.claim_type_name}</span>
                              </div>
                              <div className="request-details">
                                <span>{formatDate(claim.claim_date)}</span>
                                <span className="amount">RM {parseFloat(claim.amount).toFixed(2)}</span>
                              </div>
                              {claim.description && <p className="request-reason">{claim.description}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attendance Tab */}
                  {activeTab === 'attendance' && (
                    <div className="tab-content">
                      <h4>Today's Attendance</h4>

                      {/* Not Clocked In */}
                      {outlet.not_clocked_in.length > 0 && (
                        <div className="attendance-section">
                          <h5 className="section-title danger">Not Clocked In ({outlet.not_clocked_in.length})</h5>
                          <div className="attendance-list">
                            {outlet.not_clocked_in.map(emp => (
                              <div key={emp.id} className="attendance-item not-clocked">
                                <span className="emp-name">{emp.employee_name}</span>
                                <span className="emp-id">{emp.emp_code}</span>
                                <span className="shift-time">
                                  Scheduled: {emp.shift_start?.substring(0, 5)} - {emp.shift_end?.substring(0, 5)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Clocked In */}
                      {outlet.attendance_today.length > 0 ? (
                        <div className="attendance-section">
                          <h5 className="section-title success">Attendance Records ({outlet.attendance_today.length})</h5>
                          <div className="attendance-list">
                            {outlet.attendance_today.map(att => (
                              <div key={att.id} className={`attendance-item ${att.clock_out_time ? 'completed' : 'working'}`}>
                                <span className="emp-name">{att.employee_name}</span>
                                <span className="emp-id">{att.emp_code}</span>
                                <span className="clock-times">
                                  In: {formatTime(att.clock_in_time)}
                                  {att.clock_out_time ? ` | Out: ${formatTime(att.clock_out_time)}` : ' (Working)'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : outlet.not_clocked_in.length === 0 && (
                        <p className="no-data">No attendance records for today</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </ESSLayout>
  );
}

export default ESSManagerOverview;
