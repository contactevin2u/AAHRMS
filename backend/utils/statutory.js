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
// KWSP rounds contributions to nearest RM (not cents)
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

  // KWSP rounds to nearest RM (not cents)
  return {
    employee: Math.round(epfWage * employeeRate),
    employer: Math.round(epfWage * employerRate)
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

// =====================================================
// PCB (Monthly Tax Deduction) - Full LHDN Computerized Method
// Reference: Official LHDN PCB Calculation Formula
// =====================================================
//
// FORMULA:
// 1. Normal STD = [(P - M) × R + B - (Z + X)] / (n + 1)
// 2. Additional STD = Total Tax - (Total STD for year + Z)
// 3. Current Month PCB = Normal STD + Additional STD
//
// WHERE:
// P = Chargeable Income for the year
//   = [E(Y-K) + (Y1-K1) + (Y2-K2)*n + (Yt-Kt)] - [D + S + DU + SU + (2000*C) + (ELP+LP1)]
//
// E(Y-K) = Accumulated net remuneration (gross - EPF) from previous months
// Y1 = Current month normal remuneration
// K1 = EPF on current month (subject to RM4,000/year cap)
// Y2 = Estimated future monthly remuneration (usually same as Y1)
// K2 = Estimated future EPF (subject to remaining cap)
// n = Remaining months after current month
// Yt = Additional remuneration (bonus, commission) for current month
// Kt = EPF on additional remuneration (subject to cap)
// D = Individual relief (RM9,000)
// S = Spouse relief (RM4,000 if not working)
// DU = Disabled individual relief (RM7,000)
// SU = Disabled spouse relief (RM6,000)
// C = Number of qualifying children
// ELP = Accumulated other deductions
// LP1 = Current month other deductions
// M = Tax bracket threshold
// R = Tax rate
// B = Base tax amount (after rebate)
// Z = Accumulated zakat paid
// X = Accumulated PCB paid

// Tax brackets for YA 2023/2024/2025 - LHDN official rates
// Source: https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-rate/
// B values = Cumulative tax at M - Rebate (RM400 for Category 1/3, RM800 for Category 2)
//
// Chargeable Income | Rate | Cumulative Tax
// 0 - 5,000         | 0%   | 0
// 5,001 - 20,000    | 1%   | 150
// 20,001 - 35,000   | 3%   | 600
// 35,001 - 50,000   | 6%   | 1,500
// 50,001 - 70,000   | 11%  | 3,700
// 70,001 - 100,000  | 19%  | 9,400
// 100,001 - 400,000 | 25%  | 84,400
// 400,001 - 600,000 | 26%  | 136,400
// 600,001 - 2,000,000 | 28% | 528,400
// Above 2,000,000   | 30%  | ...
const TAX_BRACKETS_LHDN = [
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

// Keep old name for backward compatibility
const TAX_BRACKETS = TAX_BRACKETS_LHDN;

/**
 * Get tax bracket for a given chargeable income
 */
const getTaxBracket = (chargeableIncome) => {
  for (const bracket of TAX_BRACKETS_LHDN) {
    if (chargeableIncome >= bracket.min && chargeableIncome <= bracket.max) {
      return bracket;
    }
  }
  return TAX_BRACKETS_LHDN[TAX_BRACKETS_LHDN.length - 1];
};

/**
 * Calculate annual tax using LHDN formula: (P - M) × R + B
 */
const calculateAnnualTax = (chargeableIncome, isCategory2 = false) => {
  const bracket = getTaxBracket(chargeableIncome);
  const B = isCategory2 ? bracket.B2 : bracket.B1;
  const tax = ((chargeableIncome - bracket.M) * bracket.R) + B;
  return Math.max(0, tax);
};

/**
 * Full LHDN PCB Calculation
 *
 * @param {Object} params - PCB calculation parameters
 * @param {number} params.normalRemuneration - Y1: Current month normal salary (basic + fixed allowance)
 * @param {number} params.additionalRemuneration - Yt: Bonus, commission, incentives for current month
 * @param {number} params.currentMonth - 1-12 (January = 1)
 * @param {number} params.accumulatedGross - E(Y): Total gross from previous months (Jan to previous month)
 * @param {number} params.accumulatedEPF - E(K): Total EPF from previous months
 * @param {number} params.accumulatedPCB - X: Total PCB paid from previous months
 * @param {number} params.accumulatedZakat - Z: Total zakat paid from previous months
 * @param {number} params.currentMonthZakat - Zakat for current month
 * @param {string} params.maritalStatus - 'single' or 'married'
 * @param {boolean} params.spouseWorking - true if spouse has income
 * @param {number} params.childrenCount - Number of qualifying children
 * @param {boolean} params.isDisabled - Employee is disabled (RM7,000 additional relief)
 * @param {boolean} params.spouseDisabled - Spouse is disabled (RM6,000 additional relief)
 * @param {number} params.otherDeductions - ELP + LP1: Life insurance, education fees, etc.
 * @param {number} params.epfRate - EPF rate (default 0.11 = 11%)
 * @returns {Object} - PCB calculation result with breakdown
 */
const calculatePCBFull = (params) => {
  const {
    normalRemuneration = 0,        // Y1
    additionalRemuneration = 0,    // Yt (bonus, commission)
    currentMonth = new Date().getMonth() + 1,
    accumulatedGross = 0,          // E(Y) - total gross Jan to previous month
    accumulatedEPF = 0,            // E(K) - total EPF Jan to previous month
    accumulatedPCB = 0,            // X - total PCB paid
    accumulatedZakat = 0,          // Z - total zakat paid (excluding current month)
    currentMonthZakat = 0,         // Zakat for current month
    maritalStatus = 'single',
    spouseWorking = false,
    childrenCount = 0,
    isDisabled = false,
    spouseDisabled = false,
    otherDeductions = 0,           // ELP + LP1
    epfRate = 0.11
  } = params;

  // EPF cap is RM4,000 per year for tax relief
  const EPF_CAP = 4000;

  // n = remaining months after current month
  // n+1 = remaining months including current month
  const n = 12 - currentMonth;
  const nPlus1 = n + 1;

  // Calculate EPF amounts
  const Y1 = normalRemuneration;
  const Yt = additionalRemuneration;
  const Y = accumulatedGross; // E(Y)
  const K = accumulatedEPF;   // E(K)

  // K1 = EPF on current month normal remuneration (subject to cap)
  const epfOnY1 = Math.round(Y1 * epfRate * 100) / 100;
  const remainingEPFCap = Math.max(0, EPF_CAP - K);
  const K1 = Math.min(epfOnY1, remainingEPFCap);

  // Kt = EPF on additional remuneration (subject to cap)
  const epfOnYt = Math.round(Yt * epfRate * 100) / 100;
  const remainingEPFCapAfterK1 = Math.max(0, EPF_CAP - K - K1);
  const Kt = Math.min(epfOnYt, remainingEPFCapAfterK1);

  // Y2 = Estimated future monthly remuneration (assume same as Y1)
  const Y2 = Y1;

  // K2 = Estimated future EPF per month (subject to remaining cap)
  // K2 = min(EPF on Y2, (RM4000 - K - K1 - Kt) / n) or K1, whichever is lower
  const epfOnY2 = Math.round(Y2 * epfRate * 100) / 100;
  const remainingEPFForFuture = Math.max(0, EPF_CAP - K - K1 - Kt);
  const K2 = n > 0 ? Math.min(epfOnY2, remainingEPFForFuture / n, K1) : 0;

  // Total EPF for tax relief (EK)
  const EK = K + K1 + (K2 * n) + Kt;
  const epfRelief = Math.min(EK, EPF_CAP);

  // Calculate E(Y-K) = accumulated net remuneration
  const EYminusK = Y - K;

  // Tax Reliefs
  const D = 9000;  // Individual relief
  const S = (maritalStatus === 'married' && !spouseWorking) ? 4000 : 0;  // Spouse relief
  const DU = isDisabled ? 7000 : 0;  // Disabled individual
  const SU = spouseDisabled ? 6000 : 0;  // Disabled spouse
  const C = childrenCount;  // Number of children
  const childRelief = 2000 * C;
  const ELP_LP1 = otherDeductions;

  // Total deductions
  const totalDeductions = D + S + DU + SU + childRelief + ELP_LP1;

  // Determine tax category
  // Category 1 & 3: Single OR Married with working spouse (RM400 rebate)
  // Category 2: Married with non-working spouse (RM800 rebate)
  const isCategory2 = maritalStatus === 'married' && !spouseWorking;

  // =====================================================
  // STEP 1: Calculate Normal STD (when Yt = 0)
  // =====================================================

  // P for normal calculation (without additional remuneration)
  // P = [E(Y-K) + (Y1-K1) + (Y2-K2)*n + (0-0)] - deductions
  const P_normal = (EYminusK + (Y1 - K1) + ((Y2 - K2) * n)) - totalDeductions;

  // Adjust P for EPF relief (EPF is already subtracted, but we need to ensure cap)
  const P_normalAdjusted = Math.max(0, P_normal);

  const bracket_normal = getTaxBracket(P_normalAdjusted);
  const M = bracket_normal.M;
  const R = bracket_normal.R;
  const B = isCategory2 ? bracket_normal.B2 : bracket_normal.B1;

  const Z = accumulatedZakat;
  const X = accumulatedPCB;

  // Normal STD = [(P - M) × R + B - (Z + X)] / (n + 1)
  let normalSTD = ((P_normalAdjusted - M) * R + B - (Z + X)) / nPlus1;
  normalSTD = Math.max(0, normalSTD);

  // =====================================================
  // STEP 2: Calculate Additional STD (when Yt > 0)
  // =====================================================

  let additionalSTD = 0;

  if (Yt > 0) {
    // Total STD for a year (if no additional remuneration)
    const totalSTDForYear = X + (normalSTD * nPlus1);

    // P with additional remuneration
    // P = [E(Y-K) + (Y1-K1) + (Y2-K2)*n + (Yt-Kt)] - deductions
    const P_withAdditional = (EYminusK + (Y1 - K1) + ((Y2 - K2) * n) + (Yt - Kt)) - totalDeductions;
    const P_withAdditionalAdjusted = Math.max(0, P_withAdditional);

    // Total Tax with additional remuneration
    const bracket_additional = getTaxBracket(P_withAdditionalAdjusted);
    const M_add = bracket_additional.M;
    const R_add = bracket_additional.R;
    const B_add = isCategory2 ? bracket_additional.B2 : bracket_additional.B1;

    const totalTax = (P_withAdditionalAdjusted - M_add) * R_add + B_add;

    // Additional STD = Total Tax - (Total STD for year + Z)
    additionalSTD = Math.max(0, totalTax - (totalSTDForYear + Z));
  }

  // =====================================================
  // STEP 3: Calculate Current Month PCB
  // =====================================================

  // Net STD = Normal STD - current month zakat
  const netSTD = Math.max(0, normalSTD - currentMonthZakat);

  // Current Month STD = Net STD + Additional STD
  let currentMonthSTD = netSTD + additionalSTD;

  // Round up to nearest 5 cents (LHDN requirement)
  currentMonthSTD = Math.ceil(currentMonthSTD * 20) / 20;

  // Return detailed breakdown
  return {
    // Final PCB amount
    pcb: currentMonthSTD,

    // Breakdown
    normalSTD: Math.round(normalSTD * 100) / 100,
    additionalSTD: Math.round(additionalSTD * 100) / 100,
    netSTD: Math.round(netSTD * 100) / 100,

    // Input values used
    Y1,
    K1,
    Y2,
    K2,
    Yt,
    Kt,
    n,
    nPlus1,

    // Chargeable income
    P_normal: Math.round(P_normalAdjusted * 100) / 100,
    P_withAdditional: Yt > 0 ? Math.round((EYminusK + (Y1 - K1) + ((Y2 - K2) * n) + (Yt - Kt) - totalDeductions) * 100) / 100 : null,

    // Tax bracket used
    M,
    R: R * 100, // as percentage
    B,

    // Accumulated values
    accumulatedGross: Y,
    accumulatedEPF: K,
    accumulatedPCB: X,
    accumulatedZakat: Z,

    // EPF breakdown
    epfRelief,
    totalEPF: EK,

    // Relief breakdown
    reliefs: {
      individual: D,
      spouse: S,
      disabledIndividual: DU,
      disabledSpouse: SU,
      children: childRelief,
      other: ELP_LP1,
      total: totalDeductions
    },

    // Category
    taxCategory: isCategory2 ? 2 : 1
  };
};

/**
 * Simplified PCB calculation (backward compatible)
 * Uses the full LHDN formula but with simplified inputs
 */
const calculatePCB = (
  grossSalary,
  epfEmployee,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0,
  currentMonth = new Date().getMonth() + 1,
  ytdGross = 0,
  ytdEPF = 0,
  ytdPCB = 0,
  ytdZakat = 0
) => {
  const result = calculatePCBFull({
    normalRemuneration: grossSalary,
    additionalRemuneration: 0,
    currentMonth,
    accumulatedGross: ytdGross,
    accumulatedEPF: ytdEPF,
    accumulatedPCB: ytdPCB,
    accumulatedZakat: ytdZakat,
    maritalStatus,
    spouseWorking,
    childrenCount,
    epfRate: epfEmployee > 0 ? epfEmployee / grossSalary : 0.11
  });

  return result.pcb;
};

/**
 * PCB calculation with additional remuneration (bonus, commission)
 */
const calculatePCBWithBonus = (
  normalSalary,
  bonusOrCommission,
  currentMonth = new Date().getMonth() + 1,
  ytdGross = 0,
  ytdEPF = 0,
  ytdPCB = 0,
  ytdZakat = 0,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0
) => {
  return calculatePCBFull({
    normalRemuneration: normalSalary,
    additionalRemuneration: bonusOrCommission,
    currentMonth,
    accumulatedGross: ytdGross,
    accumulatedEPF: ytdEPF,
    accumulatedPCB: ytdPCB,
    accumulatedZakat: ytdZakat,
    maritalStatus,
    spouseWorking,
    childrenCount
  });
};

/**
 * Simplified PCB for standalone calculation (assumes January, no YTD)
 */
const calculatePCBSimple = (
  grossSalary,
  epfEmployee,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0
) => {
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

/**
 * Calculate all statutory deductions using full LHDN formula
 *
 * IMPORTANT: Only basic, commission, and bonus are subject to statutory deductions
 * OT and allowance are NOT subject to EPF, SOCSO, EIS, PCB
 *
 * @param {number} grossSalary - Total gross salary (basic + commission + bonus)
 * @param {Object} employee - Employee details
 * @param {number} month - Current month (1-12)
 * @param {Object} ytdData - Year-to-date data for accurate PCB
 * @param {Object} breakdown - Optional salary breakdown { basic, commission, bonus }
 */
const calculateAllStatutory = (grossSalary, employee = {}, month = null, ytdData = null, breakdown = null) => {
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

  // Calculate PCB using full LHDN formula
  let pcb;
  let pcbBreakdown = null;

  // Determine normal vs additional remuneration
  let normalRemuneration = grossSalary;
  let additionalRemuneration = 0;

  if (breakdown) {
    // If breakdown provided, separate normal salary from bonus/commission
    normalRemuneration = breakdown.basic || 0;
    additionalRemuneration = (breakdown.commission || 0) + (breakdown.bonus || 0);
  }

  const currentMonth = month || (new Date().getMonth() + 1);

  if (ytdData) {
    // Use full LHDN formula with YTD data
    const pcbResult = calculatePCBFull({
      normalRemuneration,
      additionalRemuneration,
      currentMonth,
      accumulatedGross: ytdData.ytdGross || 0,
      accumulatedEPF: ytdData.ytdEPF || 0,
      accumulatedPCB: ytdData.ytdPCB || 0,
      accumulatedZakat: ytdData.ytdZakat || 0,
      currentMonthZakat: ytdData.currentMonthZakat || 0,
      maritalStatus,
      spouseWorking,
      childrenCount,
      isDisabled: employee.is_disabled || false,
      spouseDisabled: employee.spouse_disabled || false,
      otherDeductions: ytdData.otherDeductions || 0,
      epfRate: 0.11
    });

    pcb = pcbResult.pcb;
    pcbBreakdown = pcbResult;
  } else {
    // Use simplified calculation (assumes January or standalone)
    if (additionalRemuneration > 0) {
      const pcbResult = calculatePCBFull({
        normalRemuneration,
        additionalRemuneration,
        currentMonth,
        maritalStatus,
        spouseWorking,
        childrenCount,
        epfRate: 0.11
      });
      pcb = pcbResult.pcb;
      pcbBreakdown = pcbResult;
    } else {
      pcb = calculatePCBSimple(grossSalary, epf.employee, maritalStatus, spouseWorking, childrenCount);
    }
  }

  const totalEmployeeDeductions = epf.employee + socso.employee + eis.employee + pcb;
  const totalEmployerContributions = epf.employer + socso.employer + eis.employer;
  const netSalary = grossSalary - totalEmployeeDeductions;

  return {
    epf,
    socso,
    eis,
    pcb,
    pcbBreakdown, // Detailed PCB breakdown (if using full formula)
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

// =====================================================
// IC NUMBER FORMATTING & DETECTION
// =====================================================

// Valid Malaysian state codes (7th-8th digit of IC)
const VALID_STATE_CODES = [
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16', // Malaysian states
  '21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59', // Foreign countries
  '82' // Unknown state
];

/**
 * Format IC number with dashes: yymmddxxxxxx -> yymmdd-xx-xxxx
 * @param {string} ic - IC number (with or without dashes)
 * @returns {string} - Formatted IC with dashes, or original if not 12 digits
 */
const formatIC = (ic) => {
  if (!ic) return '';
  const clean = ic.replace(/[-\s]/g, '');
  if (clean.length !== 12) return ic; // Return as-is if not 12 digits
  return `${clean.slice(0,6)}-${clean.slice(6,8)}-${clean.slice(8)}`;
};

/**
 * Detect if ID is Malaysian IC or Passport
 * IC criteria: 12 digits + valid date (YYMMDD) + valid state code (7th-8th digit)
 * @param {string} idNumber - ID number to check
 * @returns {string} - 'ic' or 'passport'
 */
const detectIDType = (idNumber) => {
  if (!idNumber) return 'passport';
  const clean = idNumber.replace(/[-\s]/g, '');

  // Must be exactly 12 digits
  if (!/^\d{12}$/.test(clean)) return 'passport';

  // Validate date portion (YYMMDD)
  const month = parseInt(clean.substring(2, 4));
  const day = parseInt(clean.substring(4, 6));
  if (month < 1 || month > 12) return 'passport';
  if (day < 1 || day > 31) return 'passport';

  // Validate state code (7th-8th digit)
  const stateCode = clean.substring(6, 8);
  if (!VALID_STATE_CODES.includes(stateCode)) return 'passport';

  return 'ic';
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculatePCBFull,        // Full LHDN formula with detailed breakdown
  calculatePCBWithBonus,   // For salary + bonus/commission
  calculatePCBSimple,
  calculateAnnualTax,
  getTaxBracket,
  calculateAge,
  calculateAgeFromIC,
  getEmployeeAge,
  isMalaysianIC,
  calculateAllStatutory,
  TAX_BRACKETS,
  TAX_BRACKETS_LHDN,
  // OT and Public Holiday functions
  calculateOT,
  calculatePublicHolidayPay,
  isPublicHoliday,
  countPublicHolidaysInMonth,
  getPublicHolidaysInMonth,
  SELANGOR_PUBLIC_HOLIDAYS,
  // IC formatting and detection
  formatIC,
  detectIDType,
  VALID_STATE_CODES
};
