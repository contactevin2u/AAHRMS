import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import './ESSLogin.css';

function ESSLogin() {
  const navigate = useNavigate();
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'ic'
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    name: '',
    ic_number: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('employeeToken');
    if (token) {
      navigate('/ess/dashboard');
    }
  }, [navigate]);

  // PWA Install prompt
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Check if running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let response;

      if (loginMethod === 'email') {
        response = await essApi.login(formData.login, formData.password);
      } else {
        response = await essApi.loginByName(formData.name, formData.ic_number);
      }

      const { token, employee, requiresPasswordChange } = response.data;

      // Store token and employee info
      localStorage.setItem('employeeToken', token);
      localStorage.setItem('employeeInfo', JSON.stringify(employee));

      // If first login with IC as password, redirect to change password
      if (requiresPasswordChange) {
        navigate('/ess/change-password', { state: { firstLogin: true } });
      } else {
        // Navigate to dashboard
        navigate('/ess/dashboard');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="ess-login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-header">
          <img src="/logos/hr-default.png" alt="ESS" className="login-logo" />
          <h1>Employee Portal</h1>
          <p>Sign in to access your dashboard</p>
        </div>

        {/* Login Method Tabs */}
        <div className="login-tabs">
          <button
            className={`tab ${loginMethod === 'email' ? 'active' : ''}`}
            onClick={() => setLoginMethod('email')}
          >
            Email / Password
          </button>
          <button
            className={`tab ${loginMethod === 'ic' ? 'active' : ''}`}
            onClick={() => setLoginMethod('ic')}
          >
            IC Number
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {loginMethod === 'email' ? (
            <>
              <div className="form-group">
                <label>Username or Employee ID</label>
                <input
                  type="text"
                  value={formData.login}
                  onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                  placeholder="Enter username or employee ID"
                  required
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="login-hint">
                <span className="hint-icon">💡</span>
                <div className="hint-text">
                  <strong>First time login?</strong>
                  <p>Your password is your IC number without dashes (e.g. 901234145678)</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div className="form-group">
                <label>IC Number (MyKad)</label>
                <input
                  type="text"
                  value={formData.ic_number}
                  onChange={(e) => {
                    // Allow only numbers and dashes
                    let value = e.target.value.replace(/[^0-9-]/g, '');
                    // Auto-insert dashes as user types
                    const digits = value.replace(/-/g, '');
                    if (digits.length >= 6 && digits.length < 8) {
                      value = `${digits.slice(0,6)}-${digits.slice(6)}`;
                    } else if (digits.length >= 8) {
                      value = `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8,12)}`;
                    } else {
                      value = digits;
                    }
                    setFormData({ ...formData, ic_number: value });
                  }}
                  placeholder="e.g. 901234-12-5678"
                  required
                  maxLength="14"
                />
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Format: YYMMDD-SS-NNNN
                </small>
              </div>
            </>
          )}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Forgot Password Link */}
        {loginMethod === 'email' && (
          <div className="forgot-link">
            <a href="/ess/forgot-password">Forgot password?</a>
          </div>
        )}

        {/* Install Prompt */}
        {showInstallPrompt && !isIOS && (
          <div className="install-prompt">
            <p>Install the app for quick access</p>
            <button onClick={handleInstall} className="install-btn">
              Install App
            </button>
          </div>
        )}

        {/* iOS Install Instructions */}
        {isIOS && (
          <div className="ios-install-hint">
            <p>
              <strong>Install on iPhone:</strong> Tap
              <span className="share-icon"> &#x2B06;&#xFE0E; </span>
              then "Add to Home Screen"
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="login-footer">
        <p>Powered by HRMS</p>
      </div>
    </div>
  );
}

export default ESSLogin;
