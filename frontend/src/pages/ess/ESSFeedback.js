import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSFeedback.css';

const CATEGORIES = [
  { value: 'suggestion', labelKey: 'feedback.categories.suggestion', icon: '\u{1F4A1}' },
  { value: 'concern', labelKey: 'feedback.categories.concern', icon: '\u{1F914}' },
  { value: 'complaint', labelKey: 'feedback.categories.complaint', icon: '\u{1F614}' },
  { value: 'praise', labelKey: 'feedback.categories.praise', icon: '\u{1F31F}' },
  { value: 'question', labelKey: 'feedback.categories.question', icon: '\u{2753}' },
  { value: 'other', labelKey: 'feedback.categories.other', icon: '\u{1F343}' },
];

function ESSFeedback() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!category) {
      setStatus({ type: 'error', message: t('feedback.errors.selectCategory') });
      return;
    }

    if (message.length < 10) {
      setStatus({ type: 'error', message: t('feedback.errors.minLength') });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      await essApi.submitFeedback({ category, message });
      setStatus({
        type: 'success',
        message: t('feedback.successMessage'),
      });
      setCategory('');
      setMessage('');
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.response?.data?.error || t('feedback.errors.submitFailed'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ESSLayout>
      <div className="ess-feedback">
        <div className="ess-feedback-header">
          <button className="back-btn" onClick={() => navigate('/ess/dashboard')}>
            &#x2190; {t('common.back')}
          </button>
          <h1>{t('feedback.title')}</h1>
          <p className="subtitle">{t('feedback.subtitle')}</p>
        </div>

        <div className="privacy-notice">
          <strong>{t('feedback.privacyTitle')}</strong>
          <p>{t('feedback.privacyMessage')}</p>
        </div>

        <form onSubmit={handleSubmit} className="ess-feedback-form">
          <div className="form-group">
            <label>{t('feedback.categoryLabel')}</label>
            <div className="category-grid">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  className={`category-btn ${category === cat.value ? 'active' : ''}`}
                  onClick={() => setCategory(cat.value)}
                >
                  <span className="category-icon">{cat.icon}</span>
                  <span className="category-label">{t(cat.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="message">{t('feedback.messageLabel')}</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('feedback.messagePlaceholder')}
              rows={6}
              maxLength={5000}
            />
            <span className="char-count">{message.length}/5000</span>
          </div>

          {status.message && (
            <div className={`status-message ${status.type}`}>
              {status.message}
            </div>
          )}

          <button
            type="submit"
            className="submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('feedback.sending') : t('feedback.submitBtn')}
          </button>
        </form>
      </div>
    </ESSLayout>
  );
}

export default ESSFeedback;
