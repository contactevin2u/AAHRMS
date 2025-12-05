const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get all letters with filters
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, letter_type, status, from_date, to_date } = req.query;

    let query = `
      SELECT
        l.*,
        e.name as employee_name,
        e.employee_id as employee_code,
        d.name as department_name
      FROM hr_letters l
      LEFT JOIN employees e ON l.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (employee_id) {
      query += ` AND l.employee_id = $${paramIndex++}`;
      params.push(employee_id);
    }
    if (letter_type) {
      query += ` AND l.letter_type = $${paramIndex++}`;
      params.push(letter_type);
    }
    if (status) {
      query += ` AND l.status = $${paramIndex++}`;
      params.push(status);
    }
    if (from_date) {
      query += ` AND l.created_at >= $${paramIndex++}`;
      params.push(from_date);
    }
    if (to_date) {
      query += ` AND l.created_at <= $${paramIndex++}`;
      params.push(to_date + ' 23:59:59');
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching letters:', error);
    res.status(500).json({ error: 'Failed to fetch letters' });
  }
});

// Get single letter by ID
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        l.*,
        e.name as employee_name,
        e.employee_id as employee_code,
        e.email as employee_email,
        d.name as department_name
      FROM hr_letters l
      LEFT JOIN employees e ON l.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE l.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching letter:', error);
    res.status(500).json({ error: 'Failed to fetch letter' });
  }
});

// Create/Issue a new letter
router.post('/', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      employee_id,
      letter_type,
      subject,
      content,
      attachment_url,
      attachment_name
    } = req.body;

    // Validate required fields
    if (!employee_id || !letter_type || !subject || !content) {
      return res.status(400).json({
        error: 'Employee, letter type, subject, and content are required'
      });
    }

    await client.query('BEGIN');

    // Get admin user name and designation
    const adminResult = await client.query(
      'SELECT name, username, designation FROM admin_users WHERE id = $1',
      [req.admin.id]
    );
    const adminUser = adminResult.rows[0];
    const issuedByName = adminUser?.name || adminUser?.username || 'Admin';
    const issuedByDesignation = adminUser?.designation || '';

    // Create the letter
    const letterResult = await client.query(`
      INSERT INTO hr_letters (
        employee_id, letter_type, subject, content,
        attachment_url, attachment_name, issued_by, issued_by_name, issued_by_designation, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unread')
      RETURNING *
    `, [
      employee_id, letter_type, subject, content,
      attachment_url || null, attachment_name || null,
      req.admin.id, issuedByName, issuedByDesignation
    ]);

    const letter = letterResult.rows[0];

    // Get letter type display name
    const letterTypeNames = {
      warning: 'Warning Letter',
      appreciation: 'Appreciation Letter',
      promotion: 'Promotion Letter',
      performance_improvement: 'Performance Improvement Notice',
      salary_adjustment: 'Salary Adjustment Letter',
      general_notice: 'General Notice',
      termination: 'Termination Letter',
      confirmation: 'Confirmation Letter'
    };

    // Create notification for the employee
    await client.query(`
      INSERT INTO notifications (
        employee_id, type, title, message, reference_type, reference_id
      )
      VALUES ($1, 'letter', $2, $3, 'hr_letter', $4)
    `, [
      employee_id,
      `New Letter: ${letterTypeNames[letter_type] || letter_type}`,
      `You have received a new ${letterTypeNames[letter_type] || letter_type}. Please check your HR Documents.`,
      letter.id
    ]);

    await client.query('COMMIT');

    // Fetch the complete letter with employee details
    const fullLetter = await pool.query(`
      SELECT
        l.*,
        e.name as employee_name,
        e.employee_id as employee_code,
        d.name as department_name
      FROM hr_letters l
      LEFT JOIN employees e ON l.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE l.id = $1
    `, [letter.id]);

    res.status(201).json(fullLetter.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating letter:', error);
    res.status(500).json({ error: 'Failed to create letter' });
  } finally {
    client.release();
  }
});

// Update a letter (only if unread)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, content, attachment_url, attachment_name } = req.body;

    // Check if letter exists and is still unread
    const existing = await pool.query(
      'SELECT * FROM hr_letters WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    if (existing.rows[0].status === 'read') {
      return res.status(400).json({
        error: 'Cannot edit a letter that has already been read'
      });
    }

    const result = await pool.query(`
      UPDATE hr_letters
      SET subject = COALESCE($1, subject),
          content = COALESCE($2, content),
          attachment_url = COALESCE($3, attachment_url),
          attachment_name = COALESCE($4, attachment_name),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [subject, content, attachment_url, attachment_name, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating letter:', error);
    res.status(500).json({ error: 'Failed to update letter' });
  }
});

// Delete a letter
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM hr_letters WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    // Also delete related notifications
    await pool.query(
      "DELETE FROM notifications WHERE reference_type = 'hr_letter' AND reference_id = $1",
      [id]
    );

    res.json({ message: 'Letter deleted successfully' });
  } catch (error) {
    console.error('Error deleting letter:', error);
    res.status(500).json({ error: 'Failed to delete letter' });
  }
});

// Get all letter templates
router.get('/templates/all', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM letter_templates
      WHERE is_active = TRUE
      ORDER BY letter_type, name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get templates by letter type
router.get('/templates/type/:type', authenticateAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const result = await pool.query(`
      SELECT * FROM letter_templates
      WHERE letter_type = $1 AND is_active = TRUE
      ORDER BY name
    `, [type]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get letter statistics
router.get('/stats/summary', authenticateAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_letters,
        COUNT(CASE WHEN status = 'unread' THEN 1 END) as unread_count,
        COUNT(CASE WHEN status = 'read' THEN 1 END) as read_count,
        COUNT(CASE WHEN letter_type = 'warning' THEN 1 END) as warning_count,
        COUNT(CASE WHEN letter_type = 'appreciation' THEN 1 END) as appreciation_count,
        COUNT(CASE WHEN letter_type = 'promotion' THEN 1 END) as promotion_count,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM hr_letters
    `);
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get letters for a specific employee (admin view)
router.get('/employee/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;

    const result = await pool.query(`
      SELECT
        l.*,
        e.name as employee_name,
        e.employee_id as employee_code
      FROM hr_letters l
      LEFT JOIN employees e ON l.employee_id = e.id
      WHERE l.employee_id = $1
      ORDER BY l.created_at DESC
    `, [employeeId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee letters:', error);
    res.status(500).json({ error: 'Failed to fetch employee letters' });
  }
});

module.exports = router;
