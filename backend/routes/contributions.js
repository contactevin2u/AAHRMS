const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get contribution summary for a payroll run
router.get('/summary/:runId', authenticateAdmin, async (req, res) => {
  try {
    const { runId } = req.params;

    // Get payroll run details
    const runResult = await pool.query(`
      SELECT pr.*, d.name as department_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE pr.id = $1
    `, [runId]);

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    // Get contribution totals
    const totalsResult = await pool.query(`
      SELECT
        SUM(epf_employee) as total_epf_employee,
        SUM(epf_employer) as total_epf_employer,
        SUM(socso_employee) as total_socso_employee,
        SUM(socso_employer) as total_socso_employer,
        SUM(eis_employee) as total_eis_employee,
        SUM(eis_employer) as total_eis_employer,
        SUM(pcb) as total_pcb,
        COUNT(*) as employee_count
      FROM payroll_items
      WHERE payroll_run_id = $1
    `, [runId]);

    const totals = totalsResult.rows[0];

    // Calculate totals to pay government
    const epfTotal = parseFloat(totals.total_epf_employee || 0) + parseFloat(totals.total_epf_employer || 0);
    const socsoTotal = parseFloat(totals.total_socso_employee || 0) + parseFloat(totals.total_socso_employer || 0);
    const eisTotal = parseFloat(totals.total_eis_employee || 0) + parseFloat(totals.total_eis_employer || 0);
    const pcbTotal = parseFloat(totals.total_pcb || 0);

    res.json({
      run: {
        id: run.id,
        month: run.month,
        year: run.year,
        status: run.status,
        department_name: run.department_name
      },
      contributions: {
        epf: {
          employee: parseFloat(totals.total_epf_employee || 0),
          employer: parseFloat(totals.total_epf_employer || 0),
          total: epfTotal
        },
        socso: {
          employee: parseFloat(totals.total_socso_employee || 0),
          employer: parseFloat(totals.total_socso_employer || 0),
          total: socsoTotal
        },
        eis: {
          employee: parseFloat(totals.total_eis_employee || 0),
          employer: parseFloat(totals.total_eis_employer || 0),
          total: eisTotal
        },
        pcb: {
          total: pcbTotal
        },
        grand_total: epfTotal + socsoTotal + eisTotal + pcbTotal
      },
      employee_count: parseInt(totals.employee_count || 0)
    });
  } catch (error) {
    console.error('Error fetching contribution summary:', error);
    res.status(500).json({ error: 'Failed to fetch contribution summary' });
  }
});

// Get detailed contributions breakdown by employee
router.get('/details/:runId', authenticateAdmin, async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await pool.query(`
      SELECT
        pi.id,
        e.employee_id as emp_code,
        e.name as employee_name,
        e.ic_number,
        e.epf_number,
        e.socso_number,
        e.tax_number,
        d.name as department_name,
        pi.basic_salary,
        pi.gross_salary,
        pi.epf_employee,
        pi.epf_employer,
        pi.socso_employee,
        pi.socso_employer,
        pi.eis_employee,
        pi.eis_employer,
        pi.pcb
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.name
    `, [runId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching contribution details:', error);
    res.status(500).json({ error: 'Failed to fetch contribution details' });
  }
});

// Get contributions summary across multiple months (for reporting)
router.get('/report', authenticateAdmin, async (req, res) => {
  try {
    const { year, type } = req.query;
    const targetYear = year || new Date().getFullYear();

    const result = await pool.query(`
      SELECT
        pr.month,
        pr.year,
        pr.status,
        d.name as department_name,
        SUM(pi.epf_employee) as epf_employee,
        SUM(pi.epf_employer) as epf_employer,
        SUM(pi.socso_employee) as socso_employee,
        SUM(pi.socso_employer) as socso_employer,
        SUM(pi.eis_employee) as eis_employee,
        SUM(pi.eis_employer) as eis_employer,
        SUM(pi.pcb) as pcb,
        COUNT(pi.id) as employee_count
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      JOIN payroll_items pi ON pr.id = pi.payroll_run_id
      WHERE pr.year = $1
      GROUP BY pr.id, pr.month, pr.year, pr.status, d.name
      ORDER BY pr.month DESC
    `, [targetYear]);

    // Calculate totals for each row
    const data = result.rows.map(row => ({
      ...row,
      epf_total: parseFloat(row.epf_employee || 0) + parseFloat(row.epf_employer || 0),
      socso_total: parseFloat(row.socso_employee || 0) + parseFloat(row.socso_employer || 0),
      eis_total: parseFloat(row.eis_employee || 0) + parseFloat(row.eis_employer || 0),
      pcb_total: parseFloat(row.pcb || 0)
    }));

    // Calculate year totals
    const yearTotals = {
      epf_employee: 0,
      epf_employer: 0,
      epf_total: 0,
      socso_employee: 0,
      socso_employer: 0,
      socso_total: 0,
      eis_employee: 0,
      eis_employer: 0,
      eis_total: 0,
      pcb_total: 0,
      grand_total: 0
    };

    data.forEach(row => {
      yearTotals.epf_employee += parseFloat(row.epf_employee || 0);
      yearTotals.epf_employer += parseFloat(row.epf_employer || 0);
      yearTotals.epf_total += row.epf_total;
      yearTotals.socso_employee += parseFloat(row.socso_employee || 0);
      yearTotals.socso_employer += parseFloat(row.socso_employer || 0);
      yearTotals.socso_total += row.socso_total;
      yearTotals.eis_employee += parseFloat(row.eis_employee || 0);
      yearTotals.eis_employer += parseFloat(row.eis_employer || 0);
      yearTotals.eis_total += row.eis_total;
      yearTotals.pcb_total += row.pcb_total;
    });

    yearTotals.grand_total = yearTotals.epf_total + yearTotals.socso_total + yearTotals.eis_total + yearTotals.pcb_total;

    res.json({
      year: parseInt(targetYear),
      monthly: data,
      totals: yearTotals
    });
  } catch (error) {
    console.error('Error fetching contribution report:', error);
    res.status(500).json({ error: 'Failed to fetch contribution report' });
  }
});

// Export EPF file format (for KWSP submission)
router.get('/export/epf/:runId', authenticateAdmin, async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await pool.query(`
      SELECT
        e.epf_number,
        e.name as employee_name,
        e.ic_number,
        pi.epf_employee,
        pi.epf_employer,
        pi.gross_salary
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1 AND (pi.epf_employee > 0 OR pi.epf_employer > 0)
      ORDER BY e.name
    `, [runId]);

    // Get run info
    const runResult = await pool.query('SELECT month, year FROM payroll_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];

    // Generate CSV
    let csv = 'EPF Number,Employee Name,IC Number,Employee Contribution,Employer Contribution,Total Wages\n';
    result.rows.forEach(row => {
      csv += `"${row.epf_number || ''}","${row.employee_name}","${row.ic_number || ''}",${row.epf_employee},${row.epf_employer},${row.gross_salary}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=EPF_${run.month}_${run.year}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting EPF:', error);
    res.status(500).json({ error: 'Failed to export EPF data' });
  }
});

// Export SOCSO file format
router.get('/export/socso/:runId', authenticateAdmin, async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await pool.query(`
      SELECT
        e.socso_number,
        e.name as employee_name,
        e.ic_number,
        pi.socso_employee,
        pi.socso_employer,
        pi.gross_salary
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1 AND (pi.socso_employee > 0 OR pi.socso_employer > 0)
      ORDER BY e.name
    `, [runId]);

    const runResult = await pool.query('SELECT month, year FROM payroll_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];

    let csv = 'SOCSO Number,Employee Name,IC Number,Employee Contribution,Employer Contribution,Total Wages\n';
    result.rows.forEach(row => {
      csv += `"${row.socso_number || ''}","${row.employee_name}","${row.ic_number || ''}",${row.socso_employee},${row.socso_employer},${row.gross_salary}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=SOCSO_${run.month}_${run.year}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting SOCSO:', error);
    res.status(500).json({ error: 'Failed to export SOCSO data' });
  }
});

// Export EIS file format
router.get('/export/eis/:runId', authenticateAdmin, async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await pool.query(`
      SELECT
        e.socso_number as eis_number,
        e.name as employee_name,
        e.ic_number,
        pi.eis_employee,
        pi.eis_employer,
        pi.gross_salary
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1 AND (pi.eis_employee > 0 OR pi.eis_employer > 0)
      ORDER BY e.name
    `, [runId]);

    const runResult = await pool.query('SELECT month, year FROM payroll_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];

    let csv = 'EIS Number,Employee Name,IC Number,Employee Contribution,Employer Contribution,Total Wages\n';
    result.rows.forEach(row => {
      csv += `"${row.eis_number || ''}","${row.employee_name}","${row.ic_number || ''}",${row.eis_employee},${row.eis_employer},${row.gross_salary}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=EIS_${run.month}_${run.year}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting EIS:', error);
    res.status(500).json({ error: 'Failed to export EIS data' });
  }
});

// Export PCB/Tax file format
router.get('/export/pcb/:runId', authenticateAdmin, async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await pool.query(`
      SELECT
        e.tax_number,
        e.name as employee_name,
        e.ic_number,
        pi.pcb,
        pi.gross_salary
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1 AND pi.pcb > 0
      ORDER BY e.name
    `, [runId]);

    const runResult = await pool.query('SELECT month, year FROM payroll_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];

    let csv = 'Tax Number,Employee Name,IC Number,PCB Amount,Total Wages\n';
    result.rows.forEach(row => {
      csv += `"${row.tax_number || ''}","${row.employee_name}","${row.ic_number || ''}",${row.pcb},${row.gross_salary}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=PCB_${run.month}_${run.year}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting PCB:', error);
    res.status(500).json({ error: 'Failed to export PCB data' });
  }
});

module.exports = router;
