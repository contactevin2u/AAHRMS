import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { canViewTeamAttendance, canApproveOT } from '../../utils/permissions';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSAttendance.css';

// Error Boundary to catch rendering errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Attendance page error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ESSAttendanceContent() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const isOnline = useOnlineStatus();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Get employee info from localStorage
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const showTeamTab = canViewTeamAttendance(employeeInfo);
  const canApprove = canApproveOT(employeeInfo);

  const [activeTab, setActiveTab] = useState('clockin');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Team state
  const [teamAttendance, setTeamAttendance] = useState([]);
  const [pendingOT, setPendingOT] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamDate, setTeamDate] = useState(new Date().toISOString().split('T')[0]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Schedule state (for outlet-based companies like Mimix)
  const [scheduleStatus, setScheduleStatus] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  // Camera permission state (check without popup)
  const [cameraPermission, setCameraPermission] = useState(null);

  // Camera and location states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [locationError, setLocationError] = useState('');
  const [serverTime, setServerTime] = useState(new Date());

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

  // Check if feature is enabled (Mimix via features.clockIn OR AA Alive via clock_in_required)
  const hasClockInAccess = employeeInfo.features?.clockIn || employeeInfo.clock_in_required;

  useEffect(() => {
    if (!hasClockInAccess) {
      navigate('/ess/dashboard');
      return;
    }
    fetchStatus();
  }, [navigate, hasClockInAccess]);

  // Update server time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setServerTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await essApi.getClockInStatus();
      setStatus(res.data);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch schedule status for outlet-based companies (Mimix)
  const fetchScheduleStatus = async () => {
    try {
      const res = await essApi.getTodaySchedule();
      setScheduleStatus(res.data);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      setScheduleStatus({ has_schedule: true, can_clock_in: true });
    } finally {
      setScheduleLoading(false);
    }
  };

  // Fetch schedule on mount (for employees with clock-in access)
  useEffect(() => {
    if (hasClockInAccess) {
      fetchScheduleStatus();
    } else {
      setScheduleLoading(false);
    }
  }, [hasClockInAccess]);

  // Fetch history when history tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Fetch team data when team tab is active
  useEffect(() => {
    if (activeTab === 'team' && showTeamTab) {
      fetchTeamData();
    }
  }, [activeTab, teamDate]);

  // Stop camera helper function
  const stopCamera = useCallback(() => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject = null;
      }
    } catch (err) {
      console.error('Stop camera error:', err);
    }
    setCameraActive(false);
    setCameraLoading(false);
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

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const currentDate = new Date();
      const res = await essApi.getClockInHistory({
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear()
      });
      setHistory(res.data.records || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchTeamData = async () => {
    setTeamLoading(true);
    try {
      const [attendanceRes, otRes] = await Promise.all([
        essApi.getTeamAttendance(teamDate),
        essApi.getPendingOT()
      ]);
      setTeamAttendance(attendanceRes.data || []);
      setPendingOT(otRes.data || []);
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleApproveOT = async (recordId) => {
    if (!window.confirm('Approve this overtime?')) return;

    try {
      setSubmitting(true);
      await essApi.approveOT(recordId);
      alert('Overtime approved');
      fetchTeamData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve OT');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectOT = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      setSubmitting(true);
      await essApi.rejectOT(selectedOT.id, rejectReason);
      alert('Overtime rejected');
      setShowRejectModal(false);
      setSelectedOT(null);
      setRejectReason('');
      fetchTeamData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reject OT');
    } finally {
      setSubmitting(false);
    }
  };

  const openRejectModal = (record) => {
    setSelectedOT(record);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // Start camera - ONLY on button click
  const startCamera = async () => {
    // Check if camera permission is denied
    if (cameraPermission === 'denied') {
      setError('Camera blocked. Please enable camera in browser settings.');
      return;
    }

    setCameraLoading(true);
    setCameraActive(false);
    setError('');

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('autoplay', '');
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('muted', '');

        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video autoplay failed:', playErr);
        }

        setCameraLoading(false);
        setCameraActive(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraLoading(false);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access.');
        setCameraPermission('denied');
      } else {
        setError('Unable to access camera. Please check your device.');
      }
    }
  };

  // Capture photo
  const capturePhoto = () => {
    try {
      if (!videoRef.current || !canvasRef.current) {
        setError('Camera not ready. Please try again.');
        return;
      }

      const canvas = canvasRef.current;
      const video = videoRef.current;

      const width = video.videoWidth || video.clientWidth || 640;
      const height = video.videoHeight || video.clientHeight || 480;

      if (width === 0 || height === 0) {
        setError('Camera not ready. Please wait and try again.');
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Failed to capture photo. Please try again.');
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);

      const photoData = canvas.toDataURL('image/jpeg', 0.7);

      if (!photoData || photoData === 'data:,') {
        setError('Failed to capture photo. Please try again.');
        return;
      }

      stopCamera();
      setCapturedPhoto(photoData);
    } catch (err) {
      console.error('Photo capture error:', err);
      setError('Failed to capture photo. Please try again.');
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  // Get location
  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setLocation(loc);
        setLocationError('');

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}`
          );
          const data = await response.json();
          if (data.display_name) {
            setAddress(data.display_name);
          }
        } catch (e) {
          console.error('Geocoding error:', e);
        }
      },
      (error) => {
        console.error('Location error:', error);
        setLocationError('Unable to get location. Please enable GPS.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // Get location on mount
  useEffect(() => {
    getLocation();
  }, [getLocation]);

  // Submit clock action
  const handleSubmit = async () => {
    if (!isOnline) {
      setError('Clock-in requires internet connection.');
      return;
    }

    if (!capturedPhoto) {
      setError('Please take a selfie first.');
      return;
    }

    if (!location) {
      setError('Please enable location services.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await essApi.clockAction({
        action: status?.next_action || 'clock_in_1',
        photo_base64: capturedPhoto,
        latitude: location.latitude,
        longitude: location.longitude,
        address: address,
        face_detected: true,
        face_confidence: 0.95
      });

      const successMsg = res.data.message;
      setSuccess(typeof successMsg === 'string' ? successMsg : 'Action recorded successfully!');
      setCapturedPhoto(null);

      setTimeout(() => {
        fetchStatus();
        setSuccess('');
      }, 2000);
    } catch (err) {
      console.error('Clock action error:', err);
      const errMsg = err.response?.data?.error;
      setError(typeof errMsg === 'string' ? errMsg : (errMsg?.message || 'Failed to record action. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Get action button label
  const getActionLabel = () => {
    switch (status?.next_action) {
      case 'clock_in_1': return t('attendance.clockIn');
      case 'clock_out_1': return t('attendance.startBreak');
      case 'clock_in_2': return t('attendance.endBreak');
      case 'clock_out_2': return t('attendance.clockOut');
      default: return t('attendance.clockIn');
    }
  };

  // Get status message
  const getStatusMessage = () => {
    if (!status) return '';
    switch (status.status) {
      case 'not_started': return t('attendance.readyToStart');
      case 'working': return t('attendance.currentlyWorking');
      case 'on_break': return t('attendance.onBreak');
      case 'completed': return t('attendance.completedToday');
      default: return '';
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (time) => {
    if (!time) return '--:--';
    return time.substring(0, 5);
  };

  if (loading || scheduleLoading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>{t('common.loading')}</p>
        </div>
      </ESSLayout>
    );
  }

  const noScheduleToday = scheduleStatus && !scheduleStatus.has_schedule;

  return (
    <ESSLayout>
      <div className="ess-attendance">
        {/* Page Header */}
        <div className="ess-page-header">
          <div className="header-content">
            <h1>{t('attendance.title')}</h1>
            <p>{t('attendance.subtitle')}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="ess-tabs">
          <button
            className={`tab-btn ${activeTab === 'clockin' ? 'active' : ''}`}
            onClick={() => setActiveTab('clockin')}
          >
            {t('attendance.clockIn')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            {t('attendance.history')}
          </button>
          {showTeamTab && (
            <button
              className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
              onClick={() => setActiveTab('team')}
            >
              {t('attendance.team')}
              {pendingOT.length > 0 && (
                <span className="tab-badge">{pendingOT.length}</span>
              )}
            </button>
          )}
        </div>

        {/* Clock In Tab */}
        {activeTab === 'clockin' && (
          <div className="clockin-section">
            {/* Offline Warning */}
            {!isOnline && (
              <div className="offline-warning">
                <span className="offline-icon">&#x26A0;&#xFE0F;</span>
                <div>
                  <strong>{t('attendance.youreOffline')}</strong>
                  <p>{t('attendance.offlineMessage')}</p>
                </div>
              </div>
            )}

            {/* Server Time */}
            <div className="time-display">
              <span className="time">
                {serverTime.toLocaleTimeString(language === 'ms' ? 'ms-MY' : 'en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="date">
                {serverTime.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </div>

            {/* No Schedule Info */}
            {noScheduleToday && (
              <div className="schedule-info no-schedule-info">
                <span className="schedule-icon">&#x1F4C5;</span>
                <span>{t('attendance.noShiftToday')}</span>
              </div>
            )}

            {/* Today's Schedule Info */}
            {scheduleStatus?.has_schedule && scheduleStatus?.schedule && (
              <div className="schedule-info">
                <span className="schedule-icon">&#x1F4C5;</span>
                <span>{t('attendance.todayShift')}: {scheduleStatus.schedule.shift_start} - {scheduleStatus.schedule.shift_end}</span>
              </div>
            )}

            {/* Status */}
            <div className={`status-badge ${status?.status || 'not_started'}`}>
              {getStatusMessage()}
            </div>

            {/* Today's Timeline */}
            {status?.record && (
              <div className="timeline">
                <div className={`timeline-item ${status.record.clock_in_1 ? 'done' : ''}`}>
                  <span className="time-label">{t('attendance.clockIn')}</span>
                  <span className="time-value">{status.record.clock_in_1 || '--:--'}</span>
                </div>
                <div className={`timeline-item ${status.record.clock_out_1 ? 'done' : ''}`}>
                  <span className="time-label">{t('attendance.break')}</span>
                  <span className="time-value">{status.record.clock_out_1 || '--:--'}</span>
                </div>
                <div className={`timeline-item ${status.record.clock_in_2 ? 'done' : ''}`}>
                  <span className="time-label">{t('attendance.return')}</span>
                  <span className="time-value">{status.record.clock_in_2 || '--:--'}</span>
                </div>
                <div className={`timeline-item ${status.record.clock_out_2 ? 'done' : ''}`}>
                  <span className="time-label">{t('attendance.clockOut')}</span>
                  <span className="time-value">{status.record.clock_out_2 || '--:--'}</span>
                </div>
              </div>
            )}

            {/* Clock In Instructions */}
            {status?.status !== 'completed' && (
              <div className="clockin-instructions">
                <div className="instructions-title">{t('attendance.howToClockIn')}:</div>
                <div className="instructions-steps">
                  <div className="step">1. {t('attendance.step1')}</div>
                  <div className="step">2. {t('attendance.step2', { action: getActionLabel() })}</div>
                </div>
              </div>
            )}

            {/* Camera Section */}
            {status?.status !== 'completed' && (
              <div className="camera-section">
                {!cameraActive && !cameraLoading && !capturedPhoto && (
                  <button className="start-camera-btn" onClick={startCamera} disabled={!isOnline}>
                    <span>&#x1F4F7;</span>
                    {t('attendance.takeSelfie')}
                  </button>
                )}

                {(cameraLoading || cameraActive) && (
                  <div className="camera-view">
                    {cameraLoading && (
                      <div className="camera-loading">
                        <div className="spinner"></div>
                        <p>{t('attendance.startingCamera')}</p>
                      </div>
                    )}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      webkit-playsinline="true"
                      style={{ width: '100%', height: 'auto' }}
                    />
                    {cameraActive && !cameraLoading && (
                      <div className="capture-container">
                        <button className="capture-btn" onClick={capturePhoto}>
                          <span className="capture-inner"></span>
                        </button>
                        <span className="capture-label">{t('attendance.tapToCapture')}</span>
                      </div>
                    )}
                  </div>
                )}

                {capturedPhoto && (
                  <div className="photo-preview">
                    <img
                      src={capturedPhoto}
                      alt="Selfie"
                      onError={(e) => {
                        console.error('Image load error');
                        setCapturedPhoto(null);
                        setError(t('attendance.photoLoadError'));
                      }}
                    />
                    <button className="retake-btn" onClick={retakePhoto}>{t('attendance.retake')}</button>
                  </div>
                )}
              </div>
            )}

            {/* Location */}
            <div className="location-section">
              <span className="location-icon">&#x1F4CD;</span>
              {locationError ? (
                <span className="location-error">{locationError}</span>
              ) : location ? (
                <span className="location-text">{address || t('attendance.locationCaptured')}</span>
              ) : (
                <span className="location-loading">{t('attendance.gettingLocation')}</span>
              )}
            </div>

            {/* Hidden Canvas for Photo Capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Error Message */}
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="success-message">
                {success}
              </div>
            )}

            {/* Submit Button */}
            {status?.status !== 'completed' && (
              <button
                className="submit-btn"
                onClick={handleSubmit}
                disabled={!isOnline || !capturedPhoto || !location || submitting}
              >
                {submitting ? t('common.submitting') : getActionLabel()}
              </button>
            )}

            {/* Completed Message */}
            {status?.status === 'completed' && (
              <div className="completed-message">
                <span className="check-icon">&#x2705;</span>
                <p>{t('attendance.completedMessage')}</p>
                {status.record && (
                  <p className="hours-worked">
                    {t('attendance.total')}: <span style={(status.record.total_hours || 0) < 8 && (status.record.total_hours || 0) > 0 ? { color: '#dc2626', fontWeight: 'bold' } : {}}>
                      {status.record.total_hours || 0} {t('time.hours')}
                    </span>
                    {status.record.ot_hours > 0 && ` (OT: ${status.record.ot_hours}${t('time.hrs')})`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="history-section">
            {historyLoading ? (
              <div className="ess-loading">
                <div className="spinner"></div>
                <p>{t('attendance.loadingHistory')}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">&#x1F4C5;</span>
                <p>{t('attendance.noRecordsThisMonth')}</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((record, idx) => (
                  <div key={idx} className="history-card">
                    <div className="history-date">
                      {formatDate(record.work_date)}
                    </div>
                    <div className="history-times">
                      <span className="time-item">
                        <span className="label">{t('attendance.in')}:</span> {formatTime(record.clock_in_1)}
                      </span>
                      <span className="time-item">
                        <span className="label">{t('attendance.out')}:</span> {formatTime(record.clock_out_2)}
                      </span>
                    </div>
                    <div className="history-hours">
                      <span className="total" style={(record.total_hours || 0) < 8 && (record.total_hours || 0) > 0 ? { color: '#dc2626', fontWeight: 'bold' } : {}}>{record.total_hours || 0}{t('time.hrs')}</span>
                      {record.ot_hours > 0 && (
                        <span className={`ot ${record.ot_approved === true ? 'approved' : record.ot_approved === false ? 'rejected' : 'pending'}`}>
                          +{record.ot_hours}{t('time.hrs')} OT
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Team Tab (Supervisor/Manager only) */}
        {activeTab === 'team' && showTeamTab && (
          <div className="team-section">
            {/* Date Selector */}
            <div className="date-selector">
              <input
                type="date"
                value={teamDate}
                onChange={(e) => setTeamDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {teamLoading ? (
              <div className="ess-loading">
                <div className="spinner"></div>
                <p>{t('attendance.loadingTeamData')}</p>
              </div>
            ) : (
              <>
                {/* Pending OT Approvals */}
                {canApprove && pendingOT.length > 0 && (
                  <div className="pending-ot-section">
                    <h3>{t('attendance.pendingOTApprovals')}</h3>
                    <div className="ot-list">
                      {pendingOT.map((record) => (
                        <div key={record.id} className="ot-card">
                          <div className="ot-employee">
                            <span className="employee-name">{record.employee_name}</span>
                            <span className="ot-date">{formatDate(record.work_date)}</span>
                          </div>
                          <div className="ot-details">
                            <span className="ot-hours">{record.ot_hours}{t('time.hrs')} {t('attendance.overtime')}</span>
                            <span className="total-hours" style={(record.total_hours || 0) < 8 && (record.total_hours || 0) > 0 ? { color: '#dc2626', fontWeight: 'bold' } : {}}>{t('attendance.total')}: {record.total_hours}{t('time.hrs')}</span>
                          </div>
                          <div className="ot-actions">
                            <button
                              className="approve-btn"
                              onClick={() => handleApproveOT(record.id)}
                              disabled={submitting}
                            >
                              {t('ot.approve')}
                            </button>
                            <button
                              className="reject-btn"
                              onClick={() => openRejectModal(record)}
                              disabled={submitting}
                            >
                              {t('ot.reject')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team Attendance List */}
                <div className="team-attendance-section">
                  <h3>{t('attendance.teamAttendance')} - {formatDate(teamDate)}</h3>
                  {teamAttendance.length === 0 ? (
                    <div className="empty-state">
                      <span className="empty-icon">&#x1F465;</span>
                      <p>{t('attendance.noRecordsForDate')}</p>
                    </div>
                  ) : (
                    <div className="team-list">
                      {teamAttendance.map((record) => (
                        <div key={record.id} className="team-card">
                          <div className="team-employee">
                            <span className="employee-name">{record.employee_name}</span>
                            <span className="outlet-name">{record.outlet_name}</span>
                          </div>
                          <div className="team-times">
                            <span className="time-item">
                              <span className="label">In:</span> {formatTime(record.clock_in_1)}
                            </span>
                            <span className="time-item">
                              <span className="label">Out:</span> {formatTime(record.clock_out_2)}
                            </span>
                          </div>
                          <div className="team-hours">
                            <span className="total" style={(record.total_hours || 0) < 8 && (record.total_hours || 0) > 0 ? { color: '#dc2626', fontWeight: 'bold' } : {}}>{record.total_hours || '-'}h</span>
                            {record.ot_flagged && (
                              <span className={`ot-badge ${record.ot_approved === true ? 'approved' : record.ot_approved === false ? 'rejected' : 'pending'}`}>
                                OT: {record.ot_hours}h
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Reject OT Modal */}
        {showRejectModal && selectedOT && (
          <div className="ess-modal-overlay" onClick={() => setShowRejectModal(false)}>
            <div className="ess-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('ot.rejectOvertime')}</h2>
                <button className="close-btn" onClick={() => setShowRejectModal(false)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                <p className="reject-info">
                  {t('ot.rejectingOTFor')} <strong>{selectedOT.employee_name}</strong>
                  <br />
                  {formatDate(selectedOT.work_date)} - {selectedOT.ot_hours} {t('time.hours')} OT
                </p>
                <div className="form-group">
                  <label>{t('ot.rejectionReason')} *</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('ot.enterReason')}
                    rows="3"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="cancel-btn" onClick={() => setShowRejectModal(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="reject-submit-btn"
                  onClick={handleRejectOT}
                  disabled={submitting || !rejectReason.trim()}
                >
                  {submitting ? t('ot.rejecting') : t('ot.reject')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

// Wrap with Error Boundary
function ESSAttendance() {
  return (
    <ErrorBoundary>
      <ESSAttendanceContent />
    </ErrorBoundary>
  );
}

export default ESSAttendance;
