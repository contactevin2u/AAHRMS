import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverClaimsApi } from '../../api';
import './DriverClaims.css';

function DriverClaimsDashboard() {
  const navigate = useNavigate();
  const [adminInfo, setAdminInfo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending'); // pending, approved, pending_signature, paid, rejected
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverClaims, setDriverClaims] = useState([]);
  const [selectedClaims, setSelectedClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [pendingSignClaims, setPendingSignClaims] = useState([]);
  const [pendingSignTotal, setPendingSignTotal] = useState(0);
  const [signing, setSigning] = useState(false);
  const [message, setMessage] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingIds, setRejectingIds] = useState([]);

  // Month/year filter
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  // Signature canvas
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const stored = localStorage.getItem('driverClaimsAdmin');
    if (stored) setAdminInfo(JSON.parse(stored));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, driversRes] = await Promise.all([
        driverClaimsApi.getSummary({ month, year }),
        driverClaimsApi.getByDriver({ month, year, status: activeTab })
      ]);
      setSummary(summaryRes.data);
      setDrivers(driversRes.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        handleLogout();
        return;
      }
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [month, year, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('driverClaimsToken');
    localStorage.removeItem('driverClaimsAdmin');
    navigate('/driver-claims/login');
  };

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // ===== Driver detail =====
  const openDriverClaims = async (driver) => {
    setSelectedDriver(driver);
    setSelectedClaims([]);
    setLoadingClaims(true);
    try {
      const res = await driverClaimsApi.getDriverClaims(driver.employee_id, { month, year, status: activeTab });
      setDriverClaims(res.data.claims || []);
    } catch (err) {
      console.error('Error fetching driver claims:', err);
    } finally {
      setLoadingClaims(false);
    }
  };

  const closeDriverClaims = () => {
    setSelectedDriver(null);
    setDriverClaims([]);
    setSelectedClaims([]);
  };

  const toggleClaim = (id) => {
    setSelectedClaims(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleAllClaims = () => {
    const eligibleIds = driverClaims.map(c => c.id);
    if (selectedClaims.length === eligibleIds.length) {
      setSelectedClaims([]);
    } else {
      setSelectedClaims(eligibleIds);
    }
  };

  // ===== Approve claims =====
  const handleApprove = async () => {
    if (selectedClaims.length === 0) return;
    if (!window.confirm(`Approve ${selectedClaims.length} claim(s)?`)) return;

    setApproving(true);
    try {
      const res = await driverClaimsApi.approve({ claim_ids: selectedClaims });
      showMsg(`Approved ${res.data.approved_count} claims - ${formatRM(res.data.total_amount)}`);
      setSelectedClaims([]);
      openDriverClaims(selectedDriver);
      fetchData();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to approve', 'error');
    } finally {
      setApproving(false);
    }
  };

  // ===== Reject claims =====
  const openRejectModal = (ids) => {
    if (!ids || ids.length === 0) return;
    setRejectingIds(ids);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showMsg('Please enter a rejection reason', 'error');
      return;
    }

    setApproving(true);
    try {
      if (rejectingIds.length === 1) {
        await driverClaimsApi.reject(rejectingIds[0], { reason: rejectReason.trim() });
        showMsg('Claim rejected');
      } else {
        const res = await driverClaimsApi.bulkReject({ claim_ids: rejectingIds, reason: rejectReason.trim() });
        showMsg(`${res.data.rejected_count} claims rejected`);
      }
      setShowRejectModal(false);
      setSelectedClaims([]);
      openDriverClaims(selectedDriver);
      fetchData();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to reject', 'error');
    } finally {
      setApproving(false);
    }
  };

  // ===== Release payment =====
  const handleRelease = async () => {
    if (selectedClaims.length === 0) return;
    if (!window.confirm(`Release payment for ${selectedClaims.length} claim(s)?`)) return;

    setReleasing(true);
    try {
      const res = await driverClaimsApi.release({ claim_ids: selectedClaims });
      showMsg(`Released ${formatRM(res.data.total_amount)} for ${res.data.released_count} claims`);

      // Now open signature for this driver
      openSignatureModal(selectedDriver.employee_id);
      setSelectedClaims([]);
      openDriverClaims(selectedDriver);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to release', 'error');
    } finally {
      setReleasing(false);
    }
  };

  // ===== Signature =====
  const openSignatureModal = async (employeeId) => {
    try {
      const res = await driverClaimsApi.getPendingSignature(employeeId);
      if (res.data.claims.length === 0) {
        showMsg('No claims pending signature');
        return;
      }
      setPendingSignClaims(res.data.claims);
      setPendingSignTotal(res.data.total_amount);
      setShowSignature(true);
      setTimeout(() => initCanvas(), 100);
    } catch (err) {
      showMsg('Failed to load signature data', 'error');
    }
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.min(rect.width - 20, 500);
    canvas.height = 200;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e) => { e.preventDefault(); isDrawingRef.current = true; lastPosRef.current = getPos(e); };
  const draw = (e) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  };
  const stopDrawing = (e) => { if (e) e.preventDefault(); isDrawingRef.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSign = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let hasDrawing = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { hasDrawing = true; break; }
    }
    if (!hasDrawing) { showMsg('Please sign before submitting', 'error'); return; }

    const sig = canvas.toDataURL('image/png');
    setSigning(true);
    try {
      const res = await driverClaimsApi.sign(selectedDriver?.employee_id || pendingSignClaims[0]?.employee_id, { signature: sig });
      showMsg(`${res.data.paid_count} claims signed and marked as paid - ${formatRM(res.data.total_amount)}`);
      setShowSignature(false);
      closeDriverClaims();
      fetchData();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to submit signature', 'error');
    } finally {
      setSigning(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatRM = (amt) => `RM${parseFloat(amt || 0).toFixed(2)}`;

  const monthsList = [
    { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' }
  ];

  // Determine which columns to show based on tab
  const showCheckbox = activeTab === 'pending' || activeTab === 'approved';
  const showReleasedBy = activeTab === 'pending_signature' || activeTab === 'paid';
  const showPaidDate = activeTab === 'paid';
  const showRejectionReason = activeTab === 'rejected';

  if (loading && !summary) {
    return (
      <div className="dc-page">
        <div className="dc-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dc-page">
      {/* Header */}
      <header className="dc-header">
        <div className="dc-header-left">
          <img src="/logos/aa-alive.png" alt="AA Alive" className="dc-header-logo" onError={(e) => { e.target.style.display = 'none'; }} />
          <div>
            <h1>Driver Claims</h1>
            <span className="dc-header-sub">Cash Payment Portal</span>
          </div>
        </div>
        <div className="dc-header-right">
          <span className="dc-admin-name">{adminInfo?.name}</span>
          <button className="dc-btn dc-btn-outline dc-btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Message */}
      {message && (
        <div className={`dc-message dc-message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="dc-filters">
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
          {monthsList.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="dc-summary dc-summary-5">
          <div className={`dc-card dc-card-yellow ${activeTab === 'pending' ? 'dc-card-active' : ''}`} onClick={() => { setActiveTab('pending'); closeDriverClaims(); }}>
            <div className="dc-card-label">Pending Approval</div>
            <div className="dc-card-value">{summary.pending_approval}</div>
            <div className="dc-card-amount">{formatRM(summary.pending_approval_amount)}</div>
          </div>
          <div className={`dc-card dc-card-blue ${activeTab === 'approved' ? 'dc-card-active' : ''}`} onClick={() => { setActiveTab('approved'); closeDriverClaims(); }}>
            <div className="dc-card-label">Pending Release</div>
            <div className="dc-card-value">{summary.pending_release}</div>
            <div className="dc-card-amount">{formatRM(summary.pending_amount)}</div>
          </div>
          <div className={`dc-card dc-card-orange ${activeTab === 'pending_signature' ? 'dc-card-active' : ''}`} onClick={() => { setActiveTab('pending_signature'); closeDriverClaims(); }}>
            <div className="dc-card-label">Pending Sign</div>
            <div className="dc-card-value">{summary.pending_signature}</div>
            <div className="dc-card-amount">{formatRM(summary.signature_amount)}</div>
          </div>
          <div className={`dc-card dc-card-green ${activeTab === 'paid' ? 'dc-card-active' : ''}`} onClick={() => { setActiveTab('paid'); closeDriverClaims(); }}>
            <div className="dc-card-label">Paid</div>
            <div className="dc-card-value">{summary.paid_count}</div>
            <div className="dc-card-amount">{formatRM(summary.paid_amount)}</div>
          </div>
          <div className={`dc-card dc-card-red ${activeTab === 'rejected' ? 'dc-card-active' : ''}`} onClick={() => { setActiveTab('rejected'); closeDriverClaims(); }}>
            <div className="dc-card-label">Rejected</div>
            <div className="dc-card-value">{summary.rejected_count}</div>
            <div className="dc-card-amount">{formatRM(summary.rejected_amount)}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="dc-tabs">
        <button className={`dc-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => { setActiveTab('pending'); closeDriverClaims(); }}>
          Pending {summary?.pending_approval > 0 && <span className="dc-tab-badge">{summary.pending_approval}</span>}
        </button>
        <button className={`dc-tab ${activeTab === 'approved' ? 'active' : ''}`} onClick={() => { setActiveTab('approved'); closeDriverClaims(); }}>
          Approved
        </button>
        <button className={`dc-tab ${activeTab === 'pending_signature' ? 'active' : ''}`} onClick={() => { setActiveTab('pending_signature'); closeDriverClaims(); }}>
          Pending Sign
        </button>
        <button className={`dc-tab ${activeTab === 'paid' ? 'active' : ''}`} onClick={() => { setActiveTab('paid'); closeDriverClaims(); }}>
          Paid
        </button>
        <button className={`dc-tab ${activeTab === 'rejected' ? 'active' : ''}`} onClick={() => { setActiveTab('rejected'); closeDriverClaims(); }}>
          Rejected
        </button>
      </div>

      {/* Driver List or Detail View */}
      {!selectedDriver ? (
        <div className="dc-driver-list">
          {drivers.length === 0 ? (
            <div className="dc-empty">
              No {activeTab === 'pending' ? 'pending approval' : activeTab === 'approved' ? 'pending release' : activeTab === 'pending_signature' ? 'pending signature' : activeTab === 'rejected' ? 'rejected' : 'paid'} claims for {monthsList[month - 1]?.label} {year}
            </div>
          ) : (
            drivers.map(driver => (
              <div key={driver.employee_id} className="dc-driver-row" onClick={() => openDriverClaims(driver)}>
                <div className="dc-driver-info">
                  <div className={`dc-driver-avatar ${activeTab === 'pending' ? 'dc-avatar-yellow' : activeTab === 'rejected' ? 'dc-avatar-red' : ''}`}>
                    {driver.driver_name?.charAt(0)}
                  </div>
                  <div>
                    <div className="dc-driver-name">{driver.driver_name}</div>
                    <div className="dc-driver-code">{driver.emp_code}</div>
                  </div>
                </div>
                <div className="dc-driver-stats">
                  <div className="dc-driver-count">{driver.claim_count} claims</div>
                  <div className="dc-driver-amount">{formatRM(driver.total_amount)}</div>
                </div>
                <div className="dc-driver-arrow">&rsaquo;</div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="dc-detail">
          <button className="dc-btn dc-btn-back" onClick={closeDriverClaims}>
            &lsaquo; Back to Drivers
          </button>

          <div className="dc-detail-header">
            <div className={`dc-driver-avatar dc-avatar-lg ${activeTab === 'pending' ? 'dc-avatar-yellow' : activeTab === 'rejected' ? 'dc-avatar-red' : ''}`}>
              {selectedDriver.driver_name?.charAt(0)}
            </div>
            <div>
              <h2>{selectedDriver.driver_name}</h2>
              <span className="dc-driver-code">{selectedDriver.emp_code}</span>
            </div>
            <div className="dc-detail-total">
              <div className="dc-detail-total-label">{driverClaims.length} Claims</div>
              <div className="dc-detail-total-amount">{formatRM(driverClaims.reduce((s, c) => s + parseFloat(c.amount), 0))}</div>
            </div>
          </div>

          {/* Action buttons for PENDING tab */}
          {activeTab === 'pending' && (
            <div className="dc-actions">
              <label className="dc-select-all">
                <input
                  type="checkbox"
                  checked={selectedClaims.length > 0 && selectedClaims.length === driverClaims.length}
                  onChange={toggleAllClaims}
                />
                Select All
              </label>
              <div className="dc-actions-btns">
                <button
                  className="dc-btn dc-btn-danger dc-btn-sm"
                  disabled={selectedClaims.length === 0 || approving}
                  onClick={() => openRejectModal(selectedClaims)}
                >
                  Reject ({selectedClaims.length})
                </button>
                <button
                  className="dc-btn dc-btn-success"
                  disabled={selectedClaims.length === 0 || approving}
                  onClick={handleApprove}
                >
                  {approving ? 'Approving...' : `Approve (${selectedClaims.length})`}
                </button>
              </div>
            </div>
          )}

          {/* Action buttons for APPROVED tab */}
          {activeTab === 'approved' && (
            <div className="dc-actions">
              <label className="dc-select-all">
                <input
                  type="checkbox"
                  checked={selectedClaims.length > 0 && selectedClaims.length === driverClaims.filter(c => !c.cash_paid_at).length}
                  onChange={toggleAllClaims}
                />
                Select All
              </label>
              <button
                className="dc-btn dc-btn-primary"
                disabled={selectedClaims.length === 0 || releasing}
                onClick={handleRelease}
              >
                {releasing ? 'Releasing...' : `Release Payment (${selectedClaims.length})`}
              </button>
            </div>
          )}

          {/* Action buttons for PENDING SIGNATURE tab */}
          {activeTab === 'pending_signature' && (
            <div className="dc-actions">
              <span></span>
              <button
                className="dc-btn dc-btn-primary"
                onClick={() => openSignatureModal(selectedDriver.employee_id)}
              >
                Collect Signature
              </button>
            </div>
          )}

          {/* Claims table */}
          {loadingClaims ? (
            <div className="dc-loading">Loading claims...</div>
          ) : driverClaims.length === 0 ? (
            <div className="dc-empty">No claims found</div>
          ) : (
            <div className="dc-claims-table">
              <table>
                <thead>
                  <tr>
                    {showCheckbox && <th style={{ width: 40 }}></th>}
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>AI Detected</th>
                    {showReleasedBy && <th>Released By</th>}
                    {showPaidDate && <th>Paid Date</th>}
                    {showRejectionReason && <th>Reason</th>}
                    <th>Receipt</th>
                    {activeTab === 'pending' && <th style={{ width: 80 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {driverClaims.map(claim => (
                    <tr key={claim.id} className={selectedClaims.includes(claim.id) ? 'selected' : ''}>
                      {showCheckbox && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedClaims.includes(claim.id)}
                            onChange={() => toggleClaim(claim.id)}
                          />
                        </td>
                      )}
                      <td>{formatDate(claim.claim_date)}</td>
                      <td><span className="dc-badge">{claim.category}</span></td>
                      <td className="dc-desc-cell">{claim.description || '-'}</td>
                      <td className="dc-amount">{formatRM(claim.amount)}</td>
                      <td className="dc-ai-detected">
                        {claim.ai_extracted_amount ? (
                          <span className="dc-ai-info">
                            <span className="dc-ai-amount">{formatRM(claim.ai_extracted_amount)}</span>
                            {claim.ai_extracted_merchant && (
                              <span className="dc-ai-merchant">{claim.ai_extracted_merchant}</span>
                            )}
                          </span>
                        ) : (
                          <span className="dc-ai-none">-</span>
                        )}
                      </td>
                      {showReleasedBy && (
                        <td><span className="dc-released-by">{claim.paid_by_name || '-'}</span></td>
                      )}
                      {showPaidDate && <td>{formatDate(claim.cash_paid_at)}</td>}
                      {showRejectionReason && (
                        <td className="dc-reject-reason">{claim.rejection_reason || '-'}</td>
                      )}
                      <td>
                        {claim.receipt_url && (
                          <a href={claim.receipt_url} target="_blank" rel="noopener noreferrer" className="dc-receipt-link">
                            View
                          </a>
                        )}
                      </td>
                      {activeTab === 'pending' && (
                        <td>
                          <button
                            className="dc-btn dc-btn-danger dc-btn-xs"
                            onClick={(e) => { e.stopPropagation(); openRejectModal([claim.id]); }}
                          >
                            Reject
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {showCheckbox && <td></td>}
                    <td colSpan={3}><strong>Total</strong></td>
                    <td className="dc-amount"><strong>{formatRM(driverClaims.reduce((s, c) => s + parseFloat(c.amount), 0))}</strong></td>
                    <td></td>
                    {showReleasedBy && <td></td>}
                    {showPaidDate && <td></td>}
                    {showRejectionReason && <td></td>}
                    <td></td>
                    {activeTab === 'pending' && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="dc-modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="dc-modal dc-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Reject Claim{rejectingIds.length > 1 ? 's' : ''}</h3>
              <button className="dc-modal-close" onClick={() => setShowRejectModal(false)}>&times;</button>
            </div>
            <div className="dc-modal-body">
              <p className="dc-reject-info">
                Rejecting <strong>{rejectingIds.length}</strong> claim{rejectingIds.length > 1 ? 's' : ''}. Please provide a reason:
              </p>
              <textarea
                className="dc-textarea"
                placeholder="Enter rejection reason..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="dc-sign-actions">
                <button className="dc-btn dc-btn-outline" onClick={() => setShowRejectModal(false)}>Cancel</button>
                <button className="dc-btn dc-btn-danger" onClick={handleReject} disabled={approving || !rejectReason.trim()}>
                  {approving ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {showSignature && (
        <div className="dc-modal-overlay" onClick={() => setShowSignature(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dc-modal-header">
              <h3>Driver Signature</h3>
              <button className="dc-modal-close" onClick={() => setShowSignature(false)}>&times;</button>
            </div>
            <div className="dc-modal-body">
              <div className="dc-sign-summary">
                <p>I, <strong>{selectedDriver?.driver_name}</strong>, acknowledge receipt of cash payment for the following claims:</p>
                <div className="dc-sign-claims-list">
                  {pendingSignClaims.map(c => (
                    <div key={c.id} className="dc-sign-claim-row">
                      <span>{formatDate(c.claim_date)} - {c.category}</span>
                      <span>{formatRM(c.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="dc-sign-total">
                  <strong>Total: {formatRM(pendingSignTotal)}</strong>
                </div>
              </div>
              <div className="dc-sign-label">Sign below:</div>
              <div className="dc-canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  className="dc-signature-canvas"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <div className="dc-sign-actions">
                <button className="dc-btn dc-btn-outline" onClick={clearCanvas}>Clear</button>
                <button className="dc-btn dc-btn-primary" onClick={handleSign} disabled={signing}>
                  {signing ? 'Submitting...' : 'Confirm & Sign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverClaimsDashboard;
