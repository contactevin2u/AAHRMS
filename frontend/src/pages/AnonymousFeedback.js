import React, { useState } from 'react';
import { feedbackApi } from '../api';
import './AnonymousFeedback.css';

const CATEGORIES = [
  { value: 'suggestion', label: 'Suggestion', icon: '💡✨' },
  { value: 'concern', label: 'Concern', icon: '🤔💭' },
  { value: 'complaint', label: 'Complaint', icon: '📝😤' },
  { value: 'praise', label: 'Praise', icon: '⭐🎉' },
  { value: 'question', label: 'Question', icon: '❓🙋' },
  { value: 'other', label: 'Other', icon: '💬🌈' },
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
        message: '🎉 Yay! Your feedback has been submitted anonymously. Thank you for sharing! 💖✨',
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
          <div className="shield-icon">🛡️✨</div>
          <h1>Speak Freely 💬</h1>
          <p className="subtitle">Your voice matters! Share your thoughts anonymously 🌟</p>
        </header>

        <div className="privacy-notice">
          <strong>🔒 100% Anonymous 🤫</strong>
          <p>
            We do not collect any identifying information. No IP addresses, no cookies,
            no tracking. Your feedback is completely confidential! 💯
          </p>
        </div>

        <form onSubmit={handleSubmit} className="feedback-form">
          <div className="form-group">
            <label>What type of feedback do you have? 🤔</label>
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
            <label htmlFor="message">Your Message 📝💭</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share your thoughts, concerns, or suggestions here! Be as detailed as you'd like - everything is confidential 🤗💕"
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
            {isSubmitting ? '✨ Submitting...' : '🚀 Submit Anonymously'}
          </button>
        </form>

        <footer className="feedback-footer">
          <p>Your feedback helps us build a better workplace for everyone! 🌈💪🏼</p>
        </footer>
      </div>
    </div>
  );
}

export default AnonymousFeedback;
