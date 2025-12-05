import React, { useState } from 'react';
import { feedbackApi } from '../api';
import './AnonymousFeedback.css';

const CATEGORIES = [
  { value: 'suggestion', label: 'Suggestion', icon: '💡' },
  { value: 'concern', label: 'Concern', icon: '🤔' },
  { value: 'complaint', label: 'Complaint', icon: '😔' },
  { value: 'praise', label: 'Praise', icon: '🌟' },
  { value: 'question', label: 'Question', icon: '❓' },
  { value: 'other', label: 'Other', icon: '🍃' },
];

function AnonymousFeedback() {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!category) {
      setStatus({ type: 'error', message: 'Please select a category' });
      return;
    }

    if (message.length < 10) {
      setStatus({ type: 'error', message: 'Message must be at least 10 characters' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      await feedbackApi.submit({ category, message });
      setStatus({
        type: 'success',
        message: '🌸 Thank you for sharing! Your thoughts have been received safely. We appreciate you! 🧡',
      });
      setCategory('');
      setMessage('');
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to submit. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="anonymous-feedback">
      <div className="feedback-container">
        <header className="feedback-header">
          <img src="/logo.png" alt="AA HRMS" className="feedback-logo" />
          <h1>Share Your Thoughts</h1>
          <p className="subtitle">A safe space to express yourself freely ~ your voice matters</p>
        </header>

        <div className="privacy-notice">
          <strong>🔐 Your Safe Corner</strong>
          <p>
            Everything here stays between us. No names, no tracking, just your honest thoughts.
            Feel free to share what's on your mind ~ we're listening with care 🤎
          </p>
        </div>

        <form onSubmit={handleSubmit} className="feedback-form">
          <div className="form-group">
            <label>What's on your mind today? 🍂</label>
            <div className="category-grid">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  className={`category-btn ${category === cat.value ? 'active' : ''}`}
                  onClick={() => setCategory(cat.value)}
                >
                  <span className="category-icon">{cat.icon}</span>
                  <span className="category-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="message">Tell us more... ✍️</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Take your time... write whatever feels right. We're here to listen and make things better together 🌻"
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
            {isSubmitting ? '☕ Sending...' : '🌿 Share Anonymously'}
          </button>
        </form>

        <footer className="feedback-footer">
          <p>Together, we grow and create a warmer workplace for everyone 🌻🤎</p>
        </footer>
      </div>
    </div>
  );
}

export default AnonymousFeedback;
