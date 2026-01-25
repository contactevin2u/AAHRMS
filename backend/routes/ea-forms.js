/**
 * EA Forms (Borang EA) API Routes
 *
 * Provides endpoints for generating, viewing, and downloading Form EA.
 * Form EA is the Malaysian yearly statement of remuneration.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const {
  generateEAFormData,
  generateCompanyEAForms,
  saveEAForm,
  getEAFormSummary
} = require('../utils/eaFormGenerator');

/**
 * GET /api/ea-forms/:year
 * List all EA forms for a given year
 */
router.get('/:year', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.params;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(`
      SELECT ef.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             e.ic_number
      FROM ea_forms ef
      JOIN employees e ON ef.employee_id = e.id
      WHERE ef.company_id = $1 AND ef.year = $2
      ORDER BY e.name
    `, [companyId, parseInt(year)]);

    const summary = await getEAFormSummary(companyId, parseInt(year));

    res.json({
      year: parseInt(year),
      forms: result.rows,
      summary
    });

  } catch (error) {
    console.error('Error listing EA forms:', error);
    res.status(500).json({ error: 'Failed to list EA forms: ' + error.message });
  }
});

/**
 * GET /api/ea-forms/:year/:employeeId
 * Get EA form for a specific employee
 */
router.get('/:year/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { year, employeeId } = req.params;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Verify employee belongs to company
    const empResult = await pool.query(
      'SELECT company_id FROM employees WHERE id = $1',
      [parseInt(employeeId)]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if form already exists
    const existingForm = await pool.query(
      'SELECT * FROM ea_forms WHERE employee_id = $1 AND year = $2',
      [parseInt(employeeId), parseInt(year)]
    );

    if (existingForm.rows.length > 0) {
      return res.json(existingForm.rows[0]);
    }

    // Generate form data on the fly
    const formData = await generateEAFormData(parseInt(employeeId), parseInt(year));
    res.json({
      employee_id: parseInt(employeeId),
      year: parseInt(year),
      form_data: formData,
      generated_at: new Date().toISOString(),
      is_draft: true
    });

  } catch (error) {
    console.error('Error getting EA form:', error);
    res.status(500).json({ error: 'Failed to get EA form: ' + error.message });
  }
});

/**
 * POST /api/ea-forms/generate/:year
 * Generate EA forms for all employees
 */
router.post('/generate/:year', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.params;
    const { employee_ids } = req.body; // Optional: specific employees
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Validate year
    const yearInt = parseInt(year);
    const currentYear = new Date().getFullYear();

    if (yearInt > currentYear) {
      return res.status(400).json({ error: 'Cannot generate EA forms for future years' });
    }

    // Generate forms for company
    const { forms, errors, total } = await generateCompanyEAForms(companyId, yearInt);

    // Save generated forms
    const saved = [];
    for (const form of forms) {
      try {
        // Get company_id from employee
        const empResult = await pool.query(
          'SELECT company_id FROM employees WHERE id = $1',
          [form.employee.employee_no]
        );

        if (empResult.rows.length > 0) {
          form.employer.company_id = empResult.rows[0].company_id;
        }

        // Get employee ID from form data
        const employeeIdResult = await pool.query(
          'SELECT id FROM employees WHERE employee_id = $1 AND company_id = $2',
          [form.employee.employee_no, companyId]
        );

        if (employeeIdResult.rows.length > 0) {
          const savedForm = await saveEAForm(employeeIdResult.rows[0].id, yearInt, form);
          saved.push(savedForm);
        }
      } catch (saveError) {
        errors.push({
          employee_no: form.employee.employee_no,
          error: saveError.message
        });
      }
    }

    res.json({
      message: `Generated ${saved.length} EA forms for year ${year}`,
      year: yearInt,
      generated: saved.length,
      errors: errors.length > 0 ? errors : undefined,
      summary: await getEAFormSummary(companyId, yearInt)
    });

  } catch (error) {
    console.error('Error generating EA forms:', error);
    res.status(500).json({ error: 'Failed to generate EA forms: ' + error.message });
  }
});

/**
 * POST /api/ea-forms/generate/:year/:employeeId
 * Generate EA form for a specific employee
 */
router.post('/generate/:year/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { year, employeeId } = req.params;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    // Verify employee belongs to company
    const empResult = await pool.query(
      'SELECT id, company_id FROM employees WHERE id = $1',
      [parseInt(employeeId)]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate form data
    const formData = await generateEAFormData(parseInt(employeeId), parseInt(year));
    formData.employer.company_id = companyId;

    // Save to database
    const savedForm = await saveEAForm(parseInt(employeeId), parseInt(year), formData);

    res.json({
      message: 'EA form generated successfully',
      form: savedForm
    });

  } catch (error) {
    console.error('Error generating EA form:', error);
    res.status(500).json({ error: 'Failed to generate EA form: ' + error.message });
  }
});

/**
 * GET /api/ea-forms/:id/download
 * Download EA form as PDF (placeholder - would need PDF generation library)
 */
router.get('/:id/download', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(`
      SELECT ef.*, e.name as employee_name
      FROM ea_forms ef
      JOIN employees e ON ef.employee_id = e.id
      WHERE ef.id = $1 AND ef.company_id = $2
    `, [parseInt(id), companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'EA form not found' });
    }

    const form = result.rows[0];

    // For now, return JSON format
    // In production, this would generate a PDF using a library like puppeteer or pdfkit
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="EA_${form.year}_${form.employee_name.replace(/\s+/g, '_')}.json"`);
    res.json(form.form_data);

  } catch (error) {
    console.error('Error downloading EA form:', error);
    res.status(500).json({ error: 'Failed to download EA form: ' + error.message });
  }
});

/**
 * GET /api/ea-forms/:year/summary
 * Get EA forms summary for a year
 */
router.get('/:year/summary', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.params;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const summary = await getEAFormSummary(companyId, parseInt(year));
    res.json(summary);

  } catch (error) {
    console.error('Error getting EA summary:', error);
    res.status(500).json({ error: 'Failed to get EA summary: ' + error.message });
  }
});

module.exports = router;
