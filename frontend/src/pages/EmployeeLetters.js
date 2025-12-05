import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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

  const handleDownload = async () => {
    const element = document.getElementById('letter-print');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const fileName = `Letter_${selectedLetter.subject}_${new Date(selectedLetter.created_at).toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to download letter. Please try printing instead.');
    }
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
                <div className="modal-header-actions">
                  <button className="btn-download" onClick={handleDownload}>Download PDF</button>
                  <button className="btn-print" onClick={() => window.print()}>Print</button>
                  <button className="close-btn" onClick={() => setSelectedLetter(null)}>×</button>
                </div>
              </div>
              <div className="modal-body">
                {/* Letter with Letterhead */}
                <div className="letter-preview" id="letter-print">
                  {/* Letterhead */}
                  <div className="letterhead">
                    <div className="letterhead-logo">
                      <img src="/logo.png" alt="AA Alive" />
                    </div>
                    <div className="letterhead-info">
                      <h1>AA Alive Sdn. Bhd.</h1>
                      <p className="company-reg">Company No.: 1204108-D</p>
                      <p className="company-address">
                        1, Jalan Perusahaan Amari, Kawasan Industri Batu Caves,<br />
                        68100 Batu Caves, Selangor
                      </p>
                    </div>
                  </div>

                  <div className="letter-divider"></div>

                  {/* Letter Date */}
                  <div className="letter-date-line">
                    Date: {formatDate(selectedLetter.created_at)}
                  </div>

                  {/* Letter Subject */}
                  <div className="letter-subject-line">
                    <strong>Subject: {selectedLetter.subject}</strong>
                  </div>

                  {/* Letter Body */}
                  <div className="letter-body-content">
                    <pre>{selectedLetter.content}</pre>
                  </div>

                  {/* Signature Section */}
                  <div className="letter-signature">
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <p className="signature-name">{selectedLetter.issued_by_name || 'HR Department'}</p>
                      {selectedLetter.issued_by_designation && (
                        <p className="signature-designation">{selectedLetter.issued_by_designation}</p>
                      )}
                      <p className="signature-date">Date: {formatDate(selectedLetter.created_at)}</p>
                    </div>
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

                {/* Letter Meta Info (not printed) */}
                <div className="letter-meta-info">
                  <span
                    className="letter-type-badge"
                    style={{ backgroundColor: getTypeInfo(selectedLetter.letter_type).color }}
                  >
                    {getTypeInfo(selectedLetter.letter_type).label}
                  </span>
                  {selectedLetter.read_at && (
                    <span className="read-info">Read on {formatDateTime(selectedLetter.read_at)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeLetters;
