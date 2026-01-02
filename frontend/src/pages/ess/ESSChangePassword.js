import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { essApi } from '../../api';
import './ESSLogin.css';

function ESSChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstLogin = location.state?.firstLogin || false;

  const [formData, setFormData] = useState({
    newUsername: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate username for first login
    if (isFirstLogin && formData.newUsername) {
      const username = formData.newUsername.trim();
      // Username must be at least 3 characters
      if (username.length < 3) {
        setError('Username must be at least 3 characters');
        return;
      }
      // Only letters and numbers allowed (no symbols)
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;
      if (!alphanumericRegex.test(username)) {
        setError('Username can only contain letters and numbers (no symbols)');
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
        isFirstLogin ? formData.newUsername : null
      );

      // Update stored employee info with new email if changed
      if (response.data?.employee) {
        localStorage.setItem('employeeInfo', JSON.stringify(response.data.employee));
      }

      // Navigate to dashboard on success
      navigate('/ess/dashboard', {
        state: { message: isFirstLogin ? 'Account setup completed!' : 'Password changed successfully!' }
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
          <h1>{isFirstLogin ? 'Setup Your Account' : 'Change Password'}</h1>
          <p>
            {isFirstLogin
              ? 'Choose your username and password. Your current password is your IC number.'
              : 'Enter your current password and choose a new one.'
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
          {/* Username field - only for first login */}
          {isFirstLogin && (
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={formData.newUsername}
                onChange={(e) => setFormData({ ...formData, newUsername: e.target.value })}
                placeholder="Choose your username"
                required
                autoComplete="username"
                minLength={3}
              />
              <small style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                This will be your login username
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
            {loading ? 'Saving...' : (isFirstLogin ? 'Setup Account' : 'Change Password')}
          </button>

          <button type="button" className="skip-btn" onClick={handleSkip}>
            Skip for Now
          </button>
        </form>

        {isFirstLogin && (
          <div className="password-hint">
            <p><strong>Account Setup:</strong></p>
            <ul>
              <li>Username: letters and numbers only, no symbols</li>
              <li>Password must be at least 6 characters</li>
              <li>Password must be different from your IC number</li>
            </ul>
            <p style={{ marginTop: '10px', color: '#64748b', fontSize: '12px' }}>
              You can skip for now, but you'll be asked again on next login.
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

export default ESSChangePassword;
