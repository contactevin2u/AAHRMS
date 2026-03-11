/**
 * ESS Anonymous Feedback Routes
 * Authenticated submission - stores company_id but NOT employee_id (anonymous)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { escapeHtml } = require('../../middleware/sanitize');

/**
 * POST /api/ess/feedback/submit
 * Submit anonymous feedback (authenticated to get company_id, but no employee tracking)
 */
router.post('/submit', authenticateEmployee, async (req, res) => {
  try {
    const { category, message } = req.body;
    const companyId = req.companyId;

    if (!category || !message) {
      return res.status(400).json({ error: 'Category and message are required' });
    }

    if (message.length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters' });
    }

    const sanitizedCategory = escapeHtml(category);
    const sanitizedMessage = escapeHtml(message);

    await pool.query(
      'INSERT INTO anonymous_feedback (category, message, company_id) VALUES ($1, $2, $3) RETURNING id, created_at',
      [sanitizedCategory, sanitizedMessage, companyId]
    );

    res.status(201).json({
      success: true,
      message: 'Your feedback has been submitted anonymously. Thank you!',
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

module.exports = router;
