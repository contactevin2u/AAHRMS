import React, { useState, useEffect } from 'react';
import { claimsApi, employeeApi } from '../api';
import Layout from '../components/Layout';
import './Claims.css';

function Claims() {
  const [claims, setClaims] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [summary, setSummary] = useState([]);

  // Filters
  const [filter, setFilter] = useState({
    employee_id: '',
    status: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState(null);

  // Form
  const [form, setForm] = useState({
    employee_id: '',
    claim_date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: ''
  });

  // Selection for bulk approve
  const [selectedClaims, setSelectedClaims] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchClaims();
    fetchSummary();
  }, [filter]);

  const fetchInitialData = async () => {
    try {
      const [empRes, catRes, countRes] = await Promise.all([
        employeeApi.getAll({ status: 'active' }),
        claimsApi.getCategories(),
        claimsApi.getPendingCount()
      ]);
      setEmployees(empRes.data);
      setCategories(catRes.data);
      setPendingCount(countRes.data.count);
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
    if (window.confirm('Delete this claim?')) {
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

  const toggleSelectClaim = (id) => {
    setSelectedClaims(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    // Only select pending claims that are NOT linked to payroll
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
    return `RM ${parseFloat(amount).toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    const classes = {
      pending: 'status-badge pending',
      approved: 'status-badge approved',
      rejected: 'status-badge rejected'
    };
    return <span className={classes[status] || 'status-badge'}>{status}</span>;
  };

  const getCategoryLabel = (value) => {
    const cat = categories.find(c => c.value === value);
    return cat ? cat.label : value;
  };

  const totalApproved = summary.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);
  const totalPending = claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.amount), 0);

  return (
    <Layout>
      <div className="claims-page">
        <header className="page-header">
          <div>
            <h1>Claims</h1>
            <p>Manage employee expense claims</p>
          </div>
          <div className="header-actions">
            {pendingCount > 0 && (
              <span className="pending-badge">{pendingCount} Pending</span>
            )}
            <button onClick={() => { resetForm(); setShowModal(true); }} className="add-btn">
              + New Claim
            </button>
          </div>
        </header>

        {/* Summary Stats */}
        <div className="stats-row">
          <div className="stat-box">
            <span className="stat-num">{claims.length}</span>
            <span className="stat-text">Total Claims</span>
          </div>
          <div className="stat-box highlight">
            <span className="stat-num">{formatAmount(totalPending)}</span>
            <span className="stat-text">Pending Amount</span>
          </div>
          <div className="stat-box">
            <span className="stat-num">{formatAmount(totalApproved)}</span>
            <span className="stat-text">Approved (Month)</span>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-row">
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

        {/* Bulk Actions */}
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

        {/* Claims Table */}
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
                  <th>Status</th>
                  <th>Linked</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="no-data">No claims found</td>
                  </tr>
                ) : (
                  claims.map(claim => (
                    <tr key={claim.id}>
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
                      <td>{getStatusBadge(claim.status)}</td>
                      <td>
                        {claim.linked_payroll_item_id ? (
                          <span className="linked-badge">Linked</span>
                        ) : '-'}
                      </td>
                      <td>
                        {/* Only show action buttons if pending AND not linked to payroll */}
                        {claim.status === 'pending' && !claim.linked_payroll_item_id && (
                          <>
                            <button onClick={() => handleApprove(claim.id)} className="action-btn approve">Approve</button>
                            <button onClick={() => handleReject(claim.id)} className="action-btn reject">Reject</button>
                            <button onClick={() => handleEdit(claim)} className="action-btn edit">Edit</button>
                            <button onClick={() => handleDelete(claim.id)} className="action-btn delete">Delete</button>
                          </>
                        )}
                        {/* Show locked indicator for linked claims */}
                        {claim.linked_payroll_item_id && (
                          <span className="locked-indicator" title="Linked to payroll - cannot modify">🔒</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Category Summary */}
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
      </div>
    </Layout>
  );
}

export default Claims;
