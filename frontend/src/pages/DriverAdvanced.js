import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { advancesApi, employeeApi } from '../api';

function DriverAdvanced({ departmentId, embedded = false }) {
  const [advances, setAdvances] = useState([]);
  const [summary, setSummary] = useState({ active: 0, totalOutstanding: 0, totalDeducted: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedId, setExpandedId] = useState(null);
  const [history, setHistory] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});

  // Add advance modal
  const [showModal, setShowModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [formData, setFormData] = useState({ employee_id: '', amount: '', monthly_installment: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAdvances = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (departmentId) params.department_id = departmentId;
      const res = await advancesApi.getAll(params);
      const data = res.data || [];
      setAdvances(Array.isArray(data) ? data : data.advances || []);

      // Compute summary
      const allForSummary = Array.isArray(data) ? data : data.advances || [];
      const active = allForSummary.filter(a => a.status === 'active').length;
      const totalOutstanding = allForSummary.reduce((s, a) => s + (parseFloat(a.remaining_balance) || 0), 0);
      const totalDeducted = allForSummary.reduce((s, a) => s + (parseFloat(a.total_deducted) || 0), 0);
      setSummary({ active, totalOutstanding, totalDeducted });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch advances');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, departmentId]);

  useEffect(() => {
    fetchAdvances();
  }, [fetchAdvances]);

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!history[id]) {
      setHistoryLoading(prev => ({ ...prev, [id]: true }));
      try {
        const res = await advancesApi.getHistory(id);
        setHistory(prev => ({ ...prev, [id]: res.data || [] }));
      } catch {
        setHistory(prev => ({ ...prev, [id]: [] }));
      } finally {
        setHistoryLoading(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this advance?')) return;
    try {
      await advancesApi.cancel(id);
      fetchAdvances();
      setExpandedId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel advance');
    }
  };

  const openAddModal = async () => {
    setFormData({ employee_id: '', amount: '', monthly_installment: '', reason: '' });
    setFormError('');
    setShowModal(true);
    try {
      const params = departmentId ? { department_id: departmentId } : {};
      const res = await employeeApi.getAll(params);
      setEmployees(res.data || []);
    } catch {
      setEmployees([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employee_id || !formData.amount || !formData.monthly_installment) {
      setFormError('Employee, amount, and monthly installment are required');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await advancesApi.create({
        employee_id: parseInt(formData.employee_id),
        amount: parseFloat(formData.amount),
        monthly_installment: parseFloat(formData.monthly_installment),
        reason: formData.reason || undefined
      });
      setShowModal(false);
      fetchAdvances();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create advance');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'active': return { bg: '#dbeafe', color: '#1e40af' };
      case 'completed': return { bg: '#d1fae5', color: '#065f46' };
      case 'cancelled': return { bg: '#fee2e2', color: '#991b1b' };
      default: return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  const content = (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Salary Advance</h1>
        <button
          onClick={openAddModal}
          style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}
        >
          + Add Advance
        </button>
      </div>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>Track driver salary advances and monthly deductions</p>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#eff6ff', padding: '16px 24px', borderRadius: '8px', flex: 1 }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Active Advances</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e40af' }}>{summary.active}</div>
        </div>
        <div style={{ background: '#fef3c7', padding: '16px 24px', borderRadius: '8px', flex: 1 }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Outstanding</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>RM {summary.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: '#f0fdf4', padding: '16px 24px', borderRadius: '8px', flex: 1 }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Deducted</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#166534' }}>RM {summary.totalDeducted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '2px solid #e5e7eb' }}>
        {['active', 'completed', 'cancelled', ''].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              borderBottom: statusFilter === status ? '2px solid #3b82f6' : '2px solid transparent',
              color: statusFilter === status ? '#3b82f6' : '#6b7280', marginBottom: '-2px'
            }}
          >
            {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: '16px', padding: '10px', background: '#fef2f2', borderRadius: '6px' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading advances...</div>
      ) : advances.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>No advances found.</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Employee ID</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Name</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Advance Amount</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Deducted</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Remaining</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Monthly Installment</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {advances.map(adv => {
                const sc = statusColor(adv.status);
                const isExpanded = expandedId === adv.id;
                return (
                  <React.Fragment key={adv.id}>
                    <tr
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: isExpanded ? '#f9fafb' : 'transparent' }}
                      onClick={() => toggleExpand(adv.id)}
                    >
                      <td style={{ padding: '10px 12px' }}>{adv.employee_id}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{adv.employee_name || adv.first_name || '-'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>RM {parseFloat(adv.amount || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>RM {parseFloat(adv.total_deducted || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>RM {parseFloat(adv.remaining_balance || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>RM {parseFloat(adv.monthly_installment || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, background: sc.bg, color: sc.color }}>
                          {adv.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {adv.status === 'active' && (
                          <button
                            onClick={() => handleCancel(adv.id)}
                            style={{ padding: '4px 12px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: '0', background: '#f9fafb' }}>
                          <div style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#374151' }}>
                              Deduction History
                              {adv.reason && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '16px' }}>Reason: {adv.reason}</span>}
                            </div>
                            {historyLoading[adv.id] ? (
                              <div style={{ color: '#6b7280', padding: '8px 0' }}>Loading history...</div>
                            ) : (history[adv.id] || []).length === 0 ? (
                              <div style={{ color: '#6b7280', padding: '8px 0' }}>No deductions recorded yet.</div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: '#e5e7eb' }}>
                                    <th style={{ padding: '6px 12px', textAlign: 'left' }}>Month</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'right' }}>Amount Deducted</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'right' }}>Balance After</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left' }}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(history[adv.id] || []).map((h, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                      <td style={{ padding: '6px 12px' }}>{h.deduction_month || h.month || '-'}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>RM {parseFloat(h.amount || h.deduction_amount || 0).toFixed(2)}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>RM {parseFloat(h.balance_after || h.remaining_balance || 0).toFixed(2)}</td>
                                      <td style={{ padding: '6px 12px', color: '#6b7280' }}>{h.notes || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Advance Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Add New Advance</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Employee</label>
                <select
                  value={formData.employee_id}
                  onChange={e => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                >
                  <option value="">Select employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_id} - {emp.first_name} {emp.last_name || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Advance Amount (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                  placeholder="e.g. 500.00"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Monthly Installment (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.monthly_installment}
                  onChange={e => setFormData(prev => ({ ...prev, monthly_installment: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                  placeholder="e.g. 100.00"
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Reason (optional)</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                  placeholder="e.g. Medical emergency"
                />
              </div>
              {formError && <div style={{ color: '#dc2626', marginBottom: '12px', fontSize: '13px' }}>{formError}</div>}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '8px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Creating...' : 'Create Advance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
}

export default DriverAdvanced;
