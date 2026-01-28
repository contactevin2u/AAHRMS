/**
 * Malaysian Statutory Deductions Calculator
 * Calculates EPF, SOCSO, EIS based on salary components
 *
 * EPF Base = Basic + Commission + Bonus (excludes Allowance and OT)
 * SOCSO/EIS based on standard Malaysian contribution tables
 */

// SOCSO Contribution Table (2024 rates)
// Format: [maxWage, employeeContrib, employerContrib]
const SOCSO_TABLE = [
  [30, 0.10, 0.40],
  [50, 0.20, 0.70],
  [70, 0.30, 1.00],
  [100, 0.40, 1.30],
  [140, 0.60, 1.90],
  [200, 0.85, 2.65],
  [300, 1.25, 3.85],
  [400, 1.75, 5.35],
  [500, 2.25, 6.85],
  [600, 2.75, 8.35],
  [700, 3.25, 9.85],
  [800, 3.75, 11.35],
  [900, 4.25, 12.85],
  [1000, 4.75, 14.35],
  [1100, 5.25, 15.85],
  [1200, 5.75, 17.35],
  [1300, 6.25, 18.85],
  [1400, 6.75, 20.35],
  [1500, 7.25, 21.85],
  [1600, 7.75, 23.35],
  [1700, 8.25, 24.85],
  [1800, 8.75, 26.35],
  [1900, 9.25, 27.85],
  [2000, 9.75, 29.35],
  [2100, 10.25, 30.85],
  [2200, 10.75, 32.35],
  [2300, 11.25, 33.85],
  [2400, 11.75, 35.35],
  [2500, 12.25, 36.85],
  [2600, 12.75, 38.35],
  [2700, 13.25, 39.85],
  [2800, 13.75, 41.35],
  [2900, 14.25, 42.85],
  [3000, 14.75, 44.35],
  [3100, 15.25, 45.85],
  [3200, 15.75, 47.35],
  [3300, 16.25, 48.85],
  [3400, 16.75, 50.35],
  [3500, 17.25, 51.85],
  [3600, 17.75, 53.35],
  [3700, 18.25, 54.85],
  [3800, 18.75, 56.35],
  [3900, 19.25, 57.85],
  [4000, 19.75, 59.35],
  [4100, 20.25, 60.85],
  [4200, 20.75, 62.35],
  [4300, 21.25, 63.85],
  [4400, 21.75, 65.35],
  [4500, 22.25, 66.85],
  [4600, 22.75, 68.35],
  [4700, 23.25, 69.85],
  [4800, 23.75, 71.35],
  [4900, 24.25, 72.85],
  [5000, 24.75, 74.35],
  [5100, 25.25, 75.85],
  [5200, 25.75, 77.35],
  [5300, 26.25, 78.85],
  [5400, 26.75, 80.35],
  [5500, 27.25, 81.85],
  [5600, 27.75, 83.35],
  [5700, 28.25, 84.85],
  [5800, 28.75, 86.35],
  [5900, 29.25, 87.85],
  [6000, 29.75, 89.35],
  // For wages above 6000, max contribution applies
  [Infinity, 29.75, 104.15]
];

// EIS Contribution Table (2024 rates - corrected to match official PERKESO rates)
// Format: [maxWage, employeeContrib, employerContrib]
const EIS_TABLE = [
  [30, 0.05, 0.05],
  [50, 0.10, 0.10],
  [70, 0.15, 0.15],
  [100, 0.20, 0.20],
  [140, 0.25, 0.25],
  [200, 0.35, 0.35],
  [300, 0.50, 0.50],
  [400, 0.70, 0.70],
  [500, 0.90, 0.90],
  [600, 1.10, 1.10],
  [700, 1.30, 1.30],
  [800, 1.50, 1.50],
  [900, 1.70, 1.70],
  [1000, 1.90, 1.90],
  [1100, 2.10, 2.10],
  [1200, 2.30, 2.30],
  [1300, 2.50, 2.50],
  [1400, 2.70, 2.70],
  [1500, 2.90, 2.90],
  [1600, 3.10, 3.10],
  [1700, 3.30, 3.30],
  [1800, 3.50, 3.50],
  [1900, 3.70, 3.70],
  [2000, 3.90, 3.90],
  [2100, 4.10, 4.10],
  [2200, 4.30, 4.30],
  [2300, 4.50, 4.50],
  [2400, 4.70, 4.70],
  [2500, 4.90, 4.90],
  [2600, 5.10, 5.10],
  [2700, 5.30, 5.30],
  [2800, 5.50, 5.50],
  [2900, 5.70, 5.70],
  [3000, 5.90, 5.90],
  [3100, 6.10, 6.10],
  [3200, 6.30, 6.30],
  [3300, 6.50, 6.50],
  [3400, 6.70, 6.70],
  [3500, 6.90, 6.90],
  [3600, 7.10, 7.10],
  [3700, 7.30, 7.30],
  [3800, 7.50, 7.50],
  [3900, 7.70, 7.70],
  [4000, 7.90, 7.90],
  [4100, 8.10, 8.10],
  [4200, 8.30, 8.30],
  [4300, 8.50, 8.50],
  [4400, 8.70, 8.70],
  [4500, 8.90, 8.90],
  [4600, 9.10, 9.10],
  [4700, 9.30, 9.30],
  [4800, 9.50, 9.50],
  [4900, 9.70, 9.70],
  [5000, 9.90, 9.90],
  // For wages above 5000, max contribution applies
  [Infinity, 11.90, 11.90]
];

/**
 * Calculate EPF contributions
 * EPF Base = Basic + Commission + Bonus (excludes Allowance and OT)
 *
 * Malaysian EPF rates (2024):
 * - Employee: 11% (standard), can be 0% for foreign workers
 * - Employer: 13% for wages <= RM5000, 12% for wages > RM5000
 *
 * @param {number} basic - Basic salary
 * @param {number} commission - Commission amount
 * @param {number} bonus - Bonus amount
 * @param {number} employeeRate - Employee EPF rate (default 11%)
 * @param {number} employerRateOverride - Override employer rate (if not set, uses tiered rate)
 * @returns {object} { employee, employer, base }
 */
function calculateEPF(basic, commission = 0, bonus = 0, employeeRate = 0.11, employerRateOverride = null) {
  const rawBase = (basic || 0) + (commission || 0) + (bonus || 0);

  // EPF contributions are calculated on wage bands (rounded up to nearest RM100)
  // Exception: Commission-only employees with bonus (basic=0, bonus>0) use raw base without rounding
  const isCommissionOnlyWithBonus = (basic || 0) === 0 && (bonus || 0) > 0;
  const epfBase = isCommissionOnlyWithBonus ? rawBase : Math.ceil(rawBase / 100) * 100;

  // Employer rate: 13% for wages <= RM5000, 12% for wages > RM5000
  const employerRate = employerRateOverride !== null ? employerRateOverride : (rawBase <= 5000 ? 0.13 : 0.12);

  // Calculate contributions and round to nearest ringgit
  const employee = Math.round(epfBase * employeeRate);
  const employer = Math.round(epfBase * employerRate);

  return {
    base: rawBase,
    roundedBase: epfBase,
    employee,
    employer
  };
}

/**
 * Calculate SOCSO contributions using contribution table
 *
 * @param {number} wages - Total wages for SOCSO calculation
 * @returns {object} { employee, employer }
 */
function calculateSOCSO(wages) {
  const wage = wages || 0;

  for (const [maxWage, ee, er] of SOCSO_TABLE) {
    if (wage <= maxWage) {
      return { employee: ee, employer: er };
    }
  }

  // Max contribution for wages above table
  return { employee: 29.75, employer: 104.15 };
}

/**
 * Calculate EIS contributions using contribution table
 *
 * @param {number} wages - Total wages for EIS calculation
 * @returns {object} { employee, employer }
 */
function calculateEIS(wages) {
  const wage = wages || 0;

  for (const [maxWage, ee, er] of EIS_TABLE) {
    if (wage <= maxWage) {
      return { employee: ee, employer: er };
    }
  }

  // Max contribution for wages above table
  return { employee: 11.90, employer: 11.90 };
}

/**
 * Calculate all statutory deductions
 *
 * @param {object} salary - Salary components
 * @param {number} salary.basic - Basic salary
 * @param {number} salary.commission - Commission
 * @param {number} salary.allowance - Fixed allowance
 * @param {number} salary.overtime - Overtime pay
 * @param {number} salary.bonus - Bonus
 * @returns {object} All statutory calculations
 */
function calculateStatutory(salary) {
  const { basic = 0, commission = 0, allowance = 0, overtime = 0, bonus = 0 } = salary;

  // EPF Base = Basic + Commission + Bonus (excludes Allowance and OT)
  const epf = calculateEPF(basic, commission, bonus);

  // Gross = all components
  const gross = basic + commission + allowance + overtime + bonus;

  // SOCSO/EIS based on BASIC + COMMISSION (excluding bonus, allowance, OT)
  // This matches the pattern in the image data
  const socsoBase = basic + commission;
  const socso = calculateSOCSO(socsoBase);
  const eis = calculateEIS(socsoBase);

  // PERKESO = SOCSO Employee + EIS Employee
  const perkeso = socso.employee + eis.employee;

  return {
    epf,
    socso,
    eis,
    perkeso,
    gross,
    summary: {
      epf_employee: epf.employee,
      epf_employer: epf.employer,
      socso_employee: socso.employee,
      socso_employer: socso.employer,
      eis_employee: eis.employee,
      eis_employer: eis.employer,
      perkeso: perkeso,
      total_employee_deductions: epf.employee + socso.employee + eis.employee,
      total_employer_contributions: epf.employer + socso.employer + eis.employer
    }
  };
}

/**
 * Calculate net pay
 *
 * @param {object} salary - Salary components
 * @param {number} pcb - PCB/tax amount (must be provided separately)
 * @param {number} otherDeductions - Other deductions
 * @returns {object} Net pay calculation
 */
function calculateNetPay(salary, pcb = 0, otherDeductions = 0) {
  const statutory = calculateStatutory(salary);
  const { basic = 0, commission = 0, allowance = 0, overtime = 0, bonus = 0, claims = 0 } = salary;

  const gross = basic + commission + allowance + overtime + bonus;
  const totalDeductions = statutory.epf.employee + statutory.socso.employee + statutory.eis.employee + pcb + otherDeductions;
  const netPay = gross - totalDeductions + claims;

  return {
    gross,
    statutory: statutory.summary,
    pcb,
    otherDeductions,
    totalDeductions,
    claims,
    netPay
  };
}

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculateStatutory,
  calculateNetPay,
  SOCSO_TABLE,
  EIS_TABLE
};
