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
  const [activeTab, setActiveTab] = useState('approved'); // approved, pending_signature, paid
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverClaims, setDriverClaims] = useState([]);
  const [selectedClaims, setSelectedClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [pendingSignClaims, setPendingSignClaims] = useState([]);
  const [pendingSignTotal, setPendingSignTotal] = useState(0);
  const [signing, setSigning] = useState(false);
  const [message, setMessage] = useState(null);

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
    const eligibleIds = driverClaims
      .filter(c => !c.cash_paid_at)
      .map(c => c.id);
    if (selectedClaims.length === eligibleIds.length) {
      setSelectedClaims([]);
    } else {
      setSelectedClaims(eligibleIds);
    }
  };

  // ===== Release payment =====
  const handleRelease = async () => {
    if (selectedClaims.length === 0) return;
    if (!window.confirm(`Release payment for ${selectedClaims.length} claim(s)?`)) return;

    setReleasing(true);
    try {
      const res = await driverClaimsApi.release({ claim_ids: selectedClaims });
      showMsg(`Released RM${res.data.total_amount.toFixed(2)} for ${res.data.released_count} claims`);

      // Now open signature for this driver
      openSignatureModal(selectedDriver.employee_id);
      setSelectedClaims([]);
      // Refresh the driver's claims
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
      setSignatureData(null);
      setShowSignature(true);

      // Initialize canvas after modal renders
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
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    lastPosRef.current = getPos(e);
  };

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

  const stopDrawing = (e) => {
    if (e) e.preventDefault();
    isDrawingRef.current = false;
  };

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

    // Check if canvas has been drawn on (not just white)
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let hasDrawing = false;
    for (let i = 0; i < pixels.length; i += 4) {
      // Check if any pixel is not white
      if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
        hasDrawing = true;
        break;
      }
    }

    if (!hasDrawing) {
      showMsg('Please sign before submitting', 'error');
      return;
    }

    const sig = canvas.toDataURL('image/png');
    setSigning(true);
    try {
      const res = await driverClaimsApi.sign(selectedDriver?.employee_id || pendingSignClaims[0]?.employee_id, { signature: sig });
      showMsg(`${res.data.paid_count} claims signed and marked as paid - RM${res.data.total_amount.toFixed(2)}`);
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

  const months = [
    { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' }
  ];

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
          {months.map(m => (
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
        <div className="dc-summary">
          <div className="dc-card dc-card-blue" onClick={() => setActiveTab('approved')}>
            <div className="dc-card-label">Pending Release</div>
            <div className="dc-card-value">{summary.pending_release}</div>
            <div className="dc-card-amount">{formatRM(summary.pending_amount)}</div>
          </div>
          <div className="dc-card dc-card-orange" onClick={() => setActiveTab('pending_signature')}>
            <div className="dc-card-label">Pending Signature</div>
            <div className="dc-card-value">{summary.pending_signature}</div>
            <div className="dc-card-amount">{formatRM(summary.signature_amount)}</div>
          </div>
          <div className="dc-card dc-card-green" onClick={() => setActiveTab('paid')}>
            <div className="dc-card-label">Paid</div>
            <div className="dc-card-value">{summary.paid_count}</div>
            <div className="dc-card-amount">{formatRM(summary.paid_amount)}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="dc-tabs">
        <button
          className={`dc-tab ${activeTab === 'approved' ? 'active' : ''}`}
          onClick={() => { setActiveTab('approved'); closeDriverClaims(); }}
        >
          Pending Release
        </button>
        <button
          className={`dc-tab ${activeTab === 'pending_signature' ? 'active' : ''}`}
          onClick={() => { setActiveTab('pending_signature'); closeDriverClaims(); }}
        >
          Pending Signature
        </button>
        <button
          className={`dc-tab ${activeTab === 'paid' ? 'active' : ''}`}
          onClick={() => { setActiveTab('paid'); closeDriverClaims(); }}
        >
          Paid
        </button>
      </div>

      {/* Driver List or Detail View */}
      {!selectedDriver ? (
        <div className="dc-driver-list">
          {drivers.length === 0 ? (
            <div className="dc-empty">
              No {activeTab === 'approved' ? 'pending' : activeTab === 'pending_signature' ? 'signature pending' : 'paid'} claims found for {months[month - 1]?.label} {year}
            </div>
          ) : (
            drivers.map(driver => (
              <div key={driver.employee_id} className="dc-driver-row" onClick={() => openDriverClaims(driver)}>
                <div className="dc-driver-info">
                  <div className="dc-driver-avatar">{driver.driver_name?.charAt(0)}</div>
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
          {/* Back button */}
          <button className="dc-btn dc-btn-back" onClick={closeDriverClaims}>
            &lsaquo; Back to Drivers
          </button>

          <div className="dc-detail-header">
            <div className="dc-driver-avatar dc-avatar-lg">{selectedDriver.driver_name?.charAt(0)}</div>
            <div>
              <h2>{selectedDriver.driver_name}</h2>
              <span className="dc-driver-code">{selectedDriver.emp_code}</span>
            </div>
            <div className="dc-detail-total">
              <div className="dc-detail-total-label">{driverClaims.length} Claims</div>
              <div className="dc-detail-total-amount">{formatRM(driverClaims.reduce((s, c) => s + parseFloat(c.amount), 0))}</div>
            </div>
          </div>

          {/* Action buttons */}
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

          {activeTab === 'pending_signature' && (
            <div className="dc-actions">
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
          ) : (
            <div className="dc-claims-table">
              <table>
                <thead>
                  <tr>
                    {activeTab === 'approved' && <th style={{ width: 40 }}></th>}
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    {(activeTab === 'pending_signature' || activeTab === 'paid') && <th>Released By</th>}
                    {activeTab === 'paid' && <th>Paid Date</th>}
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {driverClaims.map(claim => (
                    <tr key={claim.id} className={selectedClaims.includes(claim.id) ? 'selected' : ''}>
                      {activeTab === 'approved' && (
                        <td>
                          {!claim.cash_paid_at && (
                            <input
                              type="checkbox"
                              checked={selectedClaims.includes(claim.id)}
                              onChange={() => toggleClaim(claim.id)}
                            />
                          )}
                        </td>
                      )}
                      <td>{formatDate(claim.claim_date)}</td>
                      <td><span className="dc-badge">{claim.category}</span></td>
                      <td>{claim.description || '-'}</td>
                      <td className="dc-amount">{formatRM(claim.amount)}</td>
                      {(activeTab === 'pending_signature' || activeTab === 'paid') && (
                        <td><span className="dc-released-by">{claim.paid_by_name || '-'}</span></td>
                      )}
                      {activeTab === 'paid' && <td>{formatDate(claim.cash_paid_at)}</td>}
                      <td>
                        {claim.receipt_url && (
                          <a href={claim.receipt_url} target="_blank" rel="noopener noreferrer" className="dc-receipt-link">
                            View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {activeTab === 'approved' && <td></td>}
                    <td colSpan={3}><strong>Total</strong></td>
                    <td className="dc-amount"><strong>{formatRM(driverClaims.reduce((s, c) => s + parseFloat(c.amount), 0))}</strong></td>
                    {(activeTab === 'pending_signature' || activeTab === 'paid') && <td></td>}
                    {activeTab === 'paid' && <td></td>}
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
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
