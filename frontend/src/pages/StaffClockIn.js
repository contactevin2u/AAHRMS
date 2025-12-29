import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import { compressAttendancePhoto, getBase64SizeKB } from '../utils/imageCompression';
import { preloadFaceDetection, getLivenessDelay } from '../utils/faceDetection';
import ClockConfirmation from '../components/ClockConfirmation';
import './StaffClockIn.css';

/**
 * Staff Clock In Page with Anti-Cheating Controls
 *
 * MANDATORY REQUIREMENTS FOR ALL CLOCK ACTIONS:
 * - System timestamp (server-side only)
 * - GPS location (latitude + longitude + address)
 * - Live selfie photo (camera capture only, NO gallery uploads)
 * - Face detection validation (single face, landmarks detected)
 * - Image quality validation (not blurred, proper exposure)
 * - Liveness check (minimum capture delay)
 *
 * ANTI-CHEATING CONTROLS:
 * - Camera-only capture (no file input)
 * - Minimum delay before capture allowed (liveness check)
 * - Server-side timestamp (no client override)
 * - GPS permission enforced
 * - Single face only (prevent proxy clock-in)
 * - All records are immutable after submission
 */
function StaffClockIn() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [clockStatus, setClockStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Camera and photo state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraStartTime, setCameraStartTime] = useState(null);
  const [canCapture, setCanCapture] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState(0);

  // Location state
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);

  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Capture metadata for validation
  const [captureMetadata, setCaptureMetadata] = useState({
    captureSource: 'camera',
    fromCamera: true,
    captureTime: null,
    cameraActiveTime: 0
  });

  // Liveness delay (milliseconds)
  const LIVENESS_DELAY = getLivenessDelay();

  // Preload face detection models on component mount
  useEffect(() => {
    preloadFaceDetection();
  }, []);

  // Load employee info and status
  useEffect(() => {
    const info = localStorage.getItem('employeeInfo');
    if (!info) {
      navigate('/staff/login');
      return;
    }
    setEmployeeInfo(JSON.parse(info));
    fetchClockStatus();
  }, [navigate]);

  // Liveness countdown timer
  useEffect(() => {
    if (!cameraActive || !cameraStartTime) return;

    const checkLiveness = () => {
      const elapsed = Date.now() - cameraStartTime;
      const remaining = Math.max(0, LIVENESS_DELAY - elapsed);

      if (remaining === 0) {
        setCanCapture(true);
        setCaptureCountdown(0);
      } else {
        setCanCapture(false);
        setCaptureCountdown(Math.ceil(remaining / 1000));
      }
    };

    checkLiveness();
    const interval = setInterval(checkLiveness, 100);

    return () => clearInterval(interval);
  }, [cameraActive, cameraStartTime, LIVENESS_DELAY]);

  const fetchClockStatus = async () => {
    try {
      const response = await essApi.getClockInStatus();
      setClockStatus(response.data);
    } catch (err) {
      console.error('Error fetching status:', err);
    } finally {
      setLoading(false);
    }
  };

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError('');
      setCapturedPhoto(null);
      setCanCapture(false);
      setCameraLoading(true);
      setCameraActive(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      streamRef.current = stream;
      // State update will trigger useEffect to attach stream after video element renders

    } catch (err) {
      console.error('Camera error:', err);
      setCameraLoading(false);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access to clock in.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please ensure your device has a camera.');
      } else {
        setError('Unable to access camera. Please allow camera permission.');
      }
    }
  }, []);

  // Attach stream to video element when it becomes available
  useEffect(() => {
    if (cameraLoading && videoRef.current && streamRef.current) {
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
      videoRef.current.play()
        .then(() => {
          setCameraLoading(false);
          setCameraActive(true);
          setCameraStartTime(Date.now());
          setCaptureCountdown(Math.ceil(LIVENESS_DELAY / 1000));
        })
        .catch(err => {
          console.error('Video play error:', err);
          // Still set camera active even if play() fails
          setCameraLoading(false);
          setCameraActive(true);
          setCameraStartTime(Date.now());
          setCaptureCountdown(Math.ceil(LIVENESS_DELAY / 1000));
        });
    }
  }, [cameraLoading, LIVENESS_DELAY]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
    setCameraStartTime(null);
    setCanCapture(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Capture photo with liveness check
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Enforce liveness delay
    if (!canCapture) {
      setError('Please wait before capturing. This prevents photo replay attacks.');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const captureTime = Date.now();
    const cameraActiveTime = captureTime - cameraStartTime;

    try {
      const compressedDataUrl = await compressAttendancePhoto(rawDataUrl);
      const sizeKB = getBase64SizeKB(compressedDataUrl);
      console.log(`Photo compressed to ${sizeKB} KB`);

      // Set capture metadata for validation
      setCaptureMetadata({
        captureSource: 'camera',
        fromCamera: true,
        captureTime: captureTime,
        cameraActiveTime: cameraActiveTime
      });

      setCapturedPhoto(compressedDataUrl);
      stopCamera();

      // Haptic feedback on capture
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    } catch (err) {
      console.error('Compression error:', err);
      setCapturedPhoto(rawDataUrl);
      stopCamera();
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedPhoto(null);
    setCaptureMetadata({
      captureSource: null,
      fromCamera: false,
      captureTime: null,
      cameraActiveTime: 0
    });
    startCamera();
  };

  // Get GPS location (mandatory)
  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser. Clock-in requires GPS.');
      return;
    }

    setGettingLocation(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
        setGettingLocation(false);

        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(30);
        }
      },
      (err) => {
        console.error('Location error:', err);
        let errorMessage = 'Unable to get location. ';

        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage += 'Location permission denied. GPS is required for clock-in.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage += 'Location unavailable. Please enable GPS.';
            break;
          case err.TIMEOUT:
            errorMessage += 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage += 'Please enable GPS and try again.';
        }

        setLocationError(errorMessage);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // Initiate clock action - opens confirmation modal
  const initiateClockAction = (action) => {
    // Validate required data before showing confirmation
    if (!capturedPhoto) {
      setError('Please capture a selfie photo first. Gallery uploads are not allowed.');
      return;
    }

    // Validate capture is from camera
    if (!captureMetadata.fromCamera) {
      setError('Photo must be captured from camera. Gallery uploads are not allowed.');
      setCapturedPhoto(null);
      return;
    }

    // Validate liveness (minimum camera active time)
    if (captureMetadata.cameraActiveTime < LIVENESS_DELAY) {
      setError('Photo capture too fast. Please retake with camera open longer.');
      setCapturedPhoto(null);
      return;
    }

    if (!location) {
      setError('GPS location is required. Please get your location first.');
      return;
    }

    setError('');
    setPendingAction(action);
    setShowConfirmation(true);
  };

  // Handle confirmed clock action
  const handleConfirmedAction = async (confirmationData) => {
    try {
      const payload = {
        action: pendingAction,
        photo_base64: confirmationData.photo,
        latitude: confirmationData.location.latitude,
        longitude: confirmationData.location.longitude,
        address: confirmationData.location.address,
        face_detected: confirmationData.faceDetected,
        face_confidence: confirmationData.faceConfidence,
        timestamp: confirmationData.timestamp,
        // Anti-cheating metadata
        capture_source: 'camera',
        liveness_verified: captureMetadata.cameraActiveTime >= LIVENESS_DELAY
      };

      const response = await essApi.clockAction(payload);

      setSuccess(response.data.message);
      setCapturedPhoto(null);
      setLocation(null);
      setShowConfirmation(false);
      setPendingAction(null);
      setCaptureMetadata({
        captureSource: null,
        fromCamera: false,
        captureTime: null,
        cameraActiveTime: 0
      });
      fetchClockStatus();

      // Haptic feedback on success
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Clock action error:', err);
      setError(err.response?.data?.error || 'Action failed. Please try again.');
      setShowConfirmation(false);

      // Haptic feedback on error
      if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
      }
    }
  };

  // Cancel confirmation
  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setPendingAction(null);
  };

  // Handle retake from confirmation modal
  const handleRetakeFromConfirmation = () => {
    setShowConfirmation(false);
    setPendingAction(null);
    retakePhoto();
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeInfo');
    navigate('/staff/login');
  };

  // Format time
  const formatTime = (time) => {
    if (!time) return '-';
    return time.substring(0, 5); // HH:MM
  };

  if (loading) {
    return (
      <div className="staff-clockin-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  const status = clockStatus?.status || 'not_started';
  const nextAction = clockStatus?.next_action;
  const record = clockStatus?.record;

  // Action button labels
  const actionLabels = {
    clock_in_1: 'Start Work',
    clock_out_1: 'Go on Break',
    clock_in_2: 'Return from Break',
    clock_out_2: 'End Work'
  };

  // Check if capture section should be shown
  const showCaptureSection = nextAction && status !== 'completed';

  return (
    <div className="staff-clockin-container">
      <header className="staff-header">
        <div className="header-content">
          <img src="/mixue-logo.png" alt="Mixue" className="header-logo" />
          <div className="user-info">
            <span className="user-name">{employeeInfo?.name}</span>
            <span className="user-id">{employeeInfo?.employee_id}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </header>

      <main className="clockin-main">
        {error && <div className="message error">{error}</div>}
        {success && <div className="message success">{success}</div>}

        {/* Current Status */}
        <div className="status-card">
          <h2>Today's Attendance</h2>
          <div className="status-info">
            <div className={`status-badge ${status}`}>
              {status === 'not_started' && 'Not Started'}
              {status === 'working' && 'Working'}
              {status === 'on_break' && 'On Break'}
              {status === 'completed' && 'Day Complete'}
            </div>
          </div>

          {/* Time Timeline */}
          {record && (
            <div className="time-timeline">
              <div className={`time-slot ${record.clock_in_1 ? 'done' : ''}`}>
                <div className="time-label">Start</div>
                <div className="time-value">{formatTime(record.clock_in_1)}</div>
              </div>
              <div className="time-connector"></div>
              <div className={`time-slot ${record.clock_out_1 ? 'done' : ''}`}>
                <div className="time-label">Break</div>
                <div className="time-value">{formatTime(record.clock_out_1)}</div>
              </div>
              <div className="time-connector"></div>
              <div className={`time-slot ${record.clock_in_2 ? 'done' : ''}`}>
                <div className="time-label">Return</div>
                <div className="time-value">{formatTime(record.clock_in_2)}</div>
              </div>
              <div className="time-connector"></div>
              <div className={`time-slot ${record.clock_out_2 ? 'done' : ''}`}>
                <div className="time-label">End</div>
                <div className="time-value">{formatTime(record.clock_out_2)}</div>
              </div>
            </div>
          )}

          {/* Summary for completed day */}
          {status === 'completed' && record && (
            <div className="day-summary">
              <div className="summary-item">
                <span className="summary-label">Total Hours</span>
                <span className="summary-value">{record.total_hours || '0'}h</span>
              </div>
              {parseFloat(record.ot_hours || 0) > 0 && (
                <div className="summary-item ot">
                  <span className="summary-label">OT Hours</span>
                  <span className="summary-value">{record.ot_hours}h</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Capture Section - Required for ALL clock actions */}
        {showCaptureSection && (
          <div className="action-card">
            <h3>{actionLabels[nextAction] || 'Clock Action'}</h3>
            <div className="mandatory-note">
              <strong>Required:</strong> Live selfie with face verification + GPS location.
              <br />
              <small>Gallery uploads not allowed. Single face only.</small>
            </div>

            {/* Camera Section */}
            <div className="camera-section">
              {!cameraActive && !cameraLoading && !capturedPhoto && (
                <button onClick={startCamera} className="action-btn camera-btn">
                  <span className="btn-icon">&#128247;</span>
                  Open Camera for Selfie
                </button>
              )}

              {(cameraLoading || cameraActive) && (
                <div className="camera-preview">
                  {cameraLoading && (
                    <div className="camera-loading-overlay">
                      <span className="spinner"></span>
                      <p>Starting camera...</p>
                    </div>
                  )}
                  <video ref={videoRef} autoPlay playsInline muted webkit-playsinline="true" style={{ width: '100%', height: 'auto' }} />
                  <div className="camera-overlay">
                    <div className="face-guide"></div>
                    <p className="camera-hint">
                      {canCapture
                        ? 'Position your face and tap capture'
                        : `Hold steady... ${captureCountdown}s`}
                    </p>
                  </div>

                  {/* Liveness indicator */}
                  <div className={`liveness-indicator ${canCapture ? 'ready' : 'waiting'}`}>
                    {canCapture ? (
                      <span>&#10003; Ready to capture</span>
                    ) : (
                      <span>&#9201; Verifying live camera... {captureCountdown}s</span>
                    )}
                  </div>

                  <button
                    onClick={capturePhoto}
                    className={`capture-btn ${canCapture ? '' : 'disabled'}`}
                    disabled={!canCapture}
                  >
                    {canCapture ? 'Capture' : captureCountdown}
                  </button>
                </div>
              )}

              {capturedPhoto && (
                <div className="photo-preview">
                  <img src={capturedPhoto} alt="Captured" />
                  <div className="photo-status">
                    <span className="check-mark">&#10003;</span> Live photo captured
                  </div>
                  <button onClick={retakePhoto} className="retake-btn">
                    Retake Photo
                  </button>
                </div>
              )}
            </div>

            {/* GPS Section */}
            <div className="gps-section">
              {!location ? (
                <button
                  onClick={getLocation}
                  className="action-btn gps-btn"
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <>
                      <span className="spinner"></span>
                      Getting Location...
                    </>
                  ) : (
                    <>
                      <span className="btn-icon">&#128205;</span>
                      Get GPS Location
                    </>
                  )}
                </button>
              ) : (
                <div className="location-info">
                  <span className="location-icon">&#128205;</span>
                  <div className="location-details">
                    <span className="location-text">Location captured</span>
                    <span className="location-coords">
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </span>
                    {location.accuracy && (
                      <span className="location-accuracy">
                        Accuracy: {Math.round(location.accuracy)}m
                      </span>
                    )}
                  </div>
                  <button onClick={getLocation} className="refresh-location">
                    Refresh
                  </button>
                </div>
              )}
              {locationError && <p className="location-error">{locationError}</p>}
            </div>

            {/* Submit Button */}
            <button
              onClick={() => initiateClockAction(nextAction)}
              className={`submit-btn ${nextAction === 'clock_in_1' ? 'clock-in-btn' : nextAction === 'clock_out_1' ? 'break-btn' : nextAction === 'clock_in_2' ? 'return-btn' : 'end-btn'}`}
              disabled={!capturedPhoto || !location}
            >
              {actionLabels[nextAction]}
            </button>

            {/* Requirements Checklist */}
            <div className="requirements-checklist">
              <div className={`requirement ${capturedPhoto ? 'met' : ''}`}>
                <span className="req-icon">{capturedPhoto ? '&#10003;' : '&#9675;'}</span>
                <span>Live selfie (camera only)</span>
              </div>
              <div className={`requirement ${location ? 'met' : ''}`}>
                <span className="req-icon">{location ? '&#10003;' : '&#9675;'}</span>
                <span>GPS location</span>
              </div>
              <div className="requirement pending">
                <span className="req-icon">&#9675;</span>
                <span>Face verification</span>
              </div>
              <div className="requirement pending">
                <span className="req-icon">&#9675;</span>
                <span>Image quality check</span>
              </div>
            </div>

            {/* Anti-cheating notice */}
            <div className="security-notice">
              <small>
                &#128274; Anti-cheating: Server timestamp, single face only, no gallery uploads
              </small>
            </div>
          </div>
        )}

        {/* Day Complete */}
        {status === 'completed' && (
          <div className="action-card completed">
            <h3>Great job today!</h3>
            <p className="action-note">Your attendance has been recorded and verified.</p>
          </div>
        )}
      </main>

      {/* Hidden canvas for capturing photos */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Confirmation Modal */}
      <ClockConfirmation
        isOpen={showConfirmation}
        action={pendingAction}
        photo={capturedPhoto}
        location={location}
        captureMetadata={captureMetadata}
        onConfirm={handleConfirmedAction}
        onCancel={handleCancelConfirmation}
        onRetakePhoto={handleRetakeFromConfirmation}
      />
    </div>
  );
}

export default StaffClockIn;
