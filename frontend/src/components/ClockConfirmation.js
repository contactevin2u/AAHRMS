/**
 * Clock In/Out Confirmation Screen Component
 *
 * Displays all mandatory data before submission:
 * - System timestamp (non-editable)
 * - GPS location (address + coordinates)
 * - Selfie preview with face detection status
 * - Confirm/Cancel actions
 */

import React, { useState, useEffect } from 'react';
import { detectFaceFromBase64, loadFaceDetectionModels } from '../utils/faceDetection';
import { getAddressFromCoordinates, formatCoordinates } from '../utils/geocoding';
import './ClockConfirmation.css';

function ClockConfirmation({
  isOpen,
  action,
  photo,
  location,
  onConfirm,
  onCancel,
  onRetakePhoto
}) {
  const [timestamp, setTimestamp] = useState(new Date());
  const [addressData, setAddressData] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [faceResult, setFaceResult] = useState(null);
  const [detectingFace, setDetectingFace] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Action labels
  const actionLabels = {
    clock_in_1: 'Start Work',
    clock_out_1: 'Go on Break',
    clock_in_2: 'Return from Break',
    clock_out_2: 'End Work'
  };

  // Update timestamp every second
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setTimestamp(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Load face detection models on mount
  useEffect(() => {
    loadFaceDetectionModels();
  }, []);

  // Get address when location changes
  useEffect(() => {
    if (!isOpen || !location) return;

    const fetchAddress = async () => {
      setLoadingAddress(true);
      try {
        const result = await getAddressFromCoordinates(
          location.latitude,
          location.longitude
        );
        setAddressData(result);
      } catch (error) {
        console.error('Address fetch error:', error);
        setAddressData({
          success: false,
          fullAddress: `${location.latitude}, ${location.longitude}`,
          shortAddress: 'Location captured',
          coordinates: location
        });
      } finally {
        setLoadingAddress(false);
      }
    };

    fetchAddress();
  }, [isOpen, location]);

  // Detect face when photo changes
  useEffect(() => {
    if (!isOpen || !photo) return;

    const runFaceDetection = async () => {
      setDetectingFace(true);
      setFaceResult(null);

      try {
        const result = await detectFaceFromBase64(photo);
        setFaceResult(result);
      } catch (error) {
        console.error('Face detection error:', error);
        setFaceResult({
          success: false,
          faceDetected: false,
          message: 'Face detection failed. Please try again.'
        });
      } finally {
        setDetectingFace(false);
      }
    };

    runFaceDetection();
  }, [isOpen, photo]);

  // Check if all requirements are met
  useEffect(() => {
    const hasTimestamp = timestamp instanceof Date;
    const hasLocation = location && location.latitude && location.longitude;
    const hasPhoto = !!photo;
    const hasFace = faceResult?.faceDetected === true;

    setCanSubmit(hasTimestamp && hasLocation && hasPhoto && hasFace && !submitting);
  }, [timestamp, location, photo, faceResult, submitting]);

  // Handle confirm
  const handleConfirm = async () => {
    if (!canSubmit) return;

    setSubmitting(true);

    try {
      await onConfirm({
        timestamp: timestamp.toISOString(),
        serverTime: timestamp.toTimeString().split(' ')[0],
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: addressData?.fullAddress || '',
          accuracy: location.accuracy
        },
        photo,
        faceDetected: true,
        faceConfidence: faceResult?.confidence || 0
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Format date
  const formatDate = (date) => {
    return date.toLocaleDateString('en-MY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format time
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  if (!isOpen) return null;

  return (
    <div className="confirmation-overlay">
      <div className="confirmation-modal">
        <div className="confirmation-header">
          <h2>Confirm {actionLabels[action] || 'Clock Action'}</h2>
          <p>Please verify all information before submitting</p>
        </div>

        <div className="confirmation-content">
          {/* Timestamp Section */}
          <div className="confirm-section timestamp-section">
            <div className="section-header">
              <span className="section-icon">&#128337;</span>
              <span className="section-title">Date & Time</span>
              <span className="section-status valid">Auto-captured</span>
            </div>
            <div className="section-body">
              <div className="timestamp-display">
                <div className="date">{formatDate(timestamp)}</div>
                <div className="time">{formatTime(timestamp)}</div>
              </div>
              <p className="section-note">System time (cannot be edited)</p>
            </div>
          </div>

          {/* Location Section */}
          <div className={`confirm-section location-section ${!location ? 'invalid' : ''}`}>
            <div className="section-header">
              <span className="section-icon">&#128205;</span>
              <span className="section-title">Location</span>
              <span className={`section-status ${location ? 'valid' : 'invalid'}`}>
                {location ? 'Captured' : 'Required'}
              </span>
            </div>
            <div className="section-body">
              {loadingAddress ? (
                <div className="loading-text">Getting address...</div>
              ) : location ? (
                <>
                  <div className="address-display">
                    {addressData?.fullAddress || 'Address loading...'}
                  </div>
                  <div className="coordinates-display">
                    <div className="coord-item">
                      <span className="coord-label">Lat:</span>
                      <span className="coord-value">{location.latitude.toFixed(6)}</span>
                    </div>
                    <div className="coord-item">
                      <span className="coord-label">Lng:</span>
                      <span className="coord-value">{location.longitude.toFixed(6)}</span>
                    </div>
                    {location.accuracy && (
                      <div className="coord-item">
                        <span className="coord-label">Accuracy:</span>
                        <span className="coord-value">{Math.round(location.accuracy)}m</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="missing-data">
                  <span className="warning-icon">&#9888;</span>
                  <span>Location data is required</span>
                </div>
              )}
            </div>
          </div>

          {/* Photo Section */}
          <div className={`confirm-section photo-section ${!photo ? 'invalid' : ''}`}>
            <div className="section-header">
              <span className="section-icon">&#128247;</span>
              <span className="section-title">Selfie</span>
              <span className={`section-status ${faceResult?.faceDetected ? 'valid' : detectingFace ? 'pending' : 'invalid'}`}>
                {detectingFace ? 'Checking...' : faceResult?.faceDetected ? 'Face Verified' : 'Face Required'}
              </span>
            </div>
            <div className="section-body">
              {photo ? (
                <div className="photo-container">
                  <img src={photo} alt="Selfie" className="selfie-preview" />

                  {/* Face Detection Status */}
                  <div className={`face-status ${faceResult?.faceDetected ? 'success' : 'error'}`}>
                    {detectingFace ? (
                      <>
                        <span className="spinner"></span>
                        <span>Detecting face...</span>
                      </>
                    ) : faceResult?.faceDetected ? (
                      <>
                        <span className="check-icon">&#10003;</span>
                        <span>Face detected ({Math.round((faceResult.confidence || 0) * 100)}% confidence)</span>
                      </>
                    ) : (
                      <>
                        <span className="x-icon">&#10007;</span>
                        <span>{faceResult?.message || 'No face detected'}</span>
                      </>
                    )}
                  </div>

                  {/* Retake Button */}
                  {!faceResult?.faceDetected && !detectingFace && (
                    <button className="retake-btn" onClick={onRetakePhoto}>
                      Retake Photo
                    </button>
                  )}
                </div>
              ) : (
                <div className="missing-data">
                  <span className="warning-icon">&#9888;</span>
                  <span>Selfie is required</span>
                </div>
              )}
            </div>
          </div>

          {/* Validation Summary */}
          <div className="validation-summary">
            <div className={`validation-item ${timestamp ? 'valid' : 'invalid'}`}>
              <span className="icon">{timestamp ? '&#10003;' : '&#10007;'}</span>
              <span>Timestamp</span>
            </div>
            <div className={`validation-item ${location ? 'valid' : 'invalid'}`}>
              <span className="icon">{location ? '&#10003;' : '&#10007;'}</span>
              <span>GPS Location</span>
            </div>
            <div className={`validation-item ${photo ? 'valid' : 'invalid'}`}>
              <span className="icon">{photo ? '&#10003;' : '&#10007;'}</span>
              <span>Selfie</span>
            </div>
            <div className={`validation-item ${faceResult?.faceDetected ? 'valid' : 'invalid'}`}>
              <span className="icon">{faceResult?.faceDetected ? '&#10003;' : '&#10007;'}</span>
              <span>Face Detected</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="confirmation-actions">
          <button
            className="cancel-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`confirm-btn ${canSubmit ? '' : 'disabled'}`}
            onClick={handleConfirm}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <>
                <span className="spinner"></span>
                Submitting...
              </>
            ) : (
              `Confirm ${actionLabels[action] || 'Action'}`
            )}
          </button>
        </div>

        {/* Warning if cannot submit */}
        {!canSubmit && !submitting && (
          <div className="submit-warning">
            {!faceResult?.faceDetected && photo && !detectingFace && (
              <p>&#9888; Face detection failed. Please retake your photo with your face clearly visible.</p>
            )}
            {!location && (
              <p>&#9888; GPS location is required. Please enable location services.</p>
            )}
            {!photo && (
              <p>&#9888; Selfie is required. Please capture a photo.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClockConfirmation;
