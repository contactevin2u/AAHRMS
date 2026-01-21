import React, { useState, useEffect, useRef, useCallback } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import { compressReceiptPhoto, getBase64SizeKB } from '../utils/imageCompression';
import './EmployeeClaims.css';

function EmployeeClaims() {
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [filter, setFilter] = useState('all');

  // Camera states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedReceipt, setCapturedReceipt] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(null);

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
  }, [filter]);

  // Check camera permission on mount (does NOT trigger popup)
  useEffect(() => {
    const checkCameraPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'camera' });
        setCameraPermission(result.state);
        result.onchange = () => setCameraPermission(result.state);
      } catch {
        setCameraPermission('prompt');
      }
    };
    checkCameraPermission();
  }, []);

  // Stop camera helper function
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // CLEANUP: Stop camera on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // CLEANUP: Stop camera when navigating away or tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && streamRef.current) {
        stopCamera();
      }
    };

    const handleBeforeUnload = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [stopCamera]);

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

  // Camera functions for receipt scanning - ONLY on button click
  const startCamera = async () => {
    // Check if camera permission is denied
    if (cameraPermission === 'denied') {
      alert('Camera blocked. Please enable camera in browser settings.');
      return;
    }

    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Use back camera for document scanning
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },  // Back camera for documents
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      streamRef.current = stream;
      // Set camera active first so video element renders
      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setCameraPermission('denied');
        alert('Camera permission denied. Please allow camera access.');
      } else {
        alert('Unable to access camera. Please check your device.');
      }
    }
  };

  // Attach stream to video element when camera becomes active
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      // Clear any existing stream
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

      videoRef.current.srcObject = streamRef.current;

      // For iOS Safari compatibility
      videoRef.current.setAttribute('autoplay', '');
      videoRef.current.setAttribute('playsinline', '');
      videoRef.current.setAttribute('muted', '');

      // Play the video
      videoRef.current.play().catch(err => {
        console.error('Video play error:', err);
      });
    }
  }, [cameraActive]);

  const captureReceipt = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setProcessingImage(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Get raw image data
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.95);

    try {
      // Compress with document enhancement (1200px, 70%, with sharpening)
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

  // Handle file upload (images and PDFs)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
        setCapturedReceipt(reader.result);
        setForm(prev => ({ ...prev, receipt_url: reader.result }));
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('image/')) {
      // Compress images using existing utility
      setProcessingImage(true);
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const compressedDataUrl = await compressReceiptPhoto(reader.result);
            const sizeKB = getBase64SizeKB(compressedDataUrl);
            console.log(`Receipt uploaded: ${sizeKB} KB`);
            setCapturedReceipt(compressedDataUrl);
            setForm(prev => ({ ...prev, receipt_url: compressedDataUrl }));
          } catch (err) {
            console.error('Compression error:', err);
            setCapturedReceipt(reader.result);
            setForm(prev => ({ ...prev, receipt_url: reader.result }));
          } finally {
            setProcessingImage(false);
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('File read error:', err);
        setProcessingImage(false);
      }
    } else {
      alert('Please upload an image or PDF file.');
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate receipt is uploaded
    if (!form.receipt_url) {
      alert('Please upload or scan a receipt (image or PDF)');
      return;
    }

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
    // Exclude rejected claims from total
    return claims
      .filter(c => c.status !== 'rejected')
      .reduce((sum, claim) => sum + parseFloat(claim.amount || 0), 0);
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
                    <span className="type-badge">{getClaimTypeLabel(claim.category)}</span>
                  </div>
                  <div className="claim-description">{claim.description || 'No description'}</div>
                  <div className="claim-date">
                    Receipt Date: {formatDate(claim.claim_date)}
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
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
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
                        value={form.claim_date}
                        onChange={(e) => setForm({ ...form, claim_date: e.target.value })}
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

                  {/* Receipt Photo Section */}
                  <div className="form-group">
                    <label>Receipt *</label>
                    <div className="receipt-capture-section">
                      {!cameraActive && !capturedReceipt && (
                        <div className="receipt-upload-options">
                          <button type="button" onClick={startCamera} className="scan-receipt-btn">
                            Scan Receipt
                          </button>
                          <span className="upload-divider">or</span>
                          <label className="file-upload-btn">
                            Upload File
                            <input
                              type="file"
                              accept="image/*,.pdf,application/pdf"
                              onChange={handleFileUpload}
                              style={{ display: 'none' }}
                            />
                          </label>
                        </div>
                      )}

                      {cameraActive && (
                        <div className="camera-preview">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            webkit-playsinline="true"
                            style={{ width: '100%', height: 'auto' }}
                          />
                          <div className="camera-controls">
                            <button
                              type="button"
                              onClick={captureReceipt}
                              className="capture-btn"
                              disabled={processingImage}
                            >
                              {processingImage ? 'Processing...' : 'Capture'}
                            </button>
                            <button type="button" onClick={stopCamera} className="cancel-camera-btn">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {processingImage && !cameraActive && (
                        <div className="processing-indicator">Processing image...</div>
                      )}

                      {capturedReceipt && (
                        <div className="receipt-preview">
                          {capturedReceipt.startsWith('data:application/pdf') ? (
                            <div className="pdf-preview">
                              <span className="pdf-icon">📄</span>
                              <span>PDF Receipt Uploaded</span>
                            </div>
                          ) : (
                            <img src={capturedReceipt} alt="Receipt" />
                          )}
                          <div className="receipt-actions">
                            <button type="button" onClick={retakeReceipt} className="retake-btn">
                              Retake
                            </button>
                            <button type="button" onClick={removeReceipt} className="remove-btn">
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <small className="form-hint">Scan with camera or upload image/PDF (max 5MB). Images will be compressed automatically.</small>
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
                  <span className="detail-value">{getClaimTypeLabel(selectedClaim.category)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Amount</span>
                  <span className="detail-value amount">{formatCurrency(selectedClaim.amount)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Receipt Date</span>
                  <span className="detail-value">{formatDate(selectedClaim.claim_date)}</span>
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
        {/* Hidden canvas for capturing photos */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeClaims;
