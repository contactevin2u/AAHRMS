/**
 * Analytics Dashboard API
 * Provides payroll overview, department breakdown, salary rankings,
 * monthly trends, headcount, attendance summary, and AI insights.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Helper: get latest finalized/approved payroll run IDs for a company
async function getLatestPayrollRunIds(companyId) {
  const result = await pool.query(`
    SELECT pr.id, pr.month, pr.year
    FROM payroll_runs pr
    WHERE pr.company_id = $1
      AND pr.status IN ('finalized', 'approved')
    ORDER BY pr.year DESC, pr.month DESC
  `, [companyId]);
  return result.rows;
}

// Helper: get the latest month/year with finalized payroll
async function getLatestPayrollPeriod(companyId) {
  const result = await pool.query(`
    SELECT month, year
    FROM payroll_runs
    WHERE company_id = $1 AND status IN ('finalized', 'approved')
    ORDER BY year DESC, month DESC
    LIMIT 1
  `, [companyId]);
  return result.rows[0] || null;
}

/**
 * GET /api/analytics/payroll-overview
 * Total payroll cost, employee count, average salary, MoM change, totals by company
 */
router.get('/payroll-overview', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const latest = await getLatestPayrollPeriod(companyId);
    if (!latest) return res.json({ totalPayroll: 0, employeeCount: 0, avgSalary: 0, momChange: null });

    // Current month totals
    const current = await pool.query(`
      SELECT
        COALESCE(SUM(pi.gross_salary), 0) AS total_gross,
        COALESCE(SUM(pi.gross_salary - COALESCE(pi.claims_amount, 0)), 0) AS total_gross_ex_claims,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COALESCE(SUM(pi.total_deductions), 0) AS total_deductions,
        COUNT(DISTINCT pi.employee_id) AS employee_count,
        CASE WHEN COUNT(DISTINCT pi.employee_id) > 0
          THEN ROUND(SUM(pi.net_pay) / COUNT(DISTINCT pi.employee_id), 2)
          ELSE 0 END AS avg_salary
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, latest.month, latest.year]);

    // Previous month totals for MoM
    let prevMonth = latest.month - 1;
    let prevYear = latest.year;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }

    const prev = await pool.query(`
      SELECT COALESCE(SUM(pi.net_pay), 0) AS total_net
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, prevMonth, prevYear]);

    const currentData = current.rows[0];
    const prevNet = parseFloat(prev.rows[0].total_net);
    const currentNet = parseFloat(currentData.total_net);
    const momChange = prevNet > 0 ? ((currentNet - prevNet) / prevNet * 100).toFixed(1) : null;

    // By company (for super admin viewing all)
    const byCompany = await pool.query(`
      SELECT c.name AS company_name, c.id AS company_id,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COUNT(DISTINCT pi.employee_id) AS employee_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN companies c ON pr.company_id = c.id
      WHERE pr.month = $1 AND pr.year = $2
        AND pr.status IN ('finalized', 'approved')
        AND (pr.company_id = $3 OR $3::int IS NULL)
      GROUP BY c.id, c.name
    `, [latest.month, latest.year, companyId]);

    res.json({
      month: latest.month,
      year: latest.year,
      totalGross: parseFloat(currentData.total_gross),
      totalGrossExClaims: parseFloat(currentData.total_gross_ex_claims),
      totalNet: currentNet,
      totalDeductions: parseFloat(currentData.total_deductions),
      employeeCount: parseInt(currentData.employee_count),
      avgSalary: parseFloat(currentData.avg_salary),
      momChange: momChange ? parseFloat(momChange) : null,
      byCompany: byCompany.rows
    });
  } catch (error) {
    console.error('Payroll overview error:', error);
    res.status(500).json({ error: 'Failed to fetch payroll overview' });
  }
});

/**
 * GET /api/analytics/department-breakdown
 * Per-department totals, avg salary, employee count, % of total
 */
router.get('/department-breakdown', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const latest = await getLatestPayrollPeriod(companyId);
    if (!latest) return res.json({ departments: [] });

    const result = await pool.query(`
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COALESCE(SUM(pi.gross_salary), 0) AS total_gross,
        COALESCE(SUM(pi.gross_salary - COALESCE(pi.claims_amount, 0)), 0) AS total_gross_ex_claims,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COUNT(DISTINCT pi.employee_id) AS employee_count,
        CASE WHEN COUNT(DISTINCT pi.employee_id) > 0
          THEN ROUND(SUM(pi.net_pay) / COUNT(DISTINCT pi.employee_id), 2)
          ELSE 0 END AS avg_salary
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
      GROUP BY d.id, d.name
      ORDER BY total_net DESC
    `, [companyId, latest.month, latest.year]);

    const totalPayroll = result.rows.reduce((sum, r) => sum + parseFloat(r.total_net), 0);
    const departments = result.rows.map(r => ({
      departmentId: r.department_id,
      departmentName: r.department_name || 'Unassigned',
      totalGross: parseFloat(r.total_gross),
      totalGrossExClaims: parseFloat(r.total_gross_ex_claims),
      totalNet: parseFloat(r.total_net),
      employeeCount: parseInt(r.employee_count),
      avgSalary: parseFloat(r.avg_salary),
      percentage: totalPayroll > 0 ? parseFloat((parseFloat(r.total_net) / totalPayroll * 100).toFixed(1)) : 0
    }));

    res.json({ month: latest.month, year: latest.year, departments, totalPayroll });
  } catch (error) {
    console.error('Department breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch department breakdown' });
  }
});

/**
 * GET /api/analytics/salary-ranking
 * Top 10 highest paid employees, top paid per department
 */
router.get('/salary-ranking', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const latest = await getLatestPayrollPeriod(companyId);
    if (!latest) return res.json({ top10: [], topByDepartment: [] });

    // Top 10 highest paid
    const top10 = await pool.query(`
      SELECT e.name, d.name AS department_name,
        pi.net_pay, pi.gross_salary,
        (pi.gross_salary - COALESCE(pi.claims_amount, 0)) AS gross_ex_claims
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
      ORDER BY pi.net_pay DESC
      LIMIT 10
    `, [companyId, latest.month, latest.year]);

    // Top paid per department
    const topByDept = await pool.query(`
      SELECT DISTINCT ON (d.id)
        d.name AS department_name, e.name AS employee_name,
        pi.net_pay, pi.gross_salary,
        (pi.gross_salary - COALESCE(pi.claims_amount, 0)) AS gross_ex_claims
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
      ORDER BY d.id, pi.net_pay DESC
    `, [companyId, latest.month, latest.year]);

    res.json({
      month: latest.month,
      year: latest.year,
      top10: top10.rows.map(r => ({
        name: r.name,
        department: r.department_name || 'Unassigned',
        netPay: parseFloat(r.net_pay),
        grossSalary: parseFloat(r.gross_salary),
        grossExClaims: parseFloat(r.gross_ex_claims)
      })),
      topByDepartment: topByDept.rows.map(r => ({
        department: r.department_name || 'Unassigned',
        employeeName: r.employee_name,
        netPay: parseFloat(r.net_pay),
        grossSalary: parseFloat(r.gross_salary),
        grossExClaims: parseFloat(r.gross_ex_claims)
      }))
    });
  } catch (error) {
    console.error('Salary ranking error:', error);
    res.status(500).json({ error: 'Failed to fetch salary rankings' });
  }
});

/**
 * GET /api/analytics/monthly-trend?months=12
 * Monthly gross, net, deductions for last N months
 */
router.get('/monthly-trend', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const months = parseInt(req.query.months) || 12;

    const result = await pool.query(`
      SELECT pr.month, pr.year,
        COALESCE(SUM(pi.gross_salary), 0) AS total_gross,
        COALESCE(SUM(pi.gross_salary - COALESCE(pi.claims_amount, 0)), 0) AS total_gross_ex_claims,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COALESCE(SUM(pi.total_deductions), 0) AS total_deductions,
        COUNT(DISTINCT pi.employee_id) AS employee_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.status IN ('finalized', 'approved')
      GROUP BY pr.year, pr.month
      ORDER BY pr.year DESC, pr.month DESC
      LIMIT $2
    `, [companyId, months]);

    // Reverse to chronological order
    const trend = result.rows.reverse().map(r => ({
      month: r.month,
      year: r.year,
      label: `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][r.month]} ${r.year}`,
      totalGross: parseFloat(r.total_gross),
      totalGrossExClaims: parseFloat(r.total_gross_ex_claims),
      totalNet: parseFloat(r.total_net),
      totalDeductions: parseFloat(r.total_deductions),
      employeeCount: parseInt(r.employee_count)
    }));

    // Per-department monthly trend
    const deptTrend = await pool.query(`
      SELECT pr.month, pr.year, d.name AS department_name,
        COALESCE(SUM(pi.net_pay), 0) AS total_net
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.company_id = $1
        AND pr.status IN ('finalized', 'approved')
      GROUP BY pr.year, pr.month, d.name
      ORDER BY pr.year DESC, pr.month DESC
    `, [companyId]);

    res.json({ trend, departmentTrend: deptTrend.rows });
  } catch (error) {
    console.error('Monthly trend error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly trend' });
  }
});

/**
 * GET /api/analytics/headcount
 * Active/inactive/probation/resigned counts, by department, new hires
 */
router.get('/headcount', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    // Overall counts
    const counts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'inactive') AS inactive,
        COUNT(*) FILTER (WHERE status = 'resigned' OR employment_status = 'resigned') AS resigned,
        COUNT(*) FILTER (WHERE employment_type = 'probation' AND status = 'active') AS probation,
        COUNT(*) FILTER (WHERE employment_type = 'confirmed' AND status = 'active') AS confirmed
      FROM employees
      WHERE company_id = $1
    `, [companyId]);

    // By department
    const byDept = await pool.query(`
      SELECT d.name AS department_name,
        COUNT(*) FILTER (WHERE e.status = 'active') AS active,
        COUNT(*) FILTER (WHERE e.status = 'resigned' OR e.employment_status = 'resigned') AS resigned,
        COUNT(*) AS total
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1
      GROUP BY d.name
      ORDER BY active DESC
    `, [companyId]);

    // New hires this month
    const now = new Date();
    const newHires = await pool.query(`
      SELECT COUNT(*) AS count
      FROM employees
      WHERE company_id = $1
        AND EXTRACT(MONTH FROM join_date) = $2
        AND EXTRACT(YEAR FROM join_date) = $3
    `, [companyId, now.getMonth() + 1, now.getFullYear()]);

    res.json({
      ...counts.rows[0],
      byDepartment: byDept.rows.map(r => ({
        department: r.department_name || 'Unassigned',
        active: parseInt(r.active),
        resigned: parseInt(r.resigned),
        total: parseInt(r.total)
      })),
      newHiresThisMonth: parseInt(newHires.rows[0].count)
    });
  } catch (error) {
    console.error('Headcount error:', error);
    res.status(500).json({ error: 'Failed to fetch headcount' });
  }
});

/**
 * GET /api/analytics/attendance-summary
 * Average hours, OT hours, late arrivals, attendance rate
 */
router.get('/attendance-summary', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const result = await pool.query(`
      SELECT
        ROUND(AVG(ci.total_hours)::numeric, 1) AS avg_hours,
        COALESCE(SUM(ci.ot_hours), 0) AS total_ot_hours,
        COUNT(*) FILTER (WHERE ci.is_late = true) AS late_count,
        COUNT(*) AS total_records
      FROM clock_in ci
      JOIN employees e ON ci.employee_id = e.id
      WHERE e.company_id = $1
        AND EXTRACT(MONTH FROM ci.clock_in_time) = $2
        AND EXTRACT(YEAR FROM ci.clock_in_time) = $3
    `, [companyId, month, year]);

    // Active employee count for attendance rate
    const activeCount = await pool.query(`
      SELECT COUNT(*) AS count FROM employees
      WHERE company_id = $1 AND status = 'active'
    `, [companyId]);

    const data = result.rows[0];
    const workingDays = Math.min(now.getDate(), 22); // rough estimate
    const expectedRecords = parseInt(activeCount.rows[0].count) * workingDays;
    const attendanceRate = expectedRecords > 0
      ? Math.min(100, (parseInt(data.total_records) / expectedRecords * 100)).toFixed(1)
      : 0;

    res.json({
      avgHours: parseFloat(data.avg_hours) || 0,
      totalOTHours: parseFloat(data.total_ot_hours),
      lateCount: parseInt(data.late_count),
      totalRecords: parseInt(data.total_records),
      attendanceRate: parseFloat(attendanceRate),
      month,
      year
    });
  } catch (error) {
    console.error('Attendance summary error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
});

/**
 * GET /api/analytics/ai-insights
 * AI-generated insights using Anthropic SDK
 */
router.get('/ai-insights', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ insights: ['AI insights unavailable - API key not configured.'] });
    }

    // Gather data for analysis
    const latest = await getLatestPayrollPeriod(companyId);
    if (!latest) return res.json({ insights: ['No payroll data available for analysis.'] });

    // Current month summary
    const summary = await pool.query(`
      SELECT
        COALESCE(SUM(pi.gross_salary), 0) AS total_gross,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COUNT(DISTINCT pi.employee_id) AS employee_count,
        ROUND(AVG(pi.net_pay)::numeric, 2) AS avg_net,
        MAX(pi.net_pay) AS max_net,
        MIN(pi.net_pay) AS min_net,
        COALESCE(SUM(pi.ot_amount), 0) AS total_ot
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, latest.month, latest.year]);

    // Department breakdown
    const depts = await pool.query(`
      SELECT d.name, COUNT(DISTINCT pi.employee_id) AS count,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        ROUND(AVG(pi.net_pay)::numeric, 2) AS avg_net
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
      GROUP BY d.name
    `, [companyId, latest.month, latest.year]);

    // Previous month for comparison
    let prevMonth = latest.month - 1, prevYear = latest.year;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
    const prevSummary = await pool.query(`
      SELECT COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COUNT(DISTINCT pi.employee_id) AS employee_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, prevMonth, prevYear]);

    const dataContext = {
      currentMonth: `${latest.month}/${latest.year}`,
      summary: summary.rows[0],
      departments: depts.rows,
      previousMonth: prevSummary.rows[0]
    };

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are an HR analytics assistant. Analyze this payroll data and provide exactly 4 concise, actionable insights. Each insight should be 1-2 sentences. Focus on trends, anomalies, cost optimization, and department comparisons. Be specific with numbers.

Payroll Data:
${JSON.stringify(dataContext, null, 2)}

Return ONLY a JSON array of strings, e.g. ["insight 1", "insight 2", "insight 3", "insight 4"]`
      }]
    });

    let insights;
    try {
      const text = message.content[0].text;
      insights = JSON.parse(text);
    } catch {
      insights = [message.content[0].text];
    }

    res.json({ insights, month: latest.month, year: latest.year });
  } catch (error) {
    console.error('AI insights error:', error);
    res.json({ insights: ['Unable to generate AI insights at this time.'], error: true });
  }
});

module.exports = router;
