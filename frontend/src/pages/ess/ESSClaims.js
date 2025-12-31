import React, { useState } from 'react';
import ESSLayout from '../../components/ESSLayout';
import ComingSoon from '../../components/ComingSoon';
import { isTestUser } from '../../utils/permissions';

function ESSClaims() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');

  if (!isTestUser(employeeInfo)) {
    return <ComingSoon title="Claims" />;
  }

  return <ESSClaimsContent employeeInfo={employeeInfo} />;
}

function ESSClaimsContent({ employeeInfo }) {
  const [activeTab, setActiveTab] = useState('submit');
  const [claims, setClaims] = useState([
    { id: 1, type: 'Transport', amount: 150.00, date: '2026-01-02', status: 'pending', description: 'Grab to client meeting' },
    { id: 2, type: 'Meal', amount: 45.50, date: '2025-12-28', status: 'approved', description: 'Lunch with client' }
  ]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    type: '',
    amount: '',
    date: '',
    description: '',
    receipt: null
  });

  const claimTypes = ['Transport', 'Meal', 'Parking', 'Medical', 'Phone', 'Other'];

  const handleSubmit = (e) => {
    e.preventDefault();
    const newClaim = {
      id: claims.length + 1,
      type: submitForm.type,
      amount: parseFloat(submitForm.amount),
      date: submitForm.date,
      status: 'pending',
      description: submitForm.description
    };
    setClaims([newClaim, ...claims]);
    setShowSubmitModal(false);
    setSubmitForm({ type: '', amount: '', date: '', description: '', receipt: null });
    alert('Claim submitted successfully!');
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
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

  const totalPending = claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0);

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>Claims</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Submit and track expense claims</p>
        </div>

        <div style={{ background: '#dbeafe', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#1e40af' }}>
          Test Mode - Full Claims Features Enabled
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#fef3c7', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#92400e' }}>Pending</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#d97706' }}>{formatCurrency(totalPending)}</div>
          </div>
          <div style={{ flex: 1, background: '#d1fae5', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#065f46' }}>Approved</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>{formatCurrency(totalApproved)}</div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={() => setShowSubmitModal(true)}
          style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #1976d2, #1565c0)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '24px' }}
        >
          + Submit Claim
        </button>

        {/* Claims List */}
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Recent Claims</h3>
        {claims.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>No claims submitted</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {claims.map(claim => (
              <div key={claim.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{claim.type}</span>
                  {getStatusBadge(claim.status)}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1976d2', marginBottom: '8px' }}>{formatCurrency(claim.amount)}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>{formatDate(claim.date)} - {claim.description}</div>
              </div>
            ))}
          </div>
        )}

        {/* Submit Modal */}
        {showSubmitModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowSubmitModal(false)}>
            <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Submit Claim</h2>
                <button onClick={() => setShowSubmitModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
              </div>
              <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Claim Type *</label>
                  <select value={submitForm.type} onChange={e => setSubmitForm({...submitForm, type: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px' }}>
                    <option value="">Select type</option>
                    {claimTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Amount (RM) *</label>
                  <input type="number" step="0.01" value={submitForm.amount} onChange={e => setSubmitForm({...submitForm, amount: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} placeholder="0.00" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Date *</label>
                  <input type="date" value={submitForm.date} onChange={e => setSubmitForm({...submitForm, date: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Description *</label>
                  <textarea value={submitForm.description} onChange={e => setSubmitForm({...submitForm, description: e.target.value})} required rows={3} style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} placeholder="Enter claim details" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Receipt (optional)</label>
                  <input type="file" accept="image/*" style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button type="button" onClick={() => setShowSubmitModal(false)} style={{ flex: 1, padding: '14px', border: '1px solid #e5e7eb', background: 'white', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ flex: 1, padding: '14px', border: 'none', background: 'linear-gradient(135deg, #1976d2, #1565c0)', color: 'white', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>Submit</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSClaims;
