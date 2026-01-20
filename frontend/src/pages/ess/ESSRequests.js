import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ESSLayout from '../../components/ESSLayout';
import ESSLeave from './ESSLeave';
import ESSClaims from './ESSClaims';
import ESSOTApproval from './ESSOTApproval';
import { essApi } from '../../api';
import { isSupervisorOrManager, isMimixCompany } from '../../utils/permissions';
import './ESSRequests.css';

function ESSRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');

  // Check if user can see approval tabs
  const isMimix = isMimixCompany(employeeInfo);
  const isSupOrMgr = isSupervisorOrManager(employeeInfo);
  const showOTTab = isSupOrMgr && isMimix;

  // State for approval counts (badges)
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [pendingClaimsCount, setPendingClaimsCount] = useState(0);

  // State for pending approvals
  const [pendingLeave, setPendingLeave] = useState([]);
  const [pendingClaims, setPendingClaims] = useState([]);
  const [loadingLeave, setLoadingLeave] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(false);

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
    } else if (activeTab === 'claims-approval' && isSupOrMgr) {
      fetchPendingClaims();
    }
  }, [activeTab, isSupOrMgr]);

  const fetchPendingCounts = async () => {
    // Fetch independently so one 403 doesn't break the other
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

    try {
      const claimsRes = await essApi.getTeamPendingClaims();
      setPendingClaimsCount(claimsRes.data?.length || 0);
    } catch (err) {
      if (err.response?.status !== 403) {
        console.error('Error fetching pending claims count:', err);
      }
      setPendingClaimsCount(0);
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

  const fetchPendingClaims = async () => {
    setLoadingClaims(true);
    try {
      const res = await essApi.getTeamPendingClaims();
      setPendingClaims(res.data || []);
      setPendingClaimsCount(res.data?.length || 0);
    } catch (err) {
      console.error('Error fetching pending claims:', err);
      setPendingClaims([]);
    } finally {
      setLoadingClaims(false);
    }
  };

  const handleApproveLeave = async (id) => {
    if (!window.confirm('Approve this leave request?')) return;
    try {
      await essApi.approveLeave(id);
      alert('Leave approved successfully');
      fetchPendingLeave();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve leave');
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
      alert(err.response?.data?.error || 'Failed to reject leave');
    }
  };

  const handleApproveClaim = async (id) => {
    if (!window.confirm('Approve this claim?')) return;
    try {
      await essApi.approveClaim(id, {});
      alert('Claim approved successfully');
      fetchPendingClaims();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve claim');
    }
  };

  const handleRejectClaim = async (id) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      await essApi.rejectClaim(id, { remarks: reason });
      alert('Claim rejected');
      fetchPendingClaims();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject claim');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
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
            My Leave
          </button>
          <button
            className={activeTab === 'claims' ? 'active' : ''}
            onClick={() => setActiveTab('claims')}
          >
            My Claims
          </button>
          {isSupOrMgr && (
            <>
              <button
                className={activeTab === 'leave-approval' ? 'active' : ''}
                onClick={() => setActiveTab('leave-approval')}
                style={{ position: 'relative' }}
              >
                Leave Approvals
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
              <button
                className={activeTab === 'claims-approval' ? 'active' : ''}
                onClick={() => setActiveTab('claims-approval')}
                style={{ position: 'relative' }}
              >
                Claims Approvals
                {pendingClaimsCount > 0 && (
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
                    {pendingClaimsCount}
                  </span>
                )}
              </button>
            </>
          )}
          {showOTTab && (
            <button
              className={activeTab === 'ot' ? 'active' : ''}
              onClick={() => setActiveTab('ot')}
            >
              OT Approvals
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
              Pending Leave Requests
            </h2>
            {loadingLeave ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
            ) : pendingLeave.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <div style={{ color: '#64748b' }}>No pending leave requests</div>
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
                        Pending
                      </span>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontWeight: '500', color: '#1976d2' }}>{leave.leave_type_name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        {formatDate(leave.start_date)} - {formatDate(leave.end_date)} ({leave.total_days} day{leave.total_days > 1 ? 's' : ''})
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
                        Approve
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
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Claims Approval Tab */}
        {activeTab === 'claims-approval' && isSupOrMgr && (
          <div style={{ paddingBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              Pending Claims
            </h2>
            {loadingClaims ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
            ) : pendingClaims.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <div style={{ color: '#64748b' }}>No pending claims</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingClaims.map(claim => (
                  <div key={claim.id} style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{claim.employee_name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{claim.emp_code} • {claim.outlet_name || claim.department_name}</div>
                      </div>
                      <span style={{
                        background: '#fef3c7',
                        color: '#d97706',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        Pending
                      </span>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '500', color: '#1976d2', textTransform: 'capitalize' }}>{claim.category}</span>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: '#059669' }}>{formatCurrency(claim.amount)}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        {formatDate(claim.claim_date)}
                      </div>
                    </div>
                    {claim.description && (
                      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                        {claim.description}
                      </div>
                    )}
                    {claim.receipt_url && (
                      <div style={{ marginBottom: '12px' }}>
                        <a
                          href={claim.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '13px', color: '#1976d2', textDecoration: 'underline' }}
                        >
                          View Receipt
                        </a>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleApproveClaim(claim.id)}
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
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectClaim(claim.id)}
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
                        Reject
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
