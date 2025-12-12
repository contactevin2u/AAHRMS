/**
 * Malaysian Statutory Calculations
 * EPF, SOCSO, EIS, PCB rates for 2024/2025
 */

// Check if IC number is Malaysian format (YYMMDD-SS-NNNN or YYMMDDSSNNNN)
// Malaysian IC: 12 digits, first 6 are DOB (YYMMDD), next 2 are state code
const isMalaysianIC = (icNumber) => {
  if (!icNumber) return false;

  // Remove dashes and spaces
  const cleanIC = icNumber.replace(/[-\s]/g, '');

  // Must be 12 digits
  if (!/^\d{12}$/.test(cleanIC)) return false;

  // Validate date portion (YYMMDD)
  const year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  // Basic date validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // State codes (00-59 are valid Malaysian states)
  const stateCode = parseInt(cleanIC.substring(6, 8));
  // State codes 01-16 are Malaysian states, 21-59 are for born outside Malaysia but are still citizens
  // Foreign workers typically have passport numbers, not IC

  return true;
};

// Calculate age from Malaysian IC number
const calculateAgeFromIC = (icNumber) => {
  if (!icNumber) return null;

  const cleanIC = icNumber.replace(/[-\s]/g, '');
  if (cleanIC.length < 6) return null;

  const year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  // Determine century (00-24 = 2000s, 25-99 = 1900s)
  // As of 2025, anyone born in 2000 is 25, so 25+ is likely 1900s
  const currentYear = new Date().getFullYear();
  const currentYearShort = currentYear % 100;
  const fullYear = year <= currentYearShort ? 2000 + year : 1900 + year;

  const birthDate = new Date(fullYear, month - 1, day);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// EPF Contribution Rates (effective 2024)
// Employee: 11% standard, 0% for age > 60
// Employer: 13% (salary <= RM5000) or 12% (salary > RM5000), 4% for age > 60
// Non-Malaysian: Different rates may apply (simplified to same for now)
const calculateEPF = (grossSalary, age = 30, contributionType = 'normal', isMalaysian = true) => {
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

// EIS (Employment Insurance System) Contribution Table 2024
// Based on official PERKESO EIS contribution table
const EIS_TABLE = [
  { min: 0, max: 30, ee: 0.05, er: 0.05 },
  { min: 30.01, max: 50, ee: 0.10, er: 0.10 },
  { min: 50.01, max: 70, ee: 0.15, er: 0.15 },
  { min: 70.01, max: 100, ee: 0.20, er: 0.20 },
  { min: 100.01, max: 140, ee: 0.25, er: 0.25 },
  { min: 140.01, max: 200, ee: 0.35, er: 0.35 },
  { min: 200.01, max: 300, ee: 0.50, er: 0.50 },
  { min: 300.01, max: 400, ee: 0.70, er: 0.70 },
  { min: 400.01, max: 500, ee: 0.90, er: 0.90 },
  { min: 500.01, max: 600, ee: 1.10, er: 1.10 },
  { min: 600.01, max: 700, ee: 1.30, er: 1.30 },
  { min: 700.01, max: 800, ee: 1.50, er: 1.50 },
  { min: 800.01, max: 900, ee: 1.70, er: 1.70 },
  { min: 900.01, max: 1000, ee: 1.90, er: 1.90 },
  { min: 1000.01, max: 1100, ee: 2.10, er: 2.10 },
  { min: 1100.01, max: 1200, ee: 2.30, er: 2.30 },
  { min: 1200.01, max: 1300, ee: 2.50, er: 2.50 },
  { min: 1300.01, max: 1400, ee: 2.70, er: 2.70 },
  { min: 1400.01, max: 1500, ee: 2.90, er: 2.90 },
  { min: 1500.01, max: 1600, ee: 3.10, er: 3.10 },
  { min: 1600.01, max: 1700, ee: 3.30, er: 3.30 },
  { min: 1700.01, max: 1800, ee: 3.50, er: 3.50 },
  { min: 1800.01, max: 1900, ee: 3.70, er: 3.70 },
  { min: 1900.01, max: 2000, ee: 3.90, er: 3.90 },
  { min: 2000.01, max: 2100, ee: 4.10, er: 4.10 },
  { min: 2100.01, max: 2200, ee: 4.30, er: 4.30 },
  { min: 2200.01, max: 2300, ee: 4.50, er: 4.50 },
  { min: 2300.01, max: 2400, ee: 4.70, er: 4.70 },
  { min: 2400.01, max: 2500, ee: 4.90, er: 4.90 },
  { min: 2500.01, max: 2600, ee: 5.10, er: 5.10 },
  { min: 2600.01, max: 2700, ee: 5.30, er: 5.30 },
  { min: 2700.01, max: 2800, ee: 5.50, er: 5.50 },
  { min: 2800.01, max: 2900, ee: 5.70, er: 5.70 },
  { min: 2900.01, max: 3000, ee: 5.90, er: 5.90 },
  { min: 3000.01, max: 3100, ee: 6.10, er: 6.10 },
  { min: 3100.01, max: 3200, ee: 6.30, er: 6.30 },
  { min: 3200.01, max: 3300, ee: 6.50, er: 6.50 },
  { min: 3300.01, max: 3400, ee: 6.70, er: 6.70 },
  { min: 3400.01, max: 3500, ee: 6.90, er: 6.90 },
  { min: 3500.01, max: 3600, ee: 7.10, er: 7.10 },
  { min: 3600.01, max: 3700, ee: 7.30, er: 7.30 },
  { min: 3700.01, max: 3800, ee: 7.50, er: 7.50 },
  { min: 3800.01, max: 3900, ee: 7.70, er: 7.70 },
  { min: 3900.01, max: 4000, ee: 7.90, er: 7.90 },
  { min: 4000.01, max: 4100, ee: 8.10, er: 8.10 },
  { min: 4100.01, max: 4200, ee: 8.30, er: 8.30 },
  { min: 4200.01, max: 4300, ee: 8.50, er: 8.50 },
  { min: 4300.01, max: 4400, ee: 8.70, er: 8.70 },
  { min: 4400.01, max: 4500, ee: 8.90, er: 8.90 },
  { min: 4500.01, max: 4600, ee: 9.10, er: 9.10 },
  { min: 4600.01, max: 4700, ee: 9.30, er: 9.30 },
  { min: 4700.01, max: 4800, ee: 9.50, er: 9.50 },
  { min: 4800.01, max: 4900, ee: 9.70, er: 9.70 },
  { min: 4900.01, max: 5000, ee: 9.90, er: 9.90 },
];

// EIS (Employment Insurance System)
// Uses contribution table, ceiling RM5000
const calculateEIS = (grossSalary, age = 30) => {
  // EIS not applicable for age >= 57
  if (age >= 57) {
    return { employee: 0, employer: 0 };
  }

  // EIS ceiling is RM5000
  if (grossSalary > 5000) {
    // Max contribution for salary > RM5000
    return { employee: 9.90, employer: 9.90 };
  }

  const bracket = EIS_TABLE.find(b => grossSalary >= b.min && grossSalary <= b.max);

  if (!bracket) {
    return { employee: 0, employer: 0 };
  }

  return {
    employee: bracket.ee,
    employer: bracket.er
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

// Get employee age - first try IC number, then date_of_birth
const getEmployeeAge = (employee) => {
  // Try to get age from Malaysian IC first
  if (employee.ic_number) {
    const ageFromIC = calculateAgeFromIC(employee.ic_number);
    if (ageFromIC !== null && ageFromIC >= 0 && ageFromIC <= 120) {
      return ageFromIC;
    }
  }

  // Fall back to date_of_birth
  if (employee.date_of_birth) {
    return calculateAge(employee.date_of_birth);
  }

  return 30; // Default age
};

// Calculate all statutory deductions
// IMPORTANT: Only basic, commission, and bonus are subject to statutory deductions
// OT and allowance are NOT subject to EPF, SOCSO, EIS, PCB
// ytdData is optional - contains year-to-date figures for accurate PCB calculation
const calculateAllStatutory = (grossSalary, employee = {}, month = null, ytdData = null) => {
  // Determine if employee is Malaysian based on IC format
  const isMalaysian = isMalaysianIC(employee.ic_number);

  // Get age from IC or DOB
  const age = getEmployeeAge(employee);

  const maritalStatus = employee.marital_status || 'single';
  const spouseWorking = employee.spouse_working || false;
  const childrenCount = employee.children_count || 0;

  // Calculate statutory contributions
  // EPF, SOCSO, EIS apply to all employees regardless of salary amount (even RM 0 salary)
  const epf = calculateEPF(grossSalary, age, 'normal', isMalaysian);
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

// =====================================================
// OT CALCULATION
// =====================================================
// OT Rate: 1.0x (flat rate per hour)
// Public Holiday: Extra 1.0x daily rate (on top of normal pay)
// OT on Public Holiday: Still 1.0x (no extra multiplier for OT itself)

// Selangor Public Holidays 2024/2025
const SELANGOR_PUBLIC_HOLIDAYS = {
  2024: [
    '2024-01-01', // New Year
    '2024-01-25', // Thaipusam
    '2024-02-01', // Federal Territory Day
    '2024-02-10', // Chinese New Year
    '2024-02-11', // Chinese New Year (2nd day)
    '2024-03-28', // Nuzul Al-Quran
    '2024-04-10', // Hari Raya Aidilfitri
    '2024-04-11', // Hari Raya Aidilfitri (2nd day)
    '2024-05-01', // Labour Day
    '2024-05-22', // Wesak Day
    '2024-06-03', // Agong's Birthday
    '2024-06-17', // Hari Raya Aidiladha
    '2024-07-07', // Awal Muharram
    '2024-08-31', // Merdeka Day
    '2024-09-16', // Malaysia Day
    '2024-09-16', // Prophet Muhammad's Birthday
    '2024-10-31', // Deepavali
    '2024-12-11', // Sultan of Selangor's Birthday
    '2024-12-25', // Christmas
  ],
  2025: [
    '2025-01-01', // New Year
    '2025-01-14', // Thaipusam (estimated)
    '2025-01-29', // Chinese New Year
    '2025-01-30', // Chinese New Year (2nd day)
    '2025-02-01', // Federal Territory Day
    '2025-03-17', // Nuzul Al-Quran (estimated)
    '2025-03-31', // Hari Raya Aidilfitri (estimated)
    '2025-04-01', // Hari Raya Aidilfitri (2nd day)
    '2025-05-01', // Labour Day
    '2025-05-12', // Wesak Day (estimated)
    '2025-06-02', // Agong's Birthday
    '2025-06-07', // Hari Raya Aidiladha (estimated)
    '2025-06-27', // Awal Muharram (estimated)
    '2025-08-31', // Merdeka Day
    '2025-09-05', // Prophet Muhammad's Birthday (estimated)
    '2025-09-16', // Malaysia Day
    '2025-10-20', // Deepavali (estimated)
    '2025-12-11', // Sultan of Selangor's Birthday
    '2025-12-25', // Christmas
  ]
};

// Check if a date is a public holiday in Selangor
const isPublicHoliday = (dateStr, year = null) => {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  const y = year || date.getFullYear();
  const dateFormatted = date.toISOString().split('T')[0];

  const holidays = SELANGOR_PUBLIC_HOLIDAYS[y] || [];
  return holidays.includes(dateFormatted);
};

// Count public holidays in a given month
const countPublicHolidaysInMonth = (year, month) => {
  const holidays = SELANGOR_PUBLIC_HOLIDAYS[year] || [];
  return holidays.filter(h => {
    const d = new Date(h);
    return d.getMonth() + 1 === month;
  }).length;
};

// Get list of public holidays in a month
const getPublicHolidaysInMonth = (year, month) => {
  const holidays = SELANGOR_PUBLIC_HOLIDAYS[year] || [];
  return holidays.filter(h => {
    const d = new Date(h);
    return d.getMonth() + 1 === month;
  });
};

// Calculate OT amount
// OT Rate: 1.0x per hour (flat rate)
// basicSalary is used to calculate the hourly rate
const calculateOT = (basicSalary, otHours, workingDaysInMonth = 22) => {
  if (!otHours || otHours <= 0) return 0;

  // OT rate is 1.0x
  const OT_RATE = 1.0;

  // Calculate hourly rate: basic salary / working days / 8 hours
  const dailyRate = basicSalary / workingDaysInMonth;
  const hourlyRate = dailyRate / 8;

  // OT amount = hourly rate × OT hours × OT rate multiplier
  const otAmount = hourlyRate * otHours * OT_RATE;

  return Math.round(otAmount * 100) / 100;
};

// Calculate public holiday extra pay
// If employee works on public holiday, they get extra 1.0x daily rate
const calculatePublicHolidayPay = (basicSalary, publicHolidayDaysWorked, workingDaysInMonth = 22) => {
  if (!publicHolidayDaysWorked || publicHolidayDaysWorked <= 0) return 0;

  // Extra rate is 1.0x daily rate
  const PH_EXTRA_RATE = 1.0;

  const dailyRate = basicSalary / workingDaysInMonth;
  const phPay = dailyRate * publicHolidayDaysWorked * PH_EXTRA_RATE;

  return Math.round(phPay * 100) / 100;
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculatePCBSimple,
  calculateAge,
  calculateAgeFromIC,
  getEmployeeAge,
  isMalaysianIC,
  calculateAllStatutory,
  TAX_BRACKETS,
  // OT and Public Holiday functions
  calculateOT,
  calculatePublicHolidayPay,
  isPublicHoliday,
  countPublicHolidaysInMonth,
  getPublicHolidaysInMonth,
  SELANGOR_PUBLIC_HOLIDAYS
};
