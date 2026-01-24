import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { payrollAIApi } from '../api';
import './AIChangeLogs.css';

function AIChangeLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'settings', 'payroll'
  const [selectedLog, setSelectedLog] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchLogs();
  }, [filter, page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {
        limit: pageSize,
        offset: page * pageSize
      };
      if (filter !== 'all') {
        params.type = filter;
      }
      const res = await payrollAIApi.getChangeLogs(params);
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load AI change logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getChangeTypeIcon = (type) => {
    return type === 'settings' ? '⚙️' : '💰';
  };

  const getChangeTypeBadge = (type) => {
    return type === 'settings' ? 'settings-badge' : 'payroll-badge';
  };

  const renderChangesDetail = (log) => {
    if (!log.changes) return null;

    if (log.change_type === 'settings') {
      // Settings changes - show key-value pairs
      return (
        <div className="changes-detail settings-changes">
          <h4>Settings Changed:</h4>
          <table>
            <thead>
              <tr>
                <th>Setting</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(log.changes).map(([key, value]) => (
                <tr key={key}>
                  <td className="setting-key">{key}</td>
                  <td className="setting-value">
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else {
      // Payroll changes - show employee changes
      const changes = Array.isArray(log.changes) ? log.changes : [];
      return (
        <div className="changes-detail payroll-changes">
          <h4>Payroll Changes ({changes.length} employees):</h4>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Field</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change, idx) => (
                <tr key={idx}>
                  <td>{change.employee_name}</td>
                  <td className="field-name">{change.field?.replace(/_/g, ' ')}</td>
                  <td className="amount">RM {parseFloat(change.new_value || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <Layout>
      <div className="ai-logs-page">
        <div className="page-header">
          <div>
            <h1>AI Change History</h1>
            <p>Track all changes made by AI assistants</p>
          </div>
        </div>

        {/* Filters */}
        <div className="logs-filters">
          <div className="filter-tabs">
            <button
              className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => { setFilter('all'); setPage(0); }}
            >
              All Changes
            </button>
            <button
              className={`filter-tab ${filter === 'settings' ? 'active' : ''}`}
              onClick={() => { setFilter('settings'); setPage(0); }}
            >
              ⚙️ Settings
            </button>
            <button
              className={`filter-tab ${filter === 'payroll' ? 'active' : ''}`}
              onClick={() => { setFilter('payroll'); setPage(0); }}
            >
              💰 Payroll
            </button>
          </div>
          <div className="logs-count">
            {total} total change{total !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Logs List */}
        <div className="logs-container">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="no-logs">
              <div className="no-logs-icon">🤖</div>
              <p>No AI changes recorded yet</p>
              <small>Changes made by AI assistants will appear here</small>
            </div>
          ) : (
            <div className="logs-list">
              {logs.map(log => (
                <div
                  key={log.id}
                  className={`log-card ${selectedLog?.id === log.id ? 'expanded' : ''}`}
                  onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                >
                  <div className="log-header">
                    <div className="log-icon">{getChangeTypeIcon(log.change_type)}</div>
                    <div className="log-info">
                      <div className="log-summary">{log.summary}</div>
                      <div className="log-meta">
                        <span className={`log-badge ${getChangeTypeBadge(log.change_type)}`}>
                          {log.change_type}
                        </span>
                        {log.category && (
                          <span className="log-category">{log.category}</span>
                        )}
                        {log.payroll_month && (
                          <span className="log-period">
                            {log.payroll_month}/{log.payroll_year}
                          </span>
                        )}
                        {log.affected_employees > 0 && (
                          <span className="log-affected">
                            {log.affected_employees} employee{log.affected_employees !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="log-time">
                      <div className="log-date">{formatDate(log.created_at)}</div>
                      <div className="log-by">by {log.changed_by_name || 'Admin'}</div>
                    </div>
                    <div className="log-expand">{selectedLog?.id === log.id ? '▼' : '▶'}</div>
                  </div>

                  {selectedLog?.id === log.id && (
                    <div className="log-details">
                      {renderChangesDetail(log)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="logs-pagination">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <span className="page-info">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default AIChangeLogs;
