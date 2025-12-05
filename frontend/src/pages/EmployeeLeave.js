import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeeLeave.css';

function EmployeeLeave() {
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
    <EmployeeLayout>
      <div className="ess-leave">
        <header className="ess-page-header">
          <div>
            <h1>Leave Management</h1>
            <p>View your leave balance and apply for leave</p>
          </div>
          <button className="apply-btn" onClick={() => setShowApplyModal(true)}>
            + Apply Leave
          </button>
        </header>

        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'balance' ? 'active' : ''}`}
            onClick={() => setActiveTab('balance')}
          >
            Leave Balance
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Leave History
          </button>
        </div>

        {loading ? (
          <div className="ess-loading">Loading...</div>
        ) : (
          <>
            {activeTab === 'balance' && (
              <div className="balance-grid">
                {balances.length === 0 ? (
                  <div className="no-data-card">No leave balance data available</div>
                ) : (
                  balances.map((balance, idx) => (
                    <div key={idx} className="balance-card">
                      <div className="balance-header">
                        <span className="leave-code">{balance.code}</span>
                        <span className="leave-name">{balance.leave_type_name}</span>
                      </div>
                      <div className="balance-body">
                        <div className="balance-stat">
                          <span className="stat-value">
                            {parseFloat(balance.entitled_days) + parseFloat(balance.carried_forward || 0)}
                          </span>
                          <span className="stat-label">Entitled</span>
                        </div>
                        <div className="balance-stat">
                          <span className="stat-value used">{balance.used_days}</span>
                          <span className="stat-label">Used</span>
                        </div>
                        <div className="balance-stat">
                          <span className="stat-value available">
                            {parseFloat(balance.entitled_days) + parseFloat(balance.carried_forward || 0) - parseFloat(balance.used_days)}
                          </span>
                          <span className="stat-label">Available</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="history-section">
                {history.length === 0 ? (
                  <div className="no-data-card">No leave history found</div>
                ) : (
                  <div className="history-list">
                    {history.map((item, idx) => (
                      <div key={idx} className="history-item">
                        <div className="history-main">
                          <div className="history-type">
                            <span className="type-code">{item.code}</span>
                            <span className="type-name">{item.leave_type_name}</span>
                          </div>
                          <div className="history-dates">
                            {formatDate(item.start_date)} - {formatDate(item.end_date)}
                            <span className="days-count">({item.total_days} days)</span>
                          </div>
                          {item.reason && (
                            <div className="history-reason">{item.reason}</div>
                          )}
                        </div>
                        <div className="history-status">
                          <span className={`status-badge ${getStatusClass(item.status)}`}>
                            {item.status}
                          </span>
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
          <div className="modal-overlay" onClick={() => setShowApplyModal(false)}>
            <div className="modal apply-modal" onClick={(e) => e.stopPropagation()}>
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
                      <label>Start Date *</label>
                      <input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>End Date *</label>
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
                    <label>Reason</label>
                    <textarea
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="Enter reason for leave (optional)"
                      rows="3"
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="cancel-btn" onClick={() => setShowApplyModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeLeave;
