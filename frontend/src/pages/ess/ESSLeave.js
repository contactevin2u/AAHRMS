import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSLeave.css';

function ESSLeave({ embedded = false }) {
  const { t, language } = useLanguage();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [activeTab, setActiveTab] = useState('apply');
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({
    leave_type_id: '',
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
      const [balanceRes, historyRes, typesRes] = await Promise.all([
        essApi.getLeaveBalance(),
        essApi.getLeaveHistory(),
        essApi.getLeaveTypes()
      ]);
      console.log('[Leave] Balance response:', balanceRes.data);
      console.log('[Leave] Types response:', typesRes.data);
      setLeaveBalances(balanceRes.data?.balances || balanceRes.data || []);
      setApplications(historyRes.data || []);
      setLeaveTypes(typesRes.data || []);
    } catch (error) {
      console.error('Error fetching leave data:', error);
      setLeaveBalances([]);
      setApplications([]);
      setLeaveTypes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        leave_type_id: parseInt(applyForm.leave_type_id, 10),
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        reason: applyForm.reason
      };
      console.log('[Leave Apply] Submitting:', payload);
      await essApi.applyLeave(payload);
      setShowApplyModal(false);
      setApplyForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      alert('Leave application submitted!');
      fetchData();
    } catch (error) {
      console.error('[Leave Apply] Error:', error.response?.data);
      alert(error.response?.data?.error || 'Failed to submit leave application');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
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

  // Helper to get balance for a leave type
  const getBalanceForType = (leaveTypeId) => {
    const balance = leaveBalances.find(b => b.leave_type_id === leaveTypeId);
    if (balance) {
      const available = (balance.entitled_days || 0) + (balance.carried_forward || 0) - (balance.used_days || 0);
      return { entitled: balance.entitled_days || 0, used: balance.used_days || 0, available };
    }
    return null;
  };

  // Display balances from API or calculate from leave types
  const displayBalances = leaveBalances.length > 0 ? leaveBalances : leaveTypes.map(lt => ({
    leave_type_id: lt.id,
    leave_type_name: lt.name,
    entitled_days: lt.entitled_days_for_service || lt.default_days_per_year || 0,
    used_days: 0,
    available: lt.entitled_days_for_service || lt.default_days_per_year || 0
  }));

  const content = (
      <div className="ess-leave">
        <div className="ess-page-header">
          <h1>{t('leave.title')}</h1>
          <p>{t('leave.subtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="ess-tabs">
          <button className={`tab-btn ${activeTab === 'apply' ? 'active' : ''}`} onClick={() => setActiveTab('apply')}>
            {t('leave.apply')}
          </button>
          <button className={`tab-btn ${activeTab === 'balance' ? 'active' : ''}`} onClick={() => setActiveTab('balance')}>
            {t('leave.balance')}
          </button>
          <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            {t('leave.history')}
          </button>
        </div>

        {/* Apply Tab */}
        {activeTab === 'apply' && (
          <div className="leave-apply-section">
            <button className="apply-btn" onClick={() => setShowApplyModal(true)}>
              + {t('leave.applyLeave')}
            </button>

            <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>{t('leave.recentApplications')}</h3>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
            ) : applications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <div style={{ color: '#64748b' }}>{t('leave.noApplications')}</div>
              </div>
            ) : (
              <div className="applications-list">
                {applications.map(app => (
                  <div key={app.id} className="application-card">
                    <div className="app-header">
                      <span className="app-type">{app.leave_type_name || app.leave_type || app.type}</span>
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
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
            ) : (
              displayBalances.filter(balance => balance.is_paid !== false).map((balance, idx) => {
                const entitled = parseFloat(balance.entitled_days || balance.entitled || balance.balance) || 0;
                const used = parseFloat(balance.used_days || balance.used) || 0;
                const available = parseFloat(balance.available) || (entitled - used);
                return (
                  <div key={idx} className="balance-card">
                    <div className="balance-type">{balance.leave_type_name || balance.leave_type || balance.name}</div>
                    <div className="balance-info">
                      <div className="balance-item">
                        <span className="label">{t('leave.entitled')}</span>
                        <span className="value">{entitled}</span>
                      </div>
                      <div className="balance-item">
                        <span className="label">{t('leave.used')}</span>
                        <span className="value">{used}</span>
                      </div>
                      <div className="balance-item highlight">
                        <span className="label">{t('leave.available')}</span>
                        <span className="value">{available}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="leave-history-section">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
            ) : applications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <div style={{ color: '#64748b' }}>{t('leave.noLeaveHistory')}</div>
              </div>
            ) : (
              <div className="history-list">
                {applications.map(app => (
                  <div key={app.id} className="history-card">
                    <div className="history-date">{formatDate(app.start_date)}</div>
                    <div className="history-details">
                      <span className="history-type">{app.leave_type_name || app.leave_type || app.type}</span>
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
                <h2>{t('leave.applyLeave')}</h2>
                <button className="close-btn" onClick={() => setShowApplyModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleApply}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>{t('leave.leaveType')} *</label>
                    <select value={applyForm.leave_type_id} onChange={e => setApplyForm({...applyForm, leave_type_id: e.target.value})} required>
                      <option value="">{t('leave.selectLeaveType')}</option>
                      {leaveTypes.filter(lt => lt.eligible !== false).map((lt) => {
                        const balance = getBalanceForType(lt.id);
                        const availableDays = balance ? parseFloat(balance.available) || 0 : parseFloat(lt.entitled_days_for_service || lt.default_days_per_year) || 0;
                        const isUnpaid = lt.is_paid === false;
                        return (
                          <option key={lt.id} value={lt.id}>
                            {lt.name}{isUnpaid ? '' : ` (${availableDays} ${t('leave.available')})`}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('leave.startDate')} *</label>
                      <input type="date" value={applyForm.start_date} onChange={e => setApplyForm({...applyForm, start_date: e.target.value})} required />
                    </div>
                    <div className="form-group">
                      <label>{t('leave.endDate')} *</label>
                      <input type="date" value={applyForm.end_date} onChange={e => setApplyForm({...applyForm, end_date: e.target.value})} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t('leave.reason')} *</label>
                    <textarea value={applyForm.reason} onChange={e => setApplyForm({...applyForm, reason: e.target.value})} rows={3} required placeholder={t('leave.reasonPlaceholder')} />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowApplyModal(false)}>{t('common.cancel')}</button>
                  <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? t('leave.submitting') : t('common.submit')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );

  return embedded ? content : <ESSLayout>{content}</ESSLayout>;
}

export default ESSLeave;
