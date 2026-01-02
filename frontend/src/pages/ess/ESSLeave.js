import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import './ESSLeave.css';

function ESSLeave() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [activeTab, setActiveTab] = useState('apply');
  const [leaveTypes] = useState([
    { id: 1, name: 'Annual Leave', balance: 14, used: 2 },
    { id: 2, name: 'Medical Leave', balance: 14, used: 0 },
    { id: 3, name: 'Emergency Leave', balance: 3, used: 0 },
    { id: 4, name: 'Unpaid Leave', balance: 999, used: 0 }
  ]);
  const [applications, setApplications] = useState([
    { id: 1, type: 'Annual Leave', start_date: '2026-01-15', end_date: '2026-01-16', days: 2, status: 'pending', reason: 'Family vacation' },
    { id: 2, type: 'Medical Leave', start_date: '2025-12-20', end_date: '2025-12-20', days: 1, status: 'approved', reason: 'Not feeling well' }
  ]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({
    leave_type: '',
    start_date: '',
    end_date: '',
    reason: ''
  });

  const handleApply = (e) => {
    e.preventDefault();
    const newApplication = {
      id: applications.length + 1,
      type: applyForm.leave_type,
      start_date: applyForm.start_date,
      end_date: applyForm.end_date,
      days: Math.ceil((new Date(applyForm.end_date) - new Date(applyForm.start_date)) / (1000 * 60 * 60 * 24)) + 1,
      status: 'pending',
      reason: applyForm.reason
    };
    setApplications([newApplication, ...applications]);
    setShowApplyModal(false);
    setApplyForm({ leave_type: '', start_date: '', end_date: '', reason: '' });
    alert('Leave application submitted!');
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

  return (
    <ESSLayout>
      <div className="ess-leave">
        <div className="ess-page-header">
          <h1>Leave</h1>
          <p>Apply and manage your leave</p>
        </div>

        {/* Test User Badge */}
        <div style={{ background: '#dbeafe', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#1e40af' }}>
          Test Mode - Full Leave Features Enabled
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
            {applications.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>No leave applications</p>
            ) : (
              <div className="applications-list">
                {applications.map(app => (
                  <div key={app.id} className="application-card">
                    <div className="app-header">
                      <span className="app-type">{app.type}</span>
                      {getStatusBadge(app.status)}
                    </div>
                    <div className="app-dates">
                      {formatDate(app.start_date)} - {formatDate(app.end_date)} ({app.days} day{app.days > 1 ? 's' : ''})
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
            {leaveTypes.map(type => (
              <div key={type.id} className="balance-card">
                <div className="balance-type">{type.name}</div>
                <div className="balance-info">
                  <div className="balance-item">
                    <span className="label">Entitled</span>
                    <span className="value">{type.balance}</span>
                  </div>
                  <div className="balance-item">
                    <span className="label">Used</span>
                    <span className="value">{type.used}</span>
                  </div>
                  <div className="balance-item highlight">
                    <span className="label">Available</span>
                    <span className="value">{type.balance - type.used}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="leave-history-section">
            {applications.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>No leave history</p>
            ) : (
              <div className="history-list">
                {applications.map(app => (
                  <div key={app.id} className="history-card">
                    <div className="history-date">{formatDate(app.start_date)}</div>
                    <div className="history-details">
                      <span className="history-type">{app.type}</span>
                      <span className="history-days">{app.days} day{app.days > 1 ? 's' : ''}</span>
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
                    {leaveTypes.map(type => (
                      <option key={type.id} value={type.name}>{type.name} ({type.balance - type.used} available)</option>
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
                  <button type="submit" className="submit-btn">Submit</button>
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
