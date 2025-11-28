/**
 * Malaysian Statutory Calculations
 * EPF, SOCSO, EIS, PCB rates for 2024/2025
 */

// EPF Contribution Rates (effective 2024)
// Employee: 11% standard, 0% for age > 60
// Employer: 13% (salary <= RM5000) or 12% (salary > RM5000), 4% for age > 60
const calculateEPF = (grossSalary, age = 30, contributionType = 'normal') => {
  let employeeRate, employerRate;

  if (age > 60) {
    // Age over 60: Employee 0%, Employer 4%
    employeeRate = 0;
    employerRate = 0.04;
  } else {
    // Standard rates
    employeeRate = 0.11; // 11%
    employerRate = grossSalary <= 5000 ? 0.13 : 0.12; // 13% or 12%
  }

  // EPF wage ceiling is RM20,000 for contribution calculation
  const epfWage = Math.min(grossSalary, 20000);

  return {
    employee: Math.round(epfWage * employeeRate * 100) / 100,
    employer: Math.round(epfWage * employerRate * 100) / 100
  };
};

// SOCSO Contribution Table (2024)
// Category 1: Employment Injury + Invalidity (age < 60)
// Category 2: Employment Injury only (age >= 60)
const SOCSO_TABLE = [
  { min: 0, max: 30, ee: 0.10, er: 0.40 },
  { min: 30.01, max: 50, ee: 0.20, er: 0.70 },
  { min: 50.01, max: 70, ee: 0.30, er: 1.00 },
  { min: 70.01, max: 100, ee: 0.40, er: 1.40 },
  { min: 100.01, max: 140, ee: 0.60, er: 2.00 },
  { min: 140.01, max: 200, ee: 0.85, er: 2.70 },
  { min: 200.01, max: 300, ee: 1.25, er: 4.00 },
  { min: 300.01, max: 400, ee: 1.75, er: 5.50 },
  { min: 400.01, max: 500, ee: 2.25, er: 7.00 },
  { min: 500.01, max: 600, ee: 2.75, er: 8.50 },
  { min: 600.01, max: 700, ee: 3.25, er: 10.00 },
  { min: 700.01, max: 800, ee: 3.75, er: 11.50 },
  { min: 800.01, max: 900, ee: 4.25, er: 13.00 },
  { min: 900.01, max: 1000, ee: 4.75, er: 14.50 },
  { min: 1000.01, max: 1100, ee: 5.25, er: 16.00 },
  { min: 1100.01, max: 1200, ee: 5.75, er: 17.50 },
  { min: 1200.01, max: 1300, ee: 6.25, er: 19.00 },
  { min: 1300.01, max: 1400, ee: 6.75, er: 20.50 },
  { min: 1400.01, max: 1500, ee: 7.25, er: 22.00 },
  { min: 1500.01, max: 1600, ee: 7.75, er: 23.50 },
  { min: 1600.01, max: 1700, ee: 8.25, er: 25.00 },
  { min: 1700.01, max: 1800, ee: 8.75, er: 26.50 },
  { min: 1800.01, max: 1900, ee: 9.25, er: 28.00 },
  { min: 1900.01, max: 2000, ee: 9.75, er: 29.50 },
  { min: 2000.01, max: 2100, ee: 10.25, er: 31.00 },
  { min: 2100.01, max: 2200, ee: 10.75, er: 32.50 },
  { min: 2200.01, max: 2300, ee: 11.25, er: 34.00 },
  { min: 2300.01, max: 2400, ee: 11.75, er: 35.50 },
  { min: 2400.01, max: 2500, ee: 12.25, er: 37.00 },
  { min: 2500.01, max: 2600, ee: 12.75, er: 38.50 },
  { min: 2600.01, max: 2700, ee: 13.25, er: 40.00 },
  { min: 2700.01, max: 2800, ee: 13.75, er: 41.50 },
  { min: 2800.01, max: 2900, ee: 14.25, er: 43.00 },
  { min: 2900.01, max: 3000, ee: 14.75, er: 44.50 },
  { min: 3000.01, max: 3100, ee: 15.25, er: 46.00 },
  { min: 3100.01, max: 3200, ee: 15.75, er: 47.50 },
  { min: 3200.01, max: 3300, ee: 16.25, er: 49.00 },
  { min: 3300.01, max: 3400, ee: 16.75, er: 50.50 },
  { min: 3400.01, max: 3500, ee: 17.25, er: 52.00 },
  { min: 3500.01, max: 3600, ee: 17.75, er: 53.50 },
  { min: 3600.01, max: 3700, ee: 18.25, er: 55.00 },
  { min: 3700.01, max: 3800, ee: 18.75, er: 56.50 },
  { min: 3800.01, max: 3900, ee: 19.25, er: 58.00 },
  { min: 3900.01, max: 4000, ee: 19.75, er: 59.50 },
  { min: 4000.01, max: 5000, ee: 24.75, er: 69.05 },
];

const calculateSOCSO = (grossSalary, age = 30) => {
  // SOCSO ceiling is RM5000
  if (grossSalary > 5000) {
    // Max contribution for salary > RM5000
    return { employee: 24.75, employer: 69.05 };
  }

  const bracket = SOCSO_TABLE.find(b => grossSalary >= b.min && grossSalary <= b.max);

  if (!bracket) {
    return { employee: 0, employer: 0 };
  }

  // Category 2 (age >= 60): only employer contribution for employment injury
  if (age >= 60) {
    return { employee: 0, employer: bracket.er };
  }

  return {
    employee: bracket.ee,
    employer: bracket.er
  };
};

// EIS (Employment Insurance System)
// Rate: 0.2% each for employee and employer
// Ceiling: RM5000
const calculateEIS = (grossSalary, age = 30) => {
  // EIS not applicable for age >= 57
  if (age >= 57) {
    return { employee: 0, employer: 0 };
  }

  const eisWage = Math.min(grossSalary, 5000);
  const rate = 0.002; // 0.2%

  return {
    employee: Math.round(eisWage * rate * 100) / 100,
    employer: Math.round(eisWage * rate * 100) / 100
  };
};

// PCB (Monthly Tax Deduction) - LHDN Computerized Method
// Formula: Monthly PCB = [(P - M) × R + B] / n
// Where P = Chargeable Income, M = threshold, R = rate, B = base tax, n = remaining months
// Reference: https://actpayroll.com/complete-guide-to-pcb-calculations/

// Tax brackets with M (threshold), R (rate), B (base tax after rebate)
// B values for Category 1 & 3 (single/married with working spouse) include RM400 rebate
// B values for Category 2 (married with non-working spouse) include RM800 rebate
const TAX_BRACKETS = [
  { min: 0, max: 5000, M: 0, R: 0, B1: 0, B2: 0 },
  { min: 5001, max: 20000, M: 5000, R: 0.01, B1: -400, B2: -800 },
  { min: 20001, max: 35000, M: 20000, R: 0.03, B1: -250, B2: -650 },
  { min: 35001, max: 50000, M: 35000, R: 0.06, B1: 200, B2: -200 },
  { min: 50001, max: 70000, M: 50000, R: 0.11, B1: 1100, B2: 700 },
  { min: 70001, max: 100000, M: 70000, R: 0.19, B1: 3300, B2: 2900 },
  { min: 100001, max: 400000, M: 100000, R: 0.25, B1: 9000, B2: 8600 },
  { min: 400001, max: 600000, M: 400000, R: 0.26, B1: 84000, B2: 83600 },
  { min: 600001, max: 2000000, M: 600000, R: 0.28, B1: 136000, B2: 135600 },
  { min: 2000001, max: Infinity, M: 2000000, R: 0.30, B1: 528000, B2: 527600 }
];

const calculatePCB = (
  grossSalary,
  epfEmployee,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0,
  currentMonth = new Date().getMonth() + 1, // 1-12
  ytdGross = 0, // Year-to-date gross (excluding current month)
  ytdEPF = 0, // Year-to-date EPF (excluding current month)
  ytdPCB = 0, // Year-to-date PCB already paid
  ytdZakat = 0 // Year-to-date zakat paid
) => {
  // Remaining months in the year including current month
  const remainingMonths = 13 - currentMonth;

  // Calculate annual projected income
  // YTD income + (current month salary × remaining months)
  const projectedAnnualGross = ytdGross + (grossSalary * remainingMonths);

  // Calculate annual EPF (capped at RM4,000 for tax relief)
  const projectedAnnualEPF = ytdEPF + (epfEmployee * remainingMonths);
  const epfRelief = Math.min(projectedAnnualEPF, 4000);

  // Tax Reliefs (2024)
  const selfRelief = 9000; // Individual relief
  const lifeInsuranceRelief = 3000; // Life insurance/takaful (optional - using 0 for safety)
  const socsoRelief = 350; // SOCSO relief (max)
  const eisRelief = 350; // EIS relief (max)

  // Spouse relief - RM4,000 if spouse has no income
  const spouseRelief = (maritalStatus === 'married' && !spouseWorking) ? 4000 : 0;

  // Child relief - RM2,000 per child (under 18)
  // RM8,000 for child in higher education (simplified to RM2,000)
  const childRelief = childrenCount * 2000;

  // Total deductions from gross income
  const totalRelief = selfRelief + spouseRelief + childRelief + epfRelief + socsoRelief + eisRelief;

  // Chargeable Income (P)
  const chargeableIncome = Math.max(0, projectedAnnualGross - totalRelief);

  // Determine tax category
  // Category 1 & 3: Single OR Married with working spouse (RM400 rebate)
  // Category 2: Married with non-working spouse (RM800 rebate)
  const isCategory2 = maritalStatus === 'married' && !spouseWorking;

  // Find applicable tax bracket
  let bracket = TAX_BRACKETS[0];
  for (const b of TAX_BRACKETS) {
    if (chargeableIncome >= b.min && chargeableIncome <= b.max) {
      bracket = b;
      break;
    }
  }

  // Calculate annual tax using formula: (P - M) × R + B
  const B = isCategory2 ? bracket.B2 : bracket.B1;
  let annualTax = ((chargeableIncome - bracket.M) * bracket.R) + B;

  // Tax cannot be negative
  annualTax = Math.max(0, annualTax);

  // Calculate current month PCB
  // Formula: [(Annual Tax) - (YTD Zakat) - (YTD PCB already paid)] / remaining months
  let currentMonthPCB = (annualTax - ytdZakat - ytdPCB) / remainingMonths;

  // PCB cannot be negative
  currentMonthPCB = Math.max(0, currentMonthPCB);

  // Round to 2 decimal places, then round up to nearest 5 cents (LHDN requirement)
  currentMonthPCB = Math.floor(currentMonthPCB * 100) / 100;
  currentMonthPCB = Math.ceil(currentMonthPCB * 20) / 20; // Round to nearest 0.05

  // If PCB < RM10, set to 0 (LHDN rule)
  if (currentMonthPCB < 10) {
    currentMonthPCB = 0;
  }

  return currentMonthPCB;
};

// Simplified PCB calculation for single month (when no YTD data available)
const calculatePCBSimple = (
  grossSalary,
  epfEmployee,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0
) => {
  // Assume calculating for full year (month 1)
  return calculatePCB(
    grossSalary,
    epfEmployee,
    maritalStatus,
    spouseWorking,
    childrenCount,
    1, // January
    0, // No YTD gross
    0, // No YTD EPF
    0, // No YTD PCB
    0  // No YTD Zakat
  );
};

// Calculate age from date of birth
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return 30; // Default age if not provided

  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// Calculate all statutory deductions
// ytdData is optional - contains year-to-date figures for accurate PCB calculation
const calculateAllStatutory = (grossSalary, employee = {}, month = null, ytdData = null) => {
  const age = calculateAge(employee.date_of_birth);
  const maritalStatus = employee.marital_status || 'single';
  const spouseWorking = employee.spouse_working || false;
  const childrenCount = employee.children_count || 0;

  const epf = calculateEPF(grossSalary, age);
  const socso = calculateSOCSO(grossSalary, age);
  const eis = calculateEIS(grossSalary, age);

  // Calculate PCB with YTD data if available (for accurate LHDN calculation)
  let pcb;
  if (ytdData && month) {
    pcb = calculatePCB(
      grossSalary,
      epf.employee,
      maritalStatus,
      spouseWorking,
      childrenCount,
      month,
      ytdData.ytdGross || 0,
      ytdData.ytdEPF || 0,
      ytdData.ytdPCB || 0,
      ytdData.ytdZakat || 0
    );
  } else {
    // Use simplified calculation (assumes this is month 1 or standalone calculation)
    pcb = calculatePCBSimple(grossSalary, epf.employee, maritalStatus, spouseWorking, childrenCount);
  }

  const totalEmployeeDeductions = epf.employee + socso.employee + eis.employee + pcb;
  const totalEmployerContributions = epf.employer + socso.employer + eis.employer;
  const netSalary = grossSalary - totalEmployeeDeductions;

  return {
    epf,
    socso,
    eis,
    pcb,
    totalEmployeeDeductions,
    totalEmployerContributions,
    grossSalary,
    netSalary
  };
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculatePCBSimple,
  calculateAge,
  calculateAllStatutory,
  TAX_BRACKETS
};
