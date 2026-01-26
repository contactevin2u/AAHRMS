import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSLogin.css';

function ESSLogin() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'ic'
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    name: '',
    ic_number: ''
  });
  const [idType, setIdType] = useState('ic'); // 'ic' or 'passport'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [rememberMe, setRememberMe] = useState(true); // Default to remember
  const [autoLogging, setAutoLogging] = useState(false);

  // Check if already logged in OR auto-login with saved credentials
  useEffect(() => {
    const token = localStorage.getItem('employeeToken');
    if (token) {
      navigate('/ess/dashboard');
      return;
    }

    // Try auto-login with saved credentials
    const savedCredentials = localStorage.getItem('essSavedCredentials');
    if (savedCredentials) {
      try {
        const creds = JSON.parse(savedCredentials);
        setAutoLogging(true);

        // Auto-login
        const autoLogin = async () => {
          try {
            let response;
            if (creds.type === 'email') {
              response = await essApi.login(creds.login, creds.password);
            } else {
              response = await essApi.loginByName(creds.name, creds.ic_number);
            }

            const { token, employee, requiresPasswordChange } = response.data;
            localStorage.setItem('employeeToken', token);
            localStorage.setItem('employeeInfo', JSON.stringify(employee));

            if (requiresPasswordChange) {
              navigate('/ess/change-password', { state: { firstLogin: true } });
            } else {
              navigate('/ess/dashboard');
            }
          } catch (err) {
            // If auto-login fails, clear saved credentials and show login form
            console.log('Auto-login failed, showing login form');
            localStorage.removeItem('essSavedCredentials');
            setAutoLogging(false);
          }
        };

        autoLogin();
      } catch (e) {
        localStorage.removeItem('essSavedCredentials');
        setAutoLogging(false);
      }
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

      // Save credentials for auto-login if remember me is checked
      if (rememberMe) {
        if (loginMethod === 'email') {
          localStorage.setItem('essSavedCredentials', JSON.stringify({
            type: 'email',
            login: formData.login,
            password: formData.password
          }));
        } else {
          localStorage.setItem('essSavedCredentials', JSON.stringify({
            type: 'ic',
            name: formData.name,
            ic_number: formData.ic_number
          }));
        }
      }

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

  // Show loading while auto-logging in
  if (autoLogging) {
    return (
      <div className="ess-login-page">
        <div className="login-card">
          <div className="login-header">
            <img src="/logos/hr-default.png" alt="ESS" className="login-logo" />
            <h1>{t('login.title')}</h1>
            <p>{t('login.autoSigningIn')}</p>
          </div>
          <div className="auto-login-loading">
            <div className="spinner"></div>
            <p>{t('common.pleaseWait')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ess-login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-header">
          <img src="/logos/hr-default.png" alt="ESS" className="login-logo" />
          <h1>{t('login.title')}</h1>
          <p>{t('login.subtitle')}</p>
        </div>

        {/* Login Method Tabs */}
        <div className="login-tabs">
          <button
            className={`tab ${loginMethod === 'email' ? 'active' : ''}`}
            onClick={() => setLoginMethod('email')}
          >
            {t('login.tabs.email')}
          </button>
          <button
            className={`tab ${loginMethod === 'ic' ? 'active' : ''}`}
            onClick={() => setLoginMethod('ic')}
          >
            {t('login.tabs.ic')}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
          {loginMethod === 'email' ? (
            <>
              <div className="form-group">
                <label>{t('login.usernameLabel')}</label>
                <input
                  type="text"
                  name="login_field"
                  value={formData.login}
                  onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                  placeholder={t('login.usernamePlaceholder')}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>{t('login.passwordLabel')}</label>
                <input
                  type="password"
                  name="password_field"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={t('login.passwordPlaceholder')}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="login-hint">
                <span className="hint-icon">💡</span>
                <div className="hint-text">
                  <strong>{t('login.firstTimeTitle')}</strong>
                  <p>{t('login.firstTimeHint')}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>{t('login.fullNameLabel')}</label>
                <input
                  type="text"
                  name="name_field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('login.fullNamePlaceholder')}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>{idType === 'ic' ? t('login.icLabel') : t('login.passportLabel')}</label>
                {/* ID Type Toggle */}
                <div className="id-type-toggle" style={{ marginBottom: '8px' }}>
                  <button
                    type="button"
                    className={`id-type-btn ${idType === 'ic' ? 'active' : ''}`}
                    onClick={() => {
                      setIdType('ic');
                      setFormData({ ...formData, ic_number: '' });
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px 0 0 4px',
                      background: idType === 'ic' ? '#3b82f6' : '#fff',
                      color: idType === 'ic' ? '#fff' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    IC
                  </button>
                  <button
                    type="button"
                    className={`id-type-btn ${idType === 'passport' ? 'active' : ''}`}
                    onClick={() => {
                      setIdType('passport');
                      setFormData({ ...formData, ic_number: '' });
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      border: '1px solid #e2e8f0',
                      borderLeft: 'none',
                      borderRadius: '0 4px 4px 0',
                      background: idType === 'passport' ? '#3b82f6' : '#fff',
                      color: idType === 'passport' ? '#fff' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    Passport
                  </button>
                </div>
                <input
                  type="text"
                  value={formData.ic_number}
                  onChange={(e) => {
                    if (idType === 'ic') {
                      // Allow only numbers and dashes for IC
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
                    } else {
                      // Passport: allow alphanumeric, no auto-formatting
                      const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                      setFormData({ ...formData, ic_number: value });
                    }
                  }}
                  placeholder={idType === 'ic' ? 'e.g. 901234-12-5678' : 'e.g. A12345678'}
                  required
                  maxLength={idType === 'ic' ? 14 : 20}
                />
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  {idType === 'ic' ? t('login.icFormat') : t('login.passportFormat')}
                </small>
              </div>
            </>
          )}

          {/* Remember Me - Always checked by default */}
          <div className="remember-me">
            <label>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>{t('login.rememberMe')}</span>
            </label>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>

        {/* Forgot Password Link */}
        {loginMethod === 'email' && (
          <div className="forgot-link">
            <a href="/ess/forgot-password">{t('login.forgotPassword')}</a>
          </div>
        )}

        {/* Install Prompt */}
        {showInstallPrompt && !isIOS && (
          <div className="install-prompt">
            <p>{t('login.installPrompt')}</p>
            <button onClick={handleInstall} className="install-btn">
              {t('login.installApp')}
            </button>
          </div>
        )}

        {/* iOS Install Instructions */}
        {isIOS && (
          <div className="ios-install-hint">
            <p>
              <strong>{t('login.iosInstallTitle')}</strong> {t('login.iosInstallHint')}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="login-footer">
        <p>{t('login.poweredBy')}</p>
      </div>
    </div>
  );
}

export default ESSLogin;
