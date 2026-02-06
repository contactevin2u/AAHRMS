/**
 * Analytics Dashboard API
 * Provides payroll overview, department breakdown, salary rankings,
 * monthly trends, headcount, attendance summary, statutory breakdown,
 * OT analysis, and AI insights.
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

// Helper: resolve month/year from query params or fallback to latest
async function resolveMonthYear(companyId, query) {
  if (query.month && query.year) {
    return { month: parseInt(query.month), year: parseInt(query.year) };
  }
  return await getLatestPayrollPeriod(companyId);
}

/**
 * GET /api/analytics/available-periods
 * List all months that have finalized payroll data
 */
router.get('/available-periods', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const result = await pool.query(`
      SELECT DISTINCT pr.month, pr.year
      FROM payroll_runs pr
      WHERE pr.company_id = $1
        AND pr.status IN ('finalized', 'approved')
      ORDER BY pr.year DESC, pr.month DESC
    `, [companyId]);

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    res.json({
      periods: result.rows.map(r => ({
        month: r.month,
        year: r.year,
        label: `${monthNames[r.month]} ${r.year}`
      }))
    });
  } catch (error) {
    console.error('Available periods error:', error);
    res.status(500).json({ error: 'Failed to fetch available periods' });
  }
});

/**
 * GET /api/analytics/payroll-overview?month=X&year=Y
 * Total payroll cost, employee count, average salary, MoM change, YoY change, employer cost
 */
router.get('/payroll-overview', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const period = await resolveMonthYear(companyId, req.query);
    if (!period) return res.json({ totalPayroll: 0, employeeCount: 0, avgSalary: 0, momChange: null });

    // Current month totals (including statutory employer contributions)
    const current = await pool.query(`
      SELECT
        COALESCE(SUM(pi.gross_salary), 0) AS total_gross,
        COALESCE(SUM(pi.gross_salary - COALESCE(pi.claims_amount, 0)), 0) AS total_gross_ex_claims,
        COALESCE(SUM(pi.net_pay), 0) AS total_net,
        COALESCE(SUM(pi.total_deductions), 0) AS total_deductions,
        COUNT(DISTINCT pi.employee_id) AS employee_count,
        CASE WHEN COUNT(DISTINCT pi.employee_id) > 0
          THEN ROUND(SUM(pi.net_pay) / COUNT(DISTINCT pi.employee_id), 2)
          ELSE 0 END AS avg_salary,
        COALESCE(SUM(pi.epf_employer), 0) AS total_epf_employer,
        COALESCE(SUM(pi.socso_employer), 0) AS total_socso_employer,
        COALESCE(SUM(pi.eis_employer), 0) AS total_eis_employer
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, period.month, period.year]);

    // Previous month totals for MoM
    let prevMonth = period.month - 1;
    let prevYear = period.year;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }

    const prev = await pool.query(`
      SELECT COALESCE(SUM(pi.net_pay), 0) AS total_net
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, prevMonth, prevYear]);

    // Same month last year for YoY
    const yoy = await pool.query(`
      SELECT COALESCE(SUM(pi.net_pay), 0) AS total_net,
             COUNT(DISTINCT pi.employee_id) AS employee_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, period.month, period.year - 1]);

    const currentData = current.rows[0];
    const prevNet = parseFloat(prev.rows[0].total_net);
    const currentNet = parseFloat(currentData.total_net);
    const momChange = prevNet > 0 ? ((currentNet - prevNet) / prevNet * 100).toFixed(1) : null;

    const yoyNet = parseFloat(yoy.rows[0].total_net);
    const yoyChange = yoyNet > 0 ? ((currentNet - yoyNet) / yoyNet * 100).toFixed(1) : null;
    const yoyHeadcountChange = parseInt(yoy.rows[0].employee_count) > 0
      ? parseInt(currentData.employee_count) - parseInt(yoy.rows[0].employee_count)
      : null;

    // Employer cost = Net Pay + Employer EPF + Employer SOCSO + Employer EIS
    const employerEPF = parseFloat(currentData.total_epf_employer);
    const employerSOCSO = parseFloat(currentData.total_socso_employer);
    const employerEIS = parseFloat(currentData.total_eis_employer);
    const totalEmployerCost = parseFloat(currentData.total_gross) + employerEPF + employerSOCSO + employerEIS;

    res.json({
      month: period.month,
      year: period.year,
      totalGross: parseFloat(currentData.total_gross),
      totalGrossExClaims: parseFloat(currentData.total_gross_ex_claims),
      totalNet: currentNet,
      totalDeductions: parseFloat(currentData.total_deductions),
      employeeCount: parseInt(currentData.employee_count),
      avgSalary: parseFloat(currentData.avg_salary),
      momChange: momChange ? parseFloat(momChange) : null,
      yoyChange: yoyChange ? parseFloat(yoyChange) : null,
      yoyHeadcountChange,
      totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
      employerEPF,
      employerSOCSO,
      employerEIS
    });
  } catch (error) {
    console.error('Payroll overview error:', error);
    res.status(500).json({ error: 'Failed to fetch payroll overview' });
  }
});

/**
 * GET /api/analytics/department-breakdown?month=X&year=Y
 * Per-department/outlet totals, avg salary, employee count, % of total
 */
router.get('/department-breakdown', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const period = await resolveMonthYear(companyId, req.query);
    if (!period) return res.json({ departments: [], groupBy: 'department' });

    const isOutletBased = companyId === 3;

    let result;
    if (isOutletBased) {
      result = await pool.query(`
        SELECT
          o.id AS group_id,
          o.name AS group_name,
          COALESCE(SUM(pi.gross_salary), 0) AS total_gross,
          COALESCE(SUM(pi.gross_salary - COALESCE(pi.claims_amount, 0)), 0) AS total_gross_ex_claims,
          COALESCE(SUM(pi.net_pay), 0) AS total_net,
          COUNT(DISTINCT pi.employee_id) AS employee_count,
          CASE WHEN COUNT(DISTINCT pi.employee_id) > 0
            THEN ROUND(SUM(pi.net_pay) / COUNT(DISTINCT pi.employee_id), 2)
            ELSE 0 END AS avg_salary
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        LEFT JOIN outlets o ON pr.outlet_id = o.id
        WHERE pr.company_id = $1
          AND pr.month = $2 AND pr.year = $3
          AND pr.status IN ('finalized', 'approved')
        GROUP BY o.id, o.name
        ORDER BY total_net DESC
      `, [companyId, period.month, period.year]);
    } else {
      result = await pool.query(`
        SELECT
          d.id AS group_id,
          d.name AS group_name,
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
      `, [companyId, period.month, period.year]);
    }

    const totalPayroll = result.rows.reduce((sum, r) => sum + parseFloat(r.total_net), 0);
    const departments = result.rows.map(r => ({
      departmentId: r.group_id,
      departmentName: r.group_name || 'Unassigned',
      totalGross: parseFloat(r.total_gross),
      totalGrossExClaims: parseFloat(r.total_gross_ex_claims),
      totalNet: parseFloat(r.total_net),
      employeeCount: parseInt(r.employee_count),
      avgSalary: parseFloat(r.avg_salary),
      percentage: totalPayroll > 0 ? parseFloat((parseFloat(r.total_net) / totalPayroll * 100).toFixed(1)) : 0
    }));

    res.json({ month: period.month, year: period.year, departments, totalPayroll, groupBy: isOutletBased ? 'outlet' : 'department' });
  } catch (error) {
    console.error('Department breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch department breakdown' });
  }
});

/**
 * GET /api/analytics/salary-ranking?month=X&year=Y
 * Top 10 highest paid employees, top paid per department
 */
router.get('/salary-ranking', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const period = await resolveMonthYear(companyId, req.query);
    if (!period) return res.json({ top10: [], topByDepartment: [] });

    const top10 = await pool.query(`
      SELECT e.name, d.name AS department_name,
        pi.net_pay, pi.gross_salary,
        (pi.gross_salary - COALESCE(pi.claims_amount, 0)) AS gross_ex_claims,
        (pi.net_pay - COALESCE(pi.claims_amount, 0)) AS net_pay_ex_claims
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
      ORDER BY net_pay_ex_claims DESC
      LIMIT 10
    `, [companyId, period.month, period.year]);

    const isOutletBased = companyId === 3;

    let topByDept;
    if (isOutletBased) {
      topByDept = await pool.query(`
        SELECT DISTINCT ON (o.id)
          o.name AS group_name, e.name AS employee_name,
          pi.net_pay, pi.gross_salary,
          (pi.gross_salary - COALESCE(pi.claims_amount, 0)) AS gross_ex_claims,
          (pi.net_pay - COALESCE(pi.claims_amount, 0)) AS net_pay_ex_claims
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        JOIN employees e ON pi.employee_id = e.id
        LEFT JOIN outlets o ON pr.outlet_id = o.id
        WHERE pr.company_id = $1
          AND pr.month = $2 AND pr.year = $3
          AND pr.status IN ('finalized', 'approved')
        ORDER BY o.id, net_pay_ex_claims DESC
      `, [companyId, period.month, period.year]);
    } else {
      topByDept = await pool.query(`
        SELECT DISTINCT ON (d.id)
          d.name AS group_name, e.name AS employee_name,
          pi.net_pay, pi.gross_salary,
          (pi.gross_salary - COALESCE(pi.claims_amount, 0)) AS gross_ex_claims,
          (pi.net_pay - COALESCE(pi.claims_amount, 0)) AS net_pay_ex_claims
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        JOIN employees e ON pi.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE pr.company_id = $1
          AND pr.month = $2 AND pr.year = $3
          AND pr.status IN ('finalized', 'approved')
        ORDER BY d.id, net_pay_ex_claims DESC
      `, [companyId, period.month, period.year]);
    }

    res.json({
      month: period.month,
      year: period.year,
      groupBy: isOutletBased ? 'outlet' : 'department',
      top10: top10.rows.map(r => ({
        name: r.name,
        department: r.department_name || 'Unassigned',
        netPay: parseFloat(r.net_pay),
        netPayExClaims: parseFloat(r.net_pay_ex_claims),
        grossSalary: parseFloat(r.gross_salary),
        grossExClaims: parseFloat(r.gross_ex_claims)
      })),
      topByDepartment: topByDept.rows.map(r => ({
        department: r.group_name || 'Unassigned',
        employeeName: r.employee_name,
        netPay: parseFloat(r.net_pay),
        netPayExClaims: parseFloat(r.net_pay_ex_claims),
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
        COUNT(DISTINCT pi.employee_id) AS employee_count,
        COALESCE(SUM(pi.epf_employer), 0) + COALESCE(SUM(pi.socso_employer), 0) + COALESCE(SUM(pi.eis_employer), 0) AS total_employer_statutory
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.status IN ('finalized', 'approved')
      GROUP BY pr.year, pr.month
      ORDER BY pr.year DESC, pr.month DESC
      LIMIT $2
    `, [companyId, months]);

    const trend = result.rows.reverse().map(r => ({
      month: r.month,
      year: r.year,
      label: `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][r.month]} ${r.year}`,
      totalGross: parseFloat(r.total_gross),
      totalGrossExClaims: parseFloat(r.total_gross_ex_claims),
      totalNet: parseFloat(r.total_net),
      totalDeductions: parseFloat(r.total_deductions),
      employeeCount: parseInt(r.employee_count),
      totalEmployerCost: parseFloat(r.total_gross) + parseFloat(r.total_employer_statutory)
    }));

    res.json({ trend });
  } catch (error) {
    console.error('Monthly trend error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly trend' });
  }
});

/**
 * GET /api/analytics/statutory-breakdown?month=X&year=Y
 * EPF, SOCSO, EIS, PCB totals (employee + employer)
 */
router.get('/statutory-breakdown', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const period = await resolveMonthYear(companyId, req.query);
    if (!period) return res.json({ statutory: null });

    const result = await pool.query(`
      SELECT
        COALESCE(SUM(pi.epf_employee), 0) AS epf_employee,
        COALESCE(SUM(pi.epf_employer), 0) AS epf_employer,
        COALESCE(SUM(pi.socso_employee), 0) AS socso_employee,
        COALESCE(SUM(pi.socso_employer), 0) AS socso_employer,
        COALESCE(SUM(pi.eis_employee), 0) AS eis_employee,
        COALESCE(SUM(pi.eis_employer), 0) AS eis_employer,
        COALESCE(SUM(pi.pcb), 0) AS pcb,
        COUNT(DISTINCT pi.employee_id) AS employee_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, period.month, period.year]);

    const d = result.rows[0];
    const epfEmployee = parseFloat(d.epf_employee);
    const epfEmployer = parseFloat(d.epf_employer);
    const socsoEmployee = parseFloat(d.socso_employee);
    const socsoEmployer = parseFloat(d.socso_employer);
    const eisEmployee = parseFloat(d.eis_employee);
    const eisEmployer = parseFloat(d.eis_employer);
    const pcb = parseFloat(d.pcb);

    res.json({
      month: period.month,
      year: period.year,
      statutory: {
        epf: { employee: epfEmployee, employer: epfEmployer, total: epfEmployee + epfEmployer },
        socso: { employee: socsoEmployee, employer: socsoEmployer, total: socsoEmployee + socsoEmployer },
        eis: { employee: eisEmployee, employer: eisEmployer, total: eisEmployee + eisEmployer },
        pcb: { employee: pcb, total: pcb },
        totalEmployee: epfEmployee + socsoEmployee + eisEmployee + pcb,
        totalEmployer: epfEmployer + socsoEmployer + eisEmployer,
        grandTotal: epfEmployee + epfEmployer + socsoEmployee + socsoEmployer + eisEmployee + eisEmployer + pcb,
        employeeCount: parseInt(d.employee_count)
      }
    });
  } catch (error) {
    console.error('Statutory breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch statutory breakdown' });
  }
});

/**
 * GET /api/analytics/ot-analysis?month=X&year=Y
 * OT cost breakdown, avg OT per employee, top OT earners
 */
router.get('/ot-analysis', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const period = await resolveMonthYear(companyId, req.query);
    if (!period) return res.json({ otAnalysis: null });

    // Overall OT stats
    const overall = await pool.query(`
      SELECT
        COALESCE(SUM(pi.ot_amount), 0) AS total_ot_cost,
        COALESCE(SUM(pi.ot_hours), 0) AS total_ot_hours,
        COUNT(DISTINCT pi.employee_id) FILTER (WHERE pi.ot_hours > 0) AS employees_with_ot,
        COUNT(DISTINCT pi.employee_id) AS total_employees,
        CASE WHEN COUNT(DISTINCT pi.employee_id) FILTER (WHERE pi.ot_hours > 0) > 0
          THEN ROUND(SUM(pi.ot_hours)::numeric / COUNT(DISTINCT pi.employee_id) FILTER (WHERE pi.ot_hours > 0), 1)
          ELSE 0 END AS avg_ot_hours,
        CASE WHEN COUNT(DISTINCT pi.employee_id) FILTER (WHERE pi.ot_hours > 0) > 0
          THEN ROUND(SUM(pi.ot_amount)::numeric / COUNT(DISTINCT pi.employee_id) FILTER (WHERE pi.ot_hours > 0), 2)
          ELSE 0 END AS avg_ot_cost
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, period.month, period.year]);

    // Top 10 OT earners
    const topOT = await pool.query(`
      SELECT e.name, e.employee_id AS emp_code,
        COALESCE(pi.ot_hours, 0) AS ot_hours,
        COALESCE(pi.ot_amount, 0) AS ot_amount
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
        AND pi.ot_hours > 0
      ORDER BY pi.ot_amount DESC
      LIMIT 10
    `, [companyId, period.month, period.year]);

    // Previous month OT for comparison
    let prevMonth = period.month - 1;
    let prevYear = period.year;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }

    const prevOT = await pool.query(`
      SELECT COALESCE(SUM(pi.ot_amount), 0) AS total_ot_cost,
             COALESCE(SUM(pi.ot_hours), 0) AS total_ot_hours
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1
        AND pr.month = $2 AND pr.year = $3
        AND pr.status IN ('finalized', 'approved')
    `, [companyId, prevMonth, prevYear]);

    const d = overall.rows[0];
    const prevOTCost = parseFloat(prevOT.rows[0].total_ot_cost);
    const currentOTCost = parseFloat(d.total_ot_cost);
    const otCostChange = prevOTCost > 0 ? ((currentOTCost - prevOTCost) / prevOTCost * 100).toFixed(1) : null;

    res.json({
      month: period.month,
      year: period.year,
      otAnalysis: {
        totalOTCost: currentOTCost,
        totalOTHours: parseFloat(d.total_ot_hours),
        employeesWithOT: parseInt(d.employees_with_ot),
        totalEmployees: parseInt(d.total_employees),
        avgOTHours: parseFloat(d.avg_ot_hours),
        avgOTCost: parseFloat(d.avg_ot_cost),
        otCostChange: otCostChange ? parseFloat(otCostChange) : null,
        topOTEarners: topOT.rows.map(r => ({
          name: r.name,
          empCode: r.emp_code,
          otHours: parseFloat(r.ot_hours),
          otAmount: parseFloat(r.ot_amount)
        }))
      }
    });
  } catch (error) {
    console.error('OT analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch OT analysis' });
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

    const activeCount = await pool.query(`
      SELECT COUNT(*) AS count FROM employees
      WHERE company_id = $1 AND status = 'active'
    `, [companyId]);

    const data = result.rows[0];
    const workingDays = Math.min(now.getDate(), 22);
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

    const latest = await getLatestPayrollPeriod(companyId);
    if (!latest) return res.json({ insights: ['No payroll data available for analysis.'] });

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
