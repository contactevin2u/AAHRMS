import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import './ESSClockIn.css';

function ESSClockIn() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Camera and location states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [locationError, setLocationError] = useState('');
  const [serverTime, setServerTime] = useState(new Date());

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

  // Start camera
  const startCamera = async () => {
    setCameraLoading(true);
    setCameraActive(false);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      if (videoRef.current) {
        // Clear any existing stream
        if (videoRef.current.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }

        videoRef.current.srcObject = stream;

        // For iOS Safari compatibility
        videoRef.current.setAttribute('autoplay', '');
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('muted', '');

        // Wait for video to be ready
        const playVideo = () => {
          videoRef.current.play()
            .then(() => {
              setCameraLoading(false);
              setCameraActive(true);
            })
            .catch(err => {
              console.error('Video play error:', err);
              // Try again without promise
              videoRef.current.play();
              setCameraLoading(false);
              setCameraActive(true);
            });
        };

        if (videoRef.current.readyState >= 2) {
          playVideo();
        } else {
          videoRef.current.onloadeddata = playVideo;
        }
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraLoading(false);
      setError('Unable to access camera. Please allow camera permission.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  // Capture photo
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const photoData = canvas.toDataURL('image/jpeg', 0.7);
    setCapturedPhoto(photoData);
    stopCamera();
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
        photo: capturedPhoto,
        latitude: location.latitude,
        longitude: location.longitude,
        address: address
      });

      setSuccess(res.data.message || 'Action recorded successfully!');
      setCapturedPhoto(null);

      // Refresh status
      setTimeout(() => {
        fetchStatus();
        setSuccess('');
      }, 2000);
    } catch (err) {
      console.error('Clock action error:', err);
      setError(err.response?.data?.error || 'Failed to record action. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Get action button label
  const getActionLabel = () => {
    switch (status?.next_action) {
      case 'clock_in_1': return 'Clock In';
      case 'clock_out_1': return 'Start Break';
      case 'clock_in_2': return 'End Break';
      case 'clock_out_2': return 'Clock Out';
      default: return 'Clock In';
    }
  };

  // Get status message
  const getStatusMessage = () => {
    if (!status) return '';
    switch (status.status) {
      case 'not_started': return 'Ready to start your day';
      case 'working': return 'Currently working';
      case 'on_break': return 'On break';
      case 'completed': return 'Completed for today';
      default: return '';
    }
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div className="ess-clockin">
        {/* Offline Warning */}
        {!isOnline && (
          <div className="offline-warning">
            <span className="offline-icon">&#x26A0;&#xFE0F;</span>
            <div>
              <strong>You're Offline</strong>
              <p>Clock-in requires an internet connection.</p>
            </div>
          </div>
        )}

        {/* Server Time */}
        <div className="time-display">
          <span className="time">
            {serverTime.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="date">
            {serverTime.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>

        {/* Status */}
        <div className={`status-badge ${status?.status || 'not_started'}`}>
          {getStatusMessage()}
        </div>

        {/* Today's Timeline */}
        {status?.record && (
          <div className="timeline">
            <div className={`timeline-item ${status.record.clock_in_1 ? 'done' : ''}`}>
              <span className="time-label">Clock In</span>
              <span className="time-value">{status.record.clock_in_1 || '--:--'}</span>
            </div>
            <div className={`timeline-item ${status.record.clock_out_1 ? 'done' : ''}`}>
              <span className="time-label">Break</span>
              <span className="time-value">{status.record.clock_out_1 || '--:--'}</span>
            </div>
            <div className={`timeline-item ${status.record.clock_in_2 ? 'done' : ''}`}>
              <span className="time-label">Return</span>
              <span className="time-value">{status.record.clock_in_2 || '--:--'}</span>
            </div>
            <div className={`timeline-item ${status.record.clock_out_2 ? 'done' : ''}`}>
              <span className="time-label">Clock Out</span>
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
                Take Selfie
              </button>
            )}

            {(cameraLoading || cameraActive) && (
              <div className="camera-view">
                {cameraLoading && (
                  <div className="camera-loading">
                    <div className="spinner"></div>
                    <p>Starting camera...</p>
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
                <img src={capturedPhoto} alt="Selfie" />
                <button className="retake-btn" onClick={retakePhoto}>Retake</button>
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
            <span className="location-text">{address || 'Location captured'}</span>
          ) : (
            <span className="location-loading">Getting location...</span>
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
            {submitting ? 'Submitting...' : getActionLabel()}
          </button>
        )}

        {/* Completed Message */}
        {status?.status === 'completed' && (
          <div className="completed-message">
            <span className="check-icon">&#x2705;</span>
            <p>You've completed your attendance for today.</p>
            {status.record && (
              <p className="hours-worked">
                Total: {status.record.total_hours?.toFixed(1) || 0} hours
              </p>
            )}
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSClockIn;
