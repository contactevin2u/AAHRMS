import React, { useState, useEffect, useCallback } from 'react';
import { payrollV2Api, departmentApi, payrollApi, outletsApi, contributionsApi } from '../api';
import Layout from '../components/Layout';
import './PayrollV2.css';
import './Contributions.css';

function PayrollUnified() {
  const [mainTab, setMainTab] = useState('payroll'); // 'payroll' or 'contributions'

  // ========== PAYROLL STATE ==========
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
  const [aiConversation, setAiConversation] = useState([]);
  const [aiMode, setAiMode] = useState('initial');
  const [aiFeedback, setAiFeedback] = useState('');

  // Create form
  const [createForm, setCreateForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    department_id: ''
  });

  // Item edit form
  const [itemForm, setItemForm] = useState({
    basic_salary: 0, fixed_allowance: 0, ot_hours: 0, ot_amount: 0,
    ph_days_worked: 0, ph_pay: 0, incentive_amount: 0, commission_amount: 0,
    trade_commission_amount: 0, outstation_amount: 0, bonus: 0,
    other_deductions: 0, deduction_remarks: '', notes: ''
  });

  // Statutory preview state
  const [statutoryPreview, setStatutoryPreview] = useState(null);
  const [loadingStatutory, setLoadingStatutory] = useState(false);

  // ========== CONTRIBUTIONS STATE ==========
  const [contribRuns, setContribRuns] = useState([]);
  const [selectedContribRunId, setSelectedContribRunId] = useState(null);
  const [contribSummary, setContribSummary] = useState(null);
  const [contribDetails, setContribDetails] = useState([]);
  const [yearReport, setYearReport] = useState(null);
  const [contribView, setContribView] = useState('summary');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // ========== EFFECTS ==========
  useEffect(() => {
    fetchRuns();
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (showCreateModal) {
      fetchOtSummary(createForm.year, createForm.month, createForm.department_id);
    }
  }, [showCreateModal, createForm.year, createForm.month, createForm.department_id]);

  useEffect(() => {
    if (mainTab === 'contributions') {
      fetchContribRuns();
    }
  }, [mainTab]);

  useEffect(() => {
    if (contribView === 'yearly' && mainTab === 'contributions') {
      fetchYearlyReport();
    }
  }, [selectedYear, contribView, mainTab]);

  // ========== PAYROLL FUNCTIONS ==========
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
      setSelectedRun({ ...res.data.run, items: res.data.items });
    } catch (error) {
      console.error('Error fetching run details:', error);
    }
  };

  const fetchOtSummary = async (year, month, departmentId) => {
    setLoadingOtSummary(true);
    try {
      const params = departmentId ? { department_id: departmentId } : {};
      const res = await payrollV2Api.getOTSummary(year, month, params);
      setOtSummary(res.data);
    } catch (error) {
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
      let message = `Payroll created for ${res.data.employee_count} employees.`;
      if (res.data.carried_forward_count > 0) {
        message += `\n\n✓ ${res.data.carried_forward_count} employee(s) had salary carried forward.`;
      }
      if (res.data.warning) {
        message += `\n\n⚠️ ${res.data.warning}`;
      }
      if (res.data.carried_forward_count > 0 || res.data.warning) {
        alert(message);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create payroll run');
    }
  };

  const handleDeleteRun = async (id) => {
    if (window.confirm('Delete this payroll run?')) {
      try {
        await payrollV2Api.deleteRun(id);
        setSelectedRun(null);
        fetchRuns();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete');
      }
    }
  };

  const handleRecalculateAll = async (id) => {
    if (window.confirm('Recalculate OT and statutory deductions?')) {
      try {
        const res = await payrollV2Api.recalculateAll(id);
        fetchRunDetails(id);
        fetchRuns();
        alert(`Recalculated ${res.data.recalculated} of ${res.data.total} employees.`);
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to recalculate');
      }
    }
  };

  const handleRecalculateItem = async (itemId) => {
    try {
      await payrollV2Api.recalculateItem(itemId);
      fetchRunDetails(selectedRun.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to recalculate');
    }
  };

  // AI functions
  const handleAIAnalyze = async (instructionParam) => {
    const instruction = typeof instructionParam === 'string' ? instructionParam : aiInstruction;
    if (!instruction?.trim() || !selectedRun) return;
    setAiLoading(true);
    try {
      const newConversation = [...aiConversation, { role: 'user', content: instruction }];
      setAiConversation(newConversation);
      const res = await payrollV2Api.aiAnalyze({
        run_id: selectedRun.id, instruction, conversation: newConversation
      });
      setAiAnalysis(res.data.analysis);
      setAiMode('reviewing');
      setAiInstruction('');
      setAiConversation([...newConversation, {
        role: 'assistant', content: res.data.analysis.summary, analysis: res.data.analysis
      }]);
    } catch (error) {
      alert(error.response?.data?.error || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIApply = async () => {
    if (!aiAnalysis?.changes?.length) return;
    setAiLoading(true);
    try {
      await payrollV2Api.aiApply({ run_id: selectedRun.id, changes: aiAnalysis.changes });
      fetchRunDetails(selectedRun.id);
      fetchRuns();
      setAiConversation([...aiConversation, {
        role: 'system', content: `✅ Changes applied! ${aiAnalysis.changes.length} item(s) updated.`
      }]);
      setAiAnalysis(null);
      setAiMode('initial');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to apply changes');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIDisagree = () => { setAiMode('feedback'); setAiFeedback(''); };

  const handleAIFeedback = async () => {
    if (!aiFeedback?.trim()) return;
    const refinedInstruction = `Previous: "${aiConversation.find(c => c.role === 'user')?.content || ''}"\nFeedback: "${aiFeedback}"\nPlease adjust.`;
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
    if (window.confirm('Finalize this payroll run? This cannot be undone.')) {
      try {
        await payrollV2Api.finalizeRun(id);
        fetchRunDetails(id);
        fetchRuns();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to finalize');
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
      alert('Failed to download');
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      basic_salary: item.basic_salary || 0, fixed_allowance: item.fixed_allowance || 0,
      ot_hours: item.ot_hours || 0, ot_amount: item.ot_amount || 0,
      ph_days_worked: item.ph_days_worked || 0, ph_pay: item.ph_pay || 0,
      incentive_amount: item.incentive_amount || 0, commission_amount: item.commission_amount || 0,
      trade_commission_amount: item.trade_commission_amount || 0, outstation_amount: item.outstation_amount || 0,
      bonus: item.bonus || 0, other_deductions: item.other_deductions || 0,
      deduction_remarks: item.deduction_remarks || '', notes: item.notes || ''
    });
    setShowItemModal(true);
    const statutoryBase = (parseFloat(item.basic_salary) || 0) + (parseFloat(item.commission_amount) || 0) +
      (parseFloat(item.trade_commission_amount) || 0) + (parseFloat(item.bonus) || 0);
    fetchStatutoryPreview(item.employee_id, statutoryBase);
  };

  const getDepartmentFields = (deptName) => {
    const dept = (deptName || '').toLowerCase();
    return {
      showAllowance: dept === 'office' || dept === 'outdoor sales',
      showBonus: dept === 'office' || dept === 'outdoor sales',
      showOT: dept === 'office' || dept === 'driver',
      showCommission: dept === 'indoor sales' || dept === 'outdoor sales',
      showUpsellCommission: dept === 'driver',
      showTripCommission: dept === 'driver',
      showOutstation: dept === 'driver',
      showBasic: true
    };
  };

  const calculateOTAmount = (basicSalary, otHours, workingDays = 22) => {
    if (!basicSalary || !otHours || otHours <= 0) return 0;
    return Math.round((basicSalary / workingDays / 8) * otHours * 100) / 100;
  };

  const calculatePHPay = (basicSalary, phDaysWorked, workingDays = 22) => {
    if (!basicSalary || !phDaysWorked || phDaysWorked <= 0) return 0;
    return Math.round((basicSalary / workingDays) * phDaysWorked * 100) / 100;
  };

  const handleOTHoursChange = (otHours) => {
    setItemForm({ ...itemForm, ot_hours: otHours, ot_amount: calculateOTAmount(itemForm.basic_salary, otHours) });
  };

  const handlePHDaysChange = (phDays) => {
    setItemForm({ ...itemForm, ph_days_worked: phDays, ph_pay: calculatePHPay(itemForm.basic_salary, phDays) });
  };

  const fetchStatutoryPreview = useCallback(async (employeeId, statutoryBase) => {
    if (!employeeId || statutoryBase <= 0) { setStatutoryPreview(null); return; }
    setLoadingStatutory(true);
    try {
      const res = await payrollApi.calculateStatutory({ employee_id: employeeId, gross_salary: statutoryBase });
      setStatutoryPreview(res.data);
    } catch (error) {
      setStatutoryPreview(null);
    } finally {
      setLoadingStatutory(false);
    }
  }, []);

  const getStatutoryBase = useCallback((form) => {
    return (parseFloat(form.basic_salary) || 0) + (parseFloat(form.commission_amount) || 0) +
      (parseFloat(form.trade_commission_amount) || 0) + (parseFloat(form.bonus) || 0);
  }, []);

  const handleBasicSalaryChange = (basicSalary) => {
    const newForm = {
      ...itemForm, basic_salary: basicSalary,
      ot_amount: calculateOTAmount(basicSalary, itemForm.ot_hours),
      ph_pay: calculatePHPay(basicSalary, itemForm.ph_days_worked)
    };
    setItemForm(newForm);
    if (editingItem) fetchStatutoryPreview(editingItem.employee_id, getStatutoryBase(newForm));
  };

  const handleStatutoryFieldChange = (field, value) => {
    const newForm = { ...itemForm, [field]: value };
    setItemForm(newForm);
    if (editingItem) fetchStatutoryPreview(editingItem.employee_id, getStatutoryBase(newForm));
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    try {
      await payrollV2Api.updateItem(editingItem.id, itemForm);
      setShowItemModal(false);
      setEditingItem(null);
      fetchRunDetails(selectedRun.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update');
    }
  };

  const handleViewPayslip = async (itemId) => {
    try {
      const res = await payrollV2Api.getItemPayslip(itemId);
      const payslipWindow = window.open('', '_blank');
      payslipWindow.document.write(generatePayslipHTML(res.data));
    } catch (error) {
      alert('Failed to generate payslip');
    }
  };

  const generatePayslipHTML = (data) => {
    const emp = data.employee || {};
    const period = data.period || {};
    const earnings = data.earnings || {};
    const deductions = data.deductions || {};
    const employer = data.employer_contributions || {};
    const totals = data.totals || {};
    return `<!DOCTYPE html><html><head><title>Payslip - ${emp.name}</title>
      <style>body{font-family:Arial;padding:40px;max-width:800px;margin:0 auto}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #1e293b;padding-bottom:20px}.header h1{color:#1e293b;margin:0}.employee-info{display:flex;justify-content:space-between;margin-bottom:30px}.info-block h3{margin:0 0 10px;color:#1e293b}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f1f5f9}.section-title{background:#1e293b;color:white}.total-row{font-weight:bold;background:#f5f5f5}.amount{text-align:right}@media print{body{padding:20px}}</style>
      </head><body><div class="header"><h1>${data.company?.name || 'Company'}</h1><p>PAYSLIP</p><p>For ${period.month_name || getMonthName(period.month)} ${period.year}</p></div>
      <div class="employee-info"><div class="info-block"><h3>Employee</h3><p><strong>Name:</strong> ${emp.name}</p><p><strong>ID:</strong> ${emp.code}</p><p><strong>Dept:</strong> ${emp.department || '-'}</p></div>
      <div class="info-block"><h3>Payment</h3><p><strong>Bank:</strong> ${emp.bank_name || '-'}</p><p><strong>Account:</strong> ${emp.bank_account_no || '-'}</p></div></div>
      <table><tr class="section-title"><td colspan="2">EARNINGS</td></tr>
      <tr><td>Basic Salary</td><td class="amount">RM ${formatNum(earnings.basic_salary)}</td></tr>
      ${earnings.fixed_allowance > 0 ? `<tr><td>Allowance</td><td class="amount">RM ${formatNum(earnings.fixed_allowance)}</td></tr>` : ''}
      ${earnings.ot_amount > 0 ? `<tr><td>OT</td><td class="amount">RM ${formatNum(earnings.ot_amount)}</td></tr>` : ''}
      ${earnings.commission_amount > 0 ? `<tr><td>Commission</td><td class="amount">RM ${formatNum(earnings.commission_amount)}</td></tr>` : ''}
      ${earnings.bonus > 0 ? `<tr><td>Bonus</td><td class="amount">RM ${formatNum(earnings.bonus)}</td></tr>` : ''}
      <tr class="total-row"><td>GROSS PAY</td><td class="amount">RM ${formatNum(totals.gross_salary)}</td></tr></table>
      <table><tr class="section-title"><td colspan="2">DEDUCTIONS</td></tr>
      <tr><td>EPF</td><td class="amount">RM ${formatNum(deductions.epf_employee)}</td></tr>
      <tr><td>SOCSO</td><td class="amount">RM ${formatNum(deductions.socso_employee)}</td></tr>
      <tr><td>EIS</td><td class="amount">RM ${formatNum(deductions.eis_employee)}</td></tr>
      <tr><td>PCB</td><td class="amount">RM ${formatNum(deductions.pcb)}</td></tr>
      <tr class="total-row"><td>TOTAL DEDUCTIONS</td><td class="amount">RM ${formatNum(totals.total_deductions)}</td></tr></table>
      <table><tr style="background:#1e293b;color:white"><td><strong>NET PAY</strong></td><td class="amount" style="font-size:1.3em"><strong>RM ${formatNum(totals.net_pay)}</strong></td></tr></table>
      <script>window.print();</script></body></html>`;
  };

  // ========== CONTRIBUTIONS FUNCTIONS ==========
  const fetchContribRuns = async () => {
    try {
      const res = await payrollV2Api.getRuns();
      const finalizedRuns = res.data.filter(r => r.status === 'finalized');
      setContribRuns(finalizedRuns);
      if (finalizedRuns.length > 0 && !selectedContribRunId) {
        setSelectedContribRunId(finalizedRuns[0].id);
        fetchContribSummary(finalizedRuns[0].id);
      }
    } catch (error) {
      console.error('Error fetching runs:', error);
    }
  };

  const fetchContribSummary = async (runId) => {
    try {
      const [summaryRes, detailsRes] = await Promise.all([
        contributionsApi.getSummary(runId),
        contributionsApi.getDetails(runId)
      ]);
      setContribSummary(summaryRes.data);
      setContribDetails(detailsRes.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const fetchYearlyReport = async () => {
    try {
      const res = await contributionsApi.getReport({ year: selectedYear });
      setYearReport(res.data);
    } catch (error) {
      console.error('Error fetching yearly report:', error);
    }
  };

  const handleContribRunSelect = (runId) => {
    setSelectedContribRunId(runId);
    fetchContribSummary(runId);
  };

  const handleContribExport = async (type) => {
    if (!selectedContribRunId) return;
    try {
      let res, filename;
      switch (type) {
        case 'epf': res = await contributionsApi.exportEPF(selectedContribRunId); filename = `EPF_${contribSummary.run.month}_${contribSummary.run.year}.csv`; break;
        case 'socso': res = await contributionsApi.exportSOCSO(selectedContribRunId); filename = `SOCSO_${contribSummary.run.month}_${contribSummary.run.year}.csv`; break;
        case 'eis': res = await contributionsApi.exportEIS(selectedContribRunId); filename = `EIS_${contribSummary.run.month}_${contribSummary.run.year}.csv`; break;
        case 'pcb': res = await contributionsApi.exportPCB(selectedContribRunId); filename = `PCB_${contribSummary.run.month}_${contribSummary.run.year}.csv`; break;
        default: return;
      }
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Failed to export');
    }
  };

  // ========== HELPERS ==========
  const formatNum = (num) => parseFloat(num || 0).toFixed(2);
  const formatAmount = (amount) => `RM ${parseFloat(amount || 0).toFixed(2)}`;
  const getMonthName = (month) => new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' });
  const getStatusBadge = (status) => <span className={`status-badge ${status}`}>{status}</span>;

  // ========== RENDER ==========
  return (
    <Layout>
      <div className="payroll-v2-page">
        <header className="page-header">
          <div>
            <h1>Payroll</h1>
            <p>Manage monthly payroll and statutory contributions</p>
          </div>
          {mainTab === 'payroll' && (
            <button onClick={() => setShowCreateModal(true)} className="add-btn">
              + New Payroll Run
            </button>
          )}
        </header>

        {/* Main Tabs */}
        <div className="main-tabs">
          <button className={`main-tab ${mainTab === 'payroll' ? 'active' : ''}`} onClick={() => setMainTab('payroll')}>
            Run Payroll
          </button>
          <button className={`main-tab ${mainTab === 'contributions' ? 'active' : ''}`} onClick={() => setMainTab('contributions')}>
            Contributions
          </button>
        </div>

        {/* ========== PAYROLL TAB ========== */}
        {mainTab === 'payroll' && (
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
                  {runs.map(run => (
                    <div key={run.id} className={`run-card ${selectedRun?.id === run.id ? 'selected' : ''}`}
                      onClick={() => fetchRunDetails(run.id)}>
                      <div className="run-period">
                        {getMonthName(run.month)} {run.year}
                        {run.department_name && <span className="run-dept"> - {run.department_name}</span>}
                      </div>
                      <div className="run-meta">
                        {getStatusBadge(run.status)}
                        <span className="run-total">{formatAmount(run.total_net)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Run Details */}
            <div className="details-panel">
              {selectedRun ? (
                <>
                  <div className="details-header">
                    <div>
                      <h2>{getMonthName(selectedRun.month)} {selectedRun.year}
                        {selectedRun.department_name && <span className="dept-tag"> - {selectedRun.department_name}</span>}
                      </h2>
                      {getStatusBadge(selectedRun.status)}
                    </div>
                    <div className="details-actions">
                      {selectedRun.status === 'draft' && (
                        <>
                          <button onClick={() => handleRecalculateAll(selectedRun.id)} className="recalculate-btn">Recalculate OT</button>
                          <button onClick={() => handleFinalizeRun(selectedRun.id)} className="finalize-btn">Finalize</button>
                          <button onClick={() => handleDeleteRun(selectedRun.id)} className="delete-btn">Delete</button>
                        </>
                      )}
                      {selectedRun.status === 'finalized' && (
                        <button onClick={() => handleDownloadBankFile(selectedRun.id)} className="download-btn">Download Bank File</button>
                      )}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="summary-stats">
                    <div className="summary-stat"><span className="stat-label">Employees</span><span className="stat-value">{selectedRun.items?.length || 0}</span></div>
                    <div className="summary-stat"><span className="stat-label">Gross</span><span className="stat-value">{formatAmount(selectedRun.total_gross)}</span></div>
                    <div className="summary-stat"><span className="stat-label">Deductions</span><span className="stat-value">{formatAmount(selectedRun.total_deductions)}</span></div>
                    <div className="summary-stat highlight"><span className="stat-label">Net</span><span className="stat-value">{formatAmount(selectedRun.total_net)}</span></div>
                    {selectedRun.status === 'draft' && (
                      <div className="summary-stat ai-toggle" onClick={() => { setShowAIAssistant(!showAIAssistant); resetAIAssistant(); }}>
                        <span className="stat-value">🤖</span><span className="stat-label">AI</span>
                      </div>
                    )}
                  </div>

                  {/* AI Assistant Panel - Simplified */}
                  {showAIAssistant && selectedRun.status === 'draft' && (
                    <div className="ai-assistant-panel">
                      <div className="ai-header"><h3>🤖 AI Payroll Assistant</h3></div>
                      <div className="ai-actions-row">
                        <button onClick={handleAICompare} className="ai-compare-btn" disabled={aiLoading}>📊 Compare</button>
                      </div>
                      <div className="ai-input-section">
                        <textarea value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)}
                          placeholder="e.g., Add RM200 bonus for all employees" rows={3} disabled={aiLoading} />
                        <button onClick={handleAIAnalyze} className="ai-analyze-btn" disabled={aiLoading || !aiInstruction.trim()}>
                          {aiLoading ? '...' : '✨ Analyze'}
                        </button>
                      </div>
                      {aiAnalysis && aiMode === 'reviewing' && aiAnalysis.understood && aiAnalysis.preview?.length > 0 && (
                        <div className="ai-preview">
                          <h4>Proposed Changes</h4>
                          <div className="ai-decision">
                            <button onClick={handleAIApply} className="ai-agree-btn" disabled={aiLoading}>✅ Apply</button>
                            <button onClick={handleAIDisagree} className="ai-disagree-btn">❌ Disagree</button>
                            <button onClick={resetAIAssistant} className="ai-reset-btn">🔄 Reset</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items Table */}
                  <div className="items-table full-breakdown">
                    <table>
                      <thead>
                        <tr>
                          <th>Employee</th><th>Basic</th><th>OT</th><th>Allow</th><th>Claims</th><th>Comm.</th>
                          <th>Gross</th><th>EPF</th><th>SOCSO</th><th>EIS</th><th>PCB</th><th>Adv</th><th>Net</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRun.items?.map(item => (
                          <tr key={item.id}>
                            <td className="employee-cell"><strong>{item.employee_name}</strong><small>{item.emp_code}</small></td>
                            <td>{formatAmount(item.basic_salary)}</td>
                            <td>{parseFloat(item.ot_hours) > 0 ? formatAmount(item.ot_amount) : '-'}</td>
                            <td>{parseFloat(item.fixed_allowance) > 0 ? formatAmount(item.fixed_allowance) : '-'}</td>
                            <td>{parseFloat(item.claims_amount) > 0 ? formatAmount(item.claims_amount) : '-'}</td>
                            <td>{(parseFloat(item.commission_amount) || 0) + (parseFloat(item.trade_commission_amount) || 0) > 0 ? formatAmount((parseFloat(item.commission_amount) || 0) + (parseFloat(item.trade_commission_amount) || 0)) : '-'}</td>
                            <td><strong>{formatAmount(item.gross_salary)}</strong></td>
                            <td>{formatAmount(item.epf_employee)}</td>
                            <td>{formatAmount(item.socso_employee)}</td>
                            <td>{formatAmount(item.eis_employee)}</td>
                            <td>{formatAmount(item.pcb)}</td>
                            <td>{parseFloat(item.advance_deduction) > 0 ? formatAmount(item.advance_deduction) : '-'}</td>
                            <td><strong>{formatAmount(item.net_pay)}</strong></td>
                            <td>
                              {selectedRun.status === 'draft' && (
                                <>
                                  <button onClick={() => handleRecalculateItem(item.id)} className="action-btn recalc">↻</button>
                                  <button onClick={() => handleEditItem(item)} className="action-btn edit">✎</button>
                                </>
                              )}
                              <button onClick={() => handleViewPayslip(item.id)} className="action-btn view">📄</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="no-selection"><p>Select a payroll run</p></div>
              )}
            </div>
          </div>
        )}

        {/* ========== CONTRIBUTIONS TAB ========== */}
        {mainTab === 'contributions' && (
          <div className="contributions-page" style={{ padding: 0 }}>
            <div className="view-toggle" style={{ marginBottom: '20px' }}>
              <button className={`toggle-btn ${contribView === 'summary' ? 'active' : ''}`} onClick={() => setContribView('summary')}>Monthly</button>
              <button className={`toggle-btn ${contribView === 'yearly' ? 'active' : ''}`} onClick={() => setContribView('yearly')}>Yearly</button>
            </div>

            {contribView === 'summary' ? (
              <div className="contributions-layout">
                <div className="runs-panel">
                  <h3>Finalized Runs</h3>
                  {contribRuns.length === 0 ? <div className="no-data">No finalized runs</div> : (
                    <div className="runs-list">
                      {contribRuns.map(run => (
                        <div key={run.id} className={`run-card ${selectedContribRunId === run.id ? 'selected' : ''}`}
                          onClick={() => handleContribRunSelect(run.id)}>
                          <div className="run-period">{getMonthName(run.month)} {run.year}</div>
                          <div className="run-meta"><span className="run-count">{run.item_count} emp</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="summary-panel">
                  {contribSummary ? (
                    <>
                      <div className="summary-header">
                        <h2>{getMonthName(contribSummary.run.month)} {contribSummary.run.year}</h2>
                        <span className="employee-count">{contribSummary.employee_count} employees</span>
                      </div>
                      <div className="contribution-cards">
                        <div className="contribution-card epf">
                          <div className="card-header"><h3>EPF</h3><button onClick={() => handleContribExport('epf')} className="export-btn">Export</button></div>
                          <div className="card-body">
                            <div className="contrib-row"><span>Employee</span><span>{formatAmount(contribSummary.contributions.epf.employee)}</span></div>
                            <div className="contrib-row"><span>Employer</span><span>{formatAmount(contribSummary.contributions.epf.employer)}</span></div>
                            <div className="contrib-row total"><span>Total</span><span>{formatAmount(contribSummary.contributions.epf.total)}</span></div>
                          </div>
                        </div>
                        <div className="contribution-card socso">
                          <div className="card-header"><h3>SOCSO</h3><button onClick={() => handleContribExport('socso')} className="export-btn">Export</button></div>
                          <div className="card-body">
                            <div className="contrib-row"><span>Employee</span><span>{formatAmount(contribSummary.contributions.socso.employee)}</span></div>
                            <div className="contrib-row"><span>Employer</span><span>{formatAmount(contribSummary.contributions.socso.employer)}</span></div>
                            <div className="contrib-row total"><span>Total</span><span>{formatAmount(contribSummary.contributions.socso.total)}</span></div>
                          </div>
                        </div>
                        <div className="contribution-card eis">
                          <div className="card-header"><h3>EIS</h3><button onClick={() => handleContribExport('eis')} className="export-btn">Export</button></div>
                          <div className="card-body">
                            <div className="contrib-row"><span>Employee</span><span>{formatAmount(contribSummary.contributions.eis.employee)}</span></div>
                            <div className="contrib-row"><span>Employer</span><span>{formatAmount(contribSummary.contributions.eis.employer)}</span></div>
                            <div className="contrib-row total"><span>Total</span><span>{formatAmount(contribSummary.contributions.eis.total)}</span></div>
                          </div>
                        </div>
                        <div className="contribution-card pcb">
                          <div className="card-header"><h3>PCB</h3><button onClick={() => handleContribExport('pcb')} className="export-btn">Export</button></div>
                          <div className="card-body">
                            <div className="contrib-row total"><span>Total Tax</span><span>{formatAmount(contribSummary.contributions.pcb.total)}</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="grand-total">
                        <span>Total Government Contributions</span>
                        <span className="amount">{formatAmount(contribSummary.contributions.grand_total)}</span>
                      </div>
                    </>
                  ) : <div className="no-selection"><p>Select a run</p></div>}
                </div>
              </div>
            ) : (
              <div className="yearly-report">
                <div className="year-selector">
                  <label>Year:</label>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                    {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {yearReport && (
                  <>
                    <div className="yearly-summary-cards">
                      <div className="yearly-card epf"><h4>EPF</h4><span className="amount">{formatAmount(yearReport.totals.epf_total)}</span></div>
                      <div className="yearly-card socso"><h4>SOCSO</h4><span className="amount">{formatAmount(yearReport.totals.socso_total)}</span></div>
                      <div className="yearly-card eis"><h4>EIS</h4><span className="amount">{formatAmount(yearReport.totals.eis_total)}</span></div>
                      <div className="yearly-card pcb"><h4>PCB</h4><span className="amount">{formatAmount(yearReport.totals.pcb_total)}</span></div>
                    </div>
                    <div className="yearly-grand-total">
                      <span>Total {yearReport.year}</span>
                      <span className="amount">{formatAmount(yearReport.totals.grand_total)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Create Modal - Simplified */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Create Payroll Run</h2>
              <form onSubmit={handleCreateRun}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Month</label>
                    <select value={createForm.month} onChange={(e) => setCreateForm({ ...createForm, month: parseInt(e.target.value) })}>
                      {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Year</label>
                    <select value={createForm.year} onChange={(e) => setCreateForm({ ...createForm, year: parseInt(e.target.value) })}>
                      {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>{isMimix ? 'Outlet' : 'Department'}</label>
                  <select value={createForm.department_id} onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })}>
                    <option value="">All</option>
                    {(isMimix ? outlets : departments).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
                  <button type="submit" className="save-btn">Create</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Item Modal - Simplified */}
        {showItemModal && editingItem && (
          <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit - {editingItem.employee_name}</h2>
              </div>
              <form onSubmit={handleUpdateItem}>
                <div className="modal-scroll-content">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Basic Salary</label>
                      <input type="number" step="0.01" value={itemForm.basic_salary} onChange={(e) => handleBasicSalaryChange(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="form-group">
                      <label>Allowance</label>
                      <input type="number" step="0.01" value={itemForm.fixed_allowance} onChange={(e) => setItemForm({ ...itemForm, fixed_allowance: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>OT Hours</label>
                      <input type="number" step="0.5" value={itemForm.ot_hours} onChange={(e) => handleOTHoursChange(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="form-group">
                      <label>OT Amount</label>
                      <input type="number" step="0.01" value={itemForm.ot_amount} onChange={(e) => setItemForm({ ...itemForm, ot_amount: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Commission</label>
                      <input type="number" step="0.01" value={itemForm.commission_amount} onChange={(e) => handleStatutoryFieldChange('commission_amount', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="form-group">
                      <label>Bonus</label>
                      <input type="number" step="0.01" value={itemForm.bonus} onChange={(e) => handleStatutoryFieldChange('bonus', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Other Deductions</label>
                      <input type="number" step="0.01" value={itemForm.other_deductions} onChange={(e) => setItemForm({ ...itemForm, other_deductions: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} rows="2" />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowItemModal(false)} className="cancel-btn">Cancel</button>
                  <button type="submit" className="save-btn">Update</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default PayrollUnified;
