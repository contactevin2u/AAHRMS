import React, { useState, useEffect, useRef, useCallback } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { compressReceiptPhoto, getBase64SizeKB } from '../../utils/imageCompression';
import { canApproveClaims, isSupervisorOrManager } from '../../utils/permissions';
import './ESSClaims.css';

function ESSClaims() {
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [teamClaims, setTeamClaims] = useState([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [mainTab, setMainTab] = useState('my'); // 'my' or 'team'
  const [activeTab, setActiveTab] = useState('all');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [claimToReject, setClaimToReject] = useState(null);

  // Camera states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedReceipt, setCapturedReceipt] = useState(null);
  const [receiptType, setReceiptType] = useState(null); // 'image' or 'pdf'
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
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      const info = JSON.parse(storedInfo);
      setEmployeeInfo(info);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'my') {
      fetchClaims();
    } else if (mainTab === 'team') {
      fetchTeamClaims();
    }
  }, [mainTab, activeTab]);

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

  const showTeamTab = canApproveClaims(employeeInfo);

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

  const fetchTeamClaims = async () => {
    try {
      setLoading(true);
      const res = await essApi.getTeamPendingClaims();
      setTeamClaims(res.data);
    } catch (error) {
      console.error('Error fetching team claims:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClaim = async (claim) => {
    if (!window.confirm(`Approve claim of ${formatCurrency(claim.amount)} from ${claim.employee_name}?`)) return;

    try {
      setSubmitting(true);
      await essApi.approveClaim(claim.id, {});
      alert('Claim approved successfully');
      setSelectedClaim(null);
      fetchTeamClaims();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve claim');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectClaim = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      setSubmitting(true);
      await essApi.rejectClaim(claimToReject.id, { remarks: rejectReason });
      alert('Claim rejected');
      setShowRejectModal(false);
      setClaimToReject(null);
      setRejectReason('');
      setSelectedClaim(null);
      fetchTeamClaims();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reject claim');
    } finally {
      setSubmitting(false);
    }
  };

  const openRejectModal = (claim) => {
    setClaimToReject(claim);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // Start camera - ONLY on button click
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
      if (err.name === 'NotAllowedError') {
        setCameraPermission('denied');
        alert('Camera permission denied. Please allow camera access.');
      } else {
        alert('Unable to access camera. Please check your device.');
      }
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
      setReceiptType('image');
      setForm(prev => ({ ...prev, receipt_url: compressedDataUrl }));
      stopCamera();
    } catch (err) {
      console.error('Compression error:', err);
      setCapturedReceipt(rawDataUrl);
      setReceiptType('image');
      setForm(prev => ({ ...prev, receipt_url: rawDataUrl }));
      stopCamera();
    } finally {
      setProcessingImage(false);
    }
  };

  // Handle file upload (image or PDF)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setProcessingImage(true);

    const isPDF = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');

    if (!isPDF && !isImage) {
      alert('Please upload an image or PDF file');
      setProcessingImage(false);
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      setProcessingImage(false);
      return;
    }

    try {
      if (isPDF) {
        // For PDF, convert to base64 directly (no compression)
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target.result;
          setCapturedReceipt(base64);
          setReceiptType('pdf');
          setForm(prev => ({ ...prev, receipt_url: base64 }));
          setProcessingImage(false);
        };
        reader.onerror = () => {
          alert('Failed to read PDF file');
          setProcessingImage(false);
        };
        reader.readAsDataURL(file);
      } else {
        // For images, compress while maintaining text clarity
        const reader = new FileReader();
        reader.onload = async (event) => {
          const rawDataUrl = event.target.result;
          try {
            const compressedDataUrl = await compressReceiptPhoto(rawDataUrl);
            const sizeKB = getBase64SizeKB(compressedDataUrl);
            console.log(`Receipt uploaded: ${sizeKB} KB`);

            setCapturedReceipt(compressedDataUrl);
            setReceiptType('image');
            setForm(prev => ({ ...prev, receipt_url: compressedDataUrl }));
          } catch (err) {
            console.error('Compression error:', err);
            setCapturedReceipt(rawDataUrl);
            setReceiptType('image');
            setForm(prev => ({ ...prev, receipt_url: rawDataUrl }));
          } finally {
            setProcessingImage(false);
          }
        };
        reader.onerror = () => {
          alert('Failed to read image file');
          setProcessingImage(false);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('File upload error:', err);
      alert('Failed to process file');
      setProcessingImage(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const retakeReceipt = () => {
    setCapturedReceipt(null);
    setReceiptType(null);
    setForm(prev => ({ ...prev, receipt_url: '' }));
    startCamera();
  };

  const removeReceipt = () => {
    setCapturedReceipt(null);
    setReceiptType(null);
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
      setReceiptType(null);
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
          {mainTab === 'my' && (
            <button className="apply-btn" onClick={() => setShowSubmitModal(true)}>
              + Submit
            </button>
          )}
        </div>

        {/* Main Tab Switcher (My Claims / Team) */}
        {showTeamTab && (
          <div className="main-tabs">
            <button
              className={`main-tab ${mainTab === 'my' ? 'active' : ''}`}
              onClick={() => setMainTab('my')}
            >
              My Claims
            </button>
            <button
              className={`main-tab ${mainTab === 'team' ? 'active' : ''}`}
              onClick={() => setMainTab('team')}
            >
              Team
              {teamClaims.length > 0 && <span className="tab-badge">{teamClaims.length}</span>}
            </button>
          </div>
        )}

        {/* My Claims View */}
        {mainTab === 'my' && (
          <>
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
          </>
        )}

        {loading ? (
          <div className="ess-loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        ) : mainTab === 'my' ? (
          // My Claims List
          claims.length === 0 ? (
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
                  onClick={() => setSelectedClaim({ ...claim, isTeamClaim: false })}
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
          )
        ) : (
          // Team Claims List
          teamClaims.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">&#x2705;</span>
              <p>No pending claims to approve</p>
            </div>
          ) : (
            <div className="claims-list">
              {teamClaims.map((claim, idx) => (
                <div
                  key={idx}
                  className="claim-card team-claim"
                  onClick={() => setSelectedClaim({ ...claim, isTeamClaim: true })}
                >
                  <div className="claim-main">
                    <span className="claim-employee">{claim.employee_name}</span>
                    <span className="claim-type">{getClaimTypeLabel(claim.category)}</span>
                    <span className="claim-desc">{claim.description || 'No description'}</span>
                    <span className="claim-date">{formatDate(claim.claim_date)}</span>
                  </div>
                  <div className="claim-right">
                    <span className="claim-amount">{formatCurrency(claim.amount)}</span>
                    <span className="claim-status status-pending">pending</span>
                  </div>
                </div>
              ))}
            </div>
          )
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

                  {/* Receipt Photo/File */}
                  <div className="form-group">
                    <label>Receipt (Photo or PDF)</label>
                    <div className="receipt-section">
                      {!cameraActive && !capturedReceipt && !processingImage && (
                        <div className="receipt-options">
                          <button type="button" onClick={startCamera} className="scan-btn">
                            &#x1F4F7; Take Photo
                          </button>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="upload-btn">
                            &#x1F4C1; Upload File
                          </button>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept="image/*,application/pdf"
                            style={{ display: 'none' }}
                          />
                          <p className="receipt-hint">Supports images (JPG, PNG) and PDF</p>
                        </div>
                      )}

                      {processingImage && !cameraActive && (
                        <div className="processing-indicator">
                          <div className="spinner"></div>
                          <p>Processing...</p>
                        </div>
                      )}

                      {cameraActive && (
                        <div className="camera-view">
                          <video ref={videoRef} autoPlay playsInline muted className="receipt-camera" />
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
                          {receiptType === 'pdf' ? (
                            <div className="pdf-preview">
                              <span className="pdf-icon">&#x1F4C4;</span>
                              <span>PDF Receipt Attached</span>
                            </div>
                          ) : (
                            <img src={capturedReceipt} alt="Receipt" />
                          )}
                          <div className="receipt-actions">
                            <button type="button" onClick={() => fileInputRef.current?.click()}>Change</button>
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
                {/* Show employee name for team claims */}
                {selectedClaim.isTeamClaim && (
                  <div className="detail-item">
                    <span className="label">Employee</span>
                    <span className="value employee-name">{selectedClaim.employee_name}</span>
                  </div>
                )}
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
                    {selectedClaim.receipt_url.includes('application/pdf') ? (
                      <div className="pdf-preview">
                        <span className="pdf-icon">&#x1F4C4;</span>
                        <span>PDF Receipt</span>
                        <a href={selectedClaim.receipt_url} target="_blank" rel="noopener noreferrer">View PDF</a>
                      </div>
                    ) : (
                      <img src={selectedClaim.receipt_url} alt="Receipt" className="receipt-image" />
                    )}
                  </div>
                )}
              </div>
              {/* Approve/Reject buttons for team claims */}
              {selectedClaim.isTeamClaim && selectedClaim.status === 'pending' && (
                <div className="modal-footer approval-actions">
                  <button
                    className="reject-btn"
                    onClick={() => openRejectModal(selectedClaim)}
                    disabled={submitting}
                  >
                    Reject
                  </button>
                  <button
                    className="approve-btn"
                    onClick={() => handleApproveClaim(selectedClaim)}
                    disabled={submitting}
                  >
                    {submitting ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reject Reason Modal */}
        {showRejectModal && (
          <div className="ess-modal-overlay" onClick={() => setShowRejectModal(false)}>
            <div className="ess-modal small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Reject Claim</h2>
                <button className="close-btn" onClick={() => setShowRejectModal(false)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Rejection Reason</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Please provide a reason for rejection..."
                    rows="3"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="cancel-btn" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button
                  className="reject-btn"
                  onClick={handleRejectClaim}
                  disabled={submitting || !rejectReason.trim()}
                >
                  {submitting ? 'Rejecting...' : 'Reject Claim'}
                </button>
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
