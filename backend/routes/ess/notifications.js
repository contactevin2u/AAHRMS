/**
 * ESS Notifications Routes
 * Handles employee notifications
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

// Get notifications
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const { unread_only } = req.query;

  let query = `
    SELECT * FROM notifications
    WHERE employee_id = $1
  `;
  const params = [req.employee.id];

  if (unread_only === 'true') {
    query += ' AND is_read = FALSE';
  }

  query += ' ORDER BY created_at DESC LIMIT 50';

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Mark notification as read
router.put('/:id/read', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE id = $1 AND employee_id = $2
     RETURNING *`,
    [id, req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Notification');
  }

  res.json(result.rows[0]);
}));

// Mark all notifications as read
router.put('/read-all', authenticateEmployee, asyncHandler(async (req, res) => {
  await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE employee_id = $1',
    [req.employee.id]
  );

  res.json({ message: 'All notifications marked as read' });
}));

// Get unread notification count
router.get('/unread-count', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM notifications WHERE employee_id = $1 AND is_read = FALSE',
    [req.employee.id]
  );

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
