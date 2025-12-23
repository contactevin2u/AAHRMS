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

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Get raw image data
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);

    // Compress the image (640px width, 60% quality)
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

  // Submit clock in
  const handleClockIn = async () => {
    if (!capturedPhoto) {
      setError('Please capture a photo first');
      return;
    }
    if (!location) {
      setError('Please get your GPS location first');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await essApi.clockIn({
        photo_base64: capturedPhoto,
        latitude: location.latitude,
        longitude: location.longitude,
        location_address: `${location.latitude}, ${location.longitude}`
      });

      setSuccess('Clock-in successful!');
      setCapturedPhoto(null);
      setLocation(null);
      fetchClockStatus();
    } catch (err) {
      console.error('Clock-in error:', err);
      setError(err.response?.data?.error || 'Clock-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit clock out
  const handleClockOut = async () => {
    setSubmitting(true);
    setError('');

    try {
      const response = await essApi.clockOut({});
      setSuccess(`Clock-out successful! Worked ${parseFloat(response.data.record.hours_worked).toFixed(2)} hours`);
      fetchClockStatus();
    } catch (err) {
      console.error('Clock-out error:', err);
      setError(err.response?.data?.error || 'Clock-out failed');
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
  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="staff-clockin-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  const isClockedIn = clockStatus?.status === 'clocked_in';

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
          <h2>Today's Status</h2>
          <div className="status-info">
            <div className={`status-badge ${isClockedIn ? 'active' : 'inactive'}`}>
              {isClockedIn ? 'Clocked In' : 'Not Clocked In'}
            </div>
            {clockStatus?.record && (
              <div className="time-info">
                <div className="time-item">
                  <span className="time-label">Clock In:</span>
                  <span className="time-value">{formatTime(clockStatus.record.clock_in_time)}</span>
                </div>
                {clockStatus.record.clock_out_time && (
                  <div className="time-item">
                    <span className="time-label">Clock Out:</span>
                    <span className="time-value">{formatTime(clockStatus.record.clock_out_time)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Clock In Section */}
        {!isClockedIn && (
          <div className="action-card">
            <h3>Clock In</h3>

            {/* Camera Section */}
            <div className="camera-section">
              {!cameraActive && !capturedPhoto && (
                <button onClick={startCamera} className="action-btn camera-btn">
                  Open Camera
                </button>
              )}

              {cameraActive && (
                <div className="camera-preview">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                  />
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
              onClick={handleClockIn}
              className="submit-btn clock-in-btn"
              disabled={submitting || !capturedPhoto || !location}
            >
              {submitting ? 'Submitting...' : 'Clock In'}
            </button>
          </div>
        )}

        {/* Clock Out Section */}
        {isClockedIn && (
          <div className="action-card">
            <h3>Clock Out</h3>
            <p className="clock-out-note">
              You have been working since {formatTime(clockStatus.record.clock_in_time)}
            </p>
            <button
              onClick={handleClockOut}
              className="submit-btn clock-out-btn"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Clock Out'}
            </button>
          </div>
        )}
      </main>

      {/* Hidden canvas for capturing photos */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default StaffClockIn;
