/**
 * ESS Letters Routes
 * Handles employee HR letters viewing
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

// Get employee's letters
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const { status, letter_type } = req.query;

  let query = `
    SELECT * FROM hr_letters
    WHERE employee_id = $1
  `;
  const params = [req.employee.id];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` AND status = $${paramCount}`;
    params.push(status);
  }

  if (letter_type) {
    paramCount++;
    query += ` AND letter_type = $${paramCount}`;
    params.push(letter_type);
  }

  query += ' ORDER BY created_at DESC';

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Get single letter and mark as read
router.get('/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get the letter (only if it belongs to this employee)
  const result = await pool.query(
    'SELECT * FROM hr_letters WHERE id = $1 AND employee_id = $2',
    [id, req.employee.id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Letter');
  }

  const letter = result.rows[0];

  // If unread, mark as read
  if (letter.status === 'unread') {
    await pool.query(
      `UPDATE hr_letters SET status = 'read', read_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    letter.status = 'read';
    letter.read_at = new Date();
  }

  res.json(letter);
}));

// Get unread letters count
router.get('/unread/count', authenticateEmployee, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM hr_letters
     WHERE employee_id = $1 AND status = 'unread'`,
    [req.employee.id]
  );

  res.json({ count: parseInt(result.rows[0].count) });
}));

module.exports = router;
