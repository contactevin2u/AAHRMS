/**
 * ESS Payslips Routes
 * Handles employee payslip viewing
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateEmployee } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');

// Get employee's payslips (only show finalized payrolls)
router.get('/', authenticateEmployee, asyncHandler(async (req, res) => {
  const { year } = req.query;

  let query = `
    SELECT pi.*, pr.month, pr.year, pr.status as run_status
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pi.employee_id = $1
      AND pr.status = 'finalized'
  `;
  const params = [req.employee.id];

  if (year) {
    query += ' AND pr.year = $2';
    params.push(year);
  }

  query += ' ORDER BY pr.year DESC, pr.month DESC';

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

// Get single payslip details - formatted like admin payslip
router.get('/:id', authenticateEmployee, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    SELECT
      pi.*,
      pr.month, pr.year, pr.status as run_status,
      e.employee_id as emp_code,
      e.name as employee_name,
      e.ic_number,
      e.epf_number,
      e.socso_number,
      e.tax_number,
      e.bank_name,
      e.bank_account_no,
      e.position,
      e.join_date,
      d.name as department_name,
      o.name as outlet_name,
      c.name as company_name,
      c.address as company_address,
      c.epf_number as company_epf,
      c.socso_number as company_socso,
      c.id as company_id
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    JOIN employees e ON pi.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN outlets o ON e.outlet_id = o.id
    LEFT JOIN companies c ON e.company_id = c.id
    WHERE pi.id = $1 AND pi.employee_id = $2
  `, [id, req.employee.id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Payslip');
  }

  const item = result.rows[0];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  // Format payslip in the same structure as admin endpoint
  const payslip = {
    company: {
      id: item.company_id,
      name: item.company_name || 'AA ALIVE SDN BHD',
      address: item.company_address || '',
      epf_number: item.company_epf || '',
      socso_number: item.company_socso || ''
    },
    employee: {
      code: item.emp_code,
      name: item.employee_name,
      ic_number: item.ic_number,
      epf_number: item.epf_number,
      socso_number: item.socso_number,
      tax_number: item.tax_number,
      department: item.department_name,
      outlet_name: item.outlet_name,
      position: item.position,
      join_date: item.join_date,
      bank_name: item.bank_name,
      bank_account_no: item.bank_account_no
    },
    period: {
      month: item.month,
      year: item.year,
      month_name: monthNames[item.month - 1]
    },
    earnings: {
      basic_salary: parseFloat(item.basic_salary) || 0,
      fixed_allowance: parseFloat(item.fixed_allowance) || 0,
      ot_hours: parseFloat(item.ot_hours) || 0,
      ot_amount: parseFloat(item.ot_amount) || 0,
      ph_days_worked: parseFloat(item.ph_days_worked) || 0,
      ph_pay: parseFloat(item.ph_pay) || 0,
      incentive_amount: parseFloat(item.incentive_amount) || 0,
      commission_amount: parseFloat(item.commission_amount) || 0,
      trade_commission_amount: parseFloat(item.trade_commission_amount) || 0,
      outstation_amount: parseFloat(item.outstation_amount) || 0,
      claims_amount: parseFloat(item.claims_amount) || 0,
      bonus: parseFloat(item.bonus) || 0
    },
    deductions: {
      unpaid_leave_days: parseFloat(item.unpaid_leave_days) || 0,
      unpaid_leave_deduction: parseFloat(item.unpaid_leave_deduction) || 0,
      epf_employee: parseFloat(item.epf_employee) || 0,
      socso_employee: parseFloat(item.socso_employee) || 0,
      eis_employee: parseFloat(item.eis_employee) || 0,
      pcb: parseFloat(item.pcb) || 0,
      advance_deduction: parseFloat(item.advance_deduction) || 0,
      other_deductions: parseFloat(item.other_deductions) || 0
    },
    employer_contributions: {
      epf_employer: parseFloat(item.epf_employer) || 0,
      socso_employer: parseFloat(item.socso_employer) || 0,
      eis_employer: parseFloat(item.eis_employer) || 0
    },
    totals: {
      gross_salary: parseFloat(item.gross_salary) || 0,
      total_deductions: parseFloat(item.total_deductions) || 0,
      net_pay: parseFloat(item.net_pay) || 0
    }
  };

  res.json(payslip);
}));

module.exports = router;
