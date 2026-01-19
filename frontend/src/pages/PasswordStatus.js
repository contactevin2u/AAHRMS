import React, { useState, useEffect, useCallback } from 'react';
import { employeeApi } from '../api';
import Layout from '../components/Layout';
import './PasswordStatus.css';

function PasswordStatus() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState('');

  const fetchPasswordStatus = useCallback(async () => {
    if (!search.trim()) {
      setEmployees([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await employeeApi.getPasswordStatus({ search: search.trim() });
      setEmployees(response.data.employees || []);
      if (response.data.employees?.length === 0) {
        setError('No employees found matching your search.');
      }
    } catch (err) {
      console.error('Error fetching password status:', err);
      setError(err.response?.data?.error || 'Failed to fetch password status');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (search) {
      fetchPasswordStatus();
    }
  }, [search, fetchPasswordStatus]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleClearMustChange = async (employeeId, employeeName) => {
    if (!window.confirm(`Clear "must change password" flag for ${employeeName}?`)) {
      return;
    }

    try {
      // Use the reset-password endpoint with a special flag or create a new endpoint
      await employeeApi.resetPassword(employeeId);
      alert(`Password flag cleared for ${employeeName}. They will need to set a new password on next login.`);
      fetchPasswordStatus();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Set':
        return <span className="badge badge-success">Password Set</span>;
      case 'Must Change':
        return <span className="badge badge-warning">Must Change</span>;
      case 'Not Set':
        return <span className="badge badge-danger">Not Set</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  return (
    <Layout>
      <div className="password-status-page">
        <div className="page-header">
          <h1>Employee Password Status</h1>
          <p className="subtitle">View and manage employee password status and login history</p>
        </div>

        <div className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Search by name, employee ID, or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {error && <div className="error-message">{error}</div>}

        {employees.length > 0 && (
          <div className="results-section">
            <div className="results-count">
              Found {employees.length} employee(s)
            </div>

            <div className="table-container">
              <table className="password-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Username</th>
                    <th>Company</th>
                    <th>Password Status</th>
                    <th>Last Login</th>
                    <th>Password History</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        <div className="employee-info">
                          <strong>{emp.name}</strong>
                          <small>{emp.employee_id}</small>
                        </div>
                      </td>
                      <td>
                        <code>{emp.email || 'Not set'}</code>
                      </td>
                      <td>{emp.company_name || '-'}</td>
                      <td>
                        {getStatusBadge(emp.password_status)}
                        {emp.password_status === 'Must Change' && (
                          <button
                            className="btn btn-sm btn-link"
                            onClick={() => handleClearMustChange(emp.id, emp.name)}
                            title="Reset password (will require new password on login)"
                          >
                            Reset
                          </button>
                        )}
                      </td>
                      <td>
                        <span className={emp.last_login ? 'text-success' : 'text-muted'}>
                          {formatDate(emp.last_login)}
                        </span>
                      </td>
                      <td>
                        {emp.password_history && emp.password_history.length > 0 ? (
                          <ul className="history-list">
                            {emp.password_history.map((h, idx) => (
                              <li key={idx}>
                                <span className="history-action">{h.action}</span>
                                <span className="history-date">{formatDate(h.created_at)}</span>
                                {h.actor_name && (
                                  <span className="history-actor">by {h.actor_name}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">No history recorded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !search && (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>Search for Employees</h3>
            <p>Enter an employee name, ID, or email to check their password status.</p>
          </div>
        )}

        <div className="info-section">
          <h3>Password Status Guide</h3>
          <div className="status-guide">
            <div className="guide-item">
              <span className="badge badge-success">Password Set</span>
              <span>Employee has set their password and can login normally.</span>
            </div>
            <div className="guide-item">
              <span className="badge badge-warning">Must Change</span>
              <span>Employee must change their password on next login (usually after admin reset).</span>
            </div>
            <div className="guide-item">
              <span className="badge badge-danger">Not Set</span>
              <span>Employee has never set a password. They need to use "First Login" to set one.</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default PasswordStatus;
