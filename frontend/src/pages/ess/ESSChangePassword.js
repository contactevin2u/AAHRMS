import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { essApi } from '../../api';
import './ESSLogin.css';

function ESSChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstLogin = location.state?.firstLogin || false;

  // Get current employee info
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const currentUsername = employeeInfo?.username || employeeInfo?.employee_id || '';

  const [formData, setFormData] = useState({
    newUsername: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [changeUsername, setChangeUsername] = useState(isFirstLogin);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate username if changing
    if (changeUsername && formData.newUsername) {
      const username = formData.newUsername.trim().toLowerCase();
      // Username must be at least 4 characters
      if (username.length < 4) {
        setError('Username must be at least 4 characters');
        return;
      }
      // Only letters, numbers, and underscore allowed
      const usernameRegex = /^[a-z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        setError('Username can only contain letters, numbers, and underscores');
        return;
      }
    }

    // Validate passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Validate password length
    if (formData.newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    // Validate new password is different from current
    if (formData.currentPassword === formData.newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      const response = await essApi.changePassword(
        formData.currentPassword,
        formData.newPassword,
        changeUsername && formData.newUsername ? formData.newUsername : null
      );

      // Update stored employee info with new email if changed
      if (response.data?.employee) {
        localStorage.setItem('employeeInfo', JSON.stringify(response.data.employee));
      }

      // Update saved credentials with new password (for auto-login)
      const savedCredentials = localStorage.getItem('essSavedCredentials');
      if (savedCredentials) {
        try {
          const creds = JSON.parse(savedCredentials);
          if (creds.type === 'email') {
            // Update with new username and password
            const newUsername = (changeUsername && formData.newUsername)
              ? formData.newUsername
              : creds.login;
            localStorage.setItem('essSavedCredentials', JSON.stringify({
              type: 'email',
              login: newUsername,
              password: formData.newPassword
            }));
          }
        } catch (e) {
          // If error, just clear saved credentials
          localStorage.removeItem('essSavedCredentials');
        }
      }

      // Navigate to dashboard on success
      const successMsg = isFirstLogin
        ? 'Account setup completed!'
        : (changeUsername && formData.newUsername
            ? 'Username and password updated!'
            : 'Password changed successfully!');
      navigate('/ess/dashboard', {
        state: { message: successMsg }
      });
    } catch (err) {
      console.error('Password change error:', err);
      setError(err.response?.data?.error || 'Failed to save changes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate('/ess/dashboard');
  };

  return (
    <div className="ess-login-page">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="password-icon">
            <span role="img" aria-label="lock">🔐</span>
          </div>
          <h1>{isFirstLogin ? 'Setup Your Account' : 'Account Settings'}</h1>
          <p>
            {isFirstLogin
              ? 'Choose your username and password. Your current password is your IC number.'
              : 'Change your username or password. You can update one or both.'
            }
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {/* Current Username Display */}
          {!isFirstLogin && currentUsername && (
            <div className="form-group">
              <label>Current Username</label>
              <div style={{
                padding: '12px',
                background: '#f1f5f9',
                borderRadius: '8px',
                color: '#1e293b',
                fontWeight: '500',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{currentUsername}</span>
                <button
                  type="button"
                  onClick={() => setChangeUsername(!changeUsername)}
                  style={{
                    background: changeUsername ? '#dc2626' : '#1976d2',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {changeUsername ? 'Cancel' : 'Change'}
                </button>
              </div>
            </div>
          )}

          {/* New Username field - for first login or when changing */}
          {(isFirstLogin || changeUsername) && (
            <div className="form-group">
              <label>{isFirstLogin ? 'Choose Username' : 'New Username'}</label>
              <input
                type="text"
                value={formData.newUsername}
                onChange={(e) => setFormData({ ...formData, newUsername: e.target.value })}
                placeholder={isFirstLogin ? "Choose your username" : "Enter new username"}
                required={isFirstLogin || changeUsername}
                autoComplete="username"
                minLength={4}
              />
              <small style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Letters, numbers, and underscore only. Min 4 characters.
              </small>
            </div>
          )}

          <div className="form-group">
            <label>Current Password {isFirstLogin && '(Your IC Number)'}</label>
            <input
              type="password"
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              placeholder={isFirstLogin ? 'Enter your IC number (no dashes)' : 'Enter current password'}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              placeholder="Enter new password (min 6 characters)"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm new password"
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Saving...' : (isFirstLogin ? 'Setup Account' : 'Save Changes')}
          </button>

          <button type="button" className="skip-btn" onClick={handleSkip}>
            {isFirstLogin ? 'Skip for Now' : 'Cancel'}
          </button>
        </form>

        {isFirstLogin ? (
          <div className="password-hint">
            <p><strong>Account Setup:</strong></p>
            <ul>
              <li>Username: letters, numbers, and underscore only</li>
              <li>Password must be at least 6 characters</li>
              <li>Password must be different from your IC number</li>
            </ul>
            <p style={{ marginTop: '10px', color: '#64748b', fontSize: '12px' }}>
              You can skip for now, but you'll be asked again on next login.
            </p>
          </div>
        ) : (
          <div className="password-hint">
            <p><strong>Tips:</strong></p>
            <ul>
              <li>Click "Change" next to username to update it</li>
              <li>Password must be at least 6 characters</li>
              <li>Remember your new credentials for next login</li>
            </ul>
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

export default ESSChangePassword;
