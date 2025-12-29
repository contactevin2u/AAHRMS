import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import './EmployeeLogin.css';

function EmployeeLogin() {
  const [view, setView] = useState('login'); // login, forgot, reset, setup
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // For forgot password
  const [email, setEmail] = useState('');

  // For password reset
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // For first-time setup
  const [employeeId, setEmployeeId] = useState('');
  const [icNumber, setIcNumber] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('employeeToken');
    if (token) {
      navigate('/ess/dashboard');
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await essApi.login({ login, password });
      localStorage.setItem('employeeToken', response.data.token);
      localStorage.setItem('employeeInfo', JSON.stringify(response.data.employee));
      navigate('/ess/dashboard');
    } catch (error) {
      if (error.response?.data?.requiresSetup) {
        setError('');
        setView('setup');
      } else {
        // Handle error object with {message, code, timestamp} structure
        const errorData = error.response?.data?.error;
        const errorMsg = typeof errorData === 'object' ? errorData?.message : errorData;
        setError(errorMsg || error.response?.data?.message || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      await essApi.forgotPassword(email);
      setSuccess('If an account exists with this email, a password reset link will be sent.');
    } catch (error) {
      const errorData = error.response?.data?.error;
      const errorMsg = typeof errorData === 'object' ? errorData?.message : errorData;
      setError(errorMsg || error.response?.data?.message || 'Failed to process request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      await essApi.resetPassword(resetToken, newPassword);
      setSuccess('Password reset successfully. You can now login.');
      setTimeout(() => {
        setView('login');
        setSuccess('');
      }, 2000);
    } catch (error) {
      const errorData = error.response?.data?.error;
      const errorMsg = typeof errorData === 'object' ? errorData?.message : errorData;
      setError(errorMsg || error.response?.data?.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      await essApi.setPassword({
        employee_id: employeeId,
        ic_number: icNumber,
        newPassword
      });
      setSuccess('Password set successfully. You can now login.');
      setTimeout(() => {
        setView('login');
        setSuccess('');
        setLogin(employeeId);
      }, 2000);
    } catch (error) {
      const errorData = error.response?.data?.error;
      const errorMsg = typeof errorData === 'object' ? errorData?.message : errorData;
      setError(errorMsg || error.response?.data?.message || 'Failed to set password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="employee-login">
      <div className="login-container">
        <div className="login-header">
          <img src="/logos/hr-default.png" alt="HRMS" className="login-logo" />
          <h1>HRMS</h1>
          <p>Employee Portal</p>
        </div>

        {view === 'login' && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="login">Employee ID / Email</label>
              <input
                type="text"
                id="login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Enter Employee ID or Email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </button>

            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setView('forgot'); setError(''); }}>
                Forgot Password?
              </button>
              <button type="button" className="link-btn" onClick={() => { setView('setup'); setError(''); }}>
                First Time Login?
              </button>
            </div>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="login-form">
            <h3>Forgot Password</h3>
            <p className="form-desc">Enter your registered email to receive a password reset link.</p>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setView('login'); setError(''); setSuccess(''); }}>
                Back to Login
              </button>
              <button type="button" className="link-btn" onClick={() => { setView('reset'); setError(''); setSuccess(''); }}>
                Have a Reset Token?
              </button>
            </div>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleResetPassword} className="login-form">
            <h3>Reset Password</h3>
            <p className="form-desc">Enter your reset token and new password.</p>

            <div className="form-group">
              <label htmlFor="resetToken">Reset Token</label>
              <input
                type="text"
                id="resetToken"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Enter reset token"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                required
                minLength={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setView('login'); setError(''); setSuccess(''); }}>
                Back to Login
              </button>
            </div>
          </form>
        )}

        {view === 'setup' && (
          <form onSubmit={handleSetupPassword} className="login-form">
            <h3>First Time Setup</h3>
            <p className="form-desc">Set up your password using your Employee ID and IC Number for verification.</p>

            <div className="form-group">
              <label htmlFor="employeeId">Employee ID</label>
              <input
                type="text"
                id="employeeId"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP001"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="icNumber">IC Number</label>
              <input
                type="text"
                id="icNumber"
                value={icNumber}
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder="e.g. 901234-56-7890"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="setupPassword">New Password</label>
              <input
                type="password"
                id="setupPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password (min 6 chars)"
                required
                minLength={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="setupConfirmPassword">Confirm Password</label>
              <input
                type="password"
                id="setupConfirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? 'Setting up...' : 'Set Password'}
            </button>

            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setView('login'); setError(''); setSuccess(''); }}>
                Back to Login
              </button>
            </div>
          </form>
        )}

        <div className="login-footer">
          <a href="/" className="admin-link">Admin Login</a>
        </div>
      </div>
    </div>
  );
}

export default EmployeeLogin;
