import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { feedbackApi } from '../api';
import './AdminDashboard.css';

const CATEGORY_COLORS = {
  suggestion: '#4CAF50',
  concern: '#FF9800',
  complaint: '#f44336',
  praise: '#2196F3',
  question: '#9C27B0',
  other: '#607D8B',
};

function AdminDashboard() {
  const [feedback, setFeedback] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ category: '', is_read: '' });
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1 });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [notes, setNotes] = useState('');
  const navigate = useNavigate();

  const fetchFeedback = useCallback(async () => {
    try {
      const params = { page: pagination.currentPage };
      if (filter.category) params.category = filter.category;
      if (filter.is_read !== '') params.is_read = filter.is_read;

      const response = await feedbackApi.getAll(params);
      setFeedback(response.data.feedback);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    }
  }, [pagination.currentPage, filter]);

  const fetchStats = async () => {
    try {
      const response = await feedbackApi.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchFeedback(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchFeedback]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const handleMarkAsRead = async (id, currentStatus) => {
    try {
      await feedbackApi.markAsRead(id, !currentStatus);
      fetchFeedback();
      fetchStats();
    } catch (error) {
      console.error('Error updating read status:', error);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedFeedback) return;
    try {
      await feedbackApi.updateNotes(selectedFeedback.id, notes);
      setSelectedFeedback({ ...selectedFeedback, admin_notes: notes });
      fetchFeedback();
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  };

  const openFeedbackDetail = (item) => {
    setSelectedFeedback(item);
    setNotes(item.admin_notes || '');
    if (!item.is_read) {
      handleMarkAsRead(item.id, false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Feedback Dashboard</h1>
          <span className="unread-badge">
            {stats?.overview?.unread || 0} unread
          </span>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </header>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-number">{stats.overview.total}</span>
            <span className="stat-label">Total Feedback</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-number">{stats.overview.unread}</span>
            <span className="stat-label">Unread</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.overview.last_week}</span>
            <span className="stat-label">Last 7 Days</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.overview.last_month}</span>
            <span className="stat-label">Last 30 Days</span>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <div className="feedback-list-section">
          <div className="filters">
            <select
              value={filter.category}
              onChange={(e) => {
                setFilter({ ...filter, category: e.target.value });
                setPagination({ ...pagination, currentPage: 1 });
              }}
            >
              <option value="">All Categories</option>
              <option value="suggestion">Suggestion</option>
              <option value="concern">Concern</option>
              <option value="complaint">Complaint</option>
              <option value="praise">Praise</option>
              <option value="question">Question</option>
              <option value="other">Other</option>
            </select>

            <select
              value={filter.is_read}
              onChange={(e) => {
                setFilter({ ...filter, is_read: e.target.value });
                setPagination({ ...pagination, currentPage: 1 });
              }}
            >
              <option value="">All Status</option>
              <option value="false">Unread</option>
              <option value="true">Read</option>
            </select>
          </div>

          <div className="feedback-list">
            {feedback.length === 0 ? (
              <div className="no-feedback">No feedback found</div>
            ) : (
              feedback.map((item) => (
                <div
                  key={item.id}
                  className={`feedback-item ${!item.is_read ? 'unread' : ''} ${
                    selectedFeedback?.id === item.id ? 'selected' : ''
                  }`}
                  onClick={() => openFeedbackDetail(item)}
                >
                  <div className="feedback-item-header">
                    <span
                      className="category-tag"
                      style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                    >
                      {item.category}
                    </span>
                    <span className="feedback-date">{formatDate(item.created_at)}</span>
                  </div>
                  <p className="feedback-preview">
                    {item.message.substring(0, 100)}
                    {item.message.length > 100 ? '...' : ''}
                  </p>
                  {!item.is_read && <span className="unread-dot"></span>}
                </div>
              ))
            )}
          </div>

          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() =>
                  setPagination({ ...pagination, currentPage: pagination.currentPage - 1 })
                }
                disabled={pagination.currentPage === 1}
              >
                Previous
              </button>
              <span>
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setPagination({ ...pagination, currentPage: pagination.currentPage + 1 })
                }
                disabled={pagination.currentPage === pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="feedback-detail-section">
          {selectedFeedback ? (
            <div className="feedback-detail">
              <div className="detail-header">
                <span
                  className="category-tag large"
                  style={{ backgroundColor: CATEGORY_COLORS[selectedFeedback.category] }}
                >
                  {selectedFeedback.category}
                </span>
                <span className="detail-date">
                  {formatDate(selectedFeedback.created_at)}
                </span>
              </div>

              <div className="detail-message">
                <h3>Message</h3>
                <p>{selectedFeedback.message}</p>
              </div>

              <div className="detail-notes">
                <h3>Admin Notes</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add private notes about this feedback..."
                  rows={4}
                />
                <button onClick={handleSaveNotes} className="save-notes-btn">
                  Save Notes
                </button>
              </div>

              <div className="detail-actions">
                <button
                  onClick={() => handleMarkAsRead(selectedFeedback.id, selectedFeedback.is_read)}
                  className={`status-btn ${selectedFeedback.is_read ? 'mark-unread' : 'mark-read'}`}
                >
                  {selectedFeedback.is_read ? 'Mark as Unread' : 'Mark as Read'}
                </button>
              </div>
            </div>
          ) : (
            <div className="no-selection">
              <p>Select a feedback item to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
