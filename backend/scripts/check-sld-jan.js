require('dotenv').config();
const pool = require('../db');

(async () => {
  try {
    // Get current payroll items for SLD Jan 2026 (payroll_run_id = 432)
    const items = await pool.query(
      `SELECT pi.id, pi.employee_id, e.name, e.employee_id as emp_code,
        pi.basic_salary, pi.ot_hours, pi.ot_amount, pi.gross_salary, pi.net_pay,
        pi.fixed_allowance, pi.commission_amount, pi.incentive_amount,
        pi.epf_employee, pi.socso_employee, pi.eis_employee, pi.pcb,
        pi.total_deductions, pi.attendance_bonus, pi.other_earnings
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = 432
      ORDER BY e.employee_id`
    );

    console.log('=== SLD Jan 2026 Payroll Items (run_id=432) ===');
    items.rows.forEach(r => {
      console.log(`${r.emp_code} | ${r.name} | basic: ${r.basic_salary} | ot_hrs: ${r.ot_hours} | ot: ${r.ot_amount} | gross: ${r.gross_salary} | net: ${r.net_pay} | epf: ${r.epf_employee} | socso: ${r.socso_employee} | eis: ${r.eis_employee} | pcb: ${r.pcb} | deductions: ${r.total_deductions} | pi_id: ${r.id}`);
    });

    // Search for the 3 employees
    console.log('\n=== Searching employees ===');
    const emp = await pool.query(
      "SELECT id, employee_id, name FROM employees WHERE company_id = 3 AND (name ILIKE '%atikah%' OR name ILIKE '%noorayuni%' OR name ILIKE '%darwisyah%')"
    );
    emp.rows.forEach(r => console.log(`id: ${r.id} | ${r.employee_id} | ${r.name}`));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
