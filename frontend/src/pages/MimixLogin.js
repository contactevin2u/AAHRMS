import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import './MimixLogin.css';

function MimixLogin() {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [icNumber, setIcNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Check if app is installed or in standalone mode
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(standalone);

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    // Listen for install prompt (Android/Chrome)
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!standalone) {
        setShowInstallPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Show iOS install instructions if not standalone
    if (ios && !standalone) {
      const hasSeenPrompt = localStorage.getItem('iosInstallPromptSeen');
      if (!hasSeenPrompt) {
        setShowInstallPrompt(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Clear any browser autofilled values
  useEffect(() => {
    const timer = setTimeout(() => {
      setEmployeeId('');
      setIcNumber('');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('Install prompt outcome:', outcome);
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  const dismissInstallPrompt = () => {
    setShowInstallPrompt(false);
    if (isIOS) {
      localStorage.setItem('iosInstallPromptSeen', 'true');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!employeeId.trim() || !icNumber.trim()) {
      setError('Please enter Employee ID and IC Number');
      return;
    }

    setLoading(true);

    try {
      const response = await essApi.loginIC(employeeId.trim(), icNumber.trim());

      // Store token and employee info
      localStorage.setItem('employeeToken', response.data.token);
      localStorage.setItem('employeeInfo', JSON.stringify(response.data.employee));

      // Haptic feedback on success (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Navigate to clock-in page
      navigate('/staff/clockin');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');

      // Haptic feedback on error
      if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mimix-login-container">
      {/* Install Prompt */}
      {showInstallPrompt && !isStandalone && (
        <div className="install-prompt">
          <div className="install-content">
            {isIOS ? (
              <>
                <div className="install-icon">+</div>
                <div className="install-text">
                  <strong>Install this app</strong>
                  <span>Tap the Share button, then "Add to Home Screen"</span>
                </div>
              </>
            ) : (
              <>
                <div className="install-icon">+</div>
                <div className="install-text">
                  <strong>Install Staff Clock App</strong>
                  <span>Add to home screen for quick access</span>
                </div>
                <button className="install-btn" onClick={handleInstallClick}>
                  Install
                </button>
              </>
            )}
            <button className="dismiss-btn" onClick={dismissInstallPrompt}>x</button>
          </div>
        </div>
      )}

      <div className="mimix-login-card">
        <div className="mimix-login-header">
          <img src="/logos/mixue.png" alt="Mixue" className="mimix-logo" />
          <h1>Staff Clock In</h1>
          <p>Enter your Employee ID and IC Number</p>
        </div>

        <form onSubmit={handleSubmit} className="mimix-login-form" autoComplete="off">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="employeeId">Employee ID</label>
            <input
              type="text"
              id="employeeId"
              name="emp_id_field"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              placeholder="e.g., MX001"
              autoComplete="off"
              autoCapitalize="characters"
              disabled={loading}
              inputMode="text"
            />
          </div>

          <div className="form-group">
            <label htmlFor="icNumber">IC Number</label>
            <input
              type="text"
              id="icNumber"
              name="ic_field"
              value={icNumber}
              onChange={(e) => setIcNumber(e.target.value)}
              placeholder="e.g., 990101011234"
              autoComplete="new-password"
              disabled={loading}
              inputMode="numeric"
              pattern="[0-9-]*"
            />
            <small>Enter without dashes</small>
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner"></span>
                Logging in...
              </span>
            ) : (
              'Login'
            )}
          </button>
        </form>

        <div className="mimix-login-footer">
          <a href="/" className="admin-link">Admin Login</a>
        </div>
      </div>

      {/* Standalone mode indicator */}
      {isStandalone && (
        <div className="standalone-badge">App Mode</div>
      )}
    </div>
  );
}

export default MimixLogin;
