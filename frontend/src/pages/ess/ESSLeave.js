import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { canViewTeamLeave } from '../../utils/permissions';
import './ESSLeave.css';

function ESSLeave() {
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [teamPending, setTeamPending] = useState([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('balance');

  // Get employee info from localStorage
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const showTeamTab = canViewTeamLeave(employeeInfo);

  const [form, setForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const promises = [
        essApi.getLeaveBalance(),
        essApi.getLeaveHistory({}),
        essApi.getLeaveTypes()
      ];

      // Only fetch team pending if user is supervisor/manager
      if (showTeamTab) {
        promises.push(essApi.getTeamPendingLeave());
      }

      const results = await Promise.all(promises);
      setBalances(results[0].data);
      setHistory(results[1].data);
      setLeaveTypes(results[2].data);

      if (showTeamTab && results[3]) {
        setTeamPending(results[3].data);
      }
    } catch (error) {
      console.error('Error fetching leave data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    if (!window.confirm('Approve this leave request?')) return;

    try {
      setSubmitting(true);
      await essApi.approveLeave(requestId);
      alert('Leave request approved');
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve leave');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      setSubmitting(true);
      await essApi.rejectLeave(selectedRequest.id, rejectReason);
      alert('Leave request rejected');
      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectReason('');
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reject leave');
    } finally {
      setSubmitting(false);
    }
  };

  const openRejectModal = (request) => {
    setSelectedRequest(request);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await essApi.applyLeave(form);
      setShowApplyModal(false);
      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      fetchData();
      alert('Leave application submitted successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit leave application');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusClass = (status) => {
    const classes = {
      pending: 'status-pending',
      approved: 'status-approved',
      rejected: 'status-rejected',
      cancelled: 'status-cancelled'
    };
    return classes[status] || '';
  };

  return (
    <ESSLayout>
      <div className="ess-leave-page">
        {/* Page Header */}
        <div className="ess-page-header">
          <div className="header-content">
            <h1>Leave</h1>
            <p>Manage your leave balance and applications</p>
          </div>
          <button className="apply-btn" onClick={() => setShowApplyModal(true)}>
            + Apply
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="ess-tabs">
          <button
            className={`tab-btn ${activeTab === 'balance' ? 'active' : ''}`}
            onClick={() => setActiveTab('balance')}
          >
            Balance
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          {showTeamTab && (
            <button
              className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
              onClick={() => setActiveTab('team')}
            >
              Team
              {teamPending.length > 0 && (
                <span className="tab-badge">{teamPending.length}</span>
              )}
            </button>
          )}
        </div>

        {loading ? (
          <div className="ess-loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {/* Balance Tab */}
            {activeTab === 'balance' && (
              <div className="balance-section">
                {balances.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">&#x1F4C5;</span>
                    <p>No leave balance data available</p>
                  </div>
                ) : (
                  <div className="balance-cards">
                    {balances.map((balance, idx) => (
                      <div key={idx} className="balance-card">
                        <div className="balance-header">
                          <span className="leave-code">{balance.code}</span>
                          <span className="leave-name">{balance.leave_type_name}</span>
                        </div>
                        <div className="balance-stats">
                          <div className="stat">
                            <span className="stat-value">
                              {parseFloat(balance.entitled_days) + parseFloat(balance.carried_forward || 0)}
                            </span>
                            <span className="stat-label">Entitled</span>
                          </div>
                          <div className="stat">
                            <span className="stat-value used">{balance.used_days}</span>
                            <span className="stat-label">Used</span>
                          </div>
                          <div className="stat">
                            <span className="stat-value available">
                              {parseFloat(balance.entitled_days) + parseFloat(balance.carried_forward || 0) - parseFloat(balance.used_days)}
                            </span>
                            <span className="stat-label">Available</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="history-section">
                {history.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">&#x1F4DD;</span>
                    <p>No leave history found</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map((item, idx) => (
                      <div key={idx} className="history-card">
                        <div className="history-main">
                          <div className="history-type">
                            <span className="type-code">{item.code}</span>
                            <span className="type-name">{item.leave_type_name}</span>
                          </div>
                          <div className="history-dates">
                            {formatDate(item.start_date)} - {formatDate(item.end_date)}
                          </div>
                          <div className="history-days">{item.total_days} day(s)</div>
                          {item.reason && (
                            <div className="history-reason">{item.reason}</div>
                          )}
                        </div>
                        <div className={`history-status ${getStatusClass(item.status)}`}>
                          {item.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Team Leave Tab (Supervisor/Manager only) */}
            {activeTab === 'team' && showTeamTab && (
              <div className="team-section">
                {teamPending.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">&#x2705;</span>
                    <p>No pending leave requests to approve</p>
                  </div>
                ) : (
                  <div className="team-list">
                    {teamPending.map((request) => (
                      <div key={request.id} className="team-card">
                        <div className="team-employee">
                          <span className="employee-name">{request.employee_name}</span>
                          <span className="employee-outlet">{request.outlet_name}</span>
                        </div>
                        <div className="team-leave-info">
                          <div className="leave-type">
                            <span className="type-code">{request.code}</span>
                            <span className="type-name">{request.leave_type_name}</span>
                          </div>
                          <div className="leave-dates">
                            {formatDate(request.start_date)} - {formatDate(request.end_date)}
                          </div>
                          <div className="leave-days">{request.total_days} day(s)</div>
                          {request.reason && (
                            <div className="leave-reason">{request.reason}</div>
                          )}
                        </div>
                        <div className="team-actions">
                          <button
                            className="approve-btn"
                            onClick={() => handleApprove(request.id)}
                            disabled={submitting}
                          >
                            Approve
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() => openRejectModal(request)}
                            disabled={submitting}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Apply Leave Modal */}
        {showApplyModal && (
          <div className="ess-modal-overlay" onClick={() => setShowApplyModal(false)}>
            <div className="ess-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Apply for Leave</h2>
                <button className="close-btn" onClick={() => setShowApplyModal(false)}>&#x2715;</button>
              </div>
              <form onSubmit={handleApply}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Leave Type</label>
                    <select
                      value={form.leave_type_id}
                      onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
                      required
                    >
                      <option value="">Select leave type</option>
                      {leaveTypes.map(type => (
                        <option key={type.id} value={type.id}>
                          {type.code} - {type.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Start Date</label>
                      <input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>End Date</label>
                      <input
                        type="date"
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        min={form.start_date}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Reason (Optional)</label>
                    <textarea
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="Enter reason for leave"
                      rows="3"
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="cancel-btn" onClick={() => setShowApplyModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reject Leave Modal */}
        {showRejectModal && selectedRequest && (
          <div className="ess-modal-overlay" onClick={() => setShowRejectModal(false)}>
            <div className="ess-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Reject Leave Request</h2>
                <button className="close-btn" onClick={() => setShowRejectModal(false)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                <p className="reject-info">
                  Rejecting leave request from <strong>{selectedRequest.employee_name}</strong>
                  <br />
                  {formatDate(selectedRequest.start_date)} - {formatDate(selectedRequest.end_date)} ({selectedRequest.total_days} day(s))
                </p>
                <div className="form-group">
                  <label>Rejection Reason *</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter reason for rejection"
                    rows="3"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="cancel-btn" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="reject-submit-btn"
                  onClick={handleReject}
                  disabled={submitting || !rejectReason.trim()}
                >
                  {submitting ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSLeave;
