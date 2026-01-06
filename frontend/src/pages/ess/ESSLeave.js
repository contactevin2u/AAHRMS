import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import './ESSLeave.css';

function ESSLeave() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [activeTab, setActiveTab] = useState('apply');
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({
    leave_type: '',
    start_date: '',
    end_date: '',
    reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balanceRes, historyRes] = await Promise.all([
        essApi.getLeaveBalance(),
        essApi.getLeaveHistory()
      ]);
      setLeaveBalances(balanceRes.data || []);
      setApplications(historyRes.data || []);
    } catch (error) {
      console.error('Error fetching leave data:', error);
      setLeaveBalances([]);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await essApi.applyLeave({
        leave_type: applyForm.leave_type,
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        reason: applyForm.reason
      });
      setShowApplyModal(false);
      setApplyForm({ leave_type: '', start_date: '', end_date: '', reason: '' });
      alert('Leave application submitted!');
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit leave application');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fef3c7', color: '#d97706' },
      approved: { bg: '#d1fae5', color: '#059669' },
      rejected: { bg: '#fee2e2', color: '#dc2626' }
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const calculateDays = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    return Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  };

  // Default leave types if no data from API
  const defaultLeaveTypes = [
    { name: 'Annual Leave', entitled: 14 },
    { name: 'Medical Leave', entitled: 14 },
    { name: 'Emergency Leave', entitled: 3 },
    { name: 'Unpaid Leave', entitled: 999 }
  ];

  const displayBalances = leaveBalances.length > 0 ? leaveBalances : defaultLeaveTypes.map(t => ({
    leave_type: t.name,
    entitled: t.entitled,
    used: 0,
    available: t.entitled
  }));

  return (
    <ESSLayout>
      <div className="ess-leave">
        <div className="ess-page-header">
          <h1>Leave</h1>
          <p>Apply and manage your leave</p>
        </div>

        {/* Tabs */}
        <div className="ess-tabs">
          <button className={`tab-btn ${activeTab === 'apply' ? 'active' : ''}`} onClick={() => setActiveTab('apply')}>
            Apply
          </button>
          <button className={`tab-btn ${activeTab === 'balance' ? 'active' : ''}`} onClick={() => setActiveTab('balance')}>
            Balance
          </button>
          <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            History
          </button>
        </div>

        {/* Apply Tab */}
        {activeTab === 'apply' && (
          <div className="leave-apply-section">
            <button className="apply-btn" onClick={() => setShowApplyModal(true)}>
              + Apply Leave
            </button>

            <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>Recent Applications</h3>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
            ) : applications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <div style={{ color: '#64748b' }}>No leave applications yet</div>
              </div>
            ) : (
              <div className="applications-list">
                {applications.map(app => (
                  <div key={app.id} className="application-card">
                    <div className="app-header">
                      <span className="app-type">{app.leave_type || app.type}</span>
                      {getStatusBadge(app.status)}
                    </div>
                    <div className="app-dates">
                      {formatDate(app.start_date)} - {formatDate(app.end_date)} ({app.days || calculateDays(app.start_date, app.end_date)} day{(app.days || calculateDays(app.start_date, app.end_date)) > 1 ? 's' : ''})
                    </div>
                    <div className="app-reason">{app.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Balance Tab */}
        {activeTab === 'balance' && (
          <div className="leave-balance-section">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
            ) : (
              displayBalances.map((balance, idx) => (
                <div key={idx} className="balance-card">
                  <div className="balance-type">{balance.leave_type || balance.name}</div>
                  <div className="balance-info">
                    <div className="balance-item">
                      <span className="label">Entitled</span>
                      <span className="value">{balance.entitled || balance.balance || 0}</span>
                    </div>
                    <div className="balance-item">
                      <span className="label">Used</span>
                      <span className="value">{balance.used || 0}</span>
                    </div>
                    <div className="balance-item highlight">
                      <span className="label">Available</span>
                      <span className="value">{balance.available || (balance.entitled || balance.balance || 0) - (balance.used || 0)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="leave-history-section">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
            ) : applications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <div style={{ color: '#64748b' }}>No leave history</div>
              </div>
            ) : (
              <div className="history-list">
                {applications.map(app => (
                  <div key={app.id} className="history-card">
                    <div className="history-date">{formatDate(app.start_date)}</div>
                    <div className="history-details">
                      <span className="history-type">{app.leave_type || app.type}</span>
                      <span className="history-days">{app.days || calculateDays(app.start_date, app.end_date)} day{(app.days || calculateDays(app.start_date, app.end_date)) > 1 ? 's' : ''}</span>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Apply Modal */}
        {showApplyModal && (
          <div className="modal-overlay" onClick={() => setShowApplyModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Apply Leave</h2>
                <button className="close-btn" onClick={() => setShowApplyModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleApply}>
                <div className="form-group">
                  <label>Leave Type *</label>
                  <select value={applyForm.leave_type} onChange={e => setApplyForm({...applyForm, leave_type: e.target.value})} required>
                    <option value="">Select leave type</option>
                    {displayBalances.map((balance, idx) => (
                      <option key={idx} value={balance.leave_type || balance.name}>
                        {balance.leave_type || balance.name} ({balance.available || (balance.entitled || balance.balance || 0) - (balance.used || 0)} available)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input type="date" value={applyForm.start_date} onChange={e => setApplyForm({...applyForm, start_date: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>End Date *</label>
                    <input type="date" value={applyForm.end_date} onChange={e => setApplyForm({...applyForm, end_date: e.target.value})} required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason *</label>
                  <textarea value={applyForm.reason} onChange={e => setApplyForm({...applyForm, reason: e.target.value})} rows={3} required placeholder="Enter reason for leave" />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowApplyModal(false)}>Cancel</button>
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
