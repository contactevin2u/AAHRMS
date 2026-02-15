import React, { useState, useEffect, useCallback } from 'react';
import { resignationsApi, employeeApi } from '../api';
import Layout from '../components/Layout';
import './Resignations.css';

function Resignations({ outletId: propOutletId, embedded = false }) {
  const isOutletLocked = !!propOutletId;

  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isMimix = adminInfo.company_id === 3;

  const [resignations, setResignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', outlet_id: propOutletId || '' });

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedResignation, setSelectedResignation] = useState(null);
  const [detailsTab, setDetailsTab] = useState('overview');

  // Clearance & Settlement
  const [clearanceData, setClearanceData] = useState(null);
  const [settlementData, setSettlementData] = useState(null);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [loadingClearance, setLoadingClearance] = useState(false);

  // Leave entitlement
  const [leaveEntitlement, setLeaveEntitlement] = useState(null);
  const [loadingLeave, setLoadingLeave] = useState(false);

  // Form
  const [form, setForm] = useState({
    employee_id: '',
    notice_date: new Date().toISOString().split('T')[0],
    last_working_day: '',
    reason: '',
    remarks: ''
  });

  // Notice info for create modal
  const [noticeInfo, setNoticeInfo] = useState(null);

  // Reject form
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const empParams = { status: 'active' };
      if (propOutletId) empParams.outlet_id = propOutletId;
      const [resRes, empRes] = await Promise.all([
        resignationsApi.getAll(filter),
        employeeApi.getAll(empParams)
      ]);
      setResignations(resRes.data);
      setEmployees(empRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-calculate notice period when employee is selected
  const handleEmployeeSelect = (empId) => {
    setForm({ ...form, employee_id: empId });
    if (!empId) {
      setNoticeInfo(null);
      return;
    }
    const emp = employees.find(e => e.id === parseInt(empId));
    if (emp && emp.join_date) {
      const joinDate = new Date(emp.join_date);
      const now = new Date();
      const serviceMonths = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
      let noticeDays;
      if (serviceMonths < 24) noticeDays = 28;
      else if (serviceMonths < 60) noticeDays = 42;
      else noticeDays = 56;

      const serviceYears = Math.floor(serviceMonths / 12);
      const serviceRemMonths = serviceMonths % 12;

      // Recommend last working day
      const recommendedLwd = new Date(form.notice_date || new Date());
      recommendedLwd.setDate(recommendedLwd.getDate() + noticeDays);
      const recommendedLwdStr = recommendedLwd.toISOString().split('T')[0];

      setNoticeInfo({
        notice_days: noticeDays,
        service: `${serviceYears}y ${serviceRemMonths}m`,
        recommended_lwd: recommendedLwdStr,
        description: serviceMonths < 24
          ? '4 weeks (less than 2 years service)'
          : serviceMonths < 60
            ? '6 weeks (2-5 years service)'
            : '8 weeks (5+ years service)'
      });

      // Auto-fill last working day if empty
      if (!form.last_working_day) {
        setForm(prev => ({ ...prev, employee_id: empId, last_working_day: recommendedLwdStr }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await resignationsApi.create(form);
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create resignation');
    }
  };

  const handleViewDetails = async (id) => {
    try {
      const res = await resignationsApi.getOne(id);
      setSelectedResignation(res.data);
      setDetailsTab('overview');
      setClearanceData(null);
      setSettlementData(null);
      setLeaveEntitlement(null);
      setShowDetailsModal(true);
    } catch (error) {
      alert('Failed to fetch resignation details');
    }
  };

  // Approval actions
  const handleApprove = async (id) => {
    if (!window.confirm('Approve this resignation? This will start the exit clearance process.')) return;
    try {
      await resignationsApi.approve(id);
      fetchData();
      if (showDetailsModal) {
        const res = await resignationsApi.getOne(id);
        setSelectedResignation(res.data);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve resignation');
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    try {
      await resignationsApi.reject(selectedResignation.id, { rejection_reason: rejectionReason });
      setShowRejectModal(false);
      setRejectionReason('');
      fetchData();
      if (showDetailsModal) setShowDetailsModal(false);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reject resignation');
    }
  };

  const handleWithdraw = async (id) => {
    if (!window.confirm('Withdraw this resignation?')) return;
    try {
      await resignationsApi.withdraw(id);
      fetchData();
      if (showDetailsModal) setShowDetailsModal(false);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to withdraw resignation');
    }
  };

  const handleCancel = async (id) => {
    if (window.confirm('Cancel this resignation? The employee will be reverted to active.')) {
      try {
        await resignationsApi.cancel(id);
        fetchData();
        if (showDetailsModal) setShowDetailsModal(false);
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to cancel resignation');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this resignation record permanently?')) {
      try {
        await resignationsApi.delete(id);
        fetchData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete resignation');
      }
    }
  };

  // Clearance
  const loadClearance = useCallback(async (id) => {
    setLoadingClearance(true);
    try {
      const res = await resignationsApi.getClearance(id);
      setClearanceData(res.data);
    } catch (error) {
      console.error('Error loading clearance:', error);
    } finally {
      setLoadingClearance(false);
    }
  }, []);

  const handleToggleClearanceItem = async (itemId, isCompleted, remarks) => {
    if (!selectedResignation) return;
    try {
      await resignationsApi.updateClearanceItem(selectedResignation.id, itemId, {
        is_completed: !isCompleted,
        remarks
      });
      loadClearance(selectedResignation.id);
      // Refresh the main resignation data too
      const res = await resignationsApi.getOne(selectedResignation.id);
      setSelectedResignation(res.data);
    } catch (error) {
      alert('Failed to update clearance item');
    }
  };

  // Settlement
  const loadSettlement = async (id, waiveNotice = false) => {
    setLoadingSettlement(true);
    try {
      const res = await resignationsApi.getSettlement(id, { waive_notice: waiveNotice });
      setSettlementData(res.data);
    } catch (error) {
      console.error('Error loading settlement:', error);
      alert('Failed to calculate settlement');
    } finally {
      setLoadingSettlement(false);
    }
  };

  // Leave entitlement
  const loadLeaveEntitlement = async (id) => {
    setLoadingLeave(true);
    try {
      const res = await resignationsApi.getLeaveEntitlement(id);
      setLeaveEntitlement(res.data);
    } catch (error) {
      console.error('Error loading leave entitlement:', error);
    } finally {
      setLoadingLeave(false);
    }
  };

  const handleWaiveNotice = async () => {
    if (!selectedResignation) return;
    const newWaive = !selectedResignation.notice_waived;
    try {
      await resignationsApi.waiveNotice(selectedResignation.id, { waive: newWaive });
      const res = await resignationsApi.getOne(selectedResignation.id);
      setSelectedResignation(res.data);
      // Recalculate settlement with new waive state
      loadSettlement(selectedResignation.id, newWaive);
    } catch (error) {
      alert('Failed to update notice waiver');
    }
  };

  // Process final pay
  const handleProcessFinalPay = async () => {
    if (!selectedResignation || !settlementData) return;
    if (!window.confirm('Process final pay and complete exit? This will set the employee status to exited.')) return;
    try {
      await resignationsApi.process(selectedResignation.id, {
        final_salary_amount: settlementData.final_amount,
        settlement_date: new Date().toISOString().split('T')[0],
        override_clearance: false
      });
      setShowDetailsModal(false);
      fetchData();
      alert('Exit process completed. Employee status updated to exited.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to process exit');
    }
  };

  const handlePrintSummary = () => {
    window.print();
  };

  const resetForm = () => {
    setForm({
      employee_id: '',
      notice_date: new Date().toISOString().split('T')[0],
      last_working_day: '',
      reason: '',
      remarks: ''
    });
    setNoticeInfo(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    const classes = {
      pending: 'status-badge pending',
      clearing: 'status-badge clearing',
      completed: 'status-badge completed',
      cancelled: 'status-badge cancelled',
      rejected: 'status-badge rejected',
      withdrawn: 'status-badge withdrawn'
    };
    return <span className={classes[status] || 'status-badge'}>{status}</span>;
  };

  const getDaysUntilExit = (lastDay) => {
    const today = new Date();
    const exitDate = new Date(lastDay);
    const diffTime = exitDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Stats counts
  const statusCounts = {
    pending: resignations.filter(r => r.status === 'pending').length,
    clearing: resignations.filter(r => r.status === 'clearing').length,
    completed: resignations.filter(r => r.status === 'completed').length,
    rejected: resignations.filter(r => r.status === 'rejected').length,
  };

  const content = (
      <div className="resignations-page">
        {!embedded && (
        <header className="page-header">
          <div>
            <h1>Resignations</h1>
            <p>Manage employee resignations, exit clearance and final settlement</p>
          </div>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="add-btn">
            + New Resignation
          </button>
        </header>
        )}
        {embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="add-btn">
            + New Resignation
          </button>
        </div>
        )}

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-box" onClick={() => setFilter({ ...filter, status: 'pending' })} style={{ cursor: 'pointer' }}>
            <span className="stat-num">{statusCounts.pending}</span>
            <span className="stat-text">Pending</span>
          </div>
          <div className="stat-box stat-clearing" onClick={() => setFilter({ ...filter, status: 'clearing' })} style={{ cursor: 'pointer' }}>
            <span className="stat-num">{statusCounts.clearing}</span>
            <span className="stat-text">Clearing</span>
          </div>
          <div className="stat-box highlight" onClick={() => setFilter({ ...filter, status: 'completed' })} style={{ cursor: 'pointer' }}>
            <span className="stat-num">{statusCounts.completed}</span>
            <span className="stat-text">Completed</span>
          </div>
          <div className="stat-box" onClick={() => setFilter({ ...filter, status: 'rejected' })} style={{ cursor: 'pointer' }}>
            <span className="stat-num">{statusCounts.rejected}</span>
            <span className="stat-text">Rejected</span>
          </div>
        </div>

        {/* Filter */}
        <div className="filters-row">
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="clearing">Clearing</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Resignations List */}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="resignation-cards">
            {resignations.length === 0 ? (
              <div className="no-data">No resignations found</div>
            ) : (
              resignations.map(r => {
                const daysLeft = getDaysUntilExit(r.last_working_day);
                const clearanceProgress = r.clearance_total > 0
                  ? Math.round((parseInt(r.clearance_done || 0) / parseInt(r.clearance_total)) * 100)
                  : null;

                return (
                  <div key={r.id} className="resignation-card">
                    <div className="card-header">
                      <div>
                        <h3>{r.employee_name}</h3>
                        <p className="emp-info">{r.emp_code} - {isMimix ? (r.outlet_name || 'No Outlet') : (r.department_name || 'No Dept')}</p>
                      </div>
                      {getStatusBadge(r.status)}
                    </div>

                    <div className="card-details">
                      <div className="detail-row">
                        <span>Notice Date:</span>
                        <strong>{formatDate(r.notice_date)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Last Working Day:</span>
                        <strong>{formatDate(r.last_working_day)}</strong>
                      </div>
                      {r.required_notice_days && (
                        <div className="detail-row">
                          <span>Notice Period:</span>
                          <strong>{r.actual_notice_days || 0}d / {r.required_notice_days}d required</strong>
                        </div>
                      )}
                      {(r.status === 'pending' || r.status === 'clearing') && (
                        <div className="detail-row">
                          <span>Days Until Exit:</span>
                          <strong className={daysLeft <= 7 ? 'urgent' : ''}>
                            {daysLeft > 0 ? `${daysLeft} days` : daysLeft === 0 ? 'Today' : 'Overdue'}
                          </strong>
                        </div>
                      )}
                      {clearanceProgress !== null && (
                        <div className="detail-row">
                          <span>Clearance:</span>
                          <div className="clearance-progress-inline">
                            <div className="progress-bar-mini">
                              <div className="progress-fill-mini" style={{ width: `${clearanceProgress}%` }}></div>
                            </div>
                            <strong>{r.clearance_done}/{r.clearance_total}</strong>
                          </div>
                        </div>
                      )}
                      {r.reason && (
                        <div className="detail-row reason">
                          <span>Reason:</span>
                          <p>{r.reason}</p>
                        </div>
                      )}
                    </div>

                    <div className="card-actions">
                      <button onClick={() => handleViewDetails(r.id)} className="action-btn view">
                        View Details
                      </button>
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(r.id)} className="action-btn approve">
                            Approve
                          </button>
                          <button onClick={() => { setSelectedResignation(r); setRejectionReason(''); setShowRejectModal(true); }} className="action-btn reject-btn">
                            Reject
                          </button>
                          <button onClick={() => handleWithdraw(r.id)} className="action-btn cancel">
                            Withdraw
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="action-btn delete">
                            Delete
                          </button>
                        </>
                      )}
                      {r.status === 'clearing' && (
                        <button onClick={() => handleCancel(r.id)} className="action-btn cancel">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Create Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>New Resignation</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={form.employee_id}
                    onChange={(e) => handleEmployeeSelect(e.target.value)}
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                    ))}
                  </select>
                </div>

                {noticeInfo && (
                  <div className="notice-info-box">
                    <strong>Notice Period: {noticeInfo.notice_days} days</strong>
                    <p>{noticeInfo.description}</p>
                    <p>Service: {noticeInfo.service}</p>
                    <p>Recommended last day: {formatDate(noticeInfo.recommended_lwd)}</p>
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>Notice Date *</label>
                    <input
                      type="date"
                      value={form.notice_date}
                      onChange={(e) => setForm({ ...form, notice_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Working Day *</label>
                    <input
                      type="date"
                      value={form.last_working_day}
                      onChange={(e) => setForm({ ...form, last_working_day: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason</label>
                  <select
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  >
                    <option value="">Select reason</option>
                    <option value="Personal reasons">Personal reasons</option>
                    <option value="Career advancement">Career advancement</option>
                    <option value="Better opportunity">Better opportunity</option>
                    <option value="Relocation">Relocation</option>
                    <option value="Health reasons">Health reasons</option>
                    <option value="Family reasons">Family reasons</option>
                    <option value="Retirement">Retirement</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    rows="3"
                    placeholder="Additional notes"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Create Resignation</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedResignation && (
          <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Reject Resignation</h2>
              <p style={{ color: '#64748b', marginBottom: 15 }}>
                Rejecting resignation for <strong>{selectedResignation.employee_name}</strong>
              </p>
              <div className="form-group">
                <label>Rejection Reason *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows="3"
                  placeholder="Provide reason for rejection"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowRejectModal(false)} className="cancel-btn">
                  Cancel
                </button>
                <button type="button" onClick={handleReject} className="save-btn" style={{ background: '#ef4444' }}>
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Details Modal (Tabbed) */}
        {showDetailsModal && selectedResignation && (
          <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
            <div className="modal xlarge" onClick={(e) => e.stopPropagation()}>
              <div className="details-modal-header">
                <h2>{selectedResignation.employee_name}</h2>
                <div className="details-header-meta">
                  <span className="emp-code">{selectedResignation.emp_code}</span>
                  {getStatusBadge(selectedResignation.status)}
                </div>
              </div>

              {/* Tabs */}
              <div className="details-tabs">
                <button
                  className={`tab-btn ${detailsTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setDetailsTab('overview')}
                >
                  Overview
                </button>
                {(selectedResignation.status === 'clearing' || selectedResignation.status === 'completed') && (
                  <button
                    className={`tab-btn ${detailsTab === 'clearance' ? 'active' : ''}`}
                    onClick={() => { setDetailsTab('clearance'); loadClearance(selectedResignation.id); }}
                  >
                    Clearance
                  </button>
                )}
                <button
                  className={`tab-btn ${detailsTab === 'leave' ? 'active' : ''}`}
                  onClick={() => { setDetailsTab('leave'); loadLeaveEntitlement(selectedResignation.id); }}
                >
                  Leave
                </button>
                <button
                  className={`tab-btn ${detailsTab === 'settlement' ? 'active' : ''}`}
                  onClick={() => { setDetailsTab('settlement'); loadSettlement(selectedResignation.id, selectedResignation.notice_waived); }}
                >
                  Settlement
                </button>
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {/* Overview Tab */}
                {detailsTab === 'overview' && (
                  <div className="details-content">
                    <div className="detail-section">
                      <h4>Employee Information</h4>
                      <div className="info-grid">
                        <div><span>Name:</span><strong>{selectedResignation.employee_name}</strong></div>
                        <div><span>ID:</span><strong>{selectedResignation.emp_code}</strong></div>
                        <div><span>{isMimix ? 'Outlet' : 'Department'}:</span><strong>{isMimix ? selectedResignation.outlet_name : selectedResignation.department_name || '-'}</strong></div>
                        <div><span>Basic Salary:</span><strong>{formatAmount(selectedResignation.default_basic_salary)}</strong></div>
                        <div><span>Join Date:</span><strong>{formatDate(selectedResignation.join_date)}</strong></div>
                        <div><span>Employment Status:</span><strong>{selectedResignation.employment_status || '-'}</strong></div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h4>Resignation Timeline</h4>
                      <div className="info-grid">
                        <div><span>Notice Date:</span><strong>{formatDate(selectedResignation.notice_date)}</strong></div>
                        <div><span>Last Working Day:</span><strong>{formatDate(selectedResignation.last_working_day)}</strong></div>
                        <div><span>Status:</span>{getStatusBadge(selectedResignation.status)}</div>
                        <div><span>Reason:</span><strong>{selectedResignation.reason || '-'}</strong></div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h4>Notice Period</h4>
                      <div className="info-grid">
                        <div><span>Required:</span><strong>{selectedResignation.required_notice_days || '-'} days</strong></div>
                        <div><span>Actual:</span><strong>{selectedResignation.actual_notice_days || '-'} days</strong></div>
                        <div>
                          <span>Shortfall:</span>
                          <strong className={(selectedResignation.required_notice_days - selectedResignation.actual_notice_days) > 0 ? 'urgent' : ''}>
                            {Math.max(0, (selectedResignation.required_notice_days || 0) - (selectedResignation.actual_notice_days || 0))} days
                          </strong>
                        </div>
                        <div><span>Notice Waived:</span><strong>{selectedResignation.notice_waived ? 'Yes' : 'No'}</strong></div>
                      </div>
                    </div>

                    {selectedResignation.approved_by_name && (
                      <div className="detail-section">
                        <h4>Approval</h4>
                        <div className="info-grid">
                          <div><span>Approved By:</span><strong>{selectedResignation.approved_by_name}</strong></div>
                          <div><span>Approved At:</span><strong>{formatDate(selectedResignation.approved_at)}</strong></div>
                        </div>
                      </div>
                    )}

                    {selectedResignation.rejection_reason && (
                      <div className="detail-section">
                        <h4>Rejection</h4>
                        <div className="remarks-box" style={{ background: '#fff3f3', borderLeft: '3px solid #ef4444' }}>
                          <p>{selectedResignation.rejection_reason}</p>
                        </div>
                      </div>
                    )}

                    {selectedResignation.remarks && (
                      <div className="remarks-box">
                        <span>Remarks:</span>
                        <p>{selectedResignation.remarks}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Clearance Tab */}
                {detailsTab === 'clearance' && (
                  <div className="clearance-content">
                    {loadingClearance ? (
                      <div className="loading">Loading clearance items...</div>
                    ) : clearanceData ? (
                      <>
                        <div className="clearance-progress">
                          <div className="progress-header">
                            <span>Exit Clearance Progress</span>
                            <strong>{clearanceData.completed}/{clearanceData.total} ({clearanceData.progress}%)</strong>
                          </div>
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${clearanceData.progress}%`,
                                background: clearanceData.progress === 100 ? '#22c55e' : '#3b82f6'
                              }}
                            ></div>
                          </div>
                        </div>

                        {Object.entries(clearanceData.grouped || {}).map(([category, items]) => (
                          <div key={category} className="clearance-category">
                            <h4 className="category-header">{category}</h4>
                            {items.map(item => (
                              <div key={item.id} className={`clearance-item ${item.is_completed ? 'done' : ''}`}>
                                <label className="clearance-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={item.is_completed}
                                    onChange={() => handleToggleClearanceItem(item.id, item.is_completed, item.remarks)}
                                    disabled={selectedResignation.status === 'completed'}
                                  />
                                  <span className="checkmark"></span>
                                  <span className="item-name">{item.item_name}</span>
                                </label>
                                {item.is_completed && item.completed_by_name && (
                                  <span className="item-meta">
                                    by {item.completed_by_name} on {formatDate(item.completed_at)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="no-data">No clearance items found</div>
                    )}
                  </div>
                )}

                {/* Leave Tab */}
                {detailsTab === 'leave' && (
                  <div className="leave-content">
                    {loadingLeave ? (
                      <div className="loading">Loading leave entitlement...</div>
                    ) : leaveEntitlement ? (
                      <>
                        <div className="detail-section">
                          <h4>Leave Entitlement Breakdown</h4>
                          <p style={{ color: '#64748b', fontSize: '0.82rem', marginTop: -10, marginBottom: 12 }}>
                            Reference date: {formatDate(leaveEntitlement.reference_date)} | Completed months: {leaveEntitlement.completed_months}/12
                          </p>
                          <div className="leave-entitlement-table-wrapper">
                            <table className="leave-entitlement-table">
                              <thead>
                                <tr>
                                  <th className="col-left">Leave Type</th>
                                  <th>Last Year B/F</th>
                                  <th>YTD Earned</th>
                                  <th>Adj</th>
                                  <th>Total Entitlement</th>
                                  <th>YTD Taken</th>
                                  <th>Future Taken</th>
                                  <th>Pending</th>
                                  <th>Available Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {leaveEntitlement.leave_types.map(lt => (
                                  <tr key={lt.leave_type_id} className={lt.advance_used > 0 ? 'advance-warning' : ''}>
                                    <td className="col-left">{lt.name} ({lt.code})</td>
                                    <td>{lt.carried_forward}</td>
                                    <td>{lt.ytd_earned} <span className="of-total">/ {lt.full_year_entitlement}</span></td>
                                    <td>{lt.adjustment}</td>
                                    <td><strong>{lt.total_entitlement}</strong></td>
                                    <td>{lt.ytd_taken}</td>
                                    <td>{lt.future_taken}</td>
                                    <td>{lt.pending}</td>
                                    <td><strong>{lt.available_balance}</strong></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="detail-section">
                          <h4>Encashment Summary</h4>
                          <div className="calc-table">
                            {leaveEntitlement.leave_types.filter(lt => lt.is_paid).map(lt => (
                              <div key={lt.leave_type_id} className="calc-row">
                                <span>{lt.name} — encashable</span>
                                <strong>{lt.encashable_days} days</strong>
                              </div>
                            ))}
                            <div className="calc-row subtotal">
                              <span>Total Encashable Days</span>
                              <strong>{leaveEntitlement.summary.total_encashable_days} days</strong>
                            </div>
                          </div>
                        </div>

                        {leaveEntitlement.summary.has_advance_usage && (
                          <div className="advance-warning-box">
                            <strong>Advance Leave Warning</strong>
                            <p>
                              Employee has used {leaveEntitlement.summary.total_advance_used} day(s) of advance (unearned) leave.
                              This may need to be deducted from the final settlement.
                            </p>
                            <div style={{ marginTop: 8 }}>
                              {leaveEntitlement.leave_types.filter(lt => lt.advance_used > 0).map(lt => (
                                <div key={lt.leave_type_id} style={{ fontSize: '0.82rem', color: '#991b1b' }}>
                                  {lt.name}: {lt.advance_used} day(s) advance used (earned {lt.ytd_earned}, used {lt.ytd_taken + lt.future_taken}, B/F {lt.carried_forward})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="no-data">Click the Leave tab to load entitlement details</div>
                    )}
                  </div>
                )}

                {/* Settlement Tab */}
                {detailsTab === 'settlement' && (
                  <div className="settlement-content">
                    {loadingSettlement ? (
                      <div className="loading">Calculating settlement...</div>
                    ) : settlementData ? (
                      <>
                        <div className="settlement-section">
                          <h4>Earnings</h4>
                          <div className="calc-table">
                            <div className="calc-row">
                              <span>
                                Prorated Salary
                                {settlementData.breakdown.prorated_salary.already_paid
                                  ? ' (already paid)'
                                  : ` (${settlementData.breakdown.prorated_salary.working_days_worked}/${settlementData.breakdown.prorated_salary.working_days_in_month} working days)`
                                }
                              </span>
                              <strong>{formatAmount(settlementData.breakdown.prorated_salary.amount)}</strong>
                            </div>
                            <div className="calc-row">
                              <span>Leave Encashment ({settlementData.breakdown.leave_encashment.total_days} days)</span>
                              <strong>{formatAmount(settlementData.breakdown.leave_encashment.amount)}</strong>
                            </div>
                            <div className="calc-row">
                              <span>Pending Claims ({settlementData.breakdown.pending_claims.count} items)</span>
                              <strong>{formatAmount(settlementData.breakdown.pending_claims.amount)}</strong>
                            </div>
                            {settlementData.breakdown.prorated_bonus.enabled && (
                              <div className="calc-row">
                                <span>Prorated Bonus ({settlementData.breakdown.prorated_bonus.months_worked} months)</span>
                                <strong>{formatAmount(settlementData.breakdown.prorated_bonus.amount)}</strong>
                              </div>
                            )}
                            <div className="calc-row subtotal">
                              <span>Gross Settlement</span>
                              <strong>{formatAmount(settlementData.breakdown.totals.gross)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="settlement-section">
                          <h4>Deductions</h4>
                          <div className="calc-table">
                            <div className="calc-row deduction">
                              <span>EPF (Employee)</span>
                              <strong>-{formatAmount(settlementData.breakdown.statutory_deductions.epf_employee)}</strong>
                            </div>
                            <div className="calc-row deduction">
                              <span>SOCSO (Employee)</span>
                              <strong>-{formatAmount(settlementData.breakdown.statutory_deductions.socso_employee)}</strong>
                            </div>
                            <div className="calc-row deduction">
                              <span>EIS (Employee)</span>
                              <strong>-{formatAmount(settlementData.breakdown.statutory_deductions.eis_employee)}</strong>
                            </div>
                            <div className="calc-row deduction">
                              <span>PCB (Tax)</span>
                              <strong>-{formatAmount(settlementData.breakdown.statutory_deductions.pcb)}</strong>
                            </div>
                            {settlementData.breakdown.notice_buyout.shortfall_days > 0 && (
                              <div className="calc-row deduction">
                                <span>
                                  Notice Shortfall ({settlementData.breakdown.notice_buyout.shortfall_days} days)
                                  {settlementData.breakdown.notice_buyout.waived && ' [WAIVED]'}
                                </span>
                                <strong>
                                  {settlementData.breakdown.notice_buyout.waived
                                    ? 'RM 0.00'
                                    : `-${formatAmount(settlementData.breakdown.notice_buyout.amount)}`
                                  }
                                </strong>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Waive Notice Toggle */}
                        {settlementData.breakdown.notice_buyout.shortfall_days > 0 && selectedResignation.status !== 'completed' && (
                          <div className="waive-notice-toggle">
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedResignation.notice_waived || false}
                                onChange={handleWaiveNotice}
                              />
                              Waive Notice Shortfall (RM {parseFloat(settlementData.breakdown.notice_buyout.amount || 0).toFixed(2)})
                            </label>
                          </div>
                        )}

                        <div className="settlement-section">
                          <h4>Employer Contributions (for reference)</h4>
                          <div className="calc-table">
                            <div className="calc-row employer">
                              <span>EPF (Employer)</span>
                              <strong>{formatAmount(settlementData.breakdown.statutory_deductions.epf_employer)}</strong>
                            </div>
                            <div className="calc-row employer">
                              <span>SOCSO (Employer)</span>
                              <strong>{formatAmount(settlementData.breakdown.statutory_deductions.socso_employer)}</strong>
                            </div>
                            <div className="calc-row employer">
                              <span>EIS (Employer)</span>
                              <strong>{formatAmount(settlementData.breakdown.statutory_deductions.eis_employer)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="settlement-section">
                          <div className="calc-table">
                            <div className="calc-row total">
                              <span>Net Final Settlement</span>
                              <strong>{formatAmount(settlementData.breakdown.totals.net)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="settlement-actions">
                          <button onClick={handlePrintSummary} className="action-btn view">
                            Print Summary
                          </button>
                          {selectedResignation.status === 'clearing' && (
                            <button
                              onClick={handleProcessFinalPay}
                              className="save-btn process"
                              disabled={!selectedResignation.clearance_completed && selectedResignation.status === 'clearing'}
                              title={!selectedResignation.clearance_completed ? 'Complete all clearance items first' : 'Process final pay'}
                            >
                              {selectedResignation.clearance_completed
                                ? 'Process Final Pay'
                                : 'Clearance Incomplete'
                              }
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="no-data">
                        <p>Click the Settlement tab to calculate</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action bar */}
              <div className="modal-actions">
                {selectedResignation.status === 'pending' && (
                  <>
                    <button onClick={() => handleApprove(selectedResignation.id)} className="save-btn" style={{ background: '#22c55e' }}>
                      Approve
                    </button>
                    <button onClick={() => { setRejectionReason(''); setShowRejectModal(true); }} className="save-btn" style={{ background: '#ef4444' }}>
                      Reject
                    </button>
                    <button onClick={() => handleWithdraw(selectedResignation.id)} className="cancel-btn">
                      Withdraw
                    </button>
                  </>
                )}
                {selectedResignation.status === 'clearing' && (
                  <button onClick={() => handleCancel(selectedResignation.id)} className="cancel-btn">
                    Cancel Resignation
                  </button>
                )}
                <button onClick={() => setShowDetailsModal(false)} className="cancel-btn">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
}

export default Resignations;
