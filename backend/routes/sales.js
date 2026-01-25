const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// Get all sales records (filtered by company)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, month, year } = req.query;
    const companyId = getCompanyFilter(req);

    let query = `
      SELECT sr.*, e.name as employee_name, e.employee_id as emp_code
      FROM sales_records sr
      JOIN employees e ON sr.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (companyId !== null) {
      paramCount++;
      query += ` AND sr.company_id = $${paramCount}`;
      params.push(companyId);
    }

    if (employee_id) {
      paramCount++;
      query += ` AND sr.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (month) {
      paramCount++;
      query += ` AND sr.month = $${paramCount}`;
      params.push(month);
    }

    if (year) {
      paramCount++;
      query += ` AND sr.year = $${paramCount}`;
      params.push(year);
    }

    query += ' ORDER BY sr.sales_date DESC, sr.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales records:', error);
    res.status(500).json({ error: 'Failed to fetch sales records' });
  }
});

// Get monthly sales total for an employee
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

    // Get monthly sales total
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(total_sales), 0) as total_monthly_sales,
        COUNT(*) as sales_count
      FROM sales_records
      WHERE employee_id = $1 AND month = $2 AND year = $3
    `, [employeeId, month, year]);

    // Get company settings for commission calculation
    let settingsQuery = 'SELECT settings FROM companies WHERE id = $1';
    let settingsParams = [companyId || 1];
    const companySettings = await pool.query(settingsQuery, settingsParams);

    const settings = companySettings.rows[0]?.settings || {};
    const basicSalary = settings.indoor_sales_basic || 4000;
    const commissionRate = settings.indoor_sales_commission_rate || 6;

    const totalSales = parseFloat(result.rows[0].total_monthly_sales) || 0;
    const commissionAmount = totalSales * (commissionRate / 100);
    const higherAmount = Math.max(basicSalary, commissionAmount);
    const usedMethod = commissionAmount >= basicSalary ? 'commission' : 'basic';

    res.json({
      employee_id: employeeId,
      employee_name: employee.rows[0].name,
      month: parseInt(month),
      year: parseInt(year),
      total_monthly_sales: totalSales,
      sales_count: parseInt(result.rows[0].sales_count),
      calculation: {
        basic_salary: basicSalary,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        higher_amount: higherAmount,
        used_method: usedMethod
      }
    });
  } catch (error) {
    console.error('Error fetching monthly sales:', error);
    res.status(500).json({ error: 'Failed to fetch monthly sales' });
  }
});

// Get all Indoor Sales employees with their monthly sales
router.get('/indoor-sales/:year/:month', authenticateAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    const companyId = getCompanyFilter(req);

    // Find all Indoor Sales employees
    let query = `
      SELECT e.id, e.employee_id as emp_code, e.name, e.default_basic_salary,
             d.name as department_name, d.payroll_structure_code,
             COALESCE(
               (SELECT SUM(total_sales) FROM sales_records sr
                WHERE sr.employee_id = e.id AND sr.month = $1 AND sr.year = $2),
               0
             ) as total_monthly_sales
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      WHERE d.payroll_structure_code = 'indoor_sales'
        AND e.status = 'active'
    `;
    let params = [month, year];

    if (companyId !== null) {
      query += ' AND e.company_id = $3';
      params.push(companyId);
    }

    query += ' ORDER BY e.name';

    const result = await pool.query(query, params);

    // Get company settings
    let settingsQuery = 'SELECT settings FROM companies WHERE id = $1';
    let settingsParams = [companyId || 1];
    const companySettings = await pool.query(settingsQuery, settingsParams);

    const settings = companySettings.rows[0]?.settings || {};
    const basicSalary = settings.indoor_sales_basic || 4000;
    const commissionRate = settings.indoor_sales_commission_rate || 6;

    // Calculate for each employee
    const employees = result.rows.map(emp => {
      const totalSales = parseFloat(emp.total_monthly_sales) || 0;
      const commissionAmount = totalSales * (commissionRate / 100);
      const higherAmount = Math.max(basicSalary, commissionAmount);
      const usedMethod = commissionAmount >= basicSalary ? 'commission' : 'basic';

      return {
        ...emp,
        calculation: {
          basic_salary: basicSalary,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          higher_amount: higherAmount,
          used_method: usedMethod
        }
      };
    });

    res.json({
      month: parseInt(month),
      year: parseInt(year),
      settings: { basic_salary: basicSalary, commission_rate: commissionRate },
      employees
    });
  } catch (error) {
    console.error('Error fetching indoor sales employees:', error);
    res.status(500).json({ error: 'Failed to fetch indoor sales data', details: error.message });
  }
});

// Create sales record
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { employee_id, sales_date, total_sales, description } = req.body;
    const companyId = req.companyId || 1;

    if (!employee_id || !sales_date || total_sales === undefined) {
      return res.status(400).json({ error: 'Employee ID, sales date, and total sales are required' });
    }

    // Verify employee belongs to user's company
    const employee = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND company_id = $2',
      [employee_id, companyId]
    );

    if (employee.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Extract month and year from sales_date
    const salesDateObj = new Date(sales_date);
    const month = salesDateObj.getMonth() + 1;
    const year = salesDateObj.getFullYear();

    const result = await pool.query(`
      INSERT INTO sales_records (employee_id, company_id, sales_date, month, year, total_sales, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [employee_id, companyId, sales_date, month, year, total_sales, description]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating sales record:', error);
    res.status(500).json({ error: 'Failed to create sales record' });
  }
});

// Bulk create sales records
router.post('/bulk', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { records } = req.body;
    const companyId = req.companyId || 1;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Records array is required' });
    }

    await client.query('BEGIN');

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const record of records) {
      try {
        if (!record.employee_id || !record.sales_date || record.total_sales === undefined) {
          results.failed++;
          results.errors.push(`Missing required fields for employee ${record.employee_id}`);
          continue;
        }

        const salesDateObj = new Date(record.sales_date);
        const month = salesDateObj.getMonth() + 1;
        const year = salesDateObj.getFullYear();

        await client.query(`
          INSERT INTO sales_records (employee_id, company_id, sales_date, month, year, total_sales, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [record.employee_id, companyId, record.sales_date, month, year, record.total_sales, record.description]);

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    await client.query('COMMIT');

    res.json({
      message: `Bulk import completed: ${results.success} successful, ${results.failed} failed`,
      ...results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk creating sales records:', error);
    res.status(500).json({ error: 'Failed to bulk create sales records' });
  } finally {
    client.release();
  }
});

// Update sales record
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { total_sales, description } = req.body;
    const companyId = getCompanyFilter(req);

    let query = 'UPDATE sales_records SET total_sales = $1, description = $2, updated_at = NOW() WHERE id = $3';
    let params = [total_sales, description, id];

    if (companyId !== null) {
      query += ' AND company_id = $4';
      params.push(companyId);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating sales record:', error);
    res.status(500).json({ error: 'Failed to update sales record' });
  }
});

// Delete sales record
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getCompanyFilter(req);

    let query = 'DELETE FROM sales_records WHERE id = $1';
    let params = [id];

    if (companyId !== null) {
      query += ' AND company_id = $2';
      params.push(companyId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }

    res.json({ message: 'Sales record deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales record:', error);
    res.status(500).json({ error: 'Failed to delete sales record' });
  }
});

module.exports = router;
