const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// =====================================================
// LEAVE TYPES (filtered by company)
// =====================================================

// Get all leave types
router.get('/types', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    let query = 'SELECT * FROM leave_types';
    let params = [];

    if (companyId !== null) {
      query += ' WHERE company_id = $1';
      params = [companyId];
    }
    query += ' ORDER BY code';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leave types:', error);
    res.status(500).json({ error: 'Failed to fetch leave types' });
  }
});

// Create leave type
router.post('/types', authenticateAdmin, async (req, res) => {
  try {
    const { code, name, is_paid, default_days_per_year, description } = req.body;
    const companyId = req.companyId || 1;

    const result = await pool.query(
      `INSERT INTO leave_types (code, name, is_paid, default_days_per_year, description, company_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [code, name, is_paid, default_days_per_year || 0, description, companyId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating leave type:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Leave type code already exists' });
    }
    res.status(500).json({ error: 'Failed to create leave type' });
  }
});

// =====================================================
// LEAVE BALANCES
// =====================================================

// Get leave balances for an employee
router.get('/balances/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const result = await pool.query(`
      SELECT lb.*, lt.code, lt.name as leave_type_name, lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2
      ORDER BY lt.code
    `, [employeeId, currentYear]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

// Get all employees' leave balances summary
router.get('/balances', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const result = await pool.query(`
      SELECT
        e.id as employee_id,
        e.employee_id as emp_code,
        e.name as employee_name,
        d.name as department_name,
        json_agg(json_build_object(
          'leave_type_id', lt.id,
          'code', lt.code,
          'name', lt.name,
          'entitled', COALESCE(lb.entitled_days, 0),
          'used', COALESCE(lb.used_days, 0),
          'remaining', COALESCE(lb.entitled_days, 0) - COALESCE(lb.used_days, 0)
        )) as balances
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN leave_balances lb ON e.id = lb.employee_id AND lb.year = $1
      LEFT JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE e.status = 'active'
      GROUP BY e.id, e.employee_id, e.name, d.name
      ORDER BY e.name
    `, [currentYear]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all leave balances:', error);
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

// Initialize leave balances for an employee (called when creating employee)
router.post('/balances/initialize/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.body;
    const currentYear = year || new Date().getFullYear();

    // Get employee join date for pro-rating
    const empResult = await pool.query(
      'SELECT join_date FROM employees WHERE id = $1',
      [employeeId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const joinDate = empResult.rows[0].join_date;

    // Get all paid leave types
    const leaveTypes = await pool.query(
      'SELECT * FROM leave_types WHERE is_paid = true'
    );

    // Calculate pro-rated entitlement based on join date
    const calculateEntitlement = (defaultDays, joinDate) => {
      if (!joinDate) return defaultDays;

      const join = new Date(joinDate);
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31);

      // If joined before this year, full entitlement
      if (join < yearStart) return defaultDays;

      // If joined after this year, no entitlement
      if (join > yearEnd) return 0;

      // Pro-rate based on remaining months
      const monthsRemaining = 12 - join.getMonth();
      return Math.round((defaultDays * monthsRemaining / 12) * 2) / 2; // Round to 0.5
    };

    const created = [];

    for (const lt of leaveTypes.rows) {
      const entitled = calculateEntitlement(lt.default_days_per_year, joinDate);

      try {
        const result = await pool.query(`
          INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days, used_days)
          VALUES ($1, $2, $3, $4, 0)
          ON CONFLICT (employee_id, leave_type_id, year)
          DO UPDATE SET entitled_days = $4, updated_at = NOW()
          RETURNING *
        `, [employeeId, lt.id, currentYear, entitled]);

        created.push(result.rows[0]);
      } catch (err) {
        console.error('Error creating balance for leave type:', lt.code, err);
      }
    }

    res.json({ message: 'Leave balances initialized', balances: created });
  } catch (error) {
    console.error('Error initializing leave balances:', error);
    res.status(500).json({ error: 'Failed to initialize leave balances' });
  }
});

// Update leave balance manually (for adjustments)
router.put('/balances/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { entitled_days, used_days, carried_forward } = req.body;

    const result = await pool.query(`
      UPDATE leave_balances
      SET entitled_days = $1, used_days = $2, carried_forward = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [entitled_days, used_days, carried_forward || 0, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave balance not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating leave balance:', error);
    res.status(500).json({ error: 'Failed to update leave balance' });
  }
});

// =====================================================
// LEAVE REQUESTS
// =====================================================

// Get all leave requests
router.get('/requests', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, status, month, year } = req.query;

    let query = `
      SELECT lr.*,
             e.name as employee_name,
             e.employee_id as emp_code,
             d.name as department_name,
             lt.code as leave_type_code,
             lt.name as leave_type_name,
             lt.is_paid
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (employee_id) {
      paramCount++;
      query += ` AND lr.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (status) {
      paramCount++;
      query += ` AND lr.status = $${paramCount}`;
      params.push(status);
    }

    if (month && year) {
      paramCount++;
      query += ` AND (
        (EXTRACT(MONTH FROM lr.start_date) = $${paramCount} AND EXTRACT(YEAR FROM lr.start_date) = $${paramCount + 1})
        OR (EXTRACT(MONTH FROM lr.end_date) = $${paramCount} AND EXTRACT(YEAR FROM lr.end_date) = $${paramCount + 1})
      )`;
      params.push(month, year);
      paramCount++;
    }

    query += ' ORDER BY lr.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// Get pending leave requests count
router.get('/requests/pending-count', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'"
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching pending count:', error);
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

// Create leave request (by HR on behalf of employee)
router.post('/requests', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason } = req.body;

    // Calculate total days (excluding weekends)
    const start = new Date(start_date);
    const end = new Date(end_date);
    let totalDays = 0;

    // Get public holidays in date range
    const holidays = await pool.query(
      'SELECT date FROM public_holidays WHERE date BETWEEN $1 AND $2',
      [start_date, end_date]
    );
    const holidayDates = holidays.rows.map(h => h.date.toISOString().split('T')[0]);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      const dateStr = d.toISOString().split('T')[0];
      // Skip weekends (0 = Sunday, 6 = Saturday) and public holidays
      if (day !== 0 && day !== 6 && !holidayDates.includes(dateStr)) {
        totalDays++;
      }
    }

    // Check leave balance if it's paid leave
    const leaveType = await pool.query(
      'SELECT * FROM leave_types WHERE id = $1',
      [leave_type_id]
    );

    if (leaveType.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid leave type' });
    }

    if (leaveType.rows[0].is_paid) {
      const currentYear = new Date(start_date).getFullYear();
      const balance = await pool.query(
        'SELECT * FROM leave_balances WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3',
        [employee_id, leave_type_id, currentYear]
      );

      if (balance.rows.length > 0) {
        const remaining = balance.rows[0].entitled_days - balance.rows[0].used_days;
        if (totalDays > remaining) {
          return res.status(400).json({
            error: `Insufficient leave balance. Available: ${remaining} days, Requested: ${totalDays} days`
          });
        }
      }
    }

    const result = await pool.query(`
      INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [employee_id, leave_type_id, start_date, end_date, totalDays, reason]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

// Approve leave request
router.post('/requests/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the leave request
    const request = await pool.query(
      `SELECT lr.*, lt.is_paid
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.id = $1`,
      [id]
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const lr = request.rows[0];

    if (lr.status !== 'pending') {
      return res.status(400).json({ error: 'Leave request is not pending' });
    }

    // Update request status
    await pool.query(
      `UPDATE leave_requests SET status = 'approved', approved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // If paid leave, update leave balance
    if (lr.is_paid) {
      const year = new Date(lr.start_date).getFullYear();
      await pool.query(
        `UPDATE leave_balances
         SET used_days = used_days + $1, updated_at = NOW()
         WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
        [lr.total_days, lr.employee_id, lr.leave_type_id, year]
      );
    }

    res.json({ message: 'Leave request approved' });
  } catch (error) {
    console.error('Error approving leave request:', error);
    res.status(500).json({ error: 'Failed to approve leave request' });
  }
});

// Reject leave request
router.post('/requests/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const result = await pool.query(
      `UPDATE leave_requests
       SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [rejection_reason, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found or not pending' });
    }

    res.json({ message: 'Leave request rejected' });
  } catch (error) {
    console.error('Error rejecting leave request:', error);
    res.status(500).json({ error: 'Failed to reject leave request' });
  }
});

// Cancel leave request
router.post('/requests/:id/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the leave request
    const request = await pool.query(
      `SELECT lr.*, lt.is_paid
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.id = $1`,
      [id]
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const lr = request.rows[0];

    // If it was approved and paid, restore the balance
    if (lr.status === 'approved' && lr.is_paid) {
      const year = new Date(lr.start_date).getFullYear();
      await pool.query(
        `UPDATE leave_balances
         SET used_days = used_days - $1, updated_at = NOW()
         WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
        [lr.total_days, lr.employee_id, lr.leave_type_id, year]
      );
    }

    // Update request status
    await pool.query(
      `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Leave request cancelled' });
  } catch (error) {
    console.error('Error cancelling leave request:', error);
    res.status(500).json({ error: 'Failed to cancel leave request' });
  }
});

// Delete leave request
router.delete('/requests/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM leave_requests WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    res.json({ message: 'Leave request deleted' });
  } catch (error) {
    console.error('Error deleting leave request:', error);
    res.status(500).json({ error: 'Failed to delete leave request' });
  }
});

// =====================================================
// PUBLIC HOLIDAYS
// =====================================================

// Get public holidays
router.get('/holidays', authenticateAdmin, async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const result = await pool.query(
      'SELECT * FROM public_holidays WHERE year = $1 ORDER BY date',
      [currentYear]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// Add public holiday
router.post('/holidays', authenticateAdmin, async (req, res) => {
  try {
    const { name, date } = req.body;
    const year = new Date(date).getFullYear();

    const result = await pool.query(
      'INSERT INTO public_holidays (name, date, year) VALUES ($1, $2, $3) RETURNING *',
      [name, date, year]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

// Delete public holiday
router.delete('/holidays/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM public_holidays WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.json({ message: 'Holiday deleted' });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// Get unpaid leave for payroll calculation
router.get('/unpaid-for-payroll', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    let query = `
      SELECT lr.employee_id, SUM(lr.total_days) as unpaid_days
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lt.is_paid = FALSE
        AND lr.status = 'approved'
        AND lr.start_date <= $1
        AND lr.end_date >= $2
    `;
    const params = [endOfMonth, startOfMonth];

    if (employee_id) {
      query += ` AND lr.employee_id = $3`;
      params.push(employee_id);
    }

    query += ' GROUP BY lr.employee_id';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching unpaid leave for payroll:', error);
    res.status(500).json({ error: 'Failed to fetch unpaid leave' });
  }
});

module.exports = router;
