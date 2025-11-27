const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// PUBLIC: Submit anonymous feedback (no auth required)
router.post('/submit', async (req, res) => {
  try {
    const { category, message } = req.body;

    if (!category || !message) {
      return res.status(400).json({ error: 'Category and message are required' });
    }

    if (message.length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters' });
    }

    // No user identification stored - completely anonymous
    const result = await pool.query(
      'INSERT INTO anonymous_feedback (category, message) VALUES ($1, $2) RETURNING id, created_at',
      [category, message]
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

// ADMIN: Get all feedback (requires auth)
router.get('/all', authenticateAdmin, async (req, res) => {
  try {
    const { category, is_read, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM anonymous_feedback WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (is_read !== undefined) {
      paramCount++;
      query += ` AND is_read = $${paramCount}`;
      params.push(is_read === 'true');
    }

    query += ' ORDER BY created_at DESC';

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM anonymous_feedback WHERE 1=1';
    const countParams = [];
    let countParamNum = 0;

    if (category) {
      countParamNum++;
      countQuery += ` AND category = $${countParamNum}`;
      countParams.push(category);
    }

    if (is_read !== undefined) {
      countParamNum++;
      countQuery += ` AND is_read = $${countParamNum}`;
      countParams.push(is_read === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      feedback: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// ADMIN: Mark feedback as read
router.patch('/:id/read', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_read } = req.body;

    const result = await pool.query(
      'UPDATE anonymous_feedback SET is_read = $1 WHERE id = $2 RETURNING *',
      [is_read, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// ADMIN: Add admin notes to feedback
router.patch('/:id/notes', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    const result = await pool.query(
      'UPDATE anonymous_feedback SET admin_notes = $1 WHERE id = $2 RETURNING *',
      [admin_notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating notes:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// ADMIN: Get statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_read = false) as unread,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_week,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_month
      FROM anonymous_feedback
    `);

    const byCategory = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM anonymous_feedback
      GROUP BY category
      ORDER BY count DESC
    `);

    res.json({
      overview: stats.rows[0],
      byCategory: byCategory.rows,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
