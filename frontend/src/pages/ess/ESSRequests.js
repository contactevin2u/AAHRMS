import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ESSLayout from '../../components/ESSLayout';
import ESSLeave from './ESSLeave';
import ESSClaims from './ESSClaims';
import ESSOTApproval from './ESSOTApproval';
import { essApi } from '../../api';
import { isSupervisorOrManager, isMimixCompany } from '../../utils/permissions';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSRequests.css';

function ESSRequests() {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');

  // Check if user can see approval tabs
  const isMimix = isMimixCompany(employeeInfo);
  const isSupOrMgr = isSupervisorOrManager(employeeInfo);
  const showOTTab = isSupOrMgr && isMimix;

  // State for approval counts (badges)
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  // State for pending approvals
  const [pendingLeave, setPendingLeave] = useState([]);
  const [loadingLeave, setLoadingLeave] = useState(false);

  // Get active tab from URL or default to 'leave'
  const activeTab = searchParams.get('tab') || 'leave';

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  // Fetch pending counts for badges
  useEffect(() => {
    if (isSupOrMgr) {
      fetchPendingCounts();
    }
  }, [isSupOrMgr]);

  // Fetch pending items when tab changes
  useEffect(() => {
    if (activeTab === 'leave-approval' && isSupOrMgr) {
      fetchPendingLeave();
    }
  }, [activeTab, isSupOrMgr]);

  const fetchPendingCounts = async () => {
    try {
      const leaveRes = await essApi.getTeamPendingLeave();
      setPendingLeaveCount(leaveRes.data?.length || 0);
    } catch (err) {
      // 403 means feature not available for this company - silently ignore
      if (err.response?.status !== 403) {
        console.error('Error fetching pending leave count:', err);
      }
      setPendingLeaveCount(0);
    }
  };

  const fetchPendingLeave = async () => {
    setLoadingLeave(true);
    try {
      const res = await essApi.getTeamPendingLeave();
      setPendingLeave(res.data || []);
      setPendingLeaveCount(res.data?.length || 0);
    } catch (err) {
      console.error('Error fetching pending leave:', err);
      setPendingLeave([]);
    } finally {
      setLoadingLeave(false);
    }
  };

  const getErrorMessage = (err, fallback) => {
    const e = err.response?.data?.error;
    if (!e) return fallback;
    return typeof e === 'string' ? e : e.message || fallback;
  };

  const handleApproveLeave = async (id) => {
    if (!window.confirm('Approve this leave request?')) return;
    try {
      await essApi.approveLeave(id);
      alert('Leave approved successfully');
      fetchPendingLeave();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to approve leave'));
    }
  };

  const handleRejectLeave = async (id) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      await essApi.rejectLeave(id, reason);
      alert('Leave rejected');
      fetchPendingLeave();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to reject leave'));
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <ESSLayout>
      <div className="ess-requests-page">
        {/* Tab Header */}
        <div className="ess-requests-tabs" style={{ flexWrap: 'wrap' }}>
          <button
            className={activeTab === 'leave' ? 'active' : ''}
            onClick={() => setActiveTab('leave')}
          >
            {t('requests.myLeave')}
          </button>
          <button
            className={activeTab === 'claims' ? 'active' : ''}
            onClick={() => setActiveTab('claims')}
          >
            {t('requests.myClaims')}
          </button>
          {isSupOrMgr && (
            <button
              className={activeTab === 'leave-approval' ? 'active' : ''}
              onClick={() => setActiveTab('leave-approval')}
              style={{ position: 'relative' }}
            >
              {t('requests.leaveApprovals')}
              {pendingLeaveCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  minWidth: '18px'
                }}>
                  {pendingLeaveCount}
                </span>
              )}
            </button>
          )}
          {showOTTab && (
            <button
              className={activeTab === 'ot' ? 'active' : ''}
              onClick={() => setActiveTab('ot')}
            >
              {t('requests.otApprovals')}
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'leave' && <ESSLeave embedded={true} />}
        {activeTab === 'claims' && <ESSClaims embedded={true} />}
        {activeTab === 'ot' && showOTTab && <ESSOTApproval embedded={true} />}

        {/* Leave Approval Tab */}
        {activeTab === 'leave-approval' && isSupOrMgr && (
          <div style={{ paddingBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              {t('requests.pendingLeaveRequests')}
            </h2>
            {loadingLeave ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
            ) : pendingLeave.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <div style={{ color: '#64748b' }}>{t('requests.noPendingLeave')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingLeave.map(leave => (
                  <div key={leave.id} style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{leave.employee_name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{leave.emp_code} • {leave.outlet_name}</div>
                      </div>
                      <span style={{
                        background: '#fef3c7',
                        color: '#d97706',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {t('claims.pending')}
                      </span>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontWeight: '500', color: '#1976d2' }}>{leave.leave_type_name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        {formatDate(leave.start_date)} - {formatDate(leave.end_date)} ({leave.total_days} {t('leave.days')})
                      </div>
                    </div>
                    {leave.reason && (
                      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px', fontStyle: 'italic' }}>
                        "{leave.reason}"
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleApproveLeave(leave.id)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {t('leave.approveLeave')}
                      </button>
                      <button
                        onClick={() => handleRejectLeave(leave.id)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {t('leave.rejectLeave')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </ESSLayout>
  );
}

export default ESSRequests;
