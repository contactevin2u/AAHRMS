import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { toast } from 'react-toastify';
import { isSupervisorOrManager } from '../../utils/permissions';

function ESSOTApproval() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [pendingOT, setPendingOT] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchPendingOT();
  }, [selectedMonth, selectedYear]);

  const fetchPendingOT = async () => {
    setLoading(true);
    try {
      const response = await essApi.getPendingOT();
      setPendingOT(response.data || []);
    } catch (error) {
      console.error('Error fetching pending OT:', error);
      setPendingOT([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await essApi.approveOT(id);
      toast.success('OT approved');
      fetchPendingOT();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!showRejectModal) return;

    try {
      await essApi.rejectOT(showRejectModal, rejectReason);
      toast.success('OT rejected');
      setShowRejectModal(null);
      setRejectReason('');
      fetchPendingOT();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reject');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time.substring(0, 5);
  };

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  // Check access
  const hasAccess = isSupervisorOrManager(employeeInfo) || employeeInfo.position === 'Manager';

  if (!hasAccess) {
    return (
      <ESSLayout>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>This page is only available for Supervisors and Managers.</p>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>
            <span style={{ marginRight: '8px' }}>&#x23F0;</span>
            Overtime Approval
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Approve or reject staff overtime requests</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
          >
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Pending Count */}
        {pendingOT.length > 0 && (
          <div style={{ background: '#fef3c7', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>&#x1F4DD;</span>
            <span style={{ fontWeight: '500', color: '#92400e' }}>{pendingOT.length} overtime request{pendingOT.length > 1 ? 's' : ''} awaiting approval</span>
          </div>
        )}

        {/* OT Records */}
        <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
          ) : pendingOT.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#x23F0;</div>
              <h3 style={{ color: '#1e293b', margin: '0 0 8px 0' }}>No Overtime Requests</h3>
              <p style={{ color: '#64748b', margin: 0 }}>There are no pending overtime approvals from your team</p>
            </div>
          ) : (
            <div>
              {pendingOT.map((record, index) => (
                <div
                  key={record.id}
                  style={{
                    padding: '16px',
                    borderBottom: index < pendingOT.length - 1 ? '1px solid #f1f5f9' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px', color: '#1e293b' }}>{record.employee_name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{record.emp_code}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', fontSize: '16px', color: '#1e293b' }}>{formatDate(record.work_date)}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{record.outlet_name || record.department_name || '-'}</div>
                    </div>
                  </div>

                  {/* OT Details */}
                  <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>Overtime Request</span>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>
                        {record.ot_hours ? `${parseFloat(record.ot_hours).toFixed(1)}h OT` : '-'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px', color: '#78716c' }}>
                      <div>
                        <span>Work Time: </span>
                        <span style={{ fontWeight: '500', color: '#44403c' }}>
                          {formatTime(record.clock_in_1)} - {formatTime(record.clock_out_2)}
                        </span>
                      </div>
                      <div>
                        <span>Total Worked: </span>
                        <span style={{ fontWeight: '500', color: '#44403c' }}>{record.total_hours ? `${parseFloat(record.total_hours).toFixed(1)}h` : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleApprove(record.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setShowRejectModal(record.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '14px'
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

        {/* Info Box */}
        <div style={{ marginTop: '20px', background: '#f0f9ff', borderRadius: '12px', padding: '16px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#0369a1' }}>OT Calculation Rules</h4>
          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: '#0369a1' }}>
            <li>Standard work day: 8 hours (+ 1 hour break)</li>
            <li>OT starts after 8 hours of actual work</li>
            <li>OT rate: 1.0x</li>
            <li>Approved OT will be included in payroll calculation</li>
          </ul>
        </div>

        {/* Reject Modal */}
        {showRejectModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowRejectModal(null)}>
            <div style={{ background: 'white', width: '90%', maxWidth: '400px', borderRadius: '16px', padding: '24px' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Reject OT</h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Reason (Optional)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={3}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowRejectModal(null)}
                  style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}
                >
                  Reject OT
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSOTApproval;
