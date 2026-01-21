import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';

function ESSClaims({ embedded = false }) {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    category: '',
    amount: '',
    claim_date: '',
    description: '',
    receipt: null
  });

  const claimTypes = ['Transport', 'Meal', 'Parking', 'Medical', 'Phone', 'Other'];

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    try {
      const response = await essApi.getClaims();
      setClaims(response.data || []);
    } catch (error) {
      console.error('Error fetching claims:', error);
      setClaims([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate receipt is uploaded
    if (!submitForm.receipt) {
      alert('Please upload a receipt (image or PDF)');
      return;
    }

    setSubmitting(true);
    try {
      await essApi.submitClaim({
        category: submitForm.category,
        amount: parseFloat(submitForm.amount),
        claim_date: submitForm.claim_date,
        description: submitForm.description,
        receipt_base64: submitForm.receipt
      });
      setShowSubmitModal(false);
      setSubmitForm({ category: '', amount: '', claim_date: '', description: '', receipt: null });
      alert('Claim submitted successfully!');
      fetchClaims();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  };

  const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale down if larger than maxWidth
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to compressed JPEG
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleReceiptChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const maxSize = 5 * 1024 * 1024; // 5MB limit

      if (file.type === 'application/pdf') {
        // PDF handling with size limit
        if (file.size > maxSize) {
          alert('PDF file is too large. Maximum size is 5MB. Please compress your PDF before uploading.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          setSubmitForm({...submitForm, receipt: reader.result});
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('image/')) {
        // Compress images
        try {
          const compressedBase64 = await compressImage(file);
          setSubmitForm({...submitForm, receipt: compressedBase64});
        } catch (err) {
          console.error('Error compressing image:', err);
          // Fallback to original if compression fails
          const reader = new FileReader();
          reader.onloadend = () => {
            setSubmitForm({...submitForm, receipt: reader.result});
          };
          reader.readAsDataURL(file);
        }
      } else {
        alert('Please upload an image or PDF file.');
        e.target.value = '';
      }
    }
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

  const totalPending = claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

  const content = (
      <div style={{ paddingBottom: embedded ? '20px' : '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>Claims</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Submit and track expense claims</p>
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
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading claims...</div>
        ) : claims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div style={{ color: '#64748b' }}>No claims submitted yet</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {claims.map(claim => (
              <div key={claim.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{claim.category}</span>
                  {getStatusBadge(claim.status)}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1976d2', marginBottom: '8px' }}>{formatCurrency(claim.amount)}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>{formatDate(claim.claim_date)} - {claim.description}</div>
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
                  <select value={submitForm.category} onChange={e => setSubmitForm({...submitForm, category: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px' }}>
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
                  <input type="date" value={submitForm.claim_date} onChange={e => setSubmitForm({...submitForm, claim_date: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Description *</label>
                  <textarea value={submitForm.description} onChange={e => setSubmitForm({...submitForm, description: e.target.value})} required rows={3} style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} placeholder="Enter claim details" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Receipt *</label>
                  <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleReceiptChange} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Accepted: Images or PDF (max 5MB)</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button type="button" onClick={() => setShowSubmitModal(false)} style={{ flex: 1, padding: '14px', border: '1px solid #e5e7eb', background: 'white', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={submitting} style={{ flex: 1, padding: '14px', border: 'none', background: 'linear-gradient(135deg, #1976d2, #1565c0)', color: 'white', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Submitting...' : 'Submit'}
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

export default ESSClaims;
