import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { payrollAIApi } from '../api';
import './PayrollCalculationGuide.css';

// SOCSO Contribution Table (exact copy from backend)
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

// EIS Contribution Table (exact copy from backend)
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

// PCB Tax Brackets (exact copy from backend)
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

function PayrollCalculationGuide() {
  const [activeSection, setActiveSection] = useState('gross');

  // Get admin's company from localStorage
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isMimix = adminInfo.company_id === 3;
  const isAAAlive = adminInfo.company_id === 1 || adminInfo.company_id === 2;

  // Test Calculator state - Employee Info
  const [testCompany, setTestCompany] = useState(isMimix ? 'mimix' : 'aa_alive');
  const [testDepartment, setTestDepartment] = useState('office');
  const [testAge, setTestAge] = useState(30);
  const [testMaritalStatus, setTestMaritalStatus] = useState('single');
  const [testSpouseWorking, setTestSpouseWorking] = useState(false);
  const [testChildrenCount, setTestChildrenCount] = useState(0);

  // Test Calculator state - Earnings
  const [testSalary, setTestSalary] = useState(3000);
  const [testAllowance, setTestAllowance] = useState(0);
  const [testOTHours, setTestOTHours] = useState(0);
  const [testPHDays, setTestPHDays] = useState(0);
  const [testCommission, setTestCommission] = useState(0);
  const [testBonus, setTestBonus] = useState(0);
  const [testOutstation, setTestOutstation] = useState(0);
  const [testClaims, setTestClaims] = useState(0);

  // Test Calculator state - Deductions
  const [testUnpaidDays, setTestUnpaidDays] = useState(0);
  const [testAdvance, setTestAdvance] = useState(0);
  const [testOtherDeductions, setTestOtherDeductions] = useState(0);

  // AI Assistant state
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSettings, setCurrentSettings] = useState(null);
  const chatEndRef = useRef(null);

  // Load current settings on mount
  useEffect(() => {
    if (activeSection === 'ai') {
      loadSettings();
    }
  }, [activeSection]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSettings = async () => {
    try {
      const res = await payrollAIApi.getSettings();
      setCurrentSettings(res.data.settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await payrollAIApi.chat(userMessage, conversationHistory);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.reply,
        changes: res.data.changes,
        applied: res.data.applied,
        needsConfirmation: res.data.needs_confirmation
      }]);

      if (res.data.applied && res.data.current_settings) {
        setCurrentSettings(res.data.current_settings);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        error: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Calculate EPF (exact same as backend)
  const calculateEPF = (grossSalary, age = 30) => {
    let employeeRate, employerRate;
    if (age > 60) {
      employeeRate = 0;
      employerRate = 0.04;
    } else {
      employeeRate = 0.11;
      employerRate = grossSalary <= 5000 ? 0.13 : 0.12;
    }
    const epfWage = Math.min(grossSalary, 20000);
    return {
      employee: Math.round(epfWage * employeeRate),
      employer: Math.round(epfWage * employerRate)
    };
  };

  // Calculate SOCSO (exact same as backend)
  const calculateSOCSO = (grossSalary) => {
    if (grossSalary > 5000) {
      return { employee: 24.75, employer: 69.05 };
    }
    const bracket = SOCSO_TABLE.find(b => grossSalary >= b.min && grossSalary <= b.max);
    if (!bracket) return { employee: 0, employer: 0 };
    return { employee: bracket.ee, employer: bracket.er };
  };

  // Calculate EIS (exact same as backend)
  const calculateEIS = (grossSalary, age = 30) => {
    if (age >= 57) return { employee: 0, employer: 0 };
    if (grossSalary > 5000) return { employee: 9.90, employer: 9.90 };
    const bracket = EIS_TABLE.find(b => grossSalary >= b.min && grossSalary <= b.max);
    if (!bracket) return { employee: 0, employer: 0 };
    return { employee: bracket.ee, employer: bracket.er };
  };

  // Calculate OT based on company and department
  const calculateOT = (basicSalary, otHours, company, department, workingDays = 22, workingHours = 7.5) => {
    if (!otHours || otHours <= 0) return { amount: 0, multiplier: 0 };

    // AA Alive: Only Driver & Packing Room have OT at 1.0x
    // Mimix: All departments have OT at 1.5x
    let multiplier = 0;
    if (company === 'mimix') {
      multiplier = 1.5;
    } else if (company === 'aa_alive' && (department === 'driver' || department === 'packing')) {
      multiplier = 1.0;
    }

    if (multiplier === 0) return { amount: 0, multiplier: 0 };

    const dailyRate = basicSalary / workingDays;
    const hourlyRate = dailyRate / workingHours;
    const amount = Math.round(hourlyRate * otHours * multiplier * 100) / 100;
    return { amount, multiplier, hourlyRate };
  };

  // Calculate PH Pay
  const calculatePHPay = (basicSalary, phDays, company, department, workingDays = 22) => {
    if (!phDays || phDays <= 0) return { amount: 0, multiplier: 0 };

    // AA Alive: Only Driver & Packing Room work on PH at 2.0x
    // Mimix: All departments at 2.0x
    let multiplier = 0;
    if (company === 'mimix') {
      multiplier = 2.0;
    } else if (company === 'aa_alive' && (department === 'driver' || department === 'packing')) {
      multiplier = 2.0;
    }

    if (multiplier === 0) return { amount: 0, multiplier: 0 };

    const dailyRate = basicSalary / workingDays;
    const amount = Math.round(dailyRate * phDays * multiplier * 100) / 100;
    return { amount, multiplier, dailyRate };
  };

  // Calculate unpaid leave deduction
  const calculateUnpaidDeduction = (basicSalary, unpaidDays, workingDays = 22) => {
    if (!unpaidDays || unpaidDays <= 0) return 0;
    const dailyRate = basicSalary / workingDays;
    return Math.round(dailyRate * unpaidDays * 100) / 100;
  };

  // Calculate PCB (Monthly Tax Deduction)
  const calculatePCB = (statutoryBase, age, maritalStatus, spouseWorking, childrenCount, monthlyEPF) => {
    if (age < 18) return 0;

    // Annual projection
    const annualGross = statutoryBase * 12;

    // Calculate reliefs
    let reliefs = 9000; // Individual relief
    if (maritalStatus === 'married' && !spouseWorking) {
      reliefs += 4000; // Spouse relief
    }
    reliefs += childrenCount * 2000; // Children relief
    reliefs += Math.min(monthlyEPF * 12, 4000); // EPF relief (max 4000/year)

    // Chargeable income
    const chargeableIncome = Math.max(0, annualGross - reliefs);

    if (chargeableIncome <= 5000) return 0;

    // Find tax bracket
    const bracket = TAX_BRACKETS.find(b => chargeableIncome >= b.min && chargeableIncome <= b.max);
    if (!bracket) return 0;

    // Calculate annual tax
    const taxableAboveM = chargeableIncome - bracket.M;
    const B = (maritalStatus === 'married' && !spouseWorking) ? bracket.B2 : bracket.B1;
    let annualTax = (taxableAboveM * bracket.R) + B;

    // Tax cannot be negative
    annualTax = Math.max(0, annualTax);

    // Monthly PCB
    const monthlyPCB = Math.ceil(annualTax / 12 * 20) / 20; // Round up to nearest 5 sen

    return {
      monthlyPCB,
      annualGross,
      reliefs,
      chargeableIncome,
      annualTax,
      bracket: `${bracket.min.toLocaleString()} - ${bracket.max === Infinity ? '∞' : bracket.max.toLocaleString()}`,
      rate: bracket.R * 100
    };
  };

  // Test calculations
  const otResult = calculateOT(testSalary, testOTHours, testCompany, testDepartment);
  const phResult = calculatePHPay(testSalary, testPHDays, testCompany, testDepartment);
  const unpaidDeduction = calculateUnpaidDeduction(testSalary, testUnpaidDays);

  // Statutory base = Basic + Commission + Bonus (OT, Allowance, Claims NOT included)
  const statutoryBase = testSalary + testCommission + testBonus;

  const epf = calculateEPF(statutoryBase, testAge);
  const socso = calculateSOCSO(statutoryBase);
  const eis = calculateEIS(statutoryBase, testAge);
  const pcb = calculatePCB(statutoryBase, testAge, testMaritalStatus, testSpouseWorking, testChildrenCount, epf.employee);

  // Gross = Basic + Allowance + OT + PH + Commission + Bonus + Outstation + Claims - Unpaid
  const grossSalary = testSalary + testAllowance + otResult.amount + phResult.amount + testCommission + testBonus + testOutstation + testClaims - unpaidDeduction;

  // Total deductions
  const totalStatutoryDeductions = epf.employee + socso.employee + eis.employee + (pcb.monthlyPCB || 0);
  const totalOtherDeductions = testAdvance + testOtherDeductions;
  const totalDeductions = totalStatutoryDeductions + totalOtherDeductions;

  // Net pay
  const netPay = grossSalary - totalDeductions;

  // Employer cost
  const employerCost = grossSalary + epf.employer + socso.employer + eis.employer;

  const sections = [
    { id: 'ai', label: 'AI Assistant' },
    { id: 'gross', label: 'Gross Salary' },
    { id: 'statutory', label: 'Statutory Base' },
    { id: 'epf', label: 'EPF (KWSP)' },
    { id: 'socso', label: 'SOCSO (PERKESO)' },
    { id: 'eis', label: 'EIS (SIP)' },
    { id: 'pcb', label: 'PCB (Tax)' },
    { id: 'ot', label: 'OT Calculation' },
    { id: 'leave', label: 'Leave Deduction' },
    { id: 'calculator', label: 'Test Calculator' },
  ];

  return (
    <Layout>
      <div className="calc-guide-container">
        <div className="calc-guide-header">
          <h1>Payroll Calculation Guide</h1>
          <p>This page shows the exact calculation formulas used in the system. Read-only reference.</p>
        </div>

      <div className="calc-guide-nav">
        {sections.map(s => (
          <button
            key={s.id}
            className={activeSection === s.id ? 'active' : ''}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="calc-guide-content">
        {/* AI ASSISTANT */}
        {activeSection === 'ai' && (
          <div className="calc-section ai-section">
            <h2>AI Payroll Assistant</h2>
            <p className="ai-description">
              Ask questions about payroll calculations or request changes to settings.
              The AI will explain and can apply changes directly to your payroll configuration.
            </p>

            {/* Current Settings Display */}
            {currentSettings && (
              <div className="current-settings">
                <h3>Current Settings</h3>
                <div className="settings-grid">
                  <div className="settings-group">
                    <h4>Statutory Contributions</h4>
                    <ul>
                      <li>EPF: {currentSettings.statutory?.epf_enabled ? 'Enabled' : 'Disabled'}</li>
                      <li>SOCSO: {currentSettings.statutory?.socso_enabled ? 'Enabled' : 'Disabled'}</li>
                      <li>EIS: {currentSettings.statutory?.eis_enabled ? 'Enabled' : 'Disabled'}</li>
                      <li>PCB: {currentSettings.statutory?.pcb_enabled ? 'Enabled' : 'Disabled'}</li>
                    </ul>
                  </div>
                  <div className="settings-group">
                    <h4>Statutory Base Includes</h4>
                    <ul>
                      <li>OT: {currentSettings.statutory?.statutory_on_ot ? 'Yes' : 'No'}</li>
                      <li>PH Pay: {currentSettings.statutory?.statutory_on_ph_pay ? 'Yes' : 'No'}</li>
                      <li>Allowances: {currentSettings.statutory?.statutory_on_allowance ? 'Yes' : 'No'}</li>
                      <li>Incentives: {currentSettings.statutory?.statutory_on_incentive ? 'Yes' : 'No'}</li>
                    </ul>
                  </div>
                  <div className="settings-group">
                    <h4>Rates</h4>
                    <ul>
                      <li>OT Multiplier: {currentSettings.rates?.ot_multiplier}x</li>
                      <li>PH Multiplier: {currentSettings.rates?.ph_multiplier}x</li>
                      <li>Work Hours/Day: {currentSettings.rates?.standard_work_hours}</li>
                      <li>Work Days/Month: {currentSettings.rates?.standard_work_days}</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Interface */}
            <div className="ai-chat">
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div className="chat-welcome">
                    <p>Hello! I can help you with:</p>
                    <ul>
                      <li>Understanding payroll calculations</li>
                      <li>Changing statutory contribution settings</li>
                      <li>Adjusting OT and PH pay rates</li>
                      <li>Configuring what's included in EPF/SOCSO/EIS</li>
                    </ul>
                    <p>Try asking: "Include PH pay in EPF calculation" or "What is the current OT multiplier?"</p>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.role}`}>
                    <div className="message-content">
                      {msg.content}
                      {msg.applied && (
                        <span className="applied-badge">Changes Applied</span>
                      )}
                      {msg.needsConfirmation && (
                        <span className="confirm-badge">Awaiting Confirmation</span>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="chat-message assistant">
                    <div className="message-content typing">Thinking...</div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about payroll calculations or request changes..."
                  rows="2"
                  disabled={isLoading}
                />
                <button onClick={sendMessage} disabled={isLoading || !inputMessage.trim()}>
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GROSS SALARY */}
        {activeSection === 'gross' && (
          <div className="calc-section">
            <h2>Gross Salary Calculation</h2>
            <div className="formula-box">
              <h3>Formula:</h3>
              <code>
                Gross Salary = Basic Salary + Allowances + OT Amount + PH Pay + Commission + Claims - Unpaid Leave Deduction
              </code>
            </div>

            <div className="info-box">
              <h3>Components Breakdown:</h3>
              <table className="info-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Description</th>
                    <th>Subject to EPF/SOCSO/EIS?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Basic Salary</strong></td>
                    <td>Base monthly salary</td>
                    <td className="yes">YES - Always</td>
                  </tr>
                  <tr>
                    <td><strong>Fixed Allowance</strong></td>
                    <td>Transport, meal, phone, etc.</td>
                    <td className="configurable">Configurable (default: NO)</td>
                  </tr>
                  <tr>
                    <td><strong>OT Amount</strong></td>
                    <td>Overtime pay</td>
                    <td className="configurable">Configurable (default: NO)</td>
                  </tr>
                  <tr>
                    <td><strong>PH Pay</strong></td>
                    <td>Public holiday extra pay</td>
                    <td className="configurable">Configurable (default: NO)</td>
                  </tr>
                  <tr>
                    <td><strong>Commission</strong></td>
                    <td>Sales/performance commission</td>
                    <td className="yes">YES - Always</td>
                  </tr>
                  <tr>
                    <td><strong>Bonus</strong></td>
                    <td>Performance bonus</td>
                    <td className="yes">YES - Always</td>
                  </tr>
                  <tr>
                    <td><strong>Claims</strong></td>
                    <td>Approved expense claims</td>
                    <td className="no">NO</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="note-box">
              <strong>Note:</strong> Unpaid leave deduction is subtracted from gross salary before calculating net pay.
            </div>
          </div>
        )}

        {/* STATUTORY BASE */}
        {activeSection === 'statutory' && (
          <div className="calc-section">
            <h2>Statutory Base (What EPF/SOCSO/EIS/PCB is calculated on)</h2>
            <div className="formula-box">
              <h3>Default Formula:</h3>
              <code>
                Statutory Base = Basic Salary + Commission + Bonus
              </code>
            </div>

            <div className="formula-box optional">
              <h3>With Optional Settings Enabled:</h3>
              <code>
                Statutory Base = Basic Salary + Commission + Bonus<br/>
                &nbsp;&nbsp;+ OT Amount (if statutory_on_ot = true)<br/>
                &nbsp;&nbsp;+ PH Pay (if statutory_on_ph_pay = true)<br/>
                &nbsp;&nbsp;+ Allowances (if statutory_on_allowance = true)<br/>
                &nbsp;&nbsp;+ Incentive (if statutory_on_incentive = true)
              </code>
            </div>

            <div className="info-box warning">
              <h3>Important Rules:</h3>
              <ul>
                <li><strong>OT, PH Pay, and Allowances</strong> are NOT subject to statutory by default</li>
                <li><strong>Commission and Bonus</strong> are ALWAYS subject to statutory</li>
                <li><strong>Claims</strong> are NEVER subject to statutory (reimbursements)</li>
                <li>Settings can be changed in Payroll Settings page</li>
              </ul>
            </div>
          </div>
        )}

        {/* EPF */}
        {activeSection === 'epf' && (
          <div className="calc-section">
            <h2>EPF (KWSP) Calculation</h2>
            <div className="formula-box">
              <h3>Employee Contribution (11%):</h3>
              <code>
                EPF Employee = ROUND(Statutory Base × 0.11) to nearest RM
              </code>
              <h3>Employer Contribution:</h3>
              <code>
                If Statutory Base ≤ RM5,000: EPF Employer = ROUND(Statutory Base × 0.13)<br/>
                If Statutory Base &gt; RM5,000: EPF Employer = ROUND(Statutory Base × 0.12)
              </code>
            </div>

            <div className="info-box">
              <h3>EPF Rules:</h3>
              <table className="info-table">
                <tbody>
                  <tr><td>Employee Rate</td><td>11%</td></tr>
                  <tr><td>Employer Rate (salary ≤ RM5,000)</td><td>13%</td></tr>
                  <tr><td>Employer Rate (salary &gt; RM5,000)</td><td>12%</td></tr>
                  <tr><td>Wage Ceiling</td><td>RM20,000</td></tr>
                  <tr><td>Rounding</td><td>Nearest RM (Ringgit)</td></tr>
                  <tr><td>Age &gt; 60</td><td>Employee: 0%, Employer: 4%</td></tr>
                </tbody>
              </table>
            </div>

            <div className="example-box">
              <h3>Example:</h3>
              <p>Basic Salary: RM 3,456.78</p>
              <p>EPF Employee = ROUND(3456.78 × 0.11) = ROUND(380.25) = <strong>RM 380</strong></p>
              <p>EPF Employer = ROUND(3456.78 × 0.13) = ROUND(449.38) = <strong>RM 449</strong></p>
            </div>
          </div>
        )}

        {/* SOCSO */}
        {activeSection === 'socso' && (
          <div className="calc-section">
            <h2>SOCSO (PERKESO) Contribution Table</h2>
            <div className="info-box">
              <h3>Rules:</h3>
              <ul>
                <li>Uses <strong>bracket table</strong> (not percentage)</li>
                <li>Wage ceiling: <strong>RM5,000</strong></li>
                <li>Age ≥ 60: Only employer contribution (Category 2)</li>
              </ul>
            </div>

            <div className="table-container">
              <table className="contribution-table">
                <thead>
                  <tr>
                    <th>Wage Range (RM)</th>
                    <th>Employee (RM)</th>
                    <th>Employer (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {SOCSO_TABLE.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.min.toFixed(2)} - {row.max.toFixed(2)}</td>
                      <td>{row.ee.toFixed(2)}</td>
                      <td>{row.er.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="ceiling-row">
                    <td>&gt; 5,000.00</td>
                    <td>24.75</td>
                    <td>69.05</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EIS */}
        {activeSection === 'eis' && (
          <div className="calc-section">
            <h2>EIS (SIP) Contribution Table</h2>
            <div className="info-box">
              <h3>Rules:</h3>
              <ul>
                <li>Uses <strong>bracket table</strong> (not percentage)</li>
                <li>Wage ceiling: <strong>RM5,000</strong></li>
                <li>Age ≥ 57: <strong>Not applicable</strong> (both EE and ER = 0)</li>
              </ul>
            </div>

            <div className="table-container">
              <table className="contribution-table">
                <thead>
                  <tr>
                    <th>Wage Range (RM)</th>
                    <th>Employee (RM)</th>
                    <th>Employer (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {EIS_TABLE.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.min.toFixed(2)} - {row.max.toFixed(2)}</td>
                      <td>{row.ee.toFixed(2)}</td>
                      <td>{row.er.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PCB */}
        {activeSection === 'pcb' && (
          <div className="calc-section">
            <h2>PCB (Monthly Tax Deduction) - LHDN Formula</h2>
            <div className="formula-box">
              <h3>Simplified Formula:</h3>
              <code>
                PCB = [(P - M) × R + B - (Z + X)] / (n + 1)
              </code>
              <div className="formula-legend">
                <p><strong>P</strong> = Annual Chargeable Income (projected)</p>
                <p><strong>M</strong> = Tax bracket threshold</p>
                <p><strong>R</strong> = Tax rate</p>
                <p><strong>B</strong> = Base tax (after rebate)</p>
                <p><strong>Z</strong> = Accumulated zakat paid</p>
                <p><strong>X</strong> = Accumulated PCB paid</p>
                <p><strong>n</strong> = Remaining months in year</p>
              </div>
            </div>

            <div className="info-box">
              <h3>Tax Brackets (2024/2025):</h3>
              <table className="info-table">
                <thead>
                  <tr>
                    <th>Annual Income (RM)</th>
                    <th>Rate</th>
                    <th>B1 (Single/Working Spouse)</th>
                    <th>B2 (Non-Working Spouse)</th>
                  </tr>
                </thead>
                <tbody>
                  {TAX_BRACKETS.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.min.toLocaleString()} - {row.max === Infinity ? '∞' : row.max.toLocaleString()}</td>
                      <td>{(row.R * 100).toFixed(0)}%</td>
                      <td>{row.B1.toLocaleString()}</td>
                      <td>{row.B2.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="info-box">
              <h3>Tax Reliefs:</h3>
              <table className="info-table">
                <tbody>
                  <tr><td>Individual Relief</td><td>RM 9,000</td></tr>
                  <tr><td>Spouse Relief (not working)</td><td>RM 4,000</td></tr>
                  <tr><td>Disabled Individual</td><td>RM 7,000</td></tr>
                  <tr><td>Disabled Spouse</td><td>RM 6,000</td></tr>
                  <tr><td>Per Child</td><td>RM 2,000</td></tr>
                  <tr><td>EPF Relief (max)</td><td>RM 4,000/year</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* OT */}
        {activeSection === 'ot' && (
          <div className="calc-section">
            <h2>OT (Overtime) Calculation</h2>
            <div className="formula-box">
              <h3>Formula:</h3>
              <code>
                Daily Rate = Basic Salary / Working Days<br/>
                Hourly Rate = Daily Rate / 8 hours<br/>
                OT Amount = Hourly Rate × OT Hours × 1.0 (OT Rate)
              </code>
            </div>

            <div className="info-box">
              <h3>OT Rules:</h3>
              <table className="info-table">
                <tbody>
                  <tr><td>Working Days (default)</td><td>22 days/month</td></tr>
                  <tr><td>Working Hours/Day</td><td>8 hours</td></tr>
                  <tr><td>OT Rate</td><td>1.0x (flat rate)</td></tr>
                  <tr><td>Subject to EPF/SOCSO/EIS?</td><td>NO (by default, configurable)</td></tr>
                </tbody>
              </table>
            </div>

            <div className="example-box">
              <h3>Example:</h3>
              <p>Basic Salary: RM 3,000</p>
              <p>OT Hours: 10 hours</p>
              <p>Daily Rate = 3000 / 22 = RM 136.36</p>
              <p>Hourly Rate = 136.36 / 8 = RM 17.05</p>
              <p>OT Amount = 17.05 × 10 × 1.0 = <strong>RM 170.45</strong></p>
            </div>

            <div className="formula-box">
              <h3>Public Holiday Extra Pay:</h3>
              <code>
                PH Pay = Daily Rate × PH Days Worked × 1.0
              </code>
              <p className="note">If employee works on public holiday, they get extra 1.0x daily rate</p>
            </div>
          </div>
        )}

        {/* LEAVE */}
        {activeSection === 'leave' && (
          <div className="calc-section">
            <h2>Leave Deduction Calculation</h2>
            <div className="formula-box">
              <h3>Unpaid Leave Deduction:</h3>
              <code>
                Daily Rate = Basic Salary / Working Days<br/>
                Unpaid Deduction = Daily Rate × Unpaid Leave Days
              </code>
            </div>

            <div className="info-box">
              <h3>Leave Types:</h3>
              <table className="info-table">
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Deduction?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Annual Leave</td><td className="no">No deduction (paid leave)</td></tr>
                  <tr><td>Medical Leave</td><td className="no">No deduction (paid leave)</td></tr>
                  <tr><td>Emergency Leave</td><td className="no">No deduction (paid leave)</td></tr>
                  <tr><td>Unpaid Leave</td><td className="yes">YES - Deducted from gross</td></tr>
                  <tr><td>Hospitalization</td><td className="no">No deduction (paid leave)</td></tr>
                  <tr><td>Maternity Leave</td><td className="no">No deduction (paid leave)</td></tr>
                  <tr><td>Paternity Leave</td><td className="no">No deduction (paid leave)</td></tr>
                </tbody>
              </table>
            </div>

            <div className="example-box">
              <h3>Example:</h3>
              <p>Basic Salary: RM 3,000</p>
              <p>Unpaid Leave Days: 2 days</p>
              <p>Daily Rate = 3000 / 22 = RM 136.36</p>
              <p>Unpaid Deduction = 136.36 × 2 = <strong>RM 272.73</strong></p>
            </div>
          </div>
        )}

        {/* CALCULATOR */}
        {activeSection === 'calculator' && (
          <div className="calc-section">
            <h2>Test Calculator</h2>
            <p>Enter values to see live calculations (uses exact same formulas as backend)</p>

            <div className="calculator-inputs">
              {/* Company & Employee Info */}
              <div className="input-section">
                <h4>Company & Employee Info</h4>
                <div className="input-row">
                  <div className="input-group">
                    <label>Company</label>
                    <select value={testCompany} onChange={(e) => setTestCompany(e.target.value)} disabled>
                      {isMimix ? (
                        <option value="mimix">Mimix</option>
                      ) : (
                        <option value="aa_alive">AA Alive</option>
                      )}
                    </select>
                  </div>
                  {!isMimix && (
                    <div className="input-group">
                      <label>Department</label>
                      <select value={testDepartment} onChange={(e) => setTestDepartment(e.target.value)}>
                        <option value="office">Office / Admin</option>
                        <option value="driver">Driver</option>
                        <option value="packing">Packing Room</option>
                        <option value="sales">Sales</option>
                      </select>
                    </div>
                  )}
                  <div className="input-group">
                    <label>Age</label>
                    <input type="number" value={testAge} onChange={(e) => setTestAge(parseInt(e.target.value) || 30)} />
                  </div>
                </div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Marital Status</label>
                    <select value={testMaritalStatus} onChange={(e) => setTestMaritalStatus(e.target.value)}>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Spouse Working?</label>
                    <select value={testSpouseWorking} onChange={(e) => setTestSpouseWorking(e.target.value === 'true')} disabled={testMaritalStatus === 'single'}>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Children</label>
                    <input type="number" min="0" value={testChildrenCount} onChange={(e) => setTestChildrenCount(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </div>

              {/* Earnings */}
              <div className="input-section">
                <h4>Earnings</h4>
                <div className="input-row">
                  <div className="input-group">
                    <label>Basic Salary (RM)</label>
                    <input type="number" value={testSalary} onChange={(e) => setTestSalary(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Allowance (RM)</label>
                    <input type="number" value={testAllowance} onChange={(e) => setTestAllowance(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>OT Hours</label>
                    <input type="number" value={testOTHours} onChange={(e) => setTestOTHours(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="input-row">
                  <div className="input-group">
                    <label>PH Days Worked</label>
                    <input type="number" value={testPHDays} onChange={(e) => setTestPHDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Commission (RM)</label>
                    <input type="number" value={testCommission} onChange={(e) => setTestCommission(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Bonus (RM)</label>
                    <input type="number" value={testBonus} onChange={(e) => setTestBonus(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Outstation (RM)</label>
                    <input type="number" value={testOutstation} onChange={(e) => setTestOutstation(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Claims (RM)</label>
                    <input type="number" value={testClaims} onChange={(e) => setTestClaims(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div className="input-section">
                <h4>Deductions</h4>
                <div className="input-row">
                  <div className="input-group">
                    <label>Unpaid Leave Days</label>
                    <input type="number" value={testUnpaidDays} onChange={(e) => setTestUnpaidDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Advance Deduction (RM)</label>
                    <input type="number" value={testAdvance} onChange={(e) => setTestAdvance(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Other Deductions (RM)</label>
                    <input type="number" value={testOtherDeductions} onChange={(e) => setTestOtherDeductions(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="calculator-results">
              <h3>Results:</h3>

              {/* Company Rules Info */}
              <div className="rules-info">
                <strong>{isMimix ? 'Mimix' : 'AA Alive'} Rules:</strong>
                {isMimix ? (
                  <span> OT 1.5x, PH 2.0x, PH After Hours 3.0x (All staff, requires OT approval)</span>
                ) : (testDepartment === 'driver' || testDepartment === 'packing') ? (
                  <span> OT 1.0x, PH 2.0x (Driver/Packing Room only)</span>
                ) : (
                  <span className="no-ot"> No OT or PH calculation (Office/Admin/Sales)</span>
                )}
              </div>

              <table className="results-table">
                <tbody>
                  <tr className="section-header"><td colSpan="2">EARNINGS</td></tr>
                  {testSalary > 0 && <tr><td>Basic Salary</td><td>RM {testSalary.toFixed(2)}</td></tr>}
                  {testAllowance > 0 && <tr><td>Allowance</td><td>RM {testAllowance.toFixed(2)}</td></tr>}
                  {otResult.amount > 0 && <tr><td>OT Amount ({testOTHours} hrs @ {otResult.multiplier}x)</td><td>RM {otResult.amount.toFixed(2)}</td></tr>}
                  {phResult.amount > 0 && <tr><td>PH Pay ({testPHDays} days @ {phResult.multiplier}x)</td><td>RM {phResult.amount.toFixed(2)}</td></tr>}
                  {testCommission > 0 && <tr><td>Commission</td><td>RM {testCommission.toFixed(2)}</td></tr>}
                  {testBonus > 0 && <tr><td>Bonus</td><td>RM {testBonus.toFixed(2)}</td></tr>}
                  {testOutstation > 0 && <tr><td>Outstation</td><td>RM {testOutstation.toFixed(2)}</td></tr>}
                  {testClaims > 0 && <tr><td>Claims</td><td>RM {testClaims.toFixed(2)}</td></tr>}
                  {unpaidDeduction > 0 && <tr><td>Unpaid Leave ({testUnpaidDays} days)</td><td className="deduction">- RM {unpaidDeduction.toFixed(2)}</td></tr>}
                  <tr className="total"><td>Gross Salary</td><td>RM {grossSalary.toFixed(2)}</td></tr>

                  <tr className="section-header"><td colSpan="2">STATUTORY BASE (for EPF/SOCSO/EIS/PCB)</td></tr>
                  <tr className="info-row"><td colSpan="2">Basic + Commission + Bonus = RM {statutoryBase.toFixed(2)}</td></tr>

                  <tr className="section-header"><td colSpan="2">STATUTORY DEDUCTIONS (Employee)</td></tr>
                  {epf.employee > 0 && <tr><td>EPF ({testAge > 60 ? '0%' : '11%'})</td><td>RM {epf.employee.toFixed(2)}</td></tr>}
                  {socso.employee > 0 && <tr><td>SOCSO</td><td>RM {socso.employee.toFixed(2)}</td></tr>}
                  {eis.employee > 0 && <tr><td>EIS {testAge >= 57 ? '(N/A - Age 57+)' : ''}</td><td>RM {eis.employee.toFixed(2)}</td></tr>}
                  <tr><td>PCB (Income Tax)</td><td>RM {(pcb.monthlyPCB || 0).toFixed(2)}</td></tr>
                  <tr className="subtotal"><td>Statutory Subtotal</td><td>RM {totalStatutoryDeductions.toFixed(2)}</td></tr>

                  {(testAdvance > 0 || testOtherDeductions > 0) && (
                    <>
                      <tr className="section-header"><td colSpan="2">OTHER DEDUCTIONS</td></tr>
                      {testAdvance > 0 && <tr><td>Advance Deduction</td><td>RM {testAdvance.toFixed(2)}</td></tr>}
                      {testOtherDeductions > 0 && <tr><td>Other Deductions</td><td>RM {testOtherDeductions.toFixed(2)}</td></tr>}
                    </>
                  )}

                  <tr className="total"><td>Total Deductions</td><td>RM {totalDeductions.toFixed(2)}</td></tr>

                  <tr className="section-header"><td colSpan="2">NET PAY</td></tr>
                  <tr className="net-pay"><td>Net Pay</td><td>RM {netPay.toFixed(2)}</td></tr>

                  <tr className="section-header"><td colSpan="2">EMPLOYER CONTRIBUTIONS</td></tr>
                  {epf.employer > 0 && <tr><td>EPF Employer ({statutoryBase <= 5000 ? '13%' : '12%'})</td><td>RM {epf.employer.toFixed(2)}</td></tr>}
                  {socso.employer > 0 && <tr><td>SOCSO Employer</td><td>RM {socso.employer.toFixed(2)}</td></tr>}
                  {eis.employer > 0 && <tr><td>EIS Employer</td><td>RM {eis.employer.toFixed(2)}</td></tr>}
                  <tr className="total"><td>Total Employer Cost</td><td>RM {employerCost.toFixed(2)}</td></tr>
                </tbody>
              </table>

              {/* PCB Details */}
              {pcb && (
                <div className="pcb-details">
                  <h4>PCB Calculation Details</h4>
                  <table className="pcb-table">
                    <tbody>
                      <tr><td>Annual Gross (projected)</td><td>RM {pcb.annualGross?.toLocaleString()}</td></tr>
                      <tr><td>Total Reliefs</td><td>RM {pcb.reliefs?.toLocaleString()}</td></tr>
                      <tr><td>Chargeable Income</td><td>RM {pcb.chargeableIncome?.toLocaleString()}</td></tr>
                      <tr><td>Tax Bracket</td><td>{pcb.bracket} ({pcb.rate}%)</td></tr>
                      <tr><td>Annual Tax</td><td>RM {pcb.annualTax?.toFixed(2)}</td></tr>
                      <tr className="total"><td>Monthly PCB</td><td>RM {(pcb.monthlyPCB || 0).toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </Layout>
  );
}

export default PayrollCalculationGuide;
