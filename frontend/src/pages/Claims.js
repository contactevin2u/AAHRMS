import React, { useState, useEffect } from 'react';
import { claimsApi, employeeApi, outletsApi, departmentApi, advancesApi } from '../api';
import Layout from '../components/Layout';
import './Claims.css';

function Claims() {
  const [claims, setClaims] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [summary, setSummary] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [advancesSummary, setAdvancesSummary] = useState([]);
  const [activeTab, setActiveTab] = useState('claims'); // 'claims', 'advances', 'restrictions'

  // Get company info for filtering
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isMimix = adminInfo.company_id === 3;

  // Filters
  const [filter, setFilter] = useState({
    employee_id: '',
    status: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    outlet_id: '',
    department_id: ''
  });

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState(null);

  // Form
  const [form, setForm] = useState({
    employee_id: '',
    claim_date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: ''
  });

  // Advance Form
  const [advanceForm, setAdvanceForm] = useState({
    employee_id: '',
    amount: '',
    advance_date: new Date().toISOString().split('T')[0],
    reason: '',
    deduction_method: 'full',
    installment_amount: '',
    expected_deduction_month: new Date().getMonth() + 2,
    expected_deduction_year: new Date().getFullYear()
  });

  // Selection for bulk approve
  const [selectedClaims, setSelectedClaims] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchClaims();
    fetchSummary();
    fetchAdvances();
  }, [filter]);

  const fetchInitialData = async () => {
    try {
      const [empRes, catRes, countRes, outletsRes, deptsRes, restrictionsRes] = await Promise.all([
        employeeApi.getAll({ status: 'active' }),
        claimsApi.getCategories(),
        claimsApi.getPendingCount(),
        outletsApi.getAll().catch(() => ({ data: [] })),
        departmentApi.getAll().catch(() => ({ data: [] })),
        claimsApi.getRestrictions().catch(() => ({ data: [] }))
      ]);
      setEmployees(empRes.data);
      setCategories(catRes.data);
      setPendingCount(countRes.data.count);
      setOutlets(outletsRes.data || []);
      setDepartments(deptsRes.data || []);
      setRestrictions(restrictionsRes.data || []);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await claimsApi.getAll(filter);
      setClaims(res.data);
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await claimsApi.getSummary({ month: filter.month, year: filter.year });
      setSummary(res.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const fetchAdvances = async () => {
    try {
      const [advRes, sumRes] = await Promise.all([
        advancesApi.getAll({ month: filter.month, year: filter.year }).catch(() => ({ data: [] })),
        advancesApi.getSummary({ month: filter.month, year: filter.year }).catch(() => ({ data: [] }))
      ]);
      setAdvances(advRes.data || []);
      setAdvancesSummary(sumRes.data || []);
    } catch (error) {
      console.error('Error fetching advances:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClaim) {
        await claimsApi.update(editingClaim.id, form);
      } else {
        await claimsApi.create(form);
      }
      setShowModal(false);
      resetForm();
      fetchClaims();
      fetchSummary();
      fetchInitialData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save claim');
    }
  };

  const handleAdvanceSubmit = async (e) => {
    e.preventDefault();
    try {
      await advancesApi.create({
        ...advanceForm,
        expected_deduction_month: advanceForm.expected_deduction_month > 12
          ? advanceForm.expected_deduction_month - 12
          : advanceForm.expected_deduction_month
      });
      setShowAdvanceModal(false);
      resetAdvanceForm();
      fetchAdvances();
      alert('Salary advance recorded successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save advance');
    }
  };

  const handleApprove = async (id) => {
    try {
      await claimsApi.approve(id);
      fetchClaims();
      fetchSummary();
      fetchInitialData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve claim');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Enter rejection reason:');
    if (reason) {
      try {
        await claimsApi.reject(id, { rejection_reason: reason });
        fetchClaims();
        fetchSummary();
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to reject claim');
      }
    }
  };

  const handleRevert = async (id) => {
    if (window.confirm('Revert this approved claim back to pending?')) {
      try {
        await claimsApi.revert(id);
        fetchClaims();
        fetchSummary();
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to revert claim');
      }
    }
  };

  const handleBulkApprove = async () => {
    if (selectedClaims.length === 0) {
      alert('Please select claims to approve');
      return;
    }
    if (window.confirm(`Approve ${selectedClaims.length} selected claims?`)) {
      try {
        await claimsApi.bulkApprove(selectedClaims);
        setSelectedClaims([]);
        fetchClaims();
        fetchSummary();
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to approve claims');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this claim?\n\n⚠️ This action cannot be undone.')) {
      try {
        await claimsApi.delete(id);
        fetchClaims();
        fetchSummary();
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete claim');
      }
    }
  };

  const handleCancelAdvance = async (id) => {
    if (window.confirm('Cancel this advance? This cannot be undone.')) {
      try {
        await advancesApi.cancel(id);
        fetchAdvances();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to cancel advance');
      }
    }
  };

  const handleEdit = (claim) => {
    setEditingClaim(claim);
    setForm({
      employee_id: claim.employee_id,
      claim_date: claim.claim_date.split('T')[0],
      category: claim.category,
      description: claim.description || '',
      amount: claim.amount
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingClaim(null);
    setForm({
      employee_id: '',
      claim_date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: ''
    });
  };

  const resetAdvanceForm = () => {
    setAdvanceForm({
      employee_id: '',
      amount: '',
      advance_date: new Date().toISOString().split('T')[0],
      reason: '',
      deduction_method: 'full',
      installment_amount: '',
      expected_deduction_month: new Date().getMonth() + 2,
      expected_deduction_year: new Date().getFullYear()
    });
  };

  const toggleSelectClaim = (id) => {
    setSelectedClaims(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const selectableClaims = claims
      .filter(c => c.status === 'pending' && !c.linked_payroll_item_id)
      .map(c => c.id);
    if (selectedClaims.length === selectableClaims.length) {
      setSelectedClaims([]);
    } else {
      setSelectedClaims(selectableClaims);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    const classes = {
      pending: 'status-badge pending',
      approved: 'status-badge approved',
      rejected: 'status-badge rejected',
      active: 'status-badge pending',
      completed: 'status-badge approved',
      cancelled: 'status-badge rejected'
    };
    return <span className={classes[status] || 'status-badge'}>{status}</span>;
  };

  const getAIInfo = (claim) => {
    if (claim.status === 'approved' && claim.auto_approved) {
      return { type: 'auto-approved', reasons: ['Auto-approved by AI'] };
    }
    if (claim.status === 'pending') {
      const reasons = [];
      if (claim.amount_mismatch_ignored) {
        const aiAmount = claim.ai_extracted_amount ? parseFloat(claim.ai_extracted_amount).toFixed(2) : '?';
        reasons.push(`Over-claim: Receipt RM ${aiAmount}, Claimed RM ${parseFloat(claim.amount).toFixed(2)}`);
      }
      if (claim.ai_confidence === 'unreadable' || claim.ai_confidence === 'low') {
        reasons.push('Receipt unreadable by AI');
      }
      if (parseFloat(claim.amount) > 100 && !claim.amount_mismatch_ignored && claim.ai_confidence !== 'unreadable') {
        reasons.push('Amount exceeds RM 100 limit');
      }
      if (reasons.length === 0 && !claim.ai_extracted_amount && !claim.receipt_hash) {
        reasons.push('Submitted before AI verification');
      }
      if (reasons.length > 0) {
        return { type: 'manual-required', reasons };
      }
    }
    return null;
  };

  const needsAttention = (claim) => {
    if (claim.status !== 'pending') return false;
    return claim.amount_mismatch_ignored || claim.ai_confidence === 'unreadable' || claim.ai_confidence === 'low';
  };

  const getCategoryLabel = (value) => {
    const cat = categories.find(c => c.value === value);
    return cat ? cat.label : value;
  };

  // Calculate totals
  const totalApproved = summary.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);
  const totalPending = claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.amount), 0);
  const totalAdvanceDeductions = advancesSummary.reduce((sum, a) => sum + parseFloat(a.deduction_this_month || 0), 0);

  // Group claims by employee for summary
  const employeeSummary = {};
  claims.forEach(c => {
    if (!employeeSummary[c.employee_id]) {
      employeeSummary[c.employee_id] = {
        name: c.employee_name,
        emp_code: c.emp_code,
        totalClaims: 0,
        approvedClaims: 0,
        pendingClaims: 0
      };
    }
    employeeSummary[c.employee_id].totalClaims += parseFloat(c.amount);
    if (c.status === 'approved') {
      employeeSummary[c.employee_id].approvedClaims += parseFloat(c.amount);
    } else if (c.status === 'pending') {
      employeeSummary[c.employee_id].pendingClaims += parseFloat(c.amount);
    }
  });

  // Add advance deductions to employee summary
  advancesSummary.forEach(a => {
    if (employeeSummary[a.employee_id]) {
      employeeSummary[a.employee_id].advanceDeduction = parseFloat(a.deduction_this_month || 0);
    } else {
      employeeSummary[a.employee_id] = {
        name: a.employee_name,
        emp_code: a.emp_code,
        totalClaims: 0,
        approvedClaims: 0,
        pendingClaims: 0,
        advanceDeduction: parseFloat(a.deduction_this_month || 0)
      };
    }
  });

  return (
    <Layout>
      <div className="claims-page">
        <header className="page-header">
          <div>
            <h1>Claims & Advances</h1>
            <p>Manage employee expense claims and salary advances</p>
          </div>
          <div className="header-actions">
            {pendingCount > 0 && (
              <span className="pending-badge">{pendingCount} Pending</span>
            )}
            {activeTab === 'claims' && (
              <button onClick={() => { resetForm(); setShowModal(true); }} className="add-btn">
                + New Claim
              </button>
            )}
            {activeTab === 'advances' && (
              <button onClick={() => { resetAdvanceForm(); setShowAdvanceModal(true); }} className="add-btn">
                + New Advance
              </button>
            )}
          </div>
        </header>

        {/* Tabs */}
        <div className="claims-tabs">
          <button
            className={`tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
            onClick={() => setActiveTab('claims')}
          >
            Claims List
          </button>
          <button
            className={`tab-btn ${activeTab === 'advances' ? 'active' : ''}`}
            onClick={() => setActiveTab('advances')}
          >
            Salary Advances
          </button>
          <button
            className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Employee Summary
          </button>
          <button
            className={`tab-btn ${activeTab === 'restrictions' ? 'active' : ''}`}
            onClick={() => setActiveTab('restrictions')}
          >
            Claim Restrictions
          </button>
        </div>

        {/* Summary Stats */}
        <div className="stats-row">
          <div
            className={`stat-box clickable ${filter.status === '' ? 'active' : ''}`}
            onClick={() => { setFilter({ ...filter, status: '' }); setActiveTab('claims'); }}
          >
            <span className="stat-num">{claims.length}</span>
            <span className="stat-text">Total Claims</span>
          </div>
          <div
            className={`stat-box clickable pending ${filter.status === 'pending' ? 'active' : ''}`}
            onClick={() => { setFilter({ ...filter, status: 'pending' }); setActiveTab('claims'); }}
          >
            <span className="stat-num">{formatAmount(totalPending)}</span>
            <span className="stat-text">Pending Amount</span>
          </div>
          <div
            className={`stat-box clickable approved ${filter.status === 'approved' ? 'active' : ''}`}
            onClick={() => { setFilter({ ...filter, status: 'approved' }); setActiveTab('claims'); }}
          >
            <span className="stat-num">{formatAmount(totalApproved)}</span>
            <span className="stat-text">Approved (Month)</span>
          </div>
          <div
            className="stat-box advance-box"
            onClick={() => setActiveTab('advances')}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-num" style={{ color: '#dc2626' }}>{formatAmount(totalAdvanceDeductions)}</span>
            <span className="stat-text">Advance Deductions</span>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-row">
          {isMimix && outlets.length > 0 && (
            <select
              value={filter.outlet_id}
              onChange={(e) => setFilter({ ...filter, outlet_id: e.target.value })}
            >
              <option value="">All Outlets</option>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          {!isMimix && departments.length > 0 && (
            <select
              value={filter.department_id}
              onChange={(e) => setFilter({ ...filter, department_id: e.target.value })}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <select
            value={filter.employee_id}
            onChange={(e) => setFilter({ ...filter, employee_id: e.target.value })}
          >
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={filter.month}
            onChange={(e) => setFilter({ ...filter, month: parseInt(e.target.value) })}
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={filter.year}
            onChange={(e) => setFilter({ ...filter, year: parseInt(e.target.value) })}
          >
            {[2023, 2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Claims Tab */}
        {activeTab === 'claims' && (
          <>
            {selectedClaims.length > 0 && (
              <div className="bulk-actions">
                <span>{selectedClaims.length} selected</span>
                <button onClick={handleBulkApprove} className="bulk-approve-btn">
                  Approve Selected
                </button>
                <button onClick={() => setSelectedClaims([])} className="clear-btn">
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={selectedClaims.length > 0 && selectedClaims.length === claims.filter(c => c.status === 'pending' && !c.linked_payroll_item_id).length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Date</th>
                      <th>Employee</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Receipt</th>
                      <th>Status</th>
                      <th>AI Info</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="no-data">No claims found</td>
                      </tr>
                    ) : (
                      claims.map(claim => {
                        const aiInfo = getAIInfo(claim);
                        const attention = needsAttention(claim);

                        return (
                          <tr key={claim.id} className={attention ? 'needs-attention' : ''}>
                            <td>
                              {claim.status === 'pending' && !claim.linked_payroll_item_id && (
                                <input
                                  type="checkbox"
                                  checked={selectedClaims.includes(claim.id)}
                                  onChange={() => toggleSelectClaim(claim.id)}
                                />
                              )}
                            </td>
                            <td>{formatDate(claim.claim_date)}</td>
                            <td><strong>{claim.employee_name}</strong></td>
                            <td>
                              <span className="category-badge">{getCategoryLabel(claim.category)}</span>
                            </td>
                            <td className="desc-cell">{claim.description || '-'}</td>
                            <td><strong>{formatAmount(claim.amount)}</strong></td>
                            <td>
                              {claim.receipt_url ? (
                                <a
                                  href={claim.receipt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="receipt-link"
                                  title="View Receipt"
                                >
                                  View
                                </a>
                              ) : (
                                <span className="no-receipt">-</span>
                              )}
                            </td>
                            <td>{getStatusBadge(claim.status)}</td>
                            <td>
                              {claim.linked_payroll_item_id ? (
                                <span className="linked-badge">Linked</span>
                              ) : aiInfo ? (
                                <span
                                  className="ai-reason-badge"
                                  title={aiInfo.reasons.join('\n')}
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    background: aiInfo.type === 'auto-approved' ? '#f0fdf4' : (attention ? '#fef3c7' : '#f3f4f6'),
                                    color: aiInfo.type === 'auto-approved' ? '#16a34a' : (attention ? '#92400e' : '#6b7280'),
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    maxWidth: '150px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    cursor: 'help'
                                  }}
                                >
                                  {aiInfo.type === 'auto-approved' ? '🤖 ' : (attention ? '⚠️ ' : '')}{aiInfo.reasons[0]}
                                </span>
                              ) : '-'}
                            </td>
                            <td>
                              <div className="action-buttons">
                                {claim.status === 'pending' && !claim.linked_payroll_item_id && (
                                  <>
                                    <button onClick={() => handleApprove(claim.id)} className="action-btn approve" title="Approve">✓</button>
                                    <button onClick={() => handleReject(claim.id)} className="action-btn reject" title="Reject">✕</button>
                                    <button onClick={() => handleEdit(claim)} className="action-btn edit" title="Edit">✎</button>
                                  </>
                                )}
                                {claim.status === 'approved' && !claim.linked_payroll_item_id && (
                                  <button onClick={() => handleRevert(claim.id)} className="action-btn revert" title="Revert to Pending">↩</button>
                                )}
                                {!claim.linked_payroll_item_id && (
                                  <button onClick={() => handleDelete(claim.id)} className="action-btn delete" title="Delete">🗑</button>
                                )}
                                {claim.linked_payroll_item_id && (
                                  <span className="locked-indicator" title="Linked to payroll - cannot modify">🔒</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {summary.length > 0 && (
              <div className="category-summary">
                <h3>Category Summary ({filter.month}/{filter.year})</h3>
                <div className="summary-grid">
                  {summary.map(s => (
                    <div key={s.category} className="summary-item">
                      <span className="summary-label">{getCategoryLabel(s.category)}</span>
                      <span className="summary-value">{formatAmount(s.total_amount)}</span>
                      <span className="summary-count">{s.count} claims</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Advances Tab */}
        {activeTab === 'advances' && (
          <div className="advances-section">
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Method</th>
                    <th>Deducted</th>
                    <th>Remaining</th>
                    <th>Deduction Month</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="no-data">No advances found</td>
                    </tr>
                  ) : (
                    advances.map(adv => (
                      <tr key={adv.id}>
                        <td>{formatDate(adv.advance_date)}</td>
                        <td><strong>{adv.employee_name}</strong></td>
                        <td><strong>{formatAmount(adv.amount)}</strong></td>
                        <td className="desc-cell">{adv.reason || '-'}</td>
                        <td>
                          <span className={`method-badge ${adv.deduction_method}`}>
                            {adv.deduction_method === 'full' ? 'Full' : `RM ${adv.installment_amount}/mo`}
                          </span>
                        </td>
                        <td style={{ color: '#16a34a' }}>{formatAmount(adv.total_deducted)}</td>
                        <td style={{ color: '#dc2626' }}>{formatAmount(adv.remaining_balance)}</td>
                        <td>{adv.expected_deduction_month}/{adv.expected_deduction_year}</td>
                        <td>{getStatusBadge(adv.status)}</td>
                        <td>
                          <div className="action-buttons">
                            {adv.status === 'active' && (
                              <button onClick={() => handleCancelAdvance(adv.id)} className="action-btn delete" title="Cancel">✕</button>
                            )}
                            {adv.status === 'completed' && (
                              <span className="locked-indicator" title="Fully deducted">✓</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="info-box" style={{ marginTop: '20px', padding: '15px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#0369a1' }}>How Salary Advances Work</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#0c4a6e' }}>
                <li><strong>Full Deduction:</strong> The entire advance is deducted in the specified month</li>
                <li><strong>Installment:</strong> A fixed amount is deducted each month until fully paid</li>
                <li>Advances are automatically deducted from payroll when the payroll is generated</li>
                <li>Deductions appear in the employee's payslip under "Advance Deduction"</li>
              </ul>
            </div>
          </div>
        )}

        {/* Employee Summary Tab */}
        {activeTab === 'summary' && (
          <div className="summary-section">
            <h3>Employee Claims & Deductions Summary - {new Date(filter.year, filter.month - 1).toLocaleString('en', { month: 'long' })} {filter.year}</h3>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Total Claims</th>
                    <th>Approved</th>
                    <th>Pending</th>
                    <th>Advance Deduction</th>
                    <th>Net to Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(employeeSummary).length === 0 ? (
                    <tr>
                      <td colSpan="6" className="no-data">No data for this period</td>
                    </tr>
                  ) : (
                    Object.entries(employeeSummary).map(([empId, data]) => {
                      const advDed = data.advanceDeduction || 0;
                      const netToSalary = data.approvedClaims - advDed;
                      return (
                        <tr key={empId}>
                          <td><strong>{data.name}</strong></td>
                          <td>{formatAmount(data.totalClaims)}</td>
                          <td style={{ color: '#16a34a' }}>{formatAmount(data.approvedClaims)}</td>
                          <td style={{ color: '#d97706' }}>{formatAmount(data.pendingClaims)}</td>
                          <td style={{ color: '#dc2626' }}>{advDed > 0 ? `-${formatAmount(advDed)}` : '-'}</td>
                          <td style={{ fontWeight: 'bold', color: netToSalary >= 0 ? '#16a34a' : '#dc2626' }}>
                            {formatAmount(netToSalary)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 'bold', background: '#f3f4f6' }}>
                    <td>TOTAL</td>
                    <td>{formatAmount(Object.values(employeeSummary).reduce((s, d) => s + d.totalClaims, 0))}</td>
                    <td style={{ color: '#16a34a' }}>{formatAmount(Object.values(employeeSummary).reduce((s, d) => s + d.approvedClaims, 0))}</td>
                    <td style={{ color: '#d97706' }}>{formatAmount(Object.values(employeeSummary).reduce((s, d) => s + d.pendingClaims, 0))}</td>
                    <td style={{ color: '#dc2626' }}>{formatAmount(Object.values(employeeSummary).reduce((s, d) => s + (d.advanceDeduction || 0), 0))}</td>
                    <td style={{ color: '#16a34a' }}>
                      {formatAmount(
                        Object.values(employeeSummary).reduce((s, d) => s + d.approvedClaims, 0) -
                        Object.values(employeeSummary).reduce((s, d) => s + (d.advanceDeduction || 0), 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="info-box" style={{ marginTop: '20px', padding: '15px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#166534' }}>How Claims Affect Payroll</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#14532d' }}>
                <li><strong>Approved Claims:</strong> Added to gross salary (reimbursement - no EPF/SOCSO/PCB deduction)</li>
                <li><strong>Advance Deductions:</strong> Subtracted from net pay</li>
                <li><strong>Net to Salary:</strong> Approved Claims - Advance Deductions = Amount added to pay</li>
              </ul>
            </div>
          </div>
        )}

        {/* Restrictions Tab */}
        {activeTab === 'restrictions' && (
          <div className="restrictions-section">
            <div className="restrictions-header">
              <h2>Claim Restrictions & Rules</h2>
              <p>The following rules and limits apply to all expense claims</p>
            </div>

            <div className="restrictions-table-container">
              <h3>Claim Limits Summary</h3>
              <table className="restrictions-table">
                <thead>
                  <tr>
                    <th>Claim Type</th>
                    <th>Maximum Limit (RM)</th>
                    <th>Auto-Cap</th>
                    <th>Receipt Required</th>
                  </tr>
                </thead>
                <tbody>
                  {restrictions.map(r => (
                    <tr key={r.category} className={r.autoCapEnabled ? 'auto-cap-row' : ''}>
                      <td><strong>{r.label}</strong></td>
                      <td className="amount-cell">
                        {r.maxAmount ? (
                          <span className="limit-amount">RM {r.maxAmount.toFixed(2)}</span>
                        ) : (
                          <span className="no-limit">No Limit</span>
                        )}
                      </td>
                      <td>
                        {r.autoCapEnabled ? (
                          <span className="badge-yes">Yes</span>
                        ) : (
                          <span className="badge-no">No</span>
                        )}
                      </td>
                      <td>
                        {r.category === 'meal' || r.category === 'parking' ? (
                          <span className="badge-optional">Optional</span>
                        ) : (
                          <span className="badge-yes">Yes</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="restrictions-rules">
              <h3>Detailed Rules & Logic</h3>
              <div className="rules-list">
                {restrictions.map(r => (
                  <div key={r.category} className={`rule-item ${r.autoCapEnabled ? 'auto-cap' : ''}`}>
                    <div className="rule-category">
                      {r.label}
                      {r.autoCapEnabled && <span className="auto-cap-badge">Auto-Cap</span>}
                    </div>
                    <div className="rule-content">
                      <p>{r.rule}</p>
                      {r.maxAmount && (
                        <div className="rule-limit">
                          Max: <strong>RM {r.maxAmount.toFixed(2)}</strong>
                          {r.autoCapEnabled && (
                            <span className="cap-note"> - Amount will be automatically reduced to this limit</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="restrictions-notes">
              <h3>Important Notes</h3>
              <ul>
                <li><strong>Auto-Cap:</strong> Claims marked with "Auto-Cap" will automatically have their amounts adjusted to the maximum limit if the claimed amount exceeds the limit.</li>
                <li><strong>Manual Review:</strong> Claims without auto-cap that exceed limits will require manual approval and may be rejected or adjusted.</li>
                <li><strong>Receipts:</strong> All claims should include receipts for verification. Claims without receipts may be rejected.</li>
                <li><strong>Payroll Link:</strong> Once a claim is linked to payroll, it cannot be modified or deleted.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Claim Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingClaim ? 'Edit Claim' : 'New Claim'}</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    required
                    disabled={editingClaim}
                  >
                    <option value="">Select employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Claim Date *</label>
                    <input
                      type="date"
                      value={form.claim_date}
                      onChange={(e) => setForm({ ...form, claim_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      required
                    >
                      <option value="">Select category</option>
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Amount (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows="3"
                    placeholder="Optional description of the claim"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    {editingClaim ? 'Update' : 'Submit'} Claim
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Advance Modal */}
        {showAdvanceModal && (
          <div className="modal-overlay" onClick={() => setShowAdvanceModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Record Salary Advance</h2>
              <form onSubmit={handleAdvanceSubmit}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={advanceForm.employee_id}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Advance Date *</label>
                    <input
                      type="date"
                      value={advanceForm.advance_date}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, advance_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Amount (RM) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={advanceForm.amount}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason</label>
                  <textarea
                    value={advanceForm.reason}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })}
                    rows="2"
                    placeholder="Optional reason for the advance"
                  />
                </div>
                <div className="form-group">
                  <label>Deduction Method *</label>
                  <select
                    value={advanceForm.deduction_method}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, deduction_method: e.target.value })}
                    required
                  >
                    <option value="full">Full Deduction (deduct all at once)</option>
                    <option value="installment">Installment (deduct monthly)</option>
                  </select>
                </div>
                {advanceForm.deduction_method === 'installment' && (
                  <div className="form-group">
                    <label>Monthly Installment Amount (RM) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={advanceForm.installment_amount}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, installment_amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Deduction Month *</label>
                    <select
                      value={advanceForm.expected_deduction_month}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, expected_deduction_month: parseInt(e.target.value) })}
                      required
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Year *</label>
                    <select
                      value={advanceForm.expected_deduction_year}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, expected_deduction_year: parseInt(e.target.value) })}
                      required
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAdvanceModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    Record Advance
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Claims;
