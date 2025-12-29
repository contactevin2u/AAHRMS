/**
 * ESS Letters Routes
 * Handles employee HR letters viewing and PDF generation
 */

const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

/**
 * Format date as DD/MM/YYYY
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Map letter type to display name
 */
function getLetterTypeName(type) {
  const typeNames = {
    warning: 'Warning Letter',
    appreciation: 'Letter of Appreciation',
    promotion: 'Promotion Letter',
    performance_improvement: 'Performance Improvement Notice',
    salary_adjustment: 'Salary Adjustment Letter',
    general_notice: 'General Notice',
    termination: 'Termination Letter',
    confirmation: 'Confirmation Letter'
  };
  return typeNames[type] || 'HR Letter';
}

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

/**
 * GET /api/ess/letters/:id/pdf
 * Generate PDF with company letterhead (AA Alive only)
 */
router.get('/:id/pdf', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if feature is enabled for this company
  if (!req.features.lettersWithPDF) {
    return res.status(403).json({
      error: 'PDF letterhead feature is not available for your company'
    });
  }

  // Get the letter with employee and company info
  const result = await pool.query(`
    SELECT l.*, e.name as employee_name, e.employee_id as employee_code,
           c.name as company_name, c.address as company_address,
           c.phone as company_phone, c.email as company_email,
           c.registration_number, c.code as company_code
    FROM hr_letters l
    JOIN employees e ON l.employee_id = e.id
    JOIN companies c ON e.company_id = c.id
    WHERE l.id = $1 AND l.employee_id = $2
  `, [id, req.employee.id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Letter');
  }

  const letter = result.rows[0];

  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: letter.subject,
      Author: letter.company_name,
      Subject: getLetterTypeName(letter.letter_type)
    }
  });

  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="Letter_${letter.id}_${formatDate(letter.created_at).replace(/\//g, '-')}.pdf"`
  );

  // Pipe PDF to response
  doc.pipe(res);

  // Try to add letterhead image if exists
  const letterheadPath = path.join(__dirname, '../../assets/letterheads', `${letter.company_code}.png`);
  const defaultLetterheadPath = path.join(__dirname, '../../assets/letterheads/default.png');

  let hasLetterhead = false;
  if (fs.existsSync(letterheadPath)) {
    try {
      doc.image(letterheadPath, 50, 30, { width: 495 });
      hasLetterhead = true;
    } catch (e) {
      console.error('Error loading letterhead:', e);
    }
  } else if (fs.existsSync(defaultLetterheadPath)) {
    try {
      doc.image(defaultLetterheadPath, 50, 30, { width: 495 });
      hasLetterhead = true;
    } catch (e) {
      console.error('Error loading default letterhead:', e);
    }
  }

  // If no letterhead image, create text-based header
  if (!hasLetterhead) {
    // Company name
    doc.fontSize(18).font('Helvetica-Bold').text(letter.company_name, 50, 50, { align: 'center' });

    // Company details
    doc.fontSize(10).font('Helvetica');
    if (letter.company_address) {
      doc.text(letter.company_address, { align: 'center' });
    }
    if (letter.company_phone || letter.company_email) {
      const contactLine = [letter.company_phone, letter.company_email].filter(Boolean).join(' | ');
      doc.text(contactLine, { align: 'center' });
    }
    if (letter.registration_number) {
      doc.text(`Registration No: ${letter.registration_number}`, { align: 'center' });
    }

    // Horizontal line
    doc.moveDown(0.5);
    doc.strokeColor('#333333').lineWidth(1)
      .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  }

  // Start content below letterhead
  doc.moveDown(hasLetterhead ? 6 : 2);
  const startY = hasLetterhead ? 150 : doc.y;
  doc.y = startY;

  // Date (right-aligned)
  doc.fontSize(11).font('Helvetica')
    .text(`Date: ${formatDate(letter.created_at)}`, 50, doc.y, { align: 'right' });

  doc.moveDown(2);

  // Employee details
  doc.text(`To: ${letter.employee_name}`, 50);
  doc.text(`Employee ID: ${letter.employee_code}`);

  doc.moveDown(1.5);

  // Letter type badge
  doc.fontSize(10).fillColor('#666666')
    .text(getLetterTypeName(letter.letter_type).toUpperCase(), 50);
  doc.fillColor('#000000');

  doc.moveDown(0.5);

  // Subject line
  doc.fontSize(13).font('Helvetica-Bold')
    .text(letter.subject, 50);

  doc.moveDown(1);

  // Letter content
  doc.fontSize(11).font('Helvetica')
    .text(letter.content, 50, doc.y, {
      align: 'justify',
      lineGap: 4,
      width: 495
    });

  doc.moveDown(3);

  // Signature section
  doc.text('Yours sincerely,', 50);
  doc.moveDown(3);

  // Signature line
  doc.strokeColor('#000000').lineWidth(0.5)
    .moveTo(50, doc.y).lineTo(200, doc.y).stroke();

  doc.moveDown(0.5);

  // Issued by
  if (letter.issued_by_name) {
    doc.font('Helvetica-Bold').text(letter.issued_by_name, 50);
  }
  if (letter.issued_by_designation) {
    doc.font('Helvetica').text(letter.issued_by_designation, 50);
  }

  // Footer with generated timestamp
  const footerY = 780;
  doc.fontSize(8).fillColor('#999999')
    .text(
      `Document generated on ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`,
      50,
      footerY,
      { align: 'center', width: 495 }
    );

  // Finalize PDF
  doc.end();
}));

module.exports = router;
