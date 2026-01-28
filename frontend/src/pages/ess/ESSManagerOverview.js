import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSManagerOverview.css';

function ESSManagerOverview() {
  const { t, language } = useLanguage();
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutlet, setSelectedOutlet] = useState('all');

  // Quick Add Employee state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    employee_id: '',
    name: '',
    id_type: 'ic',
    ic_number: '',
    outlet_id: '',
    position_id: ''
  });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState(null);

  // Approval state
  const [approvalLoading, setApprovalLoading] = useState({});
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await essApi.getManagerOverview();
      setOverviewData(res.data);
    } catch (err) {
      console.error('Error fetching overview:', err);
      // Handle different error response formats - ensure we always get a string
      const errorData = err.response?.data;
      let errorMessage = 'Failed to load team overview';
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (typeof errorData?.error === 'string') {
        errorMessage = errorData.error;
      } else if (typeof errorData?.message === 'string') {
        errorMessage = errorData.message;
      } else if (errorData?.error?.message) {
        errorMessage = errorData.error.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      day: '2-digit',
      month: 'short'
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleTimeString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    setQuickAddLoading(true);
    setQuickAddResult(null);

    try {
      const res = await essApi.managerQuickAddEmployee(quickAddForm);
      setQuickAddResult({
        success: true,
        message: res.data.message,
        loginInfo: res.data.login_info
      });
      // Reset form
      setQuickAddForm({
        employee_id: '',
        name: '',
        ic_number: '',
        outlet_id: quickAddForm.outlet_id // Keep selected outlet
      });
      // Refresh data
      fetchOverview();
    } catch (err) {
      // Ensure error message is a string
      let errorMsg = 'Failed to add employee';
      const errorData = err.response?.data;
      if (typeof errorData?.error === 'string') {
        errorMsg = errorData.error;
      } else if (typeof errorData?.message === 'string') {
        errorMsg = errorData.message;
      } else if (typeof errorData === 'string') {
        errorMsg = errorData;
      }
      setQuickAddResult({
        success: false,
        message: errorMsg
      });
    } finally {
      setQuickAddLoading(false);
    }
  };

  const resetQuickAdd = () => {
    setShowQuickAdd(false);
    setQuickAddForm({
      employee_id: '',
      name: '',
      id_type: 'ic',
      ic_number: '',
      outlet_id: '',
      position_id: ''
    });
    setQuickAddResult(null);
  };

  // Approve leave request
  const handleApproveLeave = async (leaveId) => {
    setApprovalLoading(prev => ({ ...prev, [`leave_${leaveId}`]: true }));
    try {
      await essApi.approveLeave(leaveId);
      // Refresh data
      fetchOverview();
    } catch (err) {
      console.error('Error approving leave:', err);
      alert(err.response?.data?.error || 'Failed to approve leave');
    } finally {
      setApprovalLoading(prev => ({ ...prev, [`leave_${leaveId}`]: false }));
    }
  };

  // Reject leave request
  const handleRejectLeave = async () => {
    if (!rejectReason.trim()) {
      alert('Please enter a rejection reason');
      return;
    }
    const leaveId = showRejectModal;
    setApprovalLoading(prev => ({ ...prev, [`leave_${leaveId}`]: true }));
    try {
      await essApi.rejectLeave(leaveId, rejectReason);
      setShowRejectModal(null);
      setRejectReason('');
      // Refresh data
      fetchOverview();
    } catch (err) {
      console.error('Error rejecting leave:', err);
      alert(err.response?.data?.error || 'Failed to reject leave');
    } finally {
      setApprovalLoading(prev => ({ ...prev, [`leave_${leaveId}`]: false }));
    }
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>{t('common.loading')}</p>
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

  const { outlets, positions, summary } = overviewData || { outlets: [], positions: [], summary: {} };

  // Calculate totals
  const totalPendingLeave = outlets.reduce((sum, o) => sum + o.pending_leave_count, 0);
  const totalPendingClaims = outlets.reduce((sum, o) => sum + o.pending_claims_count, 0);
  const totalNotClockedIn = outlets.reduce((sum, o) => sum + o.not_clocked_in_count, 0);

  // Get all staff across outlets (for staff directory)
  const allStaff = outlets.flatMap(outlet =>
    outlet.staff.map(emp => ({ ...emp, outlet_name: outlet.name, outlet_id: outlet.id }))
  );

  // Filter staff based on search and outlet
  const filteredStaff = allStaff.filter(emp => {
    const matchesSearch = !searchQuery ||
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOutlet = selectedOutlet === 'all' || emp.outlet_id === parseInt(selectedOutlet);
    return matchesSearch && matchesOutlet;
  });

  // Get all attendance records
  const allAttendance = outlets.flatMap(outlet =>
    outlet.attendance_today.map(att => ({ ...att, outlet_name: outlet.name }))
  );

  // Get all not clocked in
  const allNotClockedIn = outlets.flatMap(outlet =>
    outlet.not_clocked_in.map(emp => ({ ...emp, outlet_name: outlet.name }))
  );

  // Get all pending leave
  const allPendingLeave = outlets.flatMap(outlet =>
    outlet.pending_leave.map(leave => ({ ...leave, outlet_name: outlet.name }))
  );

  // Get all pending claims
  const allPendingClaims = outlets.flatMap(outlet =>
    outlet.pending_claims.map(claim => ({ ...claim, outlet_name: outlet.name }))
  );

  return (
    <ESSLayout>
      <div className="manager-overview">
        <header className="overview-header">
          <div>
            <h1>{t('manager.teamOverview')}</h1>
            <p>{new Date().toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <button className="quick-add-btn" onClick={() => setShowQuickAdd(true)}>
            + {t('manager.addStaff')}
          </button>
        </header>

        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="stat-card primary">
            <div className="stat-number">{summary.total_outlets}</div>
            <div className="stat-label">{t('manager.outlets')}</div>
          </div>
          <div className="stat-card info">
            <div className="stat-number">{summary.total_staff}</div>
            <div className="stat-label">{t('manager.staff')}</div>
          </div>
          <div className="stat-card success">
            <div className="stat-number">{summary.clocked_in_today}</div>
            <div className="stat-label">{t('manager.working')}</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-number">{totalNotClockedIn}</div>
            <div className="stat-label">{t('manager.notIn')}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            {t('manager.dashboard')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            {t('manager.staffDirectory')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            {t('manager.attendance')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => setActiveTab('approvals')}
          >
            {t('manager.approvals')} {(totalPendingLeave + totalPendingClaims) > 0 && (
              <span className="badge">{totalPendingLeave + totalPendingClaims}</span>
            )}
          </button>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-content">
            {/* Currently Working */}
            <div className="dashboard-section">
              <h3 className="section-header success-bg">
                <span>&#x2705;</span> Currently Working ({allAttendance.filter(a => !a.clock_out_time).length})
              </h3>
              {allAttendance.filter(a => !a.clock_out_time).length === 0 ? (
                <p className="no-data">No one clocked in yet</p>
              ) : (
                <div className="employee-list">
                  {allAttendance.filter(a => !a.clock_out_time).map(att => (
                    <div key={att.id} className="employee-row working">
                      <div className="emp-main">
                        <span className="emp-id-badge">{att.emp_code}</span>
                        <span className="emp-name">{att.employee_name}</span>
                      </div>
                      <div className="emp-details">
                        <span className="outlet-tag">{att.outlet_name}</span>
                        <span className="time-info">In: {formatTime(att.clock_in_time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Not Clocked In Yet */}
            {allNotClockedIn.length > 0 && (
              <div className="dashboard-section">
                <h3 className="section-header danger-bg">
                  <span>&#x26A0;</span> Not Clocked In ({allNotClockedIn.length})
                </h3>
                <div className="employee-list">
                  {allNotClockedIn.map(emp => (
                    <div key={emp.id} className="employee-row not-in">
                      <div className="emp-main">
                        <span className="emp-id-badge">{emp.emp_code}</span>
                        <span className="emp-name">{emp.employee_name}</span>
                      </div>
                      <div className="emp-details">
                        <span className="outlet-tag">{emp.outlet_name}</span>
                        <span className="time-info">
                          Shift: {emp.shift_start?.substring(0, 5)} - {emp.shift_end?.substring(0, 5)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Shifts */}
            {allAttendance.filter(a => a.clock_out_time).length > 0 && (
              <div className="dashboard-section">
                <h3 className="section-header completed-bg">
                  <span>&#x1F3C1;</span> Completed ({allAttendance.filter(a => a.clock_out_time).length})
                </h3>
                <div className="employee-list">
                  {allAttendance.filter(a => a.clock_out_time).map(att => (
                    <div key={att.id} className="employee-row completed">
                      <div className="emp-main">
                        <span className="emp-id-badge">{att.emp_code}</span>
                        <span className="emp-name">{att.employee_name}</span>
                      </div>
                      <div className="emp-details">
                        <span className="outlet-tag">{att.outlet_name}</span>
                        <span className="time-info">
                          {formatTime(att.clock_in_time)} - {formatTime(att.clock_out_time)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Approvals Summary */}
            {(totalPendingLeave > 0 || totalPendingClaims > 0) && (
              <div className="dashboard-section">
                <h3 className="section-header warning-bg">
                  <span>&#x1F4DD;</span> Pending Approvals
                </h3>
                <div className="approval-summary">
                  {totalPendingLeave > 0 && (
                    <div className="approval-item" onClick={() => setActiveTab('approvals')}>
                      <span className="approval-count">{totalPendingLeave}</span>
                      <span className="approval-label">Leave Requests</span>
                    </div>
                  )}
                  {totalPendingClaims > 0 && (
                    <div className="approval-item" onClick={() => setActiveTab('approvals')}>
                      <span className="approval-count">{totalPendingClaims}</span>
                      <span className="approval-label">Claims</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Staff Directory Tab */}
        {activeTab === 'staff' && (
          <div className="staff-directory">
            {/* Search and Filter */}
            <div className="search-filter">
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <select
                value={selectedOutlet}
                onChange={(e) => setSelectedOutlet(e.target.value)}
                className="outlet-filter"
              >
                <option value="all">All Outlets</option>
                {outlets.map(outlet => (
                  <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                ))}
              </select>
            </div>

            {/* Staff Count */}
            <div className="staff-count">
              Showing {filteredStaff.length} of {allStaff.length} staff
            </div>

            {/* Staff List */}
            <div className="staff-directory-list">
              {filteredStaff.length === 0 ? (
                <p className="no-data">No staff found</p>
              ) : (
                filteredStaff.map(emp => (
                  <div key={emp.id} className="staff-directory-card">
                    <div className="staff-avatar">
                      {emp.name.charAt(0)}
                    </div>
                    <div className="staff-details">
                      <div className="staff-name-row">
                        <span className="emp-id-badge">{emp.employee_id}</span>
                        <strong className="staff-name">{emp.name}</strong>
                      </div>
                      <div className="staff-meta">
                        <span className="outlet-tag">{emp.outlet_name}</span>
                        <span className={`role-badge ${emp.employee_role}`}>
                          {emp.position_name || emp.position || emp.employee_role}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
          <div className="attendance-content">
            {/* By Outlet */}
            {outlets.map(outlet => (
              <div key={outlet.id} className="outlet-attendance-card">
                <div className="outlet-attendance-header">
                  <h3>{outlet.name}</h3>
                  <div className="outlet-attendance-stats">
                    <span className="stat-badge success">{outlet.clocked_in_count} in</span>
                    <span className="stat-badge danger">{outlet.not_clocked_in_count} not in</span>
                  </div>
                </div>
                <div className="outlet-attendance-body">
                  {/* Not Clocked In */}
                  {outlet.not_clocked_in.length > 0 && (
                    <div className="attendance-group">
                      <h4 className="group-title danger">Not Clocked In</h4>
                      {outlet.not_clocked_in.map(emp => (
                        <div key={emp.id} className="attendance-row not-in">
                          <span className="emp-id-badge">{emp.emp_code}</span>
                          <span className="emp-name">{emp.employee_name}</span>
                          <span className="shift-time">
                            {emp.shift_start?.substring(0, 5)} - {emp.shift_end?.substring(0, 5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Clocked In */}
                  {outlet.attendance_today.length > 0 && (
                    <div className="attendance-group">
                      <h4 className="group-title success">Attendance Records</h4>
                      {outlet.attendance_today.map(att => (
                        <div key={att.id} className={`attendance-row ${att.clock_out_time ? 'completed' : 'working'}`}>
                          <span className="emp-id-badge">{att.emp_code}</span>
                          <span className="emp-name">{att.employee_name}</span>
                          <span className="clock-times">
                            {formatTime(att.clock_in_time)}
                            {att.clock_out_time ? ` - ${formatTime(att.clock_out_time)}` : ' (Working)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {outlet.not_clocked_in.length === 0 && outlet.attendance_today.length === 0 && (
                    <p className="no-data">No schedule or attendance for today</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approvals Tab */}
        {activeTab === 'approvals' && (
          <div className="approvals-content">
            {/* Pending Leave */}
            <div className="approval-section">
              <h3 className="section-header warning-bg">
                <span>&#x1F4C5;</span> Pending Leave Requests ({allPendingLeave.length})
              </h3>
              {allPendingLeave.length === 0 ? (
                <p className="no-data">No pending leave requests</p>
              ) : (
                <div className="approval-list">
                  {allPendingLeave.map(leave => (
                    <div key={leave.id} className="approval-card leave">
                      <div className="approval-header">
                        <div className="emp-info">
                          <span className="emp-id-badge">{leave.emp_code}</span>
                          <strong>{leave.employee_name}</strong>
                        </div>
                        <span className="outlet-tag">{leave.outlet_name}</span>
                      </div>
                      <div className="approval-body">
                        <span className="leave-type">{leave.leave_type_name}</span>
                        <span className="leave-dates">
                          {formatDate(leave.start_date)} - {formatDate(leave.end_date)}
                        </span>
                        <span className="leave-days">{leave.total_days} day(s)</span>
                      </div>
                      {leave.reason && <p className="approval-reason">{leave.reason}</p>}
                      <div className="approval-actions">
                        <button
                          className="btn-approve"
                          onClick={() => handleApproveLeave(leave.id)}
                          disabled={approvalLoading[`leave_${leave.id}`]}
                        >
                          {approvalLoading[`leave_${leave.id}`] ? '...' : '✓ Approve'}
                        </button>
                        <button
                          className="btn-reject"
                          onClick={() => setShowRejectModal(leave.id)}
                          disabled={approvalLoading[`leave_${leave.id}`]}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Claims */}
            <div className="approval-section">
              <h3 className="section-header warning-bg">
                <span>&#x1F4B3;</span> Pending Claims ({allPendingClaims.length})
              </h3>
              {allPendingClaims.length === 0 ? (
                <p className="no-data">No pending claims</p>
              ) : (
                <div className="approval-list">
                  {allPendingClaims.map(claim => (
                    <div key={claim.id} className="approval-card claim">
                      <div className="approval-header">
                        <div className="emp-info">
                          <span className="emp-id-badge">{claim.emp_code}</span>
                          <strong>{claim.employee_name}</strong>
                        </div>
                        <span className="outlet-tag">{claim.outlet_name}</span>
                      </div>
                      <div className="approval-body">
                        <span className="claim-type">{claim.claim_type_name}</span>
                        <span className="claim-date">{formatDate(claim.claim_date)}</span>
                        <span className="claim-amount">RM {parseFloat(claim.amount).toFixed(2)}</span>
                      </div>
                      {claim.description && <p className="approval-reason">{claim.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {totalPendingLeave === 0 && totalPendingClaims === 0 && (
              <div className="all-clear">
                <span className="all-clear-icon">&#x2705;</span>
                <h3>All Caught Up!</h3>
                <p>No pending approvals at this time</p>
              </div>
            )}
          </div>
        )}

        {/* Quick Add Employee Modal */}
        {showQuickAdd && (
          <div className="modal-overlay" onClick={resetQuickAdd}>
            <div className="quick-add-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Quick Add Staff</h2>
                <button className="close-btn" onClick={resetQuickAdd}>&times;</button>
              </div>

              {quickAddResult?.success ? (
                <div className="quick-add-success">
                  <div className="success-icon">&#x2705;</div>
                  <h3>Staff Added Successfully!</h3>
                  <p>{quickAddResult.message}</p>
                  <div className="login-info-box">
                    <p><strong>Login Details:</strong></p>
                    <p>Employee ID: <code>{quickAddResult.loginInfo.employee_id}</code></p>
                    <p>Password: <code>{quickAddResult.loginInfo.initial_password}</code></p>
                  </div>
                  <div className="modal-actions">
                    <button className="btn-secondary" onClick={resetQuickAdd}>Done</button>
                    <button className="btn-primary" onClick={() => setQuickAddResult(null)}>Add Another</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleQuickAdd}>
                  {quickAddResult?.success === false && (
                    <div className="error-alert">{quickAddResult.message}</div>
                  )}

                  <div className="form-group">
                    <label>Outlet *</label>
                    <select
                      value={quickAddForm.outlet_id}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, outlet_id: e.target.value })}
                      required
                    >
                      <option value="">Select outlet</option>
                      {outlets.map(outlet => (
                        <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Position</label>
                    <select
                      value={quickAddForm.position_id}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, position_id: e.target.value })}
                    >
                      <option value="">Select position (optional)</option>
                      {positions.map(pos => (
                        <option key={pos.id} value={pos.id}>{pos.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Employee ID *</label>
                    <input
                      type="text"
                      value={quickAddForm.employee_id}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, employee_id: e.target.value.toUpperCase() })}
                      placeholder="e.g. MX001"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      value={quickAddForm.name}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, name: e.target.value.toUpperCase() })}
                      placeholder="e.g. AHMAD BIN ALI"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>ID Type *</label>
                    <select
                      value={quickAddForm.id_type}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, id_type: e.target.value, ic_number: '' })}
                      required
                    >
                      <option value="ic">IC (Malaysian)</option>
                      <option value="passport">Passport (Foreign Worker)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>{quickAddForm.id_type === 'ic' ? 'IC Number' : 'Passport Number'} *</label>
                    <input
                      type="text"
                      value={quickAddForm.ic_number}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, ic_number: e.target.value })}
                      placeholder={quickAddForm.id_type === 'ic' ? 'e.g. 901234567890' : 'e.g. A12345678'}
                      required
                    />
                    <small className="hint">
                      {quickAddForm.id_type === 'ic'
                        ? 'IC number will be used as initial password'
                        : 'Passport number will be used as initial password'}
                    </small>
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={resetQuickAdd}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={quickAddLoading}>
                      {quickAddLoading ? 'Adding...' : 'Add Staff'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Reject Leave Modal */}
        {showRejectModal && (
          <div className="modal-overlay" onClick={() => setShowRejectModal(null)}>
            <div className="quick-add-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Reject Leave Request</h2>
                <button className="close-btn" onClick={() => setShowRejectModal(null)}>&times;</button>
              </div>
              <div className="form-group">
                <label>Rejection Reason *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Please provide a reason for rejection..."
                  rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowRejectModal(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ backgroundColor: '#dc3545' }}
                  onClick={handleRejectLeave}
                  disabled={approvalLoading[`leave_${showRejectModal}`]}
                >
                  {approvalLoading[`leave_${showRejectModal}`] ? 'Rejecting...' : 'Reject Leave'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSManagerOverview;
