import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../api';
import './MimixLogin.css';

function MimixLogin() {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [icNumber, setIcNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

      // Navigate to clock-in page
      navigate('/staff/clockin');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mimix-login-container">
      <div className="mimix-login-card">
        <div className="mimix-login-header">
          <img src="/mixue-logo.png" alt="Mixue" className="mimix-logo" />
          <h1>Staff Login</h1>
          <p>Enter your Employee ID and IC Number</p>
        </div>

        <form onSubmit={handleSubmit} className="mimix-login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="employeeId">Employee ID</label>
            <input
              type="text"
              id="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g., MX001"
              autoComplete="off"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="icNumber">IC Number</label>
            <input
              type="text"
              id="icNumber"
              value={icNumber}
              onChange={(e) => setIcNumber(e.target.value)}
              placeholder="e.g., 990101-01-1234"
              autoComplete="off"
              disabled={loading}
            />
            <small>Enter with or without dashes</small>
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mimix-login-footer">
          <a href="/" className="admin-link">Admin Login</a>
        </div>
      </div>
    </div>
  );
}

export default MimixLogin;
