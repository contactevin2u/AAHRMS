/**
 * EA Form (Borang EA) Generator
 *
 * Generates Form EA/E data for Malaysian tax purposes.
 * Form EA is the yearly statement of remuneration from employer to employee.
 *
 * Must be provided to employees by end of February each year for the previous year.
 *
 * Sections covered:
 * A. Employer's particulars
 * B. Employee's particulars
 * C. Remuneration for the year
 * D. Benefits in kind
 * E. Deductions for EPF and PCB
 */

const pool = require('../db');

/**
 * Generate EA form data for a single employee
 * @param {number} employeeId - Employee ID
 * @param {number} year - Tax year
 * @returns {Object} EA form data
 */
async function generateEAFormData(employeeId, year) {
  // Get employee details
  const empResult = await pool.query(`
    SELECT e.*,
           c.name as company_name,
           c.registration_no as company_reg_no,
           c.address as company_address,
           c.employer_epf_no,
           c.employer_income_tax_no
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    WHERE e.id = $1
  `, [employeeId]);

  if (empResult.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const emp = empResult.rows[0];

  // Get all payroll data for the year
  const payrollResult = await pool.query(`
    SELECT
      pi.*,
      pr.month,
      pr.year
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pi.employee_id = $1
      AND pr.year = $2
      AND pr.status = 'finalized'
    ORDER BY pr.month
  `, [employeeId, year]);

  // Calculate totals
  let totalGrossSalary = 0;
  let totalAllowances = 0;
  let totalOT = 0;
  let totalBonus = 0;
  let totalCommission = 0;
  let totalIncentives = 0;
  let totalOtherPayments = 0;
  let totalEPFEmployee = 0;
  let totalPCB = 0;
  let totalSOCSO = 0;
  let totalEIS = 0;
  let totalClaims = 0;

  const monthlyBreakdown = [];

  for (const pi of payrollResult.rows) {
    totalGrossSalary += parseFloat(pi.basic_salary) || 0;
    totalAllowances += parseFloat(pi.fixed_allowance) || 0;
    totalOT += parseFloat(pi.ot_amount) || 0;
    totalBonus += parseFloat(pi.bonus_amount) || 0;
    totalCommission += parseFloat(pi.commission_amount) || 0;
    totalIncentives += parseFloat(pi.incentive_amount) || 0;
    totalClaims += parseFloat(pi.claims_amount) || 0;
    totalEPFEmployee += parseFloat(pi.epf_employee) || 0;
    totalPCB += parseFloat(pi.pcb) || 0;
    totalSOCSO += parseFloat(pi.socso_employee) || 0;
    totalEIS += parseFloat(pi.eis_employee) || 0;

    monthlyBreakdown.push({
      month: pi.month,
      basic_salary: parseFloat(pi.basic_salary) || 0,
      allowances: parseFloat(pi.fixed_allowance) || 0,
      ot: parseFloat(pi.ot_amount) || 0,
      gross: parseFloat(pi.gross_salary) || 0,
      epf: parseFloat(pi.epf_employee) || 0,
      pcb: parseFloat(pi.pcb) || 0,
      net: parseFloat(pi.net_pay) || 0
    });
  }

  // Get Benefits in Kind (BIK) if applicable
  const bikResult = await pool.query(`
    SELECT * FROM benefits_in_kind
    WHERE employee_id = $1
      AND EXTRACT(YEAR FROM effective_date) = $2
      AND is_active = TRUE
  `, [employeeId, year]);

  let totalBIKValue = 0;
  const bikItems = [];

  for (const bik of bikResult.rows) {
    const value = parseFloat(bik.value) || 0;
    totalBIKValue += value;
    bikItems.push({
      description: bik.description,
      value: value
    });
  }

  // Calculate total employment income
  const totalEmploymentIncome = totalGrossSalary + totalAllowances + totalOT +
    totalBonus + totalCommission + totalIncentives;

  // Form EA structure
  const eaForm = {
    // Section A: Employer's Particulars
    employer: {
      name: emp.company_name,
      registration_no: emp.company_reg_no,
      address: emp.company_address,
      epf_no: emp.employer_epf_no,
      income_tax_no: emp.employer_income_tax_no
    },

    // Section B: Employee's Particulars
    employee: {
      name: emp.name,
      ic_no: emp.ic_number,
      old_ic_no: emp.old_ic_number || null,
      passport_no: emp.passport_no || null,
      tax_no: emp.tax_no || null,
      employee_no: emp.employee_id,
      designation: emp.position || emp.designation,
      commencement_date: emp.join_date,
      cessation_date: emp.resign_date || null
    },

    // Section C: Remuneration
    remuneration: {
      // C1: Salary/wages/leave pay/fees/bonus (cash)
      salary_wages: round2(totalGrossSalary),
      allowances: round2(totalAllowances),
      bonus: round2(totalBonus),
      commission: round2(totalCommission),
      overtime: round2(totalOT),
      incentives: round2(totalIncentives),
      other_cash_payments: round2(totalOtherPayments),

      // C2: Total cash remuneration
      total_cash_remuneration: round2(totalEmploymentIncome),

      // C3: Benefits in kind (Section E)
      bik_total: round2(totalBIKValue),

      // C4: Value of living accommodation
      living_accommodation: 0,

      // C5: Total (C2 + C3 + C4)
      total_remuneration: round2(totalEmploymentIncome + totalBIKValue)
    },

    // Section D: Benefits in Kind details
    benefits_in_kind: {
      items: bikItems,
      total: round2(totalBIKValue)
    },

    // Section E: Deductions
    deductions: {
      epf: round2(totalEPFEmployee),
      socso: round2(totalSOCSO),
      eis: round2(totalEIS),
      pcb: round2(totalPCB),
      zakat: 0, // Can be added if tracked
      total_epf: round2(totalEPFEmployee),
      total_pcb: round2(totalPCB)
    },

    // Summary
    summary: {
      total_employment_income: round2(totalEmploymentIncome + totalBIKValue),
      total_epf: round2(totalEPFEmployee),
      total_pcb: round2(totalPCB),
      months_employed: monthlyBreakdown.length
    },

    // Monthly breakdown (for reference)
    monthly_breakdown: monthlyBreakdown,

    // Metadata
    year: year,
    generated_at: new Date().toISOString(),
    form_type: 'EA' // EA for private sector, E for government
  };

  return eaForm;
}

/**
 * Round to 2 decimal places
 */
function round2(num) {
  return Math.round((num || 0) * 100) / 100;
}

/**
 * Generate EA forms for all employees in a company for a given year
 * @param {number} companyId - Company ID
 * @param {number} year - Tax year
 * @returns {Array} Array of EA form data
 */
async function generateCompanyEAForms(companyId, year) {
  // Get all employees who had payroll in the year
  const employeesResult = await pool.query(`
    SELECT DISTINCT pi.employee_id
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    JOIN employees e ON pi.employee_id = e.id
    WHERE pr.year = $1
      AND pr.company_id = $2
      AND pr.status = 'finalized'
    ORDER BY pi.employee_id
  `, [year, companyId]);

  const forms = [];
  const errors = [];

  for (const row of employeesResult.rows) {
    try {
      const form = await generateEAFormData(row.employee_id, year);
      forms.push(form);
    } catch (error) {
      errors.push({
        employee_id: row.employee_id,
        error: error.message
      });
    }
  }

  return { forms, errors, total: forms.length };
}

/**
 * Save EA form to database
 * @param {number} employeeId - Employee ID
 * @param {number} year - Tax year
 * @param {Object} formData - Generated EA form data
 * @returns {Object} Saved record
 */
async function saveEAForm(employeeId, year, formData) {
  const result = await pool.query(`
    INSERT INTO ea_forms (
      employee_id, year, company_id,
      form_data, total_employment_income, total_epf, total_pcb,
      generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    ON CONFLICT (employee_id, year) DO UPDATE SET
      form_data = EXCLUDED.form_data,
      total_employment_income = EXCLUDED.total_employment_income,
      total_epf = EXCLUDED.total_epf,
      total_pcb = EXCLUDED.total_pcb,
      generated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [
    employeeId,
    year,
    formData.employer.company_id || null,
    JSON.stringify(formData),
    formData.summary.total_employment_income,
    formData.summary.total_epf,
    formData.summary.total_pcb
  ]);

  return result.rows[0];
}

/**
 * Generate EA form summary report
 * @param {number} companyId - Company ID
 * @param {number} year - Tax year
 * @returns {Object} Summary report
 */
async function getEAFormSummary(companyId, year) {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_forms,
      SUM(total_employment_income) as total_income,
      SUM(total_epf) as total_epf,
      SUM(total_pcb) as total_pcb
    FROM ea_forms
    WHERE company_id = $1 AND year = $2
  `, [companyId, year]);

  return {
    year,
    total_forms: parseInt(result.rows[0].total_forms) || 0,
    total_income: parseFloat(result.rows[0].total_income) || 0,
    total_epf: parseFloat(result.rows[0].total_epf) || 0,
    total_pcb: parseFloat(result.rows[0].total_pcb) || 0
  };
}

module.exports = {
  generateEAFormData,
  generateCompanyEAForms,
  saveEAForm,
  getEAFormSummary
};
