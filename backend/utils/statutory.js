/**
 * Malaysian Statutory Calculations
 * EPF, SOCSO, EIS, PCB rates for 2024/2025
 */

// EPF Contribution Rates (effective 2024)
// Employee: 11% (can opt for 9% if age > 60)
// Employer: 13% (salary <= RM5000) or 12% (salary > RM5000)
const calculateEPF = (grossSalary, age = 30, contributionType = 'normal') => {
  // Contribution type: 'normal' (11%), 'reduced' (9% for age > 60)
  let employeeRate = contributionType === 'reduced' || age > 60 ? 0.09 : 0.11;
  let employerRate = grossSalary <= 5000 ? 0.13 : 0.12;

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

// PCB (Monthly Tax Deduction) - Simplified calculation
// This is a simplified version. For accurate PCB, use LHDN PCB Calculator or official formula
const calculatePCB = (grossSalary, epfEmployee, maritalStatus = 'single', spouseWorking = false, childrenCount = 0) => {
  // Annual estimates
  const annualGross = grossSalary * 12;
  const annualEPF = epfEmployee * 12;

  // Reliefs (simplified)
  const selfRelief = 9000;
  const spouseRelief = spouseWorking ? 0 : 4000;
  const childRelief = childrenCount * 2000;
  const epfRelief = Math.min(annualEPF, 4000);
  const socsoRelief = 350; // Max SOCSO relief

  const totalRelief = selfRelief + spouseRelief + childRelief + epfRelief + socsoRelief;
  const taxableIncome = Math.max(0, annualGross - totalRelief);

  // Tax brackets 2024
  let annualTax = 0;
  if (taxableIncome <= 5000) {
    annualTax = 0;
  } else if (taxableIncome <= 20000) {
    annualTax = (taxableIncome - 5000) * 0.01;
  } else if (taxableIncome <= 35000) {
    annualTax = 150 + (taxableIncome - 20000) * 0.03;
  } else if (taxableIncome <= 50000) {
    annualTax = 600 + (taxableIncome - 35000) * 0.06;
  } else if (taxableIncome <= 70000) {
    annualTax = 1500 + (taxableIncome - 50000) * 0.11;
  } else if (taxableIncome <= 100000) {
    annualTax = 3700 + (taxableIncome - 70000) * 0.19;
  } else if (taxableIncome <= 400000) {
    annualTax = 9400 + (taxableIncome - 100000) * 0.25;
  } else if (taxableIncome <= 600000) {
    annualTax = 84400 + (taxableIncome - 400000) * 0.26;
  } else if (taxableIncome <= 2000000) {
    annualTax = 136400 + (taxableIncome - 600000) * 0.28;
  } else {
    annualTax = 528400 + (taxableIncome - 2000000) * 0.30;
  }

  // Monthly PCB
  const monthlyPCB = Math.round(annualTax / 12 * 100) / 100;

  return monthlyPCB;
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
const calculateAllStatutory = (grossSalary, employee = {}) => {
  const age = calculateAge(employee.date_of_birth);
  const contributionType = employee.epf_contribution_type || 'normal';
  const maritalStatus = employee.marital_status || 'single';
  const spouseWorking = employee.spouse_working || false;
  const childrenCount = employee.children_count || 0;

  const epf = calculateEPF(grossSalary, age, contributionType);
  const socso = calculateSOCSO(grossSalary, age);
  const eis = calculateEIS(grossSalary, age);
  const pcb = calculatePCB(grossSalary, epf.employee, maritalStatus, spouseWorking, childrenCount);

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
  calculateAge,
  calculateAllStatutory
};
