/**
 * Test script to verify PCB calculation matches LHDN e-PCB example
 *
 * Reference: Michelle Chean January 2026 e-PCB slip
 * Expected: PCB = RM 1,014.75
 */

const { calculatePCBFull } = require('../utils/statutory');

console.log('==============================================');
console.log('PCB Calculation Test - LHDN e-PCB Comparison');
console.log('==============================================\n');

// From LHDN e-PCB slip for Michelle Chean (January 2026)
// Y1 = RM 4,100 (normal salary)
// K1 = RM 2,101 (EPF - includes voluntary contribution)
// Yt = RM 15,000 (commission as additional remuneration)
// Kt = RM 0 (no EPF on commission in this case)
// LP1 = RM 24.75 (SOCSO + EIS)
// Category 1 (Single)
// Month: January (n = 11)

const testParams = {
  normalRemuneration: 4100,        // Y1
  additionalRemuneration: 15000,   // Yt (commission)
  currentMonth: 1,                 // January
  accumulatedGross: 0,             // E(Y) - first month
  accumulatedEPF: 0,               // E(K) - first month
  accumulatedPCB: 0,               // X - first month
  accumulatedZakat: 0,             // Z
  currentMonthZakat: 0,
  maritalStatus: 'single',
  spouseWorking: false,
  childrenCount: 0,
  isDisabled: false,
  spouseDisabled: false,
  otherDeductions: 24.75,          // LP1 (SOCSO + EIS annualized)
  epfRate: 0.11,
  actualEPFNormal: 2101,           // Actual K1 from LHDN slip
  actualEPFAdditional: 0           // Kt = 0 from LHDN slip
};

const result = calculatePCBFull(testParams);

console.log('Input Values:');
console.log('  Y1 (Normal Remuneration):', testParams.normalRemuneration);
console.log('  Yt (Additional Remuneration):', testParams.additionalRemuneration);
console.log('  Actual K1 (EPF Normal):', testParams.actualEPFNormal);
console.log('  Actual Kt (EPF Additional):', testParams.actualEPFAdditional);
console.log('  LP1 (Other Deductions):', testParams.otherDeductions);
console.log('  Month:', testParams.currentMonth, '(n =', result.n, ')');
console.log('');

console.log('Calculated Values:');
console.log('  K1 (EPF relief on Y1):', result.K1);
console.log('  K2 (EPF relief future):', result.K2);
console.log('  Kt (EPF relief on Yt):', result.Kt);
console.log('  n (remaining months):', result.n);
console.log('  n+1:', result.nPlus1);
console.log('');

console.log('Chargeable Income (P):');
console.log('  P (normal):', result.P_normal);
console.log('  P (with additional):', result.P_withAdditional);
console.log('');

console.log('Tax Bracket:');
console.log('  M (threshold):', result.M);
console.log('  R (rate):', result.R, '%');
console.log('  B (base tax):', result.B);
console.log('');

console.log('STD Calculations:');
console.log('  Normal STD:', result.normalSTD);
console.log('  Additional STD:', result.additionalSTD);
console.log('  Net STD:', result.netSTD);
console.log('');

console.log('==============================================');
console.log('FINAL RESULT:');
console.log('  Our PCB:', result.pcb);
console.log('  LHDN PCB: 1014.75');
console.log('  Difference:', (result.pcb - 1014.75).toFixed(2));
console.log('==============================================');
console.log('');

// LHDN slip breakdown for comparison
console.log('LHDN e-PCB Slip Values (for comparison):');
console.log('  P (normal): 36,175.32');
console.log('  P (with Yt): 51,175.32');
console.log('  PCB(A) - Normal: 55.87');
console.log('  PCB(C) - Additional: 958.84');
console.log('  Total PCB: 1,014.75');

// ============================================
// Also test EPF calculation for Evin Lim
// ============================================
const { calculateEPF } = require('../utils/statutory');

console.log('\n==============================================');
console.log('EPF Calculation Test - Evin Lim');
console.log('==============================================');

// Evin Lim January payroll
// EPF Base = RM 14,750 (Basic RM 8,750 + Commission RM 6,000)
// Expected EPF = RM 1,628

const evinEPF = calculateEPF(14750, 30);

console.log('Input: EPF Base = RM 14,750');
console.log('');
console.log('KWSP Bracket Method:');
console.log('  Wage bracket upper limit: Math.ceil(14750 / 20) * 20 =', Math.ceil(14750 / 20) * 20);
console.log('  Employee EPF (11%):', evinEPF.employee);
console.log('  Employer EPF (12%):', evinEPF.employer);
console.log('');
console.log('Expected: RM 1,628');
console.log('Result:', evinEPF.employee === 1628 ? 'PASS' : 'FAIL', '(Diff:', evinEPF.employee - 1628, ')');
console.log('==============================================');
