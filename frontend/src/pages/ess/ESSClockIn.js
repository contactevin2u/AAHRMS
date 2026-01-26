import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSClockIn.css';

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
    console.error('Clock-in page error:', error, errorInfo);
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

function ESSClockInContent() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Schedule state (for outlet-based companies like Mimix)
  const [scheduleStatus, setScheduleStatus] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  // Camera permission state (check without popup)
  const [cameraPermission, setCameraPermission] = useState(null); // 'granted', 'denied', 'prompt'

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
        // Firefox doesn't support permissions.query for camera
        setCameraPermission('prompt');
      }
    };
    checkCameraPermission();
  }, []);

  // Check if feature is enabled
  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      const info = JSON.parse(storedInfo);
      setEmployeeInfo(info);

      if (!info.features?.clockIn) {
        navigate('/ess/dashboard');
        return;
      }
    }
    fetchStatus();
  }, [navigate]);

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
      // If endpoint doesn't exist or fails, assume scheduling not required
      setScheduleStatus({ has_schedule: true, can_clock_in: true });
    } finally {
      setScheduleLoading(false);
    }
  };

  // Fetch schedule on mount (for Mimix employees)
  useEffect(() => {
    if (employeeInfo?.features?.clockIn) {
      fetchScheduleStatus();
    } else {
      setScheduleLoading(false);
    }
  }, [employeeInfo]);

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

  // Start camera - ONLY on button click
  const startCamera = async () => {
    // Don't block based on permissions API - Samsung Browser reports 'denied' incorrectly
    // Just try to access camera and handle actual errors
    setCameraLoading(true);
    setCameraActive(false);
    setError('');

    try {
      // Stop any existing stream first
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

      // Attach stream to video element directly
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
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera blocked. Try: 1) Refresh page, 2) Clear browser cache, 3) Use Chrome browser');
        setCameraPermission('denied');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please check your device has a camera.');
      } else if (err.name === 'NotReadableError') {
        setError('Camera in use by another app. Please close other apps and try again.');
      } else {
        setError('Unable to access camera. Try using Chrome browser instead.');
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

      // Check if video has valid dimensions
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

      // Stop camera first, then set photo
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

        // Try to get address (reverse geocoding)
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
        face_detected: true,  // TODO: Implement actual face detection
        face_confidence: 0.95
      });

      const successMsg = res.data.message;
      setSuccess(typeof successMsg === 'string' ? successMsg : 'Action recorded successfully!');
      setCapturedPhoto(null);

      // Refresh status
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

  // Check if no schedule for today (for outlet-based companies)
  const noScheduleToday = scheduleStatus && !scheduleStatus.has_schedule;
  // Clock-in is always allowed regardless of schedule time

  return (
    <ESSLayout>
      <div className="ess-clockin">
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

        {/* No Schedule Info - Still allow clock-in */}
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
                  <button className="capture-btn" onClick={capturePhoto}>
                    <span>&#x1F4F8;</span>
                  </button>
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
            {submitting ? t('claims.submitting') : getActionLabel()}
          </button>
        )}

        {/* Completed Message */}
        {status?.status === 'completed' && (
          <div className="completed-message">
            <span className="check-icon">&#x2705;</span>
            <p>{t('attendance.completedMessage')}</p>
            {status.record && (
              <p className="hours-worked">
                {t('attendance.total')}: {status.record.total_hours || 0} {t('time.hours')}
              </p>
            )}
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

// Wrap with Error Boundary
function ESSClockIn() {
  return (
    <ErrorBoundary>
      <ESSClockInContent />
    </ErrorBoundary>
  );
}

export default ESSClockIn;
