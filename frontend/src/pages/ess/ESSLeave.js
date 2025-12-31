import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { canViewTeamLeave } from '../../utils/permissions';
import './ESSLeave.css';

function ESSLeave() {
  const [loading, setLoading] = useState(true);
  const [balanceData, setBalanceData] = useState({ year: null, years_of_service: 0, balances: [] });
  const [history, setHistory] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [teamPending, setTeamPending] = useState([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showMCModal, setShowMCModal] = useState(false);
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
    reason: '',
    half_day: '',
    child_number: ''
  });
  const [mcFile, setMcFile] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const promises = [
        essApi.getLeaveBalance(),
        essApi.getLeaveHistory({}),
        essApi.getLeaveTypes()
      ];

      if (showTeamTab) {
        promises.push(essApi.getTeamPendingLeave());
      }

      const results = await Promise.all(promises);
      setBalanceData(results[0].data);
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
  }, [showTeamTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get selected leave type details
  const selectedLeaveType = useMemo(() => {
    if (!form.leave_type_id) return null;
    return leaveTypes.find(t => t.id === parseInt(form.leave_type_id));
  }, [form.leave_type_id, leaveTypes]);

  // Get balance for selected leave type
  const selectedBalance = useMemo(() => {
    if (!form.leave_type_id) return null;
    return balanceData.balances?.find(b => b.leave_type_id === parseInt(form.leave_type_id));
  }, [form.leave_type_id, balanceData.balances]);

  // Calculate days between dates
  const calculateDays = useCallback((startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) return 0;

    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0) { // Exclude Sunday
        days++;
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, []);

  const estimatedDays = useMemo(() => {
    const days = calculateDays(form.start_date, form.end_date);
    if (form.half_day && days === 1) return 0.5;
    return days;
  }, [form.start_date, form.end_date, form.half_day, calculateDays]);

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

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Cancel this leave request?')) return;

    try {
      await essApi.cancelLeaveRequest(requestId);
      alert('Leave request cancelled');
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to cancel leave request');
    }
  };

  const openRejectModal = (request) => {
    setSelectedRequest(request);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const openMCModal = (request) => {
    setSelectedRequest(request);
    setShowMCModal(true);
  };

  const handleApply = async (e) => {
    e.preventDefault();

    // Check if MC is required but not provided
    if (selectedLeaveType?.requires_attachment && !mcFile) {
      alert('Medical Certificate (MC) is required for this leave type');
      return;
    }

    // Check balance
    if (selectedBalance && selectedLeaveType?.is_paid) {
      const available = parseFloat(selectedBalance.balance || 0);
      if (estimatedDays > available) {
        alert(`Insufficient leave balance. Available: ${available} days, Requested: ${estimatedDays} days`);
        return;
      }
    }

    setSubmitting(true);

    try {
      // Create form data for file upload
      const formData = new FormData();
      formData.append('leave_type_id', form.leave_type_id);
      formData.append('start_date', form.start_date);
      formData.append('end_date', form.end_date);
      formData.append('reason', form.reason);
      if (form.half_day) formData.append('half_day', form.half_day);
      if (form.child_number) formData.append('child_number', form.child_number);
      if (mcFile) formData.append('mc_file', mcFile);

      await essApi.applyLeaveWithFile(formData);
      setShowApplyModal(false);
      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '', half_day: '', child_number: '' });
      setMcFile(null);
      fetchData();
      alert('Leave application submitted successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit leave application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      setMcFile(file);
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

  // Main leave types for quick cards
  const mainBalances = useMemo(() => {
    const codes = ['AL', 'SL', 'HL'];
    return balanceData.balances?.filter(b => codes.includes(b.code)) || [];
  }, [balanceData.balances]);

  // Other leave types for table
  const allBalances = useMemo(() => {
    return balanceData.balances || [];
  }, [balanceData.balances]);

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
            + Apply Leave
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
                {/* Service Years Info */}
                {balanceData.years_of_service > 0 && (
                  <div className="service-info">
                    <span className="service-years">
                      {Math.floor(balanceData.years_of_service)} year{Math.floor(balanceData.years_of_service) !== 1 ? 's' : ''} of service
                    </span>
                    <span className="service-year">Year {balanceData.year}</span>
                  </div>
                )}

                {/* Quick Balance Cards */}
                <div className="quick-balance-cards">
                  {mainBalances.map((balance) => (
                    <div key={balance.id} className={`quick-card ${balance.code.toLowerCase()}`}>
                      <div className="quick-card-header">
                        <span className="quick-card-icon">
                          {balance.code === 'AL' ? '🏖️' : balance.code === 'SL' ? '🏥' : '🏨'}
                        </span>
                        <span className="quick-card-name">{balance.leave_type_name}</span>
                      </div>
                      <div className="quick-card-balance">
                        <span className="balance-current">{parseFloat(balance.balance || 0)}</span>
                        <span className="balance-separator">/</span>
                        <span className="balance-total">{parseFloat(balance.entitled_days)}</span>
                      </div>
                      <div className="quick-card-label">days left</div>
                    </div>
                  ))}
                </div>

                {/* Full Balance Table */}
                <div className="balance-table-container">
                  <h3>Leave Balance Details</h3>
                  <table className="balance-table">
                    <thead>
                      <tr>
                        <th>Leave Type</th>
                        <th>Entitled</th>
                        <th>Used</th>
                        <th>Balance</th>
                        <th>C/F</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBalances.map((balance) => (
                        <tr key={balance.id}>
                          <td>
                            <span className="leave-code-badge">{balance.code}</span>
                            {balance.leave_type_name}
                            {balance.requires_attachment && (
                              <span className="mc-required-badge" title="MC Required">MC</span>
                            )}
                          </td>
                          <td>{parseFloat(balance.entitled_days)}</td>
                          <td className="used">{parseFloat(balance.used_days)}</td>
                          <td className="balance">{parseFloat(balance.balance || 0)}</td>
                          <td>{parseFloat(balance.carried_forward || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="history-section">
                {history.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📋</span>
                    <p>No leave history found</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {history.map((item) => (
                      <div key={item.id} className="history-card">
                        <div className="history-main">
                          <div className="history-type">
                            <span className="type-code">{item.code}</span>
                            <span className="type-name">{item.leave_type_name}</span>
                            {item.mc_url && (
                              <button
                                className="mc-view-btn"
                                onClick={() => window.open(item.mc_url, '_blank')}
                                title="View MC"
                              >
                                📄 MC
                              </button>
                            )}
                          </div>
                          <div className="history-dates">
                            📅 {formatDate(item.start_date)} - {formatDate(item.end_date)}
                          </div>
                          <div className="history-days">{item.total_days} day(s)</div>
                          {item.reason && (
                            <div className="history-reason">💬 {item.reason}</div>
                          )}
                          {item.rejection_reason && (
                            <div className="history-rejection">❌ Rejected: {item.rejection_reason}</div>
                          )}
                        </div>
                        <div className="history-actions">
                          <span className={`history-status ${getStatusClass(item.status)}`}>
                            {item.status}
                          </span>
                          {item.status === 'pending' && (
                            <button
                              className="cancel-btn-small"
                              onClick={() => handleCancelRequest(item.id)}
                            >
                              Cancel
                            </button>
                          )}
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
                    <span className="empty-icon">✅</span>
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
                            {request.mc_url && (
                              <button
                                className="mc-view-btn"
                                onClick={() => openMCModal(request)}
                                title="View MC"
                              >
                                📄 View MC
                              </button>
                            )}
                          </div>
                          <div className="leave-dates">
                            📅 {formatDate(request.start_date)} - {formatDate(request.end_date)}
                          </div>
                          <div className="leave-days">{request.total_days} day(s)</div>
                          {request.reason && (
                            <div className="leave-reason">💬 {request.reason}</div>
                          )}
                        </div>
                        <div className="team-actions">
                          <button
                            className="approve-btn"
                            onClick={() => handleApprove(request.id)}
                            disabled={submitting}
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() => openRejectModal(request)}
                            disabled={submitting}
                          >
                            ✗ Reject
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
            <div className="ess-modal apply-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Apply for Leave</h2>
                <button className="close-btn" onClick={() => setShowApplyModal(false)}>×</button>
              </div>
              <form onSubmit={handleApply}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Leave Type *</label>
                    <select
                      value={form.leave_type_id}
                      onChange={(e) => {
                        setForm({ ...form, leave_type_id: e.target.value, child_number: '' });
                        setMcFile(null);
                      }}
                      required
                    >
                      <option value="">Select leave type</option>
                      {leaveTypes.filter(t => t.eligible !== false).map(type => (
                        <option key={type.id} value={type.id}>
                          {type.code} - {type.name}
                          {type.requires_attachment ? ' (MC Required)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Leave type info */}
                  {selectedLeaveType && (
                    <div className="leave-type-info">
                      {selectedLeaveType.is_consecutive && (
                        <div className="info-badge consecutive">
                          ⓘ This leave must be taken consecutively
                        </div>
                      )}
                      {selectedLeaveType.max_occurrences && (
                        <div className="info-badge occurrence">
                          ⓘ Limited to {selectedLeaveType.max_occurrences} times in career
                        </div>
                      )}
                    </div>
                  )}

                  {/* Balance Info */}
                  {selectedBalance && (
                    <div className={`balance-info ${parseFloat(selectedBalance.balance || 0) <= 0 ? 'no-balance' : ''}`}>
                      <span className="balance-label">Available Balance:</span>
                      <span className="balance-value">{parseFloat(selectedBalance.balance || 0)} days</span>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-group">
                      <label>Start Date *</label>
                      <input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>End Date *</label>
                      <input
                        type="date"
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        min={form.start_date || new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                  </div>

                  {/* Half Day Option */}
                  {estimatedDays === 1 && !selectedLeaveType?.is_consecutive && (
                    <div className="form-group">
                      <label>Half Day (Optional)</label>
                      <select
                        value={form.half_day}
                        onChange={(e) => setForm({ ...form, half_day: e.target.value })}
                      >
                        <option value="">Full Day</option>
                        <option value="AM">Morning (AM)</option>
                        <option value="PM">Afternoon (PM)</option>
                      </select>
                    </div>
                  )}

                  {/* Child Number for Maternity/Paternity */}
                  {selectedLeaveType && ['MAT', 'PAT'].includes(selectedLeaveType.code) && (
                    <div className="form-group">
                      <label>Child Number *</label>
                      <select
                        value={form.child_number}
                        onChange={(e) => setForm({ ...form, child_number: e.target.value })}
                        required
                      >
                        <option value="">Select child number</option>
                        <option value="1">1st Child</option>
                        <option value="2">2nd Child</option>
                        <option value="3">3rd Child</option>
                        <option value="4">4th Child</option>
                        <option value="5">5th Child</option>
                      </select>
                    </div>
                  )}

                  {/* Days Summary */}
                  {estimatedDays > 0 && (
                    <div className="days-summary">
                      <span className="days-label">Total Days:</span>
                      <span className="days-value">{estimatedDays} day{estimatedDays !== 1 ? 's' : ''}</span>
                    </div>
                  )}

                  {/* MC Upload for Sick Leave */}
                  {selectedLeaveType?.requires_attachment && (
                    <div className="form-group mc-upload-group">
                      <label>
                        Medical Certificate (MC) *
                        <span className="required-note">Required for {selectedLeaveType.name}</span>
                      </label>
                      <div className="mc-upload-wrapper">
                        <input
                          type="file"
                          id="mc-file"
                          accept=".jpg,.jpeg,.png,.pdf"
                          onChange={handleFileChange}
                          required={selectedLeaveType.requires_attachment}
                        />
                        <label htmlFor="mc-file" className="mc-upload-label">
                          {mcFile ? (
                            <>📄 {mcFile.name}</>
                          ) : (
                            <>📤 Click to upload MC (JPG, PNG, PDF - max 5MB)</>
                          )}
                        </label>
                      </div>
                    </div>
                  )}

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
                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={submitting || (selectedLeaveType?.requires_attachment && !mcFile)}
                  >
                    {submitting ? 'Submitting...' : 'Submit Application'}
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
                <button className="close-btn" onClick={() => setShowRejectModal(false)}>×</button>
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
                  {submitting ? 'Rejecting...' : 'Reject Leave'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MC Viewer Modal */}
        {showMCModal && selectedRequest && (
          <div className="ess-modal-overlay" onClick={() => setShowMCModal(false)}>
            <div className="ess-modal mc-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Medical Certificate</h2>
                <button className="close-btn" onClick={() => setShowMCModal(false)}>×</button>
              </div>
              <div className="modal-body mc-viewer">
                <div className="mc-info">
                  <p><strong>Employee:</strong> {selectedRequest.employee_name}</p>
                  <p><strong>Leave:</strong> {selectedRequest.leave_type_name}</p>
                  <p><strong>Dates:</strong> {formatDate(selectedRequest.start_date)} - {formatDate(selectedRequest.end_date)}</p>
                </div>
                {selectedRequest.mc_url ? (
                  <div className="mc-preview">
                    {selectedRequest.mc_url.toLowerCase().endsWith('.pdf') ? (
                      <a
                        href={selectedRequest.mc_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pdf-link"
                      >
                        📄 Click to open PDF
                      </a>
                    ) : (
                      <img
                        src={selectedRequest.mc_url}
                        alt="Medical Certificate"
                        className="mc-image"
                      />
                    )}
                  </div>
                ) : (
                  <div className="no-mc">No MC uploaded</div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowMCModal(false)}
                >
                  Close
                </button>
                {selectedRequest.mc_url && (
                  <a
                    href={selectedRequest.mc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="submit-btn"
                  >
                    Open in New Tab
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSLeave;
