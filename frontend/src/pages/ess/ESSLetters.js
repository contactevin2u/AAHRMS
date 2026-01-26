import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSLetters.css';

function ESSLetters() {
  const { t, language } = useLanguage();
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [letters, setLetters] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [filter, setFilter] = useState('all');

  const letterTypes = {
    warning: { label: 'Warning', color: '#d85454' },
    appreciation: { label: 'Appreciation', color: '#2a9d5c' },
    promotion: { label: 'Promotion', color: '#5478a8' },
    performance_improvement: { label: 'PIP', color: '#e67e22' },
    salary_adjustment: { label: 'Salary Adj', color: '#27ae60' },
    general_notice: { label: 'Notice', color: '#7a8a9a' },
    termination: { label: 'Termination', color: '#c0392b' },
    confirmation: { label: 'Confirmation', color: '#3498db' }
  };

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      setEmployeeInfo(JSON.parse(storedInfo));
    }
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
      if (letter.status === 'unread') {
        fetchLetters();
      }
    } catch (error) {
      console.error('Error fetching letter:', error);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatShortDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getTypeInfo = (type) => {
    return letterTypes[type] || { label: type, color: '#7a8a9a' };
  };

  const getCompanyLogo = () => {
    const companyId = employeeInfo?.company_id;
    const companyLogos = {
      1: '/logos/aa-alive.png',
      3: '/logos/mixue.png'
    };
    return companyLogos[companyId] || '/logos/hr-default.png';
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
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      const fileName = `Letter_${selectedLetter.subject}_${new Date(selectedLetter.created_at).toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to download letter.');
    }
  };

  const unreadCount = letters.filter(l => l.status === 'unread').length;

  return (
    <ESSLayout>
      <div className="ess-letters-page">
        {/* Page Header */}
        <div className="ess-page-header">
          <div className="header-content">
            <h1>{t('letters.title')}</h1>
            <p>{t('letters.subtitle')}</p>
          </div>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount} {t('letters.new')}</span>
          )}
        </div>

        {/* Tab Filter */}
        <div className="ess-tabs">
          <button
            className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('common.all')} ({letters.length})
          </button>
          <button
            className={`tab-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            {t('letters.unread')} ({unreadCount})
          </button>
        </div>

        {loading ? (
          <div className="ess-loading">
            <div className="spinner"></div>
            <p>{t('common.loading')}</p>
          </div>
        ) : letters.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">&#x1F4E8;</span>
            <p>{filter === 'unread' ? t('letters.noUnread') : t('letters.noLetters')}</p>
          </div>
        ) : (
          <div className="letters-list">
            {letters.map((letter) => (
              <div
                key={letter.id}
                className={`letter-card ${letter.status === 'unread' ? 'unread' : ''}`}
                onClick={() => handleViewLetter(letter)}
              >
                <div
                  className="letter-type-indicator"
                  style={{ backgroundColor: getTypeInfo(letter.letter_type).color }}
                />
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
                    <span className="letter-date">{formatShortDate(letter.created_at)}</span>
                    <span className="letter-from">{letter.issued_by_name || 'HR'}</span>
                  </div>
                </div>
                <div className="letter-arrow">&#8594;</div>
              </div>
            ))}
          </div>
        )}

        {/* Letter Detail Modal */}
        {selectedLetter && (
          <div className="ess-modal-overlay" onClick={() => setSelectedLetter(null)}>
            <div className="ess-modal letter-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('letters.viewLetter')}</h2>
                <button className="close-btn" onClick={() => setSelectedLetter(null)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                {/* Letter Preview */}
                <div className="letter-preview" id="letter-print">
                  {/* Letterhead */}
                  <div className="letterhead">
                    <img src={getCompanyLogo()} alt="Company" className="company-logo" />
                    <div className="company-info">
                      <h2>{employeeInfo?.company_name || 'Company'}</h2>
                    </div>
                  </div>

                  <div className="letter-divider"></div>

                  {/* Date */}
                  <div className="letter-date-line">
                    {formatDate(selectedLetter.created_at)}
                  </div>

                  {/* Subject */}
                  <div className="letter-subject-line">
                    <strong>Re: {selectedLetter.subject}</strong>
                  </div>

                  {/* Body */}
                  <div className="letter-body-content">
                    <pre>{selectedLetter.content}</pre>
                  </div>

                  {/* Signature */}
                  <div className="letter-signature">
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <p className="signature-name">{selectedLetter.issued_by_name || 'HR Department'}</p>
                      {selectedLetter.issued_by_designation && (
                        <p className="signature-designation">{selectedLetter.issued_by_designation}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Type Badge */}
                <div className="letter-meta-info">
                  <span
                    className="letter-type-badge"
                    style={{ backgroundColor: getTypeInfo(selectedLetter.letter_type).color }}
                  >
                    {getTypeInfo(selectedLetter.letter_type).label}
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button className="download-btn" onClick={handleDownload}>
                  &#x2B07; {t('letters.downloadLetter')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSLetters;
