import React, { useState, useEffect, useRef } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { compressReceiptPhoto, getBase64SizeKB } from '../../utils/imageCompression';
import './ESSClaims.css';

function ESSClaims() {
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  // Camera states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedReceipt, setCapturedReceipt] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);

  const [form, setForm] = useState({
    category: '',
    amount: '',
    description: '',
    claim_date: '',
    receipt_url: ''
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
  }, [activeTab]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const params = activeTab !== 'all' ? { status: activeTab } : {};
      const res = await essApi.getClaims(params);
      setClaims(res.data);
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      alert('Unable to access camera. Please allow camera permission.');
    }
  };

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.setAttribute('autoplay', '');
      videoRef.current.setAttribute('playsinline', '');
      videoRef.current.setAttribute('muted', '');
      videoRef.current.play().catch(err => console.error('Video play error:', err));
    }
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureReceipt = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setProcessingImage(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.95);

    try {
      const compressedDataUrl = await compressReceiptPhoto(rawDataUrl);
      const sizeKB = getBase64SizeKB(compressedDataUrl);
      console.log(`Receipt scanned: ${sizeKB} KB`);

      setCapturedReceipt(compressedDataUrl);
      setForm(prev => ({ ...prev, receipt_url: compressedDataUrl }));
      stopCamera();
    } catch (err) {
      console.error('Compression error:', err);
      setCapturedReceipt(rawDataUrl);
      setForm(prev => ({ ...prev, receipt_url: rawDataUrl }));
      stopCamera();
    } finally {
      setProcessingImage(false);
    }
  };

  const retakeReceipt = () => {
    setCapturedReceipt(null);
    setForm(prev => ({ ...prev, receipt_url: '' }));
    startCamera();
  };

  const removeReceipt = () => {
    setCapturedReceipt(null);
    setForm(prev => ({ ...prev, receipt_url: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await essApi.submitClaim(form);
      setShowSubmitModal(false);
      setForm({ category: '', amount: '', description: '', claim_date: '', receipt_url: '' });
      setCapturedReceipt(null);
      stopCamera();
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

  const getPendingAmount = () => {
    return claims.filter(c => c.status === 'pending')
      .reduce((sum, claim) => sum + parseFloat(claim.amount || 0), 0);
  };

  const getApprovedAmount = () => {
    return claims.filter(c => c.status === 'approved' || c.status === 'paid')
      .reduce((sum, claim) => sum + parseFloat(claim.amount || 0), 0);
  };

  return (
    <ESSLayout>
      <div className="ess-claims-page">
        {/* Page Header */}
        <div className="ess-page-header">
          <div className="header-content">
            <h1>Claims</h1>
            <p>Submit and track expense claims</p>
          </div>
          <button className="apply-btn" onClick={() => setShowSubmitModal(true)}>
            + Submit
          </button>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card pending">
            <span className="summary-value">{formatCurrency(getPendingAmount())}</span>
            <span className="summary-label">Pending</span>
          </div>
          <div className="summary-card approved">
            <span className="summary-value">{formatCurrency(getApprovedAmount())}</span>
            <span className="summary-label">Approved</span>
          </div>
        </div>

        {/* Tab Filter */}
        <div className="ess-tabs">
          {['all', 'pending', 'approved', 'rejected'].map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="ess-loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">&#x1F4DD;</span>
            <p>No claims found</p>
          </div>
        ) : (
          <div className="claims-list">
            {claims.map((claim, idx) => (
              <div
                key={idx}
                className="claim-card"
                onClick={() => setSelectedClaim(claim)}
              >
                <div className="claim-main">
                  <span className="claim-type">{getClaimTypeLabel(claim.category)}</span>
                  <span className="claim-desc">{claim.description || 'No description'}</span>
                  <span className="claim-date">{formatDate(claim.claim_date)}</span>
                </div>
                <div className="claim-right">
                  <span className="claim-amount">{formatCurrency(claim.amount)}</span>
                  <span className={`claim-status ${getStatusClass(claim.status)}`}>
                    {claim.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit Claim Modal */}
        {showSubmitModal && (
          <div className="ess-modal-overlay" onClick={() => { stopCamera(); setShowSubmitModal(false); }}>
            <div className="ess-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Submit Claim</h2>
                <button className="close-btn" onClick={() => { stopCamera(); setShowSubmitModal(false); }}>&#x2715;</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Claim Type</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      required
                    >
                      <option value="">Select type</option>
                      {claimTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount (RM)</label>
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
                      <label>Receipt Date</label>
                      <input
                        type="date"
                        value={form.claim_date}
                        onChange={(e) => setForm({ ...form, claim_date: e.target.value })}
                        max={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe your expense"
                      rows="2"
                      required
                    />
                  </div>

                  {/* Receipt Photo */}
                  <div className="form-group">
                    <label>Receipt Photo</label>
                    <div className="receipt-section">
                      {!cameraActive && !capturedReceipt && (
                        <button type="button" onClick={startCamera} className="scan-btn">
                          &#x1F4F7; Scan Receipt
                        </button>
                      )}

                      {cameraActive && (
                        <div className="camera-view">
                          <video ref={videoRef} autoPlay playsInline muted />
                          <div className="camera-actions">
                            <button type="button" onClick={captureReceipt} className="capture-btn" disabled={processingImage}>
                              {processingImage ? 'Processing...' : 'Capture'}
                            </button>
                            <button type="button" onClick={stopCamera} className="cancel-btn">Cancel</button>
                          </div>
                        </div>
                      )}

                      {capturedReceipt && (
                        <div className="receipt-preview">
                          <img src={capturedReceipt} alt="Receipt" />
                          <div className="receipt-actions">
                            <button type="button" onClick={retakeReceipt}>Retake</button>
                            <button type="button" onClick={removeReceipt}>Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="cancel-btn" onClick={() => { stopCamera(); setShowSubmitModal(false); }}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Claim Detail Modal */}
        {selectedClaim && (
          <div className="ess-modal-overlay" onClick={() => setSelectedClaim(null)}>
            <div className="ess-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Claim Details</h2>
                <button className="close-btn" onClick={() => setSelectedClaim(null)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                <div className="detail-item">
                  <span className="label">Type</span>
                  <span className="value">{getClaimTypeLabel(selectedClaim.category)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Amount</span>
                  <span className="value amount">{formatCurrency(selectedClaim.amount)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Receipt Date</span>
                  <span className="value">{formatDate(selectedClaim.claim_date)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Status</span>
                  <span className={`value status ${getStatusClass(selectedClaim.status)}`}>
                    {selectedClaim.status}
                  </span>
                </div>
                <div className="detail-item full">
                  <span className="label">Description</span>
                  <p className="value">{selectedClaim.description || '-'}</p>
                </div>
                {selectedClaim.remarks && (
                  <div className="detail-item full">
                    <span className="label">Remarks</span>
                    <p className="value">{selectedClaim.remarks}</p>
                  </div>
                )}
                {selectedClaim.receipt_url && (
                  <div className="detail-item full">
                    <span className="label">Receipt</span>
                    <img src={selectedClaim.receipt_url} alt="Receipt" className="receipt-image" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </ESSLayout>
  );
}

export default ESSClaims;
