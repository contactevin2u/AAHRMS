import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import './ESSLeave.css';

function ESSLeave() {
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('balance');

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
      const [balanceRes, historyRes, typesRes] = await Promise.all([
        essApi.getLeaveBalance(),
        essApi.getLeaveHistory({}),
        essApi.getLeaveTypes()
      ]);
      setBalances(balanceRes.data);
      setHistory(historyRes.data);
      setLeaveTypes(typesRes.data);
    } catch (error) {
      console.error('Error fetching leave data:', error);
    } finally {
      setLoading(false);
    }
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
      </div>
    </ESSLayout>
  );
}

export default ESSLeave;
