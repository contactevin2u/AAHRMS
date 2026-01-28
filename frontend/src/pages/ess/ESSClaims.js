import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { useLanguage } from '../../contexts/LanguageContext';

function ESSClaims({ embedded = false }) {
  const { t, language } = useLanguage();
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

  // AI Verification states
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState(null);
  const [showMismatchWarning, setShowMismatchWarning] = useState(false);

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

  // Verify receipt with AI
  const verifyReceipt = async () => {
    if (!submitForm.receipt || !submitForm.amount) {
      return null;
    }

    setVerifying(true);
    setVerification(null);
    setShowMismatchWarning(false);

    try {
      const response = await essApi.verifyReceipt({
        receipt_base64: submitForm.receipt,
        amount: parseFloat(submitForm.amount)
      });

      const result = response.data.verification;
      setVerification(result);

      // Check if rejected (duplicate)
      if (result.isRejected) {
        alert(`Claim Rejected: ${result.rejectionReason}`);
        return result;
      }

      // Check if amount mismatch
      if (!result.amountMatch && result.aiData?.amount !== null) {
        setShowMismatchWarning(true);
      }

      return result;
    } catch (error) {
      console.error('Verification error:', error);
      // If verification fails, allow manual submission
      setVerification({ requiresManualApproval: true, warnings: ['Receipt verification unavailable. Manual approval required.'] });
      return null;
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate receipt is uploaded
    if (!submitForm.receipt) {
      alert('Please upload a receipt (image or PDF)');
      return;
    }

    // Run verification if not done yet
    let verificationResult = verification;
    if (!verificationResult) {
      verificationResult = await verifyReceipt();
    }

    // If duplicate detected, don't submit
    if (verificationResult?.isRejected) {
      return;
    }

    // If amount mismatch and user hasn't acknowledged
    if (verificationResult && !verificationResult.amountMatch && verificationResult.aiData?.amount !== null && !showMismatchWarning) {
      setShowMismatchWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const response = await essApi.submitClaim({
        category: submitForm.category,
        amount: parseFloat(submitForm.amount),
        claim_date: submitForm.claim_date,
        description: submitForm.description,
        receipt_base64: submitForm.receipt,
        amount_mismatch_ignored: showMismatchWarning && !verificationResult?.amountMatch
      });

      setShowSubmitModal(false);
      setSubmitForm({ category: '', amount: '', claim_date: '', description: '', receipt: null });
      setVerification(null);
      setShowMismatchWarning(false);

      // Show appropriate message
      if (response.data.autoApproved) {
        alert('Claim submitted and auto-approved!');
      } else {
        alert('Claim submitted successfully! Pending approval.');
      }
      fetchClaims();
    } catch (error) {
      const errorData = error.response?.data;
      if (errorData?.autoRejected) {
        alert(`Claim Rejected: ${errorData.reason}`);
      } else {
        alert(errorData?.error || 'Failed to submit claim');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmountChange = (e) => {
    setSubmitForm({...submitForm, amount: e.target.value});
    // Reset verification when amount changes
    setVerification(null);
    setShowMismatchWarning(false);
  };

  const useAiAmount = () => {
    if (verification?.aiData?.amount) {
      setSubmitForm({...submitForm, amount: verification.aiData.amount.toString()});
      setShowMismatchWarning(false);
      // Re-verify with new amount
      setTimeout(() => verifyReceipt(), 100);
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

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

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
      const maxSize = 5 * 1024 * 1024;

      // Reset verification when receipt changes
      setVerification(null);
      setShowMismatchWarning(false);

      if (file.type === 'application/pdf') {
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
        try {
          const compressedBase64 = await compressImage(file);
          setSubmitForm({...submitForm, receipt: compressedBase64});
        } catch (err) {
          console.error('Error compressing image:', err);
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
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const getStatusBadge = (status, autoApproved) => {
    const styles = {
      pending: { bg: '#fef3c7', color: '#d97706' },
      approved: { bg: '#d1fae5', color: '#059669' },
      rejected: { bg: '#fee2e2', color: '#dc2626' }
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
        {autoApproved && status === 'approved' && ' (Auto)'}
      </span>
    );
  };

  const getPayrollMonthBadge = (payrollMonth, payrollYear) => {
    if (!payrollMonth || !payrollYear) return null;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[payrollMonth - 1];
    return (
      <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600' }}>
        {monthName} {payrollYear} Payroll
      </span>
    );
  };

  const totalPending = claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

  const content = (
      <div style={{ paddingBottom: embedded ? '20px' : '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>{t('claims.title')}</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>{t('claims.subtitle')}</p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#fef3c7', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#92400e' }}>{t('claims.pending')}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#d97706' }}>{formatCurrency(totalPending)}</div>
          </div>
          <div style={{ flex: 1, background: '#d1fae5', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#065f46' }}>{t('claims.approved')}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>{formatCurrency(totalApproved)}</div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={() => setShowSubmitModal(true)}
          style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #1976d2, #1565c0)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '24px' }}
        >
          + {t('claims.submitClaim')}
        </button>

        {/* Claims List */}
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{t('claims.recentClaims')}</h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
        ) : claims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div style={{ color: '#64748b' }}>{t('claims.noClaims')}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {claims.map(claim => (
              <div key={claim.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{claim.category}</span>
                  {getStatusBadge(claim.status, claim.auto_approved)}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1976d2', marginBottom: '8px' }}>{formatCurrency(claim.amount)}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>{formatDate(claim.claim_date)} - {claim.description}</div>
                {(claim.payroll_month && claim.payroll_year) && (
                  <div style={{ marginTop: '4px' }}>
                    {getPayrollMonthBadge(claim.payroll_month, claim.payroll_year)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submit Modal */}
        {showSubmitModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setShowSubmitModal(false); setVerification(null); setShowMismatchWarning(false); }}>
            <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{t('claims.submitClaim')}</h2>
                <button onClick={() => { setShowSubmitModal(false); setVerification(null); setShowMismatchWarning(false); }} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
              </div>
              <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>{t('claims.claimType')} *</label>
                  <select value={submitForm.category} onChange={e => setSubmitForm({...submitForm, category: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px' }}>
                    <option value="">{t('claims.selectType')}</option>
                    {claimTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>{t('claims.amount')} (RM) *</label>
                  <input type="number" step="0.01" value={submitForm.amount} onChange={handleAmountChange} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} placeholder="0.00" />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>{t('claims.claimDate')} *</label>
                  <input type="date" value={submitForm.claim_date} onChange={e => setSubmitForm({...submitForm, claim_date: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>{t('claims.description')} *</label>
                  <textarea value={submitForm.description} onChange={e => setSubmitForm({...submitForm, description: e.target.value})} required rows={3} style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} placeholder={t('claims.descriptionPlaceholder')} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>{t('claims.receipt')} *</label>
                  <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleReceiptChange} required style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{t('claims.receiptHint')}</div>
                </div>

                {/* Verify Receipt Button */}
                {submitForm.receipt && submitForm.amount && !verification && (
                  <button
                    type="button"
                    onClick={verifyReceipt}
                    disabled={verifying}
                    style={{ width: '100%', padding: '12px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '16px', opacity: verifying ? 0.7 : 1 }}
                  >
                    {verifying ? t('claims.verifying') : t('claims.verifyReceipt')}
                  </button>
                )}

                {/* Verification Result */}
                {verification && (
                  <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: verification.isRejected ? '#fef2f2' : verification.canAutoApprove ? '#f0fdf4' : '#fffbeb', border: `1px solid ${verification.isRejected ? '#fecaca' : verification.canAutoApprove ? '#bbf7d0' : '#fde68a'}` }}>
                    {verification.isRejected ? (
                      <div style={{ color: '#dc2626', fontSize: '14px' }}>
                        <strong>Rejected:</strong> {verification.rejectionReason}
                      </div>
                    ) : verification.canAutoApprove ? (
                      <div style={{ color: '#16a34a', fontSize: '14px' }}>
                        <strong>Verified!</strong> Receipt matches. Will be auto-approved.
                        {verification.aiData && (
                          <div style={{ marginTop: '8px', fontSize: '13px', color: '#15803d' }}>
                            Detected: {verification.aiData.merchant} - RM {verification.aiData.amount?.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: '#ca8a04', fontSize: '14px' }}>
                        <strong>Manual Approval Required</strong>
                        {verification.warnings?.map((w, i) => (
                          <div key={i} style={{ marginTop: '4px', fontSize: '13px' }}>{w}</div>
                        ))}
                        {verification.aiData && (
                          <div style={{ marginTop: '8px', fontSize: '13px' }}>
                            AI detected: {verification.aiData.merchant || 'Unknown'} - RM {verification.aiData.amount?.toFixed(2) || 'N/A'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Amount Mismatch Warning */}
                {showMismatchWarning && verification && !verification.amountMatch && verification.aiData?.amount !== null && (
                  <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: '#fef3c7', border: '1px solid #fcd34d' }}>
                    <div style={{ color: '#92400e', fontSize: '14px', marginBottom: '8px' }}>
                      <strong>Amount Mismatch!</strong>
                      <br />
                      Your amount: <strong>RM {parseFloat(submitForm.amount).toFixed(2)}</strong>
                      <br />
                      Receipt shows: <strong>RM {verification.aiData.amount.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={useAiAmount}
                        style={{ flex: 1, padding: '10px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                      >
                        Use RM {verification.aiData.amount.toFixed(2)}
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        style={{ flex: 1, padding: '10px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                      >
                        Keep My Amount
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: '#78716c', marginTop: '8px' }}>
                      * Keeping your amount requires manual approval
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button type="button" onClick={() => { setShowSubmitModal(false); setVerification(null); setShowMismatchWarning(false); }} style={{ flex: 1, padding: '14px', border: '1px solid #e5e7eb', background: 'white', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>{t('common.cancel')}</button>
                  <button
                    type="submit"
                    disabled={submitting || verifying || verification?.isRejected}
                    style={{ flex: 1, padding: '14px', border: 'none', background: 'linear-gradient(135deg, #1976d2, #1565c0)', color: 'white', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', opacity: (submitting || verifying || verification?.isRejected) ? 0.7 : 1 }}
                  >
                    {submitting ? t('claims.submitting') : verifying ? t('claims.verifying') : t('common.submit')}
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
