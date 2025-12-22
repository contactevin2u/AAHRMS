const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

/**
 * Clock In/Out Routes
 * Database structure only - full implementation to be added later
 *
 * This module provides API endpoints for:
 * - Recording employee clock in/out times
 * - GPS location capture
 * - OT calculation based on clock records
 */

// Get clock-in records (filtered by company)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, month, year, status, start_date, end_date } = req.query;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT cr.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             d.name as department_name
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (companyId !== null) {
      paramCount++;
      query += ` AND cr.company_id = $${paramCount}`;
      params.push(companyId);
    }

    if (employee_id) {
      paramCount++;
      query += ` AND cr.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (month && year) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM cr.work_date) = $${paramCount}`;
      params.push(month);
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM cr.work_date) = $${paramCount}`;
      params.push(year);
    }

    if (status) {
      paramCount++;
      query += ` AND cr.status = $${paramCount}`;
      params.push(status);
    }

    if (start_date) {
      paramCount++;
      query += ` AND cr.work_date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND cr.work_date <= $${paramCount}`;
      params.push(end_date);
    }

    query += ' ORDER BY cr.work_date DESC, cr.clock_in_time DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clock-in records:', error);
    res.status(500).json({ error: 'Failed to fetch clock-in records' });
  }
});

// Get monthly clock-in summary for an employee
router.get('/employee/:employeeId/monthly/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId, year, month } = req.params;
    const companyId = getCompanyFilter(req);

    // Verify employee belongs to user's company
    let empQuery = 'SELECT id, name, department_id FROM employees WHERE id = $1';
    let empParams = [employeeId];

    if (companyId !== null) {
      empQuery += ' AND company_id = $2';
      empParams.push(companyId);
    }

    const employee = await pool.query(empQuery, empParams);
    if (employee.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get monthly clock-in summary
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_records,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_records,
        COALESCE(SUM(total_hours) FILTER (WHERE status = 'approved'), 0) as total_work_hours,
        COALESCE(SUM(ot_hours) FILTER (WHERE status = 'approved'), 0) as total_ot_hours
      FROM clock_in_records
      WHERE employee_id = $1
        AND EXTRACT(MONTH FROM work_date) = $2
        AND EXTRACT(YEAR FROM work_date) = $3
    `, [employeeId, month, year]);

    res.json({
      employee_id: employeeId,
      employee_name: employee.rows[0].name,
      month: parseInt(month),
      year: parseInt(year),
      summary: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching monthly clock-in summary:', error);
    res.status(500).json({ error: 'Failed to fetch clock-in summary' });
  }
});

// Create clock-in record (placeholder for mobile app integration)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      employee_id,
      clock_in_time,
      clock_in_location,
      work_date,
      notes
    } = req.body;
    const companyId = req.companyId || 1;

    if (!employee_id || !clock_in_time || !work_date) {
      return res.status(400).json({ error: 'Employee ID, clock-in time, and work date are required' });
    }

    // Verify employee belongs to user's company
    const employee = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND company_id = $2',
      [employee_id, companyId]
    );

    if (employee.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const result = await pool.query(`
      INSERT INTO clock_in_records
      (employee_id, company_id, clock_in_time, clock_in_location, work_date, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `, [employee_id, companyId, clock_in_time, clock_in_location, work_date, notes]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating clock-in record:', error);
    res.status(500).json({ error: 'Failed to create clock-in record' });
  }
});

// Update clock-out (complete the record)
router.put('/:id/clock-out', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { clock_out_time, clock_out_location } = req.body;
    const companyId = getCompanyFilter(req);

    if (!clock_out_time) {
      return res.status(400).json({ error: 'Clock-out time is required' });
    }

    // Get clock-in record to calculate hours
    let getQuery = 'SELECT * FROM clock_in_records WHERE id = $1';
    let getParams = [id];

    if (companyId !== null) {
      getQuery += ' AND company_id = $2';
      getParams.push(companyId);
    }

    const record = await pool.query(getQuery, getParams);

    if (record.rows.length === 0) {
      return res.status(404).json({ error: 'Clock-in record not found' });
    }

    const clockIn = new Date(record.rows[0].clock_in_time);
    const clockOut = new Date(clock_out_time);
    const totalHours = (clockOut - clockIn) / (1000 * 60 * 60); // Convert ms to hours

    // Calculate OT hours (assuming 8 hours is standard work day)
    const standardHours = 8;
    const otHours = Math.max(0, totalHours - standardHours);

    const result = await pool.query(`
      UPDATE clock_in_records
      SET clock_out_time = $1,
          clock_out_location = $2,
          total_hours = $3,
          ot_hours = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [clock_out_time, clock_out_location, totalHours.toFixed(2), otHours.toFixed(2), id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating clock-out:', error);
    res.status(500).json({ error: 'Failed to update clock-out' });
  }
});

// Approve clock-in record
router.post('/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    let query = `
      UPDATE clock_in_records
      SET status = 'approved', approved_by = $1, updated_at = NOW()
      WHERE id = $2 AND status = 'pending'
    `;
    let params = [adminId, id];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Clock-in record not found or already processed' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving clock-in:', error);
    res.status(500).json({ error: 'Failed to approve clock-in record' });
  }
});

// Reject clock-in record
router.post('/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    let query = `
      UPDATE clock_in_records
      SET status = 'rejected', approved_by = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3 AND status = 'pending'
    `;
    let params = [adminId, notes, id];

    if (companyId !== null) {
      query += ' AND company_id = $4';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Clock-in record not found or already processed' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error rejecting clock-in:', error);
    res.status(500).json({ error: 'Failed to reject clock-in record' });
  }
});

// Bulk approve clock-in records
router.post('/bulk-approve', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { record_ids } = req.body;
    const companyId = getCompanyFilter(req);
    const adminId = req.admin?.id;

    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
      return res.status(400).json({ error: 'Record IDs array is required' });
    }

    await client.query('BEGIN');

    let query = `
      UPDATE clock_in_records
      SET status = 'approved', approved_by = $1, updated_at = NOW()
      WHERE id = ANY($2) AND status = 'pending'
    `;
    let params = [adminId, record_ids];

    if (companyId !== null) {
      query += ' AND company_id = $3';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await client.query(query, params);

    await client.query('COMMIT');

    res.json({
      message: `Approved ${result.rowCount} clock-in records`,
      approved_count: result.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk approving clock-in records:', error);
    res.status(500).json({ error: 'Failed to bulk approve records' });
  } finally {
    client.release();
  }
});

// Delete clock-in record
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = 'DELETE FROM clock_in_records WHERE id = $1';
    let params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Clock-in record not found' });
    }

    res.json({ message: 'Clock-in record deleted successfully' });
  } catch (error) {
    console.error('Error deleting clock-in record:', error);
    res.status(500).json({ error: 'Failed to delete clock-in record' });
  }
});

// Get OT summary for payroll (approved records only)
router.get('/ot-for-payroll/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT
        cr.employee_id,
        e.name as employee_name,
        e.employee_id as emp_code,
        d.name as department_name,
        SUM(cr.total_hours) as total_work_hours,
        SUM(cr.ot_hours) as total_ot_hours,
        COUNT(*) as work_days
      FROM clock_in_records cr
      JOIN employees e ON cr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE cr.status = 'approved'
        AND EXTRACT(MONTH FROM cr.work_date) = $1
        AND EXTRACT(YEAR FROM cr.work_date) = $2
    `;
    let params = [month, year];

    if (companyId !== null) {
      query += ' AND cr.company_id = $3';
      params.push(companyId);
    }

    query += ' GROUP BY cr.employee_id, e.name, e.employee_id, d.name';
    query += ' ORDER BY e.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching OT for payroll:', error);
    res.status(500).json({ error: 'Failed to fetch OT data' });
  }
});

module.exports = router;
