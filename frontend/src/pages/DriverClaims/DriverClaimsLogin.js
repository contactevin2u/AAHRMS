import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverClaimsApi } from '../../api';
import './DriverClaims.css';

function DriverClaimsLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('driverClaimsToken');
    if (token) {
      navigate('/driver-claims');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await driverClaimsApi.login({ username, password });
      localStorage.setItem('driverClaimsToken', response.data.token);
      localStorage.setItem('driverClaimsAdmin', JSON.stringify(response.data.admin));
      navigate('/driver-claims');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dc-login-page">
      <div className="dc-login-card">
        <div className="dc-login-header">
          <img src="/logos/aa-alive.png" alt="AA Alive" className="dc-login-logo" onError={(e) => { e.target.style.display = 'none'; }} />
          <h1>Driver Claims Portal</h1>
          <p>AA Alive Driver Cash Claims Management</p>
        </div>

        <form onSubmit={handleSubmit} className="dc-login-form">
          {error && <div className="dc-error">{error}</div>}

          <div className="dc-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoComplete="username"
            />
          </div>

          <div className="dc-field">
            <label>Password</label>
            <div className="dc-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="dc-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button type="submit" className="dc-btn dc-btn-primary dc-btn-full" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default DriverClaimsLogin;
