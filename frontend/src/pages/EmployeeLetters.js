import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeeLetters.css';

function EmployeeLetters() {
  const [loading, setLoading] = useState(true);
  const [letters, setLetters] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [filter, setFilter] = useState('all');

  const letterTypes = {
    warning: { label: 'Warning Letter', color: '#d85454' },
    appreciation: { label: 'Appreciation Letter', color: '#2a9d5c' },
    promotion: { label: 'Promotion Letter', color: '#5478a8' },
    performance_improvement: { label: 'Performance Improvement', color: '#e67e22' },
    salary_adjustment: { label: 'Salary Adjustment', color: '#27ae60' },
    general_notice: { label: 'General Notice', color: '#7a8a9a' },
    termination: { label: 'Termination Letter', color: '#c0392b' },
    confirmation: { label: 'Confirmation Letter', color: '#3498db' }
  };

  useEffect(() => {
    fetchLetters();
  }, [filter]);

  const fetchLetters = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await essApi.getLetters(params);
      setLetters(res.data);
    } catch (error) {
      console.error('Error fetching letters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewLetter = async (letter) => {
    try {
      const res = await essApi.getLetter(letter.id);
      setSelectedLetter(res.data);
      // Refresh list to update status if it was marked as read
      if (letter.status === 'unread') {
        fetchLetters();
      }
    } catch (error) {
      console.error('Error fetching letter:', error);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeInfo = (type) => {
    return letterTypes[type] || { label: type, color: '#7a8a9a' };
  };

  const unreadCount = letters.filter(l => l.status === 'unread').length;

  return (
    <EmployeeLayout>
      <div className="ess-letters">
        <header className="ess-page-header">
          <div>
            <h1>HR Documents</h1>
            <p>View official letters and notices from HR</p>
          </div>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount} unread</span>
          )}
        </header>

        {/* Filter Tabs */}
        <div className="letter-tabs">
          <button
            className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Letters ({letters.length})
          </button>
          <button
            className={`tab-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {loading ? (
          <div className="ess-loading">Loading letters...</div>
        ) : letters.length === 0 ? (
          <div className="no-data-card">
            <div className="empty-icon">📄</div>
            <p>{filter === 'unread' ? 'No unread letters' : 'No letters found'}</p>
          </div>
        ) : (
          <div className="letters-list">
            {letters.map((letter) => (
              <div
                key={letter.id}
                className={`letter-card ${letter.status === 'unread' ? 'unread' : ''}`}
                onClick={() => handleViewLetter(letter)}
              >
                <div className="letter-type-indicator" style={{ backgroundColor: getTypeInfo(letter.letter_type).color }} />
                <div className="letter-content">
                  <div className="letter-header">
                    <span
                      className="letter-type-badge"
                      style={{ backgroundColor: getTypeInfo(letter.letter_type).color }}
                    >
                      {getTypeInfo(letter.letter_type).label}
                    </span>
                    {letter.status === 'unread' && <span className="new-badge">NEW</span>}
                  </div>
                  <h3 className="letter-subject">{letter.subject}</h3>
                  <div className="letter-meta">
                    <span className="letter-date">{formatDate(letter.created_at)}</span>
                    <span className="letter-from">From: {letter.issued_by_name || 'HR Department'}</span>
                  </div>
                </div>
                <div className="letter-arrow">→</div>
              </div>
            ))}
          </div>
        )}

        {/* Letter Detail Modal */}
        {selectedLetter && (
          <div className="modal-overlay" onClick={() => setSelectedLetter(null)}>
            <div className="modal letter-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Letter Details</h2>
                <button className="close-btn" onClick={() => setSelectedLetter(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="letter-info-card">
                  <div className="info-row">
                    <span className="info-label">Type</span>
                    <span
                      className="letter-type-badge"
                      style={{ backgroundColor: getTypeInfo(selectedLetter.letter_type).color }}
                    >
                      {getTypeInfo(selectedLetter.letter_type).label}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Date Issued</span>
                    <span className="info-value">{formatDateTime(selectedLetter.created_at)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Issued By</span>
                    <span className="info-value">{selectedLetter.issued_by_name || 'HR Department'}</span>
                  </div>
                  {selectedLetter.read_at && (
                    <div className="info-row">
                      <span className="info-label">Read On</span>
                      <span className="info-value">{formatDateTime(selectedLetter.read_at)}</span>
                    </div>
                  )}
                </div>

                <div className="letter-subject-section">
                  <h3>{selectedLetter.subject}</h3>
                </div>

                <div className="letter-body-section">
                  <pre>{selectedLetter.content}</pre>
                </div>

                {selectedLetter.attachment_url && (
                  <div className="letter-attachment-section">
                    <strong>Attachment:</strong>
                    <a
                      href={selectedLetter.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-link"
                    >
                      📎 {selectedLetter.attachment_name || 'Download Attachment'}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeLetters;
