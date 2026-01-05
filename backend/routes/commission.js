const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// =====================================================
// INDOOR SALES COMMISSION (Department-based)
// =====================================================

// Get sales for a period (for Indoor Sales department)
router.get('/sales', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    const { department_id, year, month, status } = req.query;

    let query = `
      SELECT os.*,
        d.name as department_name
      FROM outlet_sales os
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE os.department_id IS NOT NULL
    `;
    let params = [];
    let paramIndex = 1;

    if (companyId !== null) {
      query += ` AND d.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }

    if (department_id) {
      query += ` AND os.department_id = $${paramIndex}`;
      params.push(department_id);
      paramIndex++;
    }

    if (year) {
      query += ` AND os.period_year = $${paramIndex}`;
      params.push(year);
      paramIndex++;
    }

    if (month) {
      query += ` AND os.period_month = $${paramIndex}`;
      params.push(month);
      paramIndex++;
    }

    if (status) {
      query += ` AND os.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY os.period_year DESC, os.period_month DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// Get single sales record with commission payouts
router.get('/sales/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let salesQuery = `
      SELECT os.*,
        d.name as department_name
      FROM outlet_sales os
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE os.id = $1
    `;
    let salesParams = [id];

    if (companyId !== null) {
      salesQuery += ' AND d.company_id = $2';
      salesParams.push(companyId);
    }

    const salesResult = await pool.query(salesQuery, salesParams);
    if (salesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    // Get commission payouts for this record
    const payoutsResult = await pool.query(`
      SELECT cp.*,
        e.name as employee_name,
        e.employee_id as employee_code
      FROM commission_payouts cp
      LEFT JOIN employees e ON cp.employee_id = e.id
      WHERE cp.outlet_sales_id = $1
      ORDER BY e.name
    `, [id]);

    res.json({
      ...salesResult.rows[0],
      payouts: payoutsResult.rows
    });
  } catch (error) {
    console.error('Error fetching sales details:', error);
    res.status(500).json({ error: 'Failed to fetch sales details' });
  }
});

// Create/Update sales for a period
router.post('/sales', authenticateAdmin, async (req, res) => {
  try {
    const { department_id, period_month, period_year, total_sales, commission_rate } = req.body;

    if (!department_id || !period_month || !period_year || total_sales === undefined) {
      return res.status(400).json({ error: 'Department ID, period, and total sales are required' });
    }

    const rate = commission_rate || 6.00;
    const commissionPool = parseFloat(total_sales) * (rate / 100);

    // Check if record exists
    const existing = await pool.query(
      'SELECT id FROM outlet_sales WHERE department_id = $1 AND period_month = $2 AND period_year = $3',
      [department_id, period_month, period_year]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE outlet_sales
         SET total_sales = $1,
             commission_rate = $2,
             commission_pool = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [total_sales, rate, commissionPool, existing.rows[0].id]
      );
    } else {
      // Create new
      result = await pool.query(
        `INSERT INTO outlet_sales
          (department_id, period_month, period_year, total_sales, commission_rate, commission_pool, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft')
         RETURNING *`,
        [department_id, period_month, period_year, total_sales, rate, commissionPool]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving sales:', error);
    res.status(500).json({ error: 'Failed to save sales' });
  }
});

// Calculate commissions for a sales period
router.post('/sales/:id/calculate', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    // Get sales record
    let salesQuery = `
      SELECT os.*, d.company_id
      FROM outlet_sales os
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE os.id = $1
    `;
    let salesParams = [id];

    if (companyId !== null) {
      salesQuery += ' AND d.company_id = $2';
      salesParams.push(companyId);
    }

    const salesResult = await pool.query(salesQuery, salesParams);
    if (salesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    const sales = salesResult.rows[0];

    // Commission period is 15th to 14th
    // period_month = payout month (when commission is paid with salary)
    // Schedule range: (previous month) 15th to (period_month) 14th
    let startYear = sales.period_year;
    let startMonth = sales.period_month - 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear = sales.period_year - 1;
    }
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-15`;
    const endDate = `${sales.period_year}-${String(sales.period_month).padStart(2, '0')}-14`;

    // Get all schedules for this department in the period
    // Count normal shifts and PH shifts separately
    const schedulesResult = await pool.query(`
      SELECT
        s.employee_id,
        COUNT(CASE WHEN s.is_public_holiday = false AND (st.is_off = false OR st.is_off IS NULL) THEN 1 END) as normal_shifts,
        COUNT(CASE WHEN s.is_public_holiday = true AND (st.is_off = false OR st.is_off IS NULL) THEN 1 END) as ph_shifts
      FROM schedules s
      LEFT JOIN shift_templates st ON s.shift_template_id = st.id
      WHERE s.department_id = $1
        AND s.schedule_date BETWEEN $2 AND $3
        AND (s.status = 'scheduled' OR s.status IS NULL)
      GROUP BY s.employee_id
    `, [sales.department_id, startDate, endDate]);

    // Calculate effective shifts (PH = 2x)
    let totalEffectiveShifts = 0;
    const employeeShifts = [];

    for (const row of schedulesResult.rows) {
      const normalShifts = parseInt(row.normal_shifts) || 0;
      const phShifts = parseInt(row.ph_shifts) || 0;
      const effectiveShifts = normalShifts + (phShifts * 2);

      totalEffectiveShifts += effectiveShifts;
      employeeShifts.push({
        employee_id: row.employee_id,
        normal_shifts: normalShifts,
        ph_shifts: phShifts,
        effective_shifts: effectiveShifts
      });
    }

    // Calculate per-shift value
    const perShiftValue = totalEffectiveShifts > 0
      ? parseFloat(sales.commission_pool) / totalEffectiveShifts
      : 0;

    // Update sales with totals
    await pool.query(
      `UPDATE outlet_sales
       SET total_effective_shifts = $1,
           per_shift_value = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [totalEffectiveShifts, perShiftValue, id]
    );

    // Delete existing payouts and create new ones
    await pool.query('DELETE FROM commission_payouts WHERE outlet_sales_id = $1', [id]);

    const payouts = [];
    for (const emp of employeeShifts) {
      if (emp.effective_shifts > 0) {
        const commissionAmount = emp.effective_shifts * perShiftValue;

        const payoutResult = await pool.query(
          `INSERT INTO commission_payouts
            (employee_id, outlet_sales_id, normal_shifts, ph_shifts, effective_shifts, commission_amount)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [emp.employee_id, id, emp.normal_shifts, emp.ph_shifts, emp.effective_shifts, commissionAmount]
        );

        // Get employee name
        const empInfo = await pool.query('SELECT name, employee_id FROM employees WHERE id = $1', [emp.employee_id]);

        payouts.push({
          ...payoutResult.rows[0],
          employee_name: empInfo.rows[0]?.name,
          employee_code: empInfo.rows[0]?.employee_id
        });
      }
    }

    res.json({
      sales_id: parseInt(id),
      period: `${sales.period_year}-${String(sales.period_month).padStart(2, '0')}`,
      period_label: `${startDate} to ${endDate}`,
      period_start: startDate,
      period_end: endDate,
      payout_month: `${sales.period_year}-${String(sales.period_month).padStart(2, '0')}`,
      total_sales: parseFloat(sales.total_sales),
      commission_rate: parseFloat(sales.commission_rate),
      commission_pool: parseFloat(sales.commission_pool),
      total_effective_shifts: totalEffectiveShifts,
      per_shift_value: perShiftValue,
      payouts
    });
  } catch (error) {
    console.error('Error calculating commissions:', error);
    res.status(500).json({ error: 'Failed to calculate commissions' });
  }
});

// Finalize commissions
router.post('/sales/:id/finalize', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let salesQuery = `
      SELECT os.*, d.company_id
      FROM outlet_sales os
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE os.id = $1
    `;
    let salesParams = [id];

    if (companyId !== null) {
      salesQuery += ' AND d.company_id = $2';
      salesParams.push(companyId);
    }

    const salesResult = await pool.query(salesQuery, salesParams);
    if (salesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    if (salesResult.rows[0].status === 'finalized') {
      return res.status(400).json({ error: 'Already finalized' });
    }

    const payoutsCount = await pool.query(
      'SELECT COUNT(*) FROM commission_payouts WHERE outlet_sales_id = $1',
      [id]
    );

    if (parseInt(payoutsCount.rows[0].count) === 0) {
      return res.status(400).json({ error: 'No commission payouts calculated. Calculate commissions first.' });
    }

    await pool.query(
      `UPDATE outlet_sales SET status = 'finalized', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Commission period finalized successfully' });
  } catch (error) {
    console.error('Error finalizing commissions:', error);
    res.status(500).json({ error: 'Failed to finalize commissions' });
  }
});

// Revert finalization
router.post('/sales/:id/revert', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let salesQuery = `
      SELECT os.*, d.company_id
      FROM outlet_sales os
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE os.id = $1
    `;
    let salesParams = [id];

    if (companyId !== null) {
      salesQuery += ' AND d.company_id = $2';
      salesParams.push(companyId);
    }

    const salesResult = await pool.query(salesQuery, salesParams);
    if (salesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    await pool.query(
      `UPDATE outlet_sales SET status = 'draft', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Commission period reverted to draft' });
  } catch (error) {
    console.error('Error reverting commissions:', error);
    res.status(500).json({ error: 'Failed to revert commissions' });
  }
});

// Delete sales record
router.delete('/sales/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let salesQuery = `
      SELECT os.*, d.company_id
      FROM outlet_sales os
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE os.id = $1
    `;
    let salesParams = [id];

    if (companyId !== null) {
      salesQuery += ' AND d.company_id = $2';
      salesParams.push(companyId);
    }

    const salesResult = await pool.query(salesQuery, salesParams);
    if (salesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    if (salesResult.rows[0].status === 'finalized') {
      return res.status(400).json({ error: 'Cannot delete finalized record. Revert first.' });
    }

    await pool.query('DELETE FROM commission_payouts WHERE outlet_sales_id = $1', [id]);
    await pool.query('DELETE FROM outlet_sales WHERE id = $1', [id]);

    res.json({ message: 'Sales record deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales:', error);
    res.status(500).json({ error: 'Failed to delete sales' });
  }
});

// =====================================================
// DEPARTMENTS FOR COMMISSION
// =====================================================

// Get Indoor Sales department (for AA Alive)
router.get('/departments', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT d.*,
        (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.status = 'active') as employee_count
      FROM departments d
      WHERE LOWER(d.name) LIKE '%indoor%sales%'
    `;
    let params = [];

    if (companyId !== null) {
      query += ' AND d.company_id = $1';
      params.push(companyId);
    }

    query += ' ORDER BY d.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching Indoor Sales departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Get commission payouts for an employee
router.get('/payouts/employee/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.query;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT cp.*,
        os.period_month,
        os.period_year,
        os.total_sales,
        os.commission_rate,
        os.commission_pool,
        os.per_shift_value,
        os.status as sales_status,
        d.name as department_name
      FROM commission_payouts cp
      LEFT JOIN outlet_sales os ON cp.outlet_sales_id = os.id
      LEFT JOIN departments d ON os.department_id = d.id
      WHERE cp.employee_id = $1
    `;
    let params = [employeeId];
    let paramIndex = 2;

    if (companyId !== null) {
      query += ` AND d.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }

    if (year) {
      query += ` AND os.period_year = $${paramIndex}`;
      params.push(year);
      paramIndex++;
    }

    query += ' ORDER BY os.period_year DESC, os.period_month DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee commission payouts:', error);
    res.status(500).json({ error: 'Failed to fetch employee commission payouts' });
  }
});

module.exports = router;
