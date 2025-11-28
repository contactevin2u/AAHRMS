import React, { useState, useEffect } from 'react';
import { feedbackApi } from '../api';
import Layout from '../components/Layout';
import './Feedback.css';

function Feedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const res = await feedbackApi.getAll();
      setFeedbacks(res.data);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await feedbackApi.markRead(id);
      fetchFeedback();
    } catch (error) {
      console.error('Error marking feedback as read:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this feedback?')) {
      try {
        await feedbackApi.delete(id);
        fetchFeedback();
      } catch (error) {
        console.error('Error deleting feedback:', error);
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredFeedbacks = feedbacks.filter(fb => {
    if (filter === 'unread') return !fb.is_read;
    if (filter === 'read') return fb.is_read;
    return true;
  });

  const unreadCount = feedbacks.filter(fb => !fb.is_read).length;

  return (
    <Layout>
      <div className="feedback-page">
        <header className="page-header">
          <div>
            <h1>💬 Anonymous Feedback</h1>
            <p>View and manage staff feedback</p>
          </div>
          {unreadCount > 0 && (
            <div className="unread-badge">
              {unreadCount} unread
            </div>
          )}
        </header>

        <div className="filters-row">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({feedbacks.length})
          </button>
          <button
            className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
          <button
            className={`filter-btn ${filter === 'read' ? 'active' : ''}`}
            onClick={() => setFilter('read')}
          >
            Read ({feedbacks.length - unreadCount})
          </button>
        </div>

        {loading ? (
          <div className="loading">☕ Loading...</div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="no-feedback">
            <span className="no-icon">📭</span>
            <p>No feedback yet</p>
            <small>Share your anonymous feedback page with your team!</small>
          </div>
        ) : (
          <div className="feedback-list">
            {filteredFeedbacks.map(fb => (
              <div key={fb.id} className={`feedback-card ${fb.is_read ? 'read' : 'unread'}`}>
                <div className="feedback-header">
                  <span className="feedback-date">{formatDate(fb.created_at)}</span>
                  <div className="feedback-actions">
                    {!fb.is_read && (
                      <button onClick={() => handleMarkRead(fb.id)} className="mark-read-btn">
                        ✓ Mark Read
                      </button>
                    )}
                    <button onClick={() => handleDelete(fb.id)} className="delete-btn">
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="feedback-content">
                  <p>{fb.message}</p>
                </div>
                {!fb.is_read && <div className="unread-indicator"></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Feedback;
