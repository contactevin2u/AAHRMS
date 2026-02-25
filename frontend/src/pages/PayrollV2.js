import React, { useState, useEffect, useCallback } from 'react';
import { payrollV2Api, departmentApi, payrollApi, outletsApi } from '../api';
import Layout from '../components/Layout';
import './PayrollV2.css';

function PayrollV2() {
  // Check if company uses outlets (Mimix = company_id 3)
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isMimix = adminInfo.company_id === 3;

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);

  // OT Summary state
  const [otSummary, setOtSummary] = useState(null);
  const [loadingOtSummary, setLoadingOtSummary] = useState(false);
  const [showOtDetails, setShowOtDetails] = useState(false);

  // AI Assistant state
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiComparison, setAiComparison] = useState(null);
  const [aiConversation, setAiConversation] = useState([]); // Chat history
  const [aiMode, setAiMode] = useState('initial'); // 'initial', 'reviewing', 'feedback'
  const [aiFeedback, setAiFeedback] = useState('');

  // Create form
  const [createForm, setCreateForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    department_id: ''
  });

  // Item edit form
  const [itemForm, setItemForm] = useState({
    basic_salary: 0,
    fixed_allowance: 0,
    ot_hours: 0,
    ot_amount: 0,
    ph_days_worked: 0,         // Public holiday days worked
    ph_pay: 0,                 // Public holiday extra pay
    incentive_amount: 0,
    commission_amount: 0,        // For Indoor/Outdoor Sales commission OR Driver trip commission
    trade_commission_amount: 0,  // For Driver upsell commission
    outstation_amount: 0,
    bonus: 0,
    other_deductions: 0,
    deduction_remarks: '',
    notes: ''
  });

  // Sidebar grouped collapse state - default all collapsed, expand on click
  const [expandedMonth, setExpandedMonth] = useState(null);

  // Statutory preview state
  const [statutoryPreview, setStatutoryPreview] = useState(null);
  const [loadingStatutory, setLoadingStatutory] = useState(false);

  useEffect(() => {
    fetchRuns();
    fetchDepartments();
  }, []);

  // Fetch OT summary when create modal is opened or form changes
  useEffect(() => {
    if (showCreateModal) {
      fetchOtSummary(createForm.year, createForm.month, createForm.department_id);
    }
  }, [showCreateModal, createForm.year, createForm.month, createForm.department_id]);

  const fetchDepartments = async () => {
    try {
      if (isMimix) {
        const res = await outletsApi.getAll();
        setOutlets(res.data);
      } else {
        const res = await departmentApi.getAll();
        setDepartments(res.data);
      }
    } catch (error) {
      console.error('Error fetching departments/outlets:', error);
    }
  };

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await payrollV2Api.getRuns();
      setRuns(res.data);
    } catch (error) {
      console.error('Error fetching runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRunDetails = async (id) => {
    try {
      const res = await payrollV2Api.getRun(id);
      // Flatten the response: merge run data with items array
      setSelectedRun({
        ...res.data.run,
        items: res.data.items
      });
    } catch (error) {
      console.error('Error fetching run details:', error);
    }
  };

  // Fetch OT summary for create modal
  const fetchOtSummary = async (year, month, departmentId) => {
    setLoadingOtSummary(true);
    try {
      const params = departmentId ? { department_id: departmentId } : {};
      const res = await payrollV2Api.getOTSummary(year, month, params);
      setOtSummary(res.data);
    } catch (error) {
      console.error('Error fetching OT summary:', error);
      setOtSummary(null);
    } finally {
      setLoadingOtSummary(false);
    }
  };

  const handleCreateRun = async (e) => {
    e.preventDefault();
    try {
      const res = await payrollV2Api.createRun(createForm);
      setShowCreateModal(false);
      fetchRuns();
      fetchRunDetails(res.data.run.id);

      // Build message with carry-forward info and warnings
      let message = `Payroll created for ${res.data.employee_count} employees.`;

      if (res.data.carried_forward_count > 0) {
        message += `\n\n✓ ${res.data.carried_forward_count} employee(s) had salary carried forward from previous month.`;
      }

      if (res.data.warning) {
        message += `\n\n⚠️ ${res.data.warning}\n\nPlease set their basic salary in Employees page.`;
      }

      // Only show alert if there's useful info
      if (res.data.carried_forward_count > 0 || res.data.warning) {
        alert(message);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create payroll run');
    }
  };

  const handleDeleteRun = async (id) => {
    if (window.confirm('Delete this payroll run? This will delete all associated payroll items.')) {
      try {
        await payrollV2Api.deleteRun(id);
        setSelectedRun(null);
        fetchRuns();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete payroll run');
      }
    }
  };

  // Recalculate all items in a run (refresh OT from clock-in records)
  const handleRecalculateAll = async (id) => {
    if (window.confirm('Recalculate OT and statutory deductions for all employees from clock-in records?\n\nThis will update OT hours, OT amount, EPF, SOCSO, EIS, and PCB.')) {
      try {
        const res = await payrollV2Api.recalculateAll(id);
        fetchRunDetails(id);
        fetchRuns();
        alert(`Recalculated ${res.data.recalculated} of ${res.data.total} employees.\n\nOT and statutory deductions have been updated from clock-in records.`);
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to recalculate');
      }
    }
  };

  // Recalculate single item
  const handleRecalculateItem = async (itemId) => {
    try {
      await payrollV2Api.recalculateItem(itemId);
      fetchRunDetails(selectedRun.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to recalculate');
    }
  };

  // AI Assistant functions
  const handleAIAnalyze = async (instructionParam) => {
    // Handle case where event is passed (from onClick) vs string (from code)
    const instruction = typeof instructionParam === 'string' ? instructionParam : aiInstruction;
    if (!instruction || !instruction.trim() || !selectedRun) return;

    setAiLoading(true);
    try {
      // Add to conversation history
      const newConversation = [...aiConversation, { role: 'user', content: instruction }];
      setAiConversation(newConversation);

      const res = await payrollV2Api.aiAnalyze({
        run_id: selectedRun.id,
        instruction: instruction,
        conversation: newConversation // Send history for context
      });

      setAiAnalysis(res.data.analysis);
      setAiMode('reviewing');
      setAiInstruction('');

      // Add AI response to conversation
      setAiConversation([...newConversation, {
        role: 'assistant',
        content: res.data.analysis.summary,
        analysis: res.data.analysis
      }]);
    } catch (error) {
      alert(error.response?.data?.error || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIApply = async () => {
    if (!aiAnalysis?.changes || aiAnalysis.changes.length === 0) return;

    setAiLoading(true);
    try {
      await payrollV2Api.aiApply({
        run_id: selectedRun.id,
        changes: aiAnalysis.changes
      });
      // Refresh data
      fetchRunDetails(selectedRun.id);
      fetchRuns();

      // Add success to conversation
      setAiConversation([...aiConversation, {
        role: 'system',
        content: `✅ Changes applied successfully! ${aiAnalysis.changes.length} item(s) updated.`
      }]);

      setAiAnalysis(null);
      setAiMode('initial');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to apply changes');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIDisagree = () => {
    // Switch to feedback mode
    setAiMode('feedback');
    setAiFeedback('');
  };

  const handleAIFeedback = async () => {
    if (!aiFeedback || !aiFeedback.trim()) return;

    // Combine original instruction with feedback
    const refinedInstruction = `Previous request: "${aiConversation.find(c => c.role === 'user')?.content || ''}"

HR Feedback: "${aiFeedback}"

Please adjust the changes based on this feedback.`;

    setAiFeedback('');
    setAiMode('reviewing');
    await handleAIAnalyze(refinedInstruction);
  };

  const handleAICompare = async () => {
    if (!selectedRun) return;

    setAiLoading(true);
    try {
      const res = await payrollV2Api.aiCompare({ run_id: selectedRun.id });
      setAiComparison(res.data);
    } catch (error) {
      alert(error.response?.data?.error || 'Comparison failed');
    } finally {
      setAiLoading(false);
    }
  };

  const resetAIAssistant = () => {
    setAiAnalysis(null);
    setAiComparison(null);
    setAiInstruction('');
    setAiConversation([]);
    setAiMode('initial');
    setAiFeedback('');
  };

  const handleFinalizeRun = async (id) => {
    if (window.confirm('Finalize this payroll run? This will lock all items and link claims. This action cannot be undone.')) {
      try {
        await payrollV2Api.finalizeRun(id);
        fetchRunDetails(id);
        fetchRuns();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to finalize payroll run');
      }
    }
  };

  const handleDownloadBankFile = async (id) => {
    try {
      const res = await payrollV2Api.getBankFile(id);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank_transfer_${selectedRun?.month}_${selectedRun?.year}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Failed to download bank file');
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    const formData = {
      basic_salary: item.basic_salary || 0,
      fixed_allowance: item.fixed_allowance || 0,
      ot_hours: item.ot_hours || 0,
      ot_amount: item.ot_amount || 0,
      ph_days_worked: item.ph_days_worked || 0,
      ph_pay: item.ph_pay || 0,
      incentive_amount: item.incentive_amount || 0,
      commission_amount: item.commission_amount || 0,
      trade_commission_amount: item.trade_commission_amount || 0,
      outstation_amount: item.outstation_amount || 0,
      bonus: item.bonus || 0,
      other_deductions: item.other_deductions || 0,
      deduction_remarks: item.deduction_remarks || '',
      notes: item.notes || ''
    };
    setItemForm(formData);
    setShowItemModal(true);
    // Fetch initial statutory preview
    const statutoryBase = (parseFloat(formData.basic_salary) || 0) +
                          (parseFloat(formData.commission_amount) || 0) +
                          (parseFloat(formData.trade_commission_amount) || 0) +
                          (parseFloat(formData.bonus) || 0);
    fetchStatutoryPreview(item.employee_id, statutoryBase);
  };

  // Get department-specific field visibility
  const getDepartmentFields = (deptName) => {
    const dept = (deptName || '').toLowerCase();
    return {
      // Office: basic + allowance + bonus + OT
      showAllowance: dept === 'office' || dept === 'outdoor sales',
      showBonus: dept === 'office' || dept === 'outdoor sales',
      showOT: true, // OT available for all departments
      // Indoor Sales: basic + commission
      showCommission: dept === 'indoor sales' || dept === 'outdoor sales',
      // Outdoor Sales: basic + commission + allowance + bonus
      // Driver: basic + upsell commission + outstation + OT + trip commission
      showUpsellCommission: dept === 'driver',
      showTripCommission: dept === 'driver',
      showOutstation: dept === 'driver',
      // All departments have basic salary
      showBasic: true
    };
  };

  // Calculate OT amount based on OT hours (1.0x rate)
  // OT Amount = (Basic / working days / 8 hours) * OT hours * 1.0
  const calculateOTAmount = (basicSalary, otHours, workingDays = 22) => {
    if (!basicSalary || !otHours || otHours <= 0) return 0;
    const dailyRate = basicSalary / workingDays;
    const hourlyRate = dailyRate / 8;
    const otAmount = hourlyRate * otHours * 1.0; // 1.0x rate
    return Math.round(otAmount * 100) / 100;
  };

  // Calculate public holiday extra pay (1.0x daily rate per PH day worked)
  const calculatePHPay = (basicSalary, phDaysWorked, workingDays = 22) => {
    if (!basicSalary || !phDaysWorked || phDaysWorked <= 0) return 0;
    const dailyRate = basicSalary / workingDays;
    const phPay = dailyRate * phDaysWorked * 1.0; // 1.0x extra
    return Math.round(phPay * 100) / 100;
  };

  // Handle OT hours change - auto-calculate OT amount
  const handleOTHoursChange = (otHours) => {
    const calculatedOT = calculateOTAmount(itemForm.basic_salary, otHours);
    setItemForm({
      ...itemForm,
      ot_hours: otHours,
      ot_amount: calculatedOT
    });
  };

  // Handle PH days change - auto-calculate PH pay
  const handlePHDaysChange = (phDays) => {
    const calculatedPH = calculatePHPay(itemForm.basic_salary, phDays);
    setItemForm({
      ...itemForm,
      ph_days_worked: phDays,
      ph_pay: calculatedPH
    });
  };

  // Fetch statutory preview calculation
  const fetchStatutoryPreview = useCallback(async (employeeId, statutoryBase) => {
    if (!employeeId || statutoryBase <= 0) {
      setStatutoryPreview(null);
      return;
    }
    setLoadingStatutory(true);
    try {
      const res = await payrollApi.calculateStatutory({
        employee_id: employeeId,
        gross_salary: statutoryBase  // This is actually the statutory base
      });
      setStatutoryPreview(res.data);
    } catch (error) {
      console.error('Error fetching statutory preview:', error);
      setStatutoryPreview(null);
    } finally {
      setLoadingStatutory(false);
    }
  }, []);

  // Calculate statutory base from form values
  const getStatutoryBase = useCallback((form) => {
    // Statutory base = basic + commission + trade_commission + bonus
    return (parseFloat(form.basic_salary) || 0) +
           (parseFloat(form.commission_amount) || 0) +
           (parseFloat(form.trade_commission_amount) || 0) +
           (parseFloat(form.bonus) || 0);
  }, []);

  // Handle basic salary change - recalculate OT, PH, and statutory preview
  const handleBasicSalaryChange = (basicSalary) => {
    const calculatedOT = calculateOTAmount(basicSalary, itemForm.ot_hours);
    const calculatedPH = calculatePHPay(basicSalary, itemForm.ph_days_worked);
    const newForm = {
      ...itemForm,
      basic_salary: basicSalary,
      ot_amount: calculatedOT,
      ph_pay: calculatedPH
    };
    setItemForm(newForm);
    // Trigger statutory preview
    if (editingItem) {
      const statutoryBase = getStatutoryBase(newForm);
      fetchStatutoryPreview(editingItem.employee_id, statutoryBase);
    }
  };

  // Handle commission/bonus changes - also update statutory preview
  const handleStatutoryFieldChange = (field, value) => {
    const newForm = { ...itemForm, [field]: value };
    setItemForm(newForm);
    if (editingItem) {
      const statutoryBase = getStatutoryBase(newForm);
      fetchStatutoryPreview(editingItem.employee_id, statutoryBase);
    }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    try {
      await payrollV2Api.updateItem(editingItem.id, itemForm);
      setShowItemModal(false);
      setEditingItem(null);
      fetchRunDetails(selectedRun.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update item');
    }
  };

  const handleViewPayslip = async (itemId) => {
    try {
      const res = await payrollV2Api.getItemPayslip(itemId);
      // Open payslip in new window
      const payslipWindow = window.open('', '_blank');
      payslipWindow.document.write(generatePayslipHTML(res.data));
    } catch (error) {
      alert('Failed to generate payslip');
    }
  };

  const generatePayslipHTML = (data) => {
    // Extract nested data
    const emp = data.employee || {};
    const period = data.period || {};
    const earnings = data.earnings || {};
    const deductions = data.deductions || {};
    const employer = data.employer_contributions || {};
    const totals = data.totals || {};

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payslip - ${emp.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e293b; padding-bottom: 20px; }
          .header h1 { color: #1e293b; margin: 0; }
          .header p { color: #64748b; margin: 5px 0; }
          .employee-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-block { }
          .info-block h3 { margin: 0 0 10px 0; color: #1e293b; }
          .info-block p { margin: 5px 0; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f1f5f9; color: #1e293b; }
          .section-title { background: #1e293b; color: white; font-weight: bold; }
          .total-row { font-weight: bold; background: #f5f5f5; }
          .amount { text-align: right; }
          .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${data.company?.name || 'AA Alive Enterprise'}</h1>
          <p>PAYSLIP</p>
          <p>For the month of ${period.month_name || getMonthName(period.month)} ${period.year}</p>
        </div>

        <div class="employee-info">
          <div class="info-block">
            <h3>Employee Details</h3>
            <p><strong>Name:</strong> ${emp.name || '-'}</p>
            <p><strong>Employee ID:</strong> ${emp.code || '-'}</p>
            <p><strong>${isMimix ? 'Outlet' : 'Department'}:</strong> ${isMimix ? emp.outlet_name : emp.department || '-'}</p>
            <p><strong>Position:</strong> ${emp.position || '-'}</p>
          </div>
          <div class="info-block">
            <h3>Payment Details</h3>
            <p><strong>Bank:</strong> ${emp.bank_name || '-'}</p>
            <p><strong>Account No:</strong> ${emp.bank_account_no || '-'}</p>
            <p><strong>EPF No:</strong> ${emp.epf_number || '-'}</p>
            <p><strong>SOCSO No:</strong> ${emp.socso_number || '-'}</p>
          </div>
        </div>

        <table>
          <tr class="section-title"><td colspan="2">EARNINGS</td></tr>
          <tr><td>Basic Salary</td><td class="amount">RM ${formatNum(earnings.basic_salary)}</td></tr>
          <tr><td>Allowance</td><td class="amount">RM ${formatNum(earnings.fixed_allowance)}</td></tr>
          ${earnings.ot_amount > 0 ? `<tr><td>OT (${earnings.ot_hours || 0} hrs @ 1.0x)</td><td class="amount">RM ${formatNum(earnings.ot_amount)}</td></tr>` : ''}
          ${earnings.ph_pay > 0 ? `<tr><td>Public Holiday Pay (${earnings.ph_days_worked || 0} days @ 1.0x)</td><td class="amount">RM ${formatNum(earnings.ph_pay)}</td></tr>` : ''}
          ${earnings.incentive_amount > 0 ? `<tr><td>Incentive</td><td class="amount">RM ${formatNum(earnings.incentive_amount)}</td></tr>` : ''}
          ${earnings.commission_amount > 0 ? `<tr><td>Commission</td><td class="amount">RM ${formatNum(earnings.commission_amount)}</td></tr>` : ''}
          ${earnings.trade_commission_amount > 0 ? `<tr><td>Upsell Commission</td><td class="amount">RM ${formatNum(earnings.trade_commission_amount)}</td></tr>` : ''}
          ${earnings.outstation_amount > 0 ? `<tr><td>Outstation</td><td class="amount">RM ${formatNum(earnings.outstation_amount)}</td></tr>` : ''}
          ${earnings.bonus > 0 ? `<tr><td>Bonus</td><td class="amount">RM ${formatNum(earnings.bonus)}</td></tr>` : ''}
          ${earnings.claims_amount > 0 ? `<tr><td>Claims</td><td class="amount">RM ${formatNum(earnings.claims_amount)}</td></tr>` : ''}
          <tr class="total-row"><td>GROSS PAY</td><td class="amount">RM ${formatNum(totals.gross_salary)}</td></tr>
        </table>

        <table>
          <tr class="section-title"><td colspan="2">DEDUCTIONS</td></tr>
          <tr><td>EPF (Employee)</td><td class="amount">RM ${formatNum(deductions.epf_employee)}</td></tr>
          <tr><td>SOCSO (Employee)</td><td class="amount">RM ${formatNum(deductions.socso_employee)}</td></tr>
          <tr><td>EIS (Employee)</td><td class="amount">RM ${formatNum(deductions.eis_employee)}</td></tr>
          <tr><td>PCB (Tax)</td><td class="amount">RM ${formatNum(deductions.pcb)}</td></tr>
          ${deductions.unpaid_leave_deduction > 0 ? `<tr><td>Unpaid Leave (${deductions.unpaid_leave_days} days)</td><td class="amount">RM ${formatNum(deductions.unpaid_leave_deduction)}</td></tr>` : ''}
          ${deductions.other_deductions > 0 ? `<tr><td>Other Deductions</td><td class="amount">RM ${formatNum(deductions.other_deductions)}</td></tr>` : ''}
          <tr class="total-row"><td>TOTAL DEDUCTIONS</td><td class="amount">RM ${formatNum(totals.total_deductions)}</td></tr>
        </table>

        <table>
          <tr class="section-title"><td colspan="2">EMPLOYER CONTRIBUTIONS</td></tr>
          <tr><td>EPF (Employer)</td><td class="amount">RM ${formatNum(employer.epf_employer)}</td></tr>
          <tr><td>SOCSO (Employer)</td><td class="amount">RM ${formatNum(employer.socso_employer)}</td></tr>
          <tr><td>EIS (Employer)</td><td class="amount">RM ${formatNum(employer.eis_employer)}</td></tr>
        </table>

        <table>
          <tr style="background: #1e293b; color: white;"><td><strong>NET PAY</strong></td><td class="amount" style="font-size: 1.3em;"><strong>RM ${formatNum(totals.net_pay)}</strong></td></tr>
        </table>

        <div class="footer">
          <p>This is a computer-generated payslip. No signature required.</p>
          <p>Generated on ${new Date().toLocaleDateString('en-MY')}</p>
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `;
  };

  const formatNum = (num) => {
    return parseFloat(num || 0).toFixed(2);
  };

  const getMonthName = (month) => {
    return new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    const classes = {
      draft: 'status-badge draft',
      finalized: 'status-badge finalized'
    };
    return <span className={classes[status] || 'status-badge'}>{status}</span>;
  };

  return (
    <Layout>
      <div className="payroll-v2-page">
        <header className="page-header">
          <div>
            <h1>Payroll</h1>
            <p>Manage monthly payroll runs</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="add-btn">
            + New Payroll Run
          </button>
        </header>

        <div className="payroll-layout">
          {/* Runs List */}
          <div className="runs-panel">
            <h3>Payroll Runs</h3>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="no-data">No payroll runs yet</div>
            ) : (
              <div className="runs-list">
                {(() => {
                  // Group runs by month-year
                  const grouped = {};
                  runs.forEach(run => {
                    const key = `${run.year}-${String(run.month).padStart(2, '0')}`;
                    if (!grouped[key]) {
                      grouped[key] = { month: run.month, year: run.year, runs: [] };
                    }
                    grouped[key].runs.push(run);
                  });
                  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

                  // Auto-expand the month that contains selectedRun
                  const activeKey = expandedMonth || (selectedRun
                    ? `${selectedRun.year}-${String(selectedRun.month).padStart(2, '0')}`
                    : sortedKeys[0]);

                  return sortedKeys.map(key => {
                    const group = grouped[key];
                    const isOpen = key === activeKey;
                    const allFinalized = group.runs.every(r => r.status === 'finalized');
                    const hasDraft = group.runs.some(r => r.status === 'draft');

                    return (
                      <div key={key} className={`month-group ${isOpen ? 'open' : ''}`}>
                        <div
                          className="month-header"
                          onClick={() => setExpandedMonth(isOpen ? null : key)}
                        >
                          <span className={`month-chevron ${!isOpen ? 'collapsed' : ''}`}>▾</span>
                          <span className="month-label">
                            {getMonthName(group.month).substring(0, 3)} {group.year}
                          </span>
                          <span className={`month-status ${allFinalized ? 'done' : hasDraft ? 'has-draft' : ''}`}>
                            {allFinalized ? '✓' : group.runs.length}
                          </span>
                        </div>
                        {isOpen && (
                          <div className="month-runs">
                            {group.runs.map(run => (
                              <div
                                key={run.id}
                                className={`run-card ${selectedRun?.id === run.id ? 'selected' : ''}`}
                                onClick={() => fetchRunDetails(run.id)}
                              >
                                <div className="run-row">
                                  <span className="run-dept-name">{run.department_name || 'All'}</span>
                                  {getStatusBadge(run.status)}
                                </div>
                                <div className="run-amount">{formatAmount(run.total_net)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Run Details */}
          <div className="details-panel">
            {selectedRun ? (
              <>
                <div className="details-header">
                  <div>
                    <h2>
                      {getMonthName(selectedRun.month)} {selectedRun.year}
                      {selectedRun.department_name && (
                        <span className="dept-tag"> - {selectedRun.department_name}</span>
                      )}
                    </h2>
                    {getStatusBadge(selectedRun.status)}
                  </div>
                  <div className="details-actions">
                    {selectedRun.status === 'draft' && (
                      <>
                        <button onClick={() => handleRecalculateAll(selectedRun.id)} className="recalculate-btn" title="Refresh OT from clock-in records">
                          Recalculate OT
                        </button>
                        <button onClick={() => handleFinalizeRun(selectedRun.id)} className="finalize-btn">
                          Finalize
                        </button>
                        <button onClick={() => handleDeleteRun(selectedRun.id)} className="delete-btn">
                          Delete
                        </button>
                      </>
                    )}
                    {selectedRun.status === 'finalized' && (
                      <button onClick={() => handleDownloadBankFile(selectedRun.id)} className="download-btn">
                        Download Bank File
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="summary-stats">
                  <div className="summary-stat">
                    <span className="stat-label">Employees</span>
                    <span className="stat-value">{selectedRun.items?.length || 0}</span>
                  </div>
                  <div className="summary-stat">
                    <span className="stat-label">Gross Total</span>
                    <span className="stat-value">{formatAmount(selectedRun.total_gross)}</span>
                  </div>
                  <div className="summary-stat">
                    <span className="stat-label">Deductions</span>
                    <span className="stat-value">{formatAmount(selectedRun.total_deductions)}</span>
                  </div>
                  <div className="summary-stat highlight">
                    <span className="stat-label">Net Total</span>
                    <span className="stat-value">{formatAmount(selectedRun.total_net)}</span>
                  </div>
                  {selectedRun.status === 'draft' && (
                    <div
                      className="summary-stat ai-toggle"
                      onClick={() => { setShowAIAssistant(!showAIAssistant); resetAIAssistant(); }}
                    >
                      <span className="stat-value">🤖</span>
                      <span className="stat-label">AI Assistant</span>
                    </div>
                  )}
                </div>

                {/* AI Payroll Assistant */}
                {showAIAssistant && selectedRun.status === 'draft' && (
                  <div className="ai-assistant-panel">
                    <div className="ai-header">
                      <h3>🤖 AI Payroll Assistant</h3>
                      <p>Describe what changes you want compared to last payroll, or ask for a comparison.</p>
                    </div>

                    <div className="ai-actions-row">
                      <button onClick={handleAICompare} className="ai-compare-btn" disabled={aiLoading}>
                        📊 Compare with Last Month
                      </button>
                    </div>

                    <div className="ai-input-section">
                      <textarea
                        value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        placeholder="Examples:
• Ali got promotion, increase basic salary by RM300
• Add RM200 bonus for all employees
• Increase MAHADI's salary to RM3000
• Deduct RM100 from HAFIZ for uniform"
                        rows={4}
                        disabled={aiLoading}
                      />
                      <button onClick={handleAIAnalyze} className="ai-analyze-btn" disabled={aiLoading || !aiInstruction.trim()}>
                        {aiLoading ? 'Analyzing...' : '✨ Analyze'}
                      </button>
                    </div>

                    {/* Comparison Results */}
                    {aiComparison && (
                      <div className="ai-comparison">
                        <h4>📊 Comparison: {aiComparison.current_period} vs {aiComparison.previous_period}</h4>
                        <div className="comparison-summary">
                          <div className="comp-stat">
                            <span>Current Total</span>
                            <strong>{formatAmount(aiComparison.summary.current_total_net)}</strong>
                          </div>
                          <div className="comp-stat">
                            <span>Previous Total</span>
                            <strong>{formatAmount(aiComparison.summary.previous_total_net)}</strong>
                          </div>
                          <div className={`comp-stat ${aiComparison.summary.difference >= 0 ? 'positive' : 'negative'}`}>
                            <span>Difference</span>
                            <strong>{aiComparison.summary.difference >= 0 ? '+' : ''}{formatAmount(aiComparison.summary.difference)}</strong>
                          </div>
                        </div>
                        {aiComparison.comparison.filter(c => c.changes.length > 0 || c.is_new).length > 0 && (
                          <div className="comparison-details">
                            <h5>Changes Detected:</h5>
                            <ul>
                              {aiComparison.comparison.filter(c => c.changes.length > 0 || c.is_new).map((c, idx) => (
                                <li key={idx}>
                                  <strong>{c.employee_name}</strong>
                                  {c.is_new ? ' (New employee)' : ''}
                                  {c.net_difference !== null && (
                                    <span className={c.net_difference >= 0 ? 'change-up' : 'change-down'}>
                                      {' '}Net: {c.net_difference >= 0 ? '+' : ''}{formatAmount(c.net_difference)}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Conversation History */}
                    {aiConversation.length > 0 && (
                      <div className="ai-conversation">
                        {aiConversation.map((msg, idx) => (
                          <div key={idx} className={`ai-message ${msg.role}`}>
                            {msg.role === 'user' && <span className="msg-icon">👤</span>}
                            {msg.role === 'assistant' && <span className="msg-icon">🤖</span>}
                            {msg.role === 'system' && <span className="msg-icon">✅</span>}
                            <span className="msg-content">{msg.content}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI Analysis Results */}
                    {aiAnalysis && aiMode === 'reviewing' && (
                      <div className="ai-analysis">
                        {!aiAnalysis.understood ? (
                          <div className="ai-clarification">
                            <p>🤔 {aiAnalysis.clarification || 'I need more information to understand your request.'}</p>
                            <div className="ai-input-section" style={{ marginTop: '15px' }}>
                              <input
                                type="text"
                                value={aiInstruction}
                                onChange={(e) => setAiInstruction(e.target.value)}
                                placeholder="Provide more details..."
                                onKeyPress={(e) => e.key === 'Enter' && handleAIAnalyze()}
                              />
                              <button onClick={() => handleAIAnalyze()} className="ai-analyze-btn" disabled={aiLoading}>
                                Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="ai-summary">
                              <h4>📝 Summary</h4>
                              <p>{aiAnalysis.summary}</p>
                            </div>

                            {aiAnalysis.preview && aiAnalysis.preview.length > 0 && (
                              <div className="ai-preview">
                                <h4>📋 Proposed Changes</h4>
                                <table className="changes-table">
                                  <thead>
                                    <tr>
                                      <th>Employee</th>
                                      <th>Field</th>
                                      <th>Current</th>
                                      <th>New</th>
                                      <th>Net Impact</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {aiAnalysis.preview.map((change, idx) => (
                                      <tr key={idx}>
                                        <td><strong>{change.employee_name}</strong></td>
                                        <td>{change.field.replace(/_/g, ' ')}</td>
                                        <td>{formatAmount(change.current_value)}</td>
                                        <td className="new-value">{formatAmount(change.new_value)}</td>
                                        <td className={change.difference >= 0 ? 'positive' : 'negative'}>
                                          {change.difference >= 0 ? '+' : ''}{formatAmount(change.difference)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>

                                {aiAnalysis.impact && (
                                  <div className="ai-impact">
                                    <span>Total Additional Cost: <strong>{formatAmount(aiAnalysis.impact.total_additional_cost)}</strong></span>
                                    <span>Affected: <strong>{aiAnalysis.impact.affected_employees}</strong> employee(s)</span>
                                  </div>
                                )}

                                <div className="ai-decision">
                                  <button onClick={handleAIApply} className="ai-agree-btn" disabled={aiLoading}>
                                    ✅ Agree & Apply
                                  </button>
                                  <button onClick={handleAIDisagree} className="ai-disagree-btn">
                                    ❌ Disagree
                                  </button>
                                  <button onClick={resetAIAssistant} className="ai-reset-btn">
                                    🔄 Start Over
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Feedback Mode - When HR disagrees */}
                    {aiMode === 'feedback' && (
                      <div className="ai-feedback-section">
                        <div className="feedback-header">
                          <h4>🤔 What's wrong with the changes?</h4>
                          <p>Tell me what needs to be adjusted and I'll fix it.</p>
                        </div>
                        <div className="ai-input-section">
                          <textarea
                            value={aiFeedback}
                            onChange={(e) => setAiFeedback(e.target.value)}
                            placeholder="Examples:
• The amount for Ali should be RM400, not RM300
• Don't include HAFIZ in the changes
• Also add bonus for MAHADI
• Change it to allowance instead of bonus"
                            rows={4}
                            autoFocus
                          />
                          <button onClick={handleAIFeedback} className="ai-analyze-btn" disabled={aiLoading || !aiFeedback.trim()}>
                            {aiLoading ? 'Analyzing...' : '✨ Update'}
                          </button>
                        </div>
                        <button onClick={() => setAiMode('reviewing')} className="ai-back-btn">
                          ← Back to review
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Items Table - Full Calculation Breakdown */}
                <div className="items-table full-breakdown">
                  <table>
                    <thead>
                      <tr>
                        <th className="th-employee">Employee</th>
                        <th className="th-earning">Basic</th>
                        <th className="th-earning">OT</th>
                        <th className="th-earning">Allowance</th>
                        <th className="th-earning">Claims</th>
                        <th className="th-earning">Comm.</th>
                        <th className="th-gross">Gross</th>
                        <th className="th-deduction">EPF</th>
                        <th className="th-deduction">SOCSO</th>
                        <th className="th-deduction">EIS</th>
                        <th className="th-deduction">PCB</th>
                        <th className="th-deduction">Advance</th>
                        <th className="th-net">Net Pay</th>
                        <th className="th-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRun.items?.map(item => {
                        const hasOT = parseFloat(item.ot_hours) > 0;
                        const hasClaims = parseFloat(item.claims_amount) > 0;
                        const hasAdvance = parseFloat(item.advance_deduction) > 0;
                        const hasCommission = parseFloat(item.commission_amount) > 0 || parseFloat(item.trade_commission_amount) > 0;

                        return (
                          <tr key={item.id}>
                            <td className="employee-cell">
                              <strong>{item.employee_name}</strong>
                              <small>{item.emp_code}</small>
                            </td>
                            <td>{formatAmount(item.basic_salary)}</td>
                            <td className={hasOT ? 'has-value' : 'zero-value'}>
                              {hasOT ? (
                                <span title={`${item.ot_hours} hrs`}>
                                  {formatAmount(item.ot_amount)}
                                  <small className="hours-label">{item.ot_hours}h</small>
                                </span>
                              ) : '-'}
                            </td>
                            <td className={parseFloat(item.fixed_allowance) > 0 ? '' : 'zero-value'}>
                              {parseFloat(item.fixed_allowance) > 0 ? formatAmount(item.fixed_allowance) : '-'}
                            </td>
                            <td className={hasClaims ? 'has-value claims' : 'zero-value'}>
                              {hasClaims ? formatAmount(item.claims_amount) : '-'}
                            </td>
                            <td className={hasCommission ? 'has-value' : 'zero-value'}>
                              {hasCommission ? formatAmount((parseFloat(item.commission_amount) || 0) + (parseFloat(item.trade_commission_amount) || 0)) : '-'}
                            </td>
                            <td className="gross-cell"><strong>{formatAmount(item.gross_salary)}</strong></td>
                            <td className="deduction">{formatAmount(item.epf_employee)}</td>
                            <td className="deduction">{formatAmount(item.socso_employee)}</td>
                            <td className="deduction">{formatAmount(item.eis_employee)}</td>
                            <td className="deduction">{formatAmount(item.pcb)}</td>
                            <td className={hasAdvance ? 'deduction advance' : 'zero-value'}>
                              {hasAdvance ? formatAmount(item.advance_deduction) : '-'}
                            </td>
                            <td className="net-cell"><strong>{formatAmount(item.net_pay)}</strong></td>
                            <td className="actions-cell">
                              {selectedRun.status === 'draft' && (
                                <>
                                  <button onClick={() => handleRecalculateItem(item.id)} className="action-btn recalc" title="Recalculate OT">
                                    ↻
                                  </button>
                                  <button onClick={() => handleEditItem(item)} className="action-btn edit" title="Edit">
                                    ✎
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleViewPayslip(item.id)} className="action-btn view" title="View Payslip">
                                📄
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="totals-row">
                        <td><strong>TOTAL</strong></td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.basic_salary || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.ot_amount || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.fixed_allowance || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.claims_amount || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.commission_amount || 0) + parseFloat(i.trade_commission_amount || 0), 0))}</td>
                        <td><strong>{formatAmount(selectedRun.total_gross)}</strong></td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.epf_employee || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.socso_employee || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.eis_employee || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.pcb || 0), 0))}</td>
                        <td>{formatAmount(selectedRun.items?.reduce((s, i) => s + parseFloat(i.advance_deduction || 0), 0))}</td>
                        <td><strong>{formatAmount(selectedRun.total_net)}</strong></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Statutory Totals */}
                <div className="statutory-totals">
                  <h4>Statutory Contributions</h4>
                  <div className="statutory-grid">
                    <div className="statutory-item">
                      <span>EPF (Employee)</span>
                      <strong>{formatAmount(selectedRun.total_epf_employee)}</strong>
                    </div>
                    <div className="statutory-item">
                      <span>EPF (Employer)</span>
                      <strong>{formatAmount(selectedRun.total_epf_employer)}</strong>
                    </div>
                    <div className="statutory-item">
                      <span>SOCSO (Employee)</span>
                      <strong>{formatAmount(selectedRun.total_socso_employee)}</strong>
                    </div>
                    <div className="statutory-item">
                      <span>SOCSO (Employer)</span>
                      <strong>{formatAmount(selectedRun.total_socso_employer)}</strong>
                    </div>
                    <div className="statutory-item">
                      <span>EIS (Employee)</span>
                      <strong>{formatAmount(selectedRun.total_eis_employee)}</strong>
                    </div>
                    <div className="statutory-item">
                      <span>EIS (Employer)</span>
                      <strong>{formatAmount(selectedRun.total_eis_employer)}</strong>
                    </div>
                    <div className="statutory-item">
                      <span>PCB (Tax)</span>
                      <strong>{formatAmount(selectedRun.total_pcb)}</strong>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="no-selection">
                <p>Select a payroll run to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Create Payroll Run</h2>
              <form onSubmit={handleCreateRun}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Month</label>
                    <select
                      value={createForm.month}
                      onChange={(e) => setCreateForm({ ...createForm, month: parseInt(e.target.value) })}
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Year</label>
                    <select
                      value={createForm.year}
                      onChange={(e) => setCreateForm({ ...createForm, year: parseInt(e.target.value) })}
                    >
                      {[2023, 2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>{isMimix ? 'Outlet' : 'Department'}</label>
                  <select
                    value={createForm.department_id}
                    onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })}
                  >
                    <option value="">{isMimix ? 'All Outlets' : 'All Departments'}</option>
                    {(isMimix ? outlets : departments).map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="info-box">
                  {createForm.department_id
                    ? `This will create payroll items for active employees in the selected ${isMimix ? 'outlet' : 'department'}.`
                    : `This will create payroll items for all active employees.`
                  }
                  {' '}Unpaid leave and approved claims will be auto-calculated.
                </div>

                {/* OT Summary Section */}
                <div className="ot-summary-section">
                  <h4>OT Summary for {new Date(2000, createForm.month - 1).toLocaleString('en', { month: 'long' })} {createForm.year}</h4>
                  {loadingOtSummary ? (
                    <p className="loading-text">Loading OT summary...</p>
                  ) : otSummary ? (
                    <>
                      <div className="ot-summary-stats">
                        <div className="stat approved">
                          <span className="label">Approved OT</span>
                          <span className="value">{otSummary.totals.approved_ot_hours} hrs</span>
                          <span className="amount">~RM {otSummary.totals.estimated_ot_pay.toLocaleString()}</span>
                        </div>
                        <div className="stat pending">
                          <span className="label">Pending OT</span>
                          <span className="value">{otSummary.totals.pending_ot_hours} hrs</span>
                          <span className="count">{otSummary.totals.employees_with_pending_ot} employee(s)</span>
                        </div>
                        <div className="stat rejected">
                          <span className="label">Rejected OT</span>
                          <span className="value">{otSummary.totals.rejected_ot_hours} hrs</span>
                        </div>
                      </div>

                      {otSummary.totals.pending_ot_hours > 0 && (
                        <div className="ot-warning">
                          <strong>Warning:</strong> There are {otSummary.totals.pending_ot_hours} hours of pending OT for {otSummary.totals.employees_with_pending_ot} employee(s).
                          Only approved OT will be included in payroll.
                          <a href="/attendance" target="_blank" rel="noopener noreferrer"> Approve OT in Attendance page</a>
                        </div>
                      )}

                      {otSummary.summary.length > 0 && (
                        <div className="ot-details-toggle">
                          <button type="button" onClick={() => setShowOtDetails(!showOtDetails)} className="toggle-btn">
                            {showOtDetails ? 'Hide' : 'Show'} Employee Details ({otSummary.summary.length})
                          </button>
                        </div>
                      )}

                      {showOtDetails && otSummary.summary.length > 0 && (
                        <div className="ot-details-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Employee</th>
                                <th>{isMimix ? 'Outlet' : 'Dept'}</th>
                                <th className="right">Approved</th>
                                <th className="right">Pending</th>
                                <th className="right">Est. Pay</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otSummary.summary.map(emp => (
                                <tr key={emp.employee_id} className={emp.pending_ot_hours > 0 ? 'has-pending' : ''}>
                                  <td>{emp.employee_name}</td>
                                  <td>{isMimix ? emp.outlet_name : emp.department_name || '-'}</td>
                                  <td className="right">{emp.approved_ot_hours} hrs</td>
                                  <td className="right">{emp.pending_ot_hours > 0 ? `${emp.pending_ot_hours} hrs` : '-'}</td>
                                  <td className="right">RM {emp.estimated_ot_pay.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="no-data">No OT data available</p>
                  )}
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Create Run</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Item Modal */}
        {showItemModal && editingItem && (() => {
          const fields = getDepartmentFields(editingItem.department_name);
          return (
          <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Payroll - {editingItem.employee_name}</h2>
                <p className="dept-info">{isMimix ? 'Outlet' : 'Department'}: <strong>{isMimix ? editingItem.outlet_name : editingItem.department_name || 'Unknown'}</strong></p>
              </div>
              <form onSubmit={handleUpdateItem}>
                <div className="modal-scroll-content">
                {/* Basic Salary - All departments */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Basic Salary (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.basic_salary}
                      onChange={(e) => handleBasicSalaryChange(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  {/* Allowance - Office, Outdoor Sales */}
                  {fields.showAllowance && (
                    <div className="form-group">
                      <label>Allowance (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.fixed_allowance}
                        onChange={(e) => setItemForm({ ...itemForm, fixed_allowance: parseFloat(e.target.value) || 0 })}
                      />
                      <small className="field-hint">Not subject to statutory deductions</small>
                    </div>
                  )}
                </div>

                {/* OT - Office, Driver */}
                {fields.showOT && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>OT Hours</label>
                        <input
                          type="number"
                          step="0.5"
                          value={itemForm.ot_hours}
                          onChange={(e) => handleOTHoursChange(parseFloat(e.target.value) || 0)}
                        />
                        <small className="field-hint">Rate: 1.0x hourly</small>
                      </div>
                      <div className="form-group">
                        <label>OT Amount (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={itemForm.ot_amount}
                          onChange={(e) => setItemForm({ ...itemForm, ot_amount: parseFloat(e.target.value) || 0 })}
                        />
                        <small className="field-hint">Auto-calculated or manual override</small>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Public Holiday Days Worked</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={itemForm.ph_days_worked}
                          onChange={(e) => handlePHDaysChange(parseFloat(e.target.value) || 0)}
                        />
                        <small className="field-hint">Extra 1.0x daily rate</small>
                      </div>
                      <div className="form-group">
                        <label>PH Extra Pay (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={itemForm.ph_pay}
                          onChange={(e) => setItemForm({ ...itemForm, ph_pay: parseFloat(e.target.value) || 0 })}
                        />
                        <small className="field-hint">Auto-calculated or manual override</small>
                      </div>
                    </div>
                  </>
                )}

                {/* Commission - Indoor Sales, Outdoor Sales */}
                {fields.showCommission && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Commission (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.commission_amount}
                        onChange={(e) => handleStatutoryFieldChange('commission_amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Incentive (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.incentive_amount}
                        onChange={(e) => setItemForm({ ...itemForm, incentive_amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}

                {/* Driver-specific fields */}
                {fields.showUpsellCommission && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Upsell Commission (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.trade_commission_amount}
                        onChange={(e) => handleStatutoryFieldChange('trade_commission_amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Trip Commission (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.commission_amount}
                        onChange={(e) => handleStatutoryFieldChange('commission_amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                )}

                {fields.showOutstation && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Outstation (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.outstation_amount}
                        onChange={(e) => setItemForm({ ...itemForm, outstation_amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}

                {/* Bonus - Office, Outdoor Sales */}
                {fields.showBonus && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Bonus (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.bonus}
                        onChange={(e) => handleStatutoryFieldChange('bonus', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                )}

                {/* Deductions - All departments */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Other Deductions (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.other_deductions}
                      onChange={(e) => setItemForm({ ...itemForm, other_deductions: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Deduction Remarks</label>
                  <input
                    type="text"
                    value={itemForm.deduction_remarks}
                    onChange={(e) => setItemForm({ ...itemForm, deduction_remarks: e.target.value })}
                    placeholder="e.g., Loan repayment, Advance..."
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={itemForm.notes}
                    onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                    rows="2"
                    placeholder="Optional notes"
                  />
                </div>

                {/* Statutory Preview */}
                <div className="statutory-preview">
                  <h4>Statutory Deductions Preview</h4>
                  {loadingStatutory ? (
                    <p className="loading-text">Calculating...</p>
                  ) : statutoryPreview ? (
                    <div className="statutory-grid">
                      <div className="statutory-item">
                        <span className="label">EPF (Employee)</span>
                        <span className="value">RM {formatNum(statutoryPreview.epf?.employee || 0)}</span>
                      </div>
                      <div className="statutory-item">
                        <span className="label">SOCSO</span>
                        <span className="value">RM {formatNum(statutoryPreview.socso?.employee || 0)}</span>
                      </div>
                      <div className="statutory-item">
                        <span className="label">EIS</span>
                        <span className="value">RM {formatNum(statutoryPreview.eis?.employee || 0)}</span>
                      </div>
                      <div className="statutory-item">
                        <span className="label">PCB (Tax)</span>
                        <span className="value">RM {formatNum(statutoryPreview.pcb || 0)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="no-data">Enter salary to see preview</p>
                  )}
                  <small className="preview-hint">Based on: Basic + Commission + Bonus</small>
                </div>

                {/* Auto-calculated info */}
                <div className="auto-info">
                  <h4>Other Auto-calculated:</h4>
                  <p>Unpaid Leave: {editingItem.unpaid_leave_days} days = RM {formatNum(editingItem.unpaid_leave_deduction)}</p>
                  <p>Claims: RM {formatNum(editingItem.claims_amount)}</p>
                </div>

                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowItemModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Update & Recalculate</button>
                </div>
              </form>
            </div>
          </div>
          );
        })()}
      </div>
    </Layout>
  );
}

export default PayrollV2;
