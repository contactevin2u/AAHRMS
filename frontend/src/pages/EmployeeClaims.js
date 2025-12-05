import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeeClaims.css';

function EmployeeClaims() {
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [filter, setFilter] = useState('all');

  const [form, setForm] = useState({
    claim_type: '',
    amount: '',
    description: '',
    receipt_date: ''
  });

  const claimTypes = [
    { value: 'transport', label: 'Transportation' },
    { value: 'meal', label: 'Meal Allowance' },
    { value: 'medical', label: 'Medical' },
    { value: 'parking', label: 'Parking' },
    { value: 'phone', label: 'Phone/Internet' },
    { value: 'training', label: 'Training/Course' },
    { value: 'other', label: 'Other' }
  ];

  useEffect(() => {
    fetchClaims();
  }, [filter]);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await essApi.getClaims(params);
      setClaims(res.data);
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await essApi.submitClaim(form);
      setShowSubmitModal(false);
      setForm({ claim_type: '', amount: '', description: '', receipt_date: '' });
      fetchClaims();
      alert('Claim submitted successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount || 0);
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
      paid: 'status-paid'
    };
    return classes[status] || '';
  };

  const getClaimTypeLabel = (type) => {
    const found = claimTypes.find(ct => ct.value === type);
    return found ? found.label : type;
  };

  const getTotalAmount = () => {
    return claims.reduce((sum, claim) => sum + parseFloat(claim.amount || 0), 0);
  };

  const getPendingAmount = () => {
    return claims
      .filter(c => c.status === 'pending')
      .reduce((sum, claim) => sum + parseFloat(claim.amount || 0), 0);
  };

  const getApprovedAmount = () => {
    return claims
      .filter(c => c.status === 'approved' || c.status === 'paid')
      .reduce((sum, claim) => sum + parseFloat(claim.amount || 0), 0);
  };

  return (
    <EmployeeLayout>
      <div className="ess-claims">
        <header className="ess-page-header">
          <div>
            <h1>Claims & Reimbursements</h1>
            <p>Submit and track your expense claims</p>
          </div>
          <button className="submit-claim-btn" onClick={() => setShowSubmitModal(true)}>
            + Submit Claim
          </button>
        </header>

        {/* Summary Cards */}
        <div className="claims-summary">
          <div className="summary-card">
            <span className="summary-label">Total Claims</span>
            <span className="summary-value">{formatCurrency(getTotalAmount())}</span>
            <span className="summary-count">{claims.length} claims</span>
          </div>
          <div className="summary-card pending">
            <span className="summary-label">Pending</span>
            <span className="summary-value">{formatCurrency(getPendingAmount())}</span>
            <span className="summary-count">{claims.filter(c => c.status === 'pending').length} claims</span>
          </div>
          <div className="summary-card approved">
            <span className="summary-label">Approved</span>
            <span className="summary-value">{formatCurrency(getApprovedAmount())}</span>
            <span className="summary-count">{claims.filter(c => c.status === 'approved' || c.status === 'paid').length} claims</span>
          </div>
        </div>

        {/* Filter */}
        <div className="filter-bar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Claims</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {loading ? (
          <div className="ess-loading">Loading claims...</div>
        ) : claims.length === 0 ? (
          <div className="no-data-card">
            <p>No claims found</p>
          </div>
        ) : (
          <div className="claims-list">
            {claims.map((claim, idx) => (
              <div
                key={idx}
                className="claim-item"
                onClick={() => setSelectedClaim(claim)}
              >
                <div className="claim-main">
                  <div className="claim-type">
                    <span className="type-badge">{getClaimTypeLabel(claim.claim_type)}</span>
                  </div>
                  <div className="claim-description">{claim.description || 'No description'}</div>
                  <div className="claim-date">
                    Receipt Date: {formatDate(claim.receipt_date)}
                  </div>
                </div>
                <div className="claim-right">
                  <div className="claim-amount">{formatCurrency(claim.amount)}</div>
                  <span className={`status-badge ${getStatusClass(claim.status)}`}>
                    {claim.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit Claim Modal */}
        {showSubmitModal && (
          <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
            <div className="modal claim-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Submit New Claim</h2>
                <button className="close-btn" onClick={() => setShowSubmitModal(false)}>×</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Claim Type *</label>
                    <select
                      value={form.claim_type}
                      onChange={(e) => setForm({ ...form, claim_type: e.target.value })}
                      required
                    >
                      <option value="">Select claim type</option>
                      {claimTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount (MYR) *</label>
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
                      <label>Receipt Date *</label>
                      <input
                        type="date"
                        value={form.receipt_date}
                        onChange={(e) => setForm({ ...form, receipt_date: e.target.value })}
                        max={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Description *</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe your expense claim"
                      rows="3"
                      required
                    />
                  </div>

                  <div className="form-note">
                    <p>Please keep your receipts for verification. You may be asked to provide supporting documents.</p>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="cancel-btn" onClick={() => setShowSubmitModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Claim'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Claim Detail Modal */}
        {selectedClaim && (
          <div className="modal-overlay" onClick={() => setSelectedClaim(null)}>
            <div className="modal claim-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Claim Details</h2>
                <button className="close-btn" onClick={() => setSelectedClaim(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="detail-row">
                  <span className="detail-label">Claim Type</span>
                  <span className="detail-value">{getClaimTypeLabel(selectedClaim.claim_type)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Amount</span>
                  <span className="detail-value amount">{formatCurrency(selectedClaim.amount)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Receipt Date</span>
                  <span className="detail-value">{formatDate(selectedClaim.receipt_date)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Submitted On</span>
                  <span className="detail-value">{formatDate(selectedClaim.created_at)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className={`status-badge ${getStatusClass(selectedClaim.status)}`}>
                    {selectedClaim.status}
                  </span>
                </div>
                <div className="detail-row full">
                  <span className="detail-label">Description</span>
                  <p className="detail-description">{selectedClaim.description || '-'}</p>
                </div>
                {selectedClaim.remarks && (
                  <div className="detail-row full">
                    <span className="detail-label">Remarks</span>
                    <p className="detail-description">{selectedClaim.remarks}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeClaims;
