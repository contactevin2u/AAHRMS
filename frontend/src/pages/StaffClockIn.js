import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import { compressAttendancePhoto, getBase64SizeKB } from '../utils/imageCompression';
import './StaffClockIn.css';

function StaffClockIn() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [clockStatus, setClockStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please allow camera permission.');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Capture photo
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);

    try {
      const compressedDataUrl = await compressAttendancePhoto(rawDataUrl);
      const sizeKB = getBase64SizeKB(compressedDataUrl);
      console.log(`Photo compressed to ${sizeKB} KB`);
      setCapturedPhoto(compressedDataUrl);
      stopCamera();
    } catch (err) {
      console.error('Compression error:', err);
      setCapturedPhoto(rawDataUrl);
      stopCamera();
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  // Get GPS location
  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setGettingLocation(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setGettingLocation(false);
      },
      (err) => {
        console.error('Location error:', err);
        setLocationError('Unable to get location. Please enable GPS.');
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Handle clock action (unified for all 4 actions)
  const handleClockAction = async (action) => {
    // First clock-in requires photo and GPS
    if (action === 'clock_in_1') {
      if (!capturedPhoto) {
        setError('Please capture a photo first');
        return;
      }
      if (!location) {
        setError('Please get your GPS location first');
        return;
      }
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = { action };

      if (action === 'clock_in_1') {
        payload.photo_base64 = capturedPhoto;
        payload.latitude = location.latitude;
        payload.longitude = location.longitude;
      }

      const response = await essApi.clockAction(payload);

      setSuccess(response.data.message);
      setCapturedPhoto(null);
      setLocation(null);
      fetchClockStatus();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Clock action error:', err);
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setSubmitting(false);
    }
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

  const actionIcons = {
    clock_in_1: '9:00',
    clock_out_1: '12:30',
    clock_in_2: '13:30',
    clock_out_2: '18:00'
  };

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

        {/* Clock In Section (requires photo + GPS) */}
        {nextAction === 'clock_in_1' && (
          <div className="action-card">
            <h3>Clock In - Start Work</h3>

            {/* Camera Section */}
            <div className="camera-section">
              {!cameraActive && !capturedPhoto && (
                <button onClick={startCamera} className="action-btn camera-btn">
                  Open Camera
                </button>
              )}

              {cameraActive && (
                <div className="camera-preview">
                  <video ref={videoRef} autoPlay playsInline muted />
                  <button onClick={capturePhoto} className="capture-btn">
                    Capture Photo
                  </button>
                </div>
              )}

              {capturedPhoto && (
                <div className="photo-preview">
                  <img src={capturedPhoto} alt="Captured" />
                  <button onClick={retakePhoto} className="retake-btn">
                    Retake
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
                  {gettingLocation ? 'Getting Location...' : 'Get GPS Location'}
                </button>
              ) : (
                <div className="location-info">
                  <span className="location-icon">GPS</span>
                  <span>Location captured</span>
                  <button onClick={getLocation} className="refresh-location">
                    Refresh
                  </button>
                </div>
              )}
              {locationError && <p className="location-error">{locationError}</p>}
            </div>

            {/* Submit Button */}
            <button
              onClick={() => handleClockAction('clock_in_1')}
              className="submit-btn clock-in-btn"
              disabled={submitting || !capturedPhoto || !location}
            >
              {submitting ? 'Submitting...' : 'Start Work'}
            </button>
          </div>
        )}

        {/* Break Button */}
        {nextAction === 'clock_out_1' && (
          <div className="action-card">
            <h3>Going on Break?</h3>
            <p className="action-note">
              Started at {formatTime(record?.clock_in_1)}
            </p>
            <button
              onClick={() => handleClockAction('clock_out_1')}
              className="submit-btn break-btn"
              disabled={submitting}
            >
              {submitting ? 'Processing...' : 'Go on Break'}
            </button>
            <p className="skip-note">
              Or skip break and <button
                className="link-btn"
                onClick={() => handleClockAction('clock_out_2')}
                disabled={submitting}
              >
                End Work directly
              </button>
            </p>
          </div>
        )}

        {/* Return from Break */}
        {nextAction === 'clock_in_2' && (
          <div className="action-card">
            <h3>Back from Break?</h3>
            <p className="action-note">
              Break started at {formatTime(record?.clock_out_1)}
            </p>
            <button
              onClick={() => handleClockAction('clock_in_2')}
              className="submit-btn return-btn"
              disabled={submitting}
            >
              {submitting ? 'Processing...' : 'Return from Break'}
            </button>
          </div>
        )}

        {/* End Work */}
        {nextAction === 'clock_out_2' && (
          <div className="action-card">
            <h3>End Your Work Day</h3>
            <p className="action-note">
              {record?.clock_in_2
                ? `Returned at ${formatTime(record.clock_in_2)}`
                : `Started at ${formatTime(record?.clock_in_1)}`}
            </p>
            <button
              onClick={() => handleClockAction('clock_out_2')}
              className="submit-btn end-btn"
              disabled={submitting}
            >
              {submitting ? 'Processing...' : 'End Work'}
            </button>
          </div>
        )}

        {/* Day Complete */}
        {status === 'completed' && (
          <div className="action-card completed">
            <h3>Great job today!</h3>
            <p className="action-note">Your attendance has been recorded.</p>
          </div>
        )}
      </main>

      {/* Hidden canvas for capturing photos */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default StaffClockIn;
