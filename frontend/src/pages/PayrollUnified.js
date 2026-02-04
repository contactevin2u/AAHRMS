import React, { useState, useEffect, useCallback, useRef } from 'react';
import { payrollV2Api, departmentApi, payrollApi, outletsApi, contributionsApi } from '../api';
import Layout from '../components/Layout';
import './PayrollV2.css';
import './Contributions.css';

function PayrollUnified() {
  const [mainTab, setMainTab] = useState('payroll'); // 'payroll' or 'contributions'
  const [expandedEmployee, setExpandedEmployee] = useState(null); // show full name on click
  const [inlineEditing, setInlineEditing] = useState(null); // { itemId, field }
  const [inlineValue, setInlineValue] = useState('');

  // ========== PAYROLL STATE ==========
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isMimix = adminInfo.company_id === 3;

  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAllOutletsModal, setShowAllOutletsModal] = useState(false);
  const [creatingAllOutlets, setCreatingAllOutlets] = useState(false);
  const [showAllDeptsModal, setShowAllDeptsModal] = useState(false);
  const [creatingAllDepts, setCreatingAllDepts] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);

  // OT Summary state
  const [otSummary, setOtSummary] = useState(null);
  const [loadingOtSummary, setLoadingOtSummary] = useState(false);
  const [showOtDetails, setShowOtDetails] = useState(false);

  // Attendance Details popup state
  const [showAttendanceDetails, setShowAttendanceDetails] = useState(false);
  const [attendanceDetails, setAttendanceDetails] = useState(null);
  const [loadingAttendanceDetails, setLoadingAttendanceDetails] = useState(false);
  const [attendanceDetailsTab, setAttendanceDetailsTab] = useState('days_worked');

  // AI Assistant state
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiComparison, setAiComparison] = useState(null);
  const [aiConversation, setAiConversation] = useState([]);
  const [aiMode, setAiMode] = useState('initial');
  const [aiFeedback, setAiFeedback] = useState('');
  const aiChatRef = useRef(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    department_id: '',
    outlet_id: ''
  });

  // Item edit form
  const [itemForm, setItemForm] = useState({
    basic_salary: 0, fixed_allowance: 0, ot_hours: 0, ot_amount: 0,
    ph_days_worked: 0, ph_pay: 0, incentive_amount: 0, commission_amount: 0,
    trade_commission_amount: 0, outstation_amount: 0, bonus: 0,
    other_deductions: 0, deduction_remarks: '', notes: '',
    part_time_hours: 0 // For part-time employees: editable normal hours
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

  // Fetch attendance details for payroll item
  const fetchAttendanceDetails = async (payrollItemId) => {
    setLoadingAttendanceDetails(true);
    try {
      const res = await payrollV2Api.getAttendanceDetails(payrollItemId);
      setAttendanceDetails(res.data);
      setShowAttendanceDetails(true);
    } catch (error) {
      console.error('Error fetching attendance details:', error);
      alert('Failed to load attendance details');
    } finally {
      setLoadingAttendanceDetails(false);
    }
  };

  const handleCreateRun = async (e) => {
    e.preventDefault();
    try {
      // For Mimix (outlet-based), send outlet_id instead of department_id
      const payload = {
        month: createForm.month,
        year: createForm.year,
        ...(isMimix
          ? { outlet_id: createForm.outlet_id || null }
          : { department_id: createForm.department_id || null })
      };
      const res = await payrollV2Api.createRun(payload);
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

  const handleCreateAllOutlets = async (e) => {
    e.preventDefault();
    setCreatingAllOutlets(true);
    try {
      const res = await payrollV2Api.createAllOutlets({
        month: createForm.month,
        year: createForm.year
      });
      setShowAllOutletsModal(false);
      fetchRuns();

      let message = `Created ${res.data.totals.runs_created} payroll runs for ${res.data.totals.total_employees} employees.\n`;
      message += `\nOutlets created:\n`;
      res.data.created_runs.forEach(run => {
        message += `- ${run.outlet_name}: ${run.employee_count} employees (${formatAmount(run.total_net)})\n`;
      });
      if (res.data.skipped_outlets.length > 0) {
        message += `\nSkipped:\n`;
        res.data.skipped_outlets.forEach(skip => {
          message += `- ${skip.outlet_name}: ${skip.reason}\n`;
        });
      }
      message += `\nTotal Net: ${formatAmount(res.data.totals.grand_total_net)}`;
      alert(message);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create payroll runs');
    } finally {
      setCreatingAllOutlets(false);
    }
  };

  const handleCreateAllDepts = async (e) => {
    e.preventDefault();
    setCreatingAllDepts(true);
    try {
      const res = await payrollV2Api.createAllDepartments({
        month: createForm.month,
        year: createForm.year
      });
      setShowAllDeptsModal(false);
      fetchRuns();

      let message = `Created ${res.data.totals.runs_created} payroll runs for ${res.data.totals.total_employees} employees.\n`;
      message += `\nDepartments created:\n`;
      res.data.created_runs.forEach(run => {
        message += `- ${run.department_name}: ${run.employee_count} employees (${formatAmount(run.total_net)})\n`;
      });
      if (res.data.skipped_departments?.length > 0) {
        message += `\nSkipped:\n`;
        res.data.skipped_departments.forEach(skip => {
          message += `- ${skip.department_name}: ${skip.reason}\n`;
        });
      }
      message += `\nTotal Net: ${formatAmount(res.data.totals.grand_total_net)}`;
      alert(message);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create payroll runs');
    } finally {
      setCreatingAllDepts(false);
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

  const handleDeleteAllDrafts = async () => {
    const draftRuns = runs.filter(r => r.status === 'draft');
    if (draftRuns.length === 0) {
      alert('No draft payroll runs to delete.');
      return;
    }
    // Get month/year from the first draft run (all runs in the list are same month/year)
    const month = draftRuns[0].month;
    const year = draftRuns[0].year;
    if (window.confirm(`Delete ALL ${draftRuns.length} draft payroll runs for ${month}/${year}?`)) {
      try {
        const res = await payrollV2Api.deleteAllDrafts(month, year);
        setSelectedRun(null);
        fetchRuns();
        alert(`Deleted ${res.data.deleted} draft payroll runs.`);
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete drafts');
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
    if (!aiAnalysis?.changes?.length && !aiAnalysis?.preview?.length) return;

    // Build changes from preview if available (may have been edited)
    const changesToApply = (aiAnalysis.preview || aiAnalysis.changes).map(change => ({
      item_id: change.item_id,
      employee_name: change.employee_name,
      field: change.field,
      current_value: change.current_value,
      new_value: change.new_value,
      reason: change.reason
    }));

    setAiLoading(true);
    try {
      const result = await payrollV2Api.aiApply({ run_id: selectedRun.id, changes: changesToApply });
      fetchRunDetails(selectedRun.id);
      fetchRuns();

      // Build success message
      const successCount = result.data.results?.filter(r => r.success).length || changesToApply.length;
      const totalNet = result.data.updated_totals?.net || 0;

      setAiConversation([...aiConversation, {
        role: 'assistant',
        content: `✅ Successfully applied ${successCount} change(s)!\n\nNew total net pay: RM ${totalNet.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
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

  // Edit a change value before applying
  const handleEditChange = (idx, newValue) => {
    if (!aiAnalysis || !aiAnalysis.preview) return;
    const updatedPreview = [...aiAnalysis.preview];
    const change = updatedPreview[idx];
    const diff = newValue - change.current_value;

    // Update the change
    updatedPreview[idx] = {
      ...change,
      new_value: newValue,
      gross_difference: diff,
      net_difference: Math.round(diff * 0.8 * 100) / 100, // Estimate ~20% for statutory
      estimated_new_gross: change.current_gross + diff,
      estimated_new_net: change.current_net + (diff * 0.8)
    };

    // Recalculate totals
    const totalGrossIncrease = updatedPreview.reduce((sum, p) => sum + (p.gross_difference || 0), 0);
    const totalNetIncrease = updatedPreview.reduce((sum, p) => sum + (p.net_difference || 0), 0);

    setAiAnalysis({
      ...aiAnalysis,
      preview: updatedPreview,
      changes: updatedPreview.map(p => ({
        item_id: p.item_id,
        employee_name: p.employee_name,
        field: p.field,
        current_value: p.current_value,
        new_value: p.new_value,
        reason: p.reason
      })),
      impact: {
        ...aiAnalysis.impact,
        total_gross_increase: Math.round(totalGrossIncrease * 100) / 100,
        total_net_increase: Math.round(totalNetIncrease * 100) / 100
      }
    });
  };

  // Remove a change from the preview
  const handleRemoveChange = (idx) => {
    if (!aiAnalysis || !aiAnalysis.preview) return;
    const updatedPreview = aiAnalysis.preview.filter((_, i) => i !== idx);

    if (updatedPreview.length === 0) {
      resetAIAssistant();
      return;
    }

    // Recalculate totals
    const totalGrossIncrease = updatedPreview.reduce((sum, p) => sum + (p.gross_difference || 0), 0);
    const totalNetIncrease = updatedPreview.reduce((sum, p) => sum + (p.net_difference || 0), 0);

    setAiAnalysis({
      ...aiAnalysis,
      preview: updatedPreview,
      changes: updatedPreview.map(p => ({
        item_id: p.item_id,
        employee_name: p.employee_name,
        field: p.field,
        current_value: p.current_value,
        new_value: p.new_value,
        reason: p.reason
      })),
      impact: {
        ...aiAnalysis.impact,
        total_gross_increase: Math.round(totalGrossIncrease * 100) / 100,
        total_net_increase: Math.round(totalNetIncrease * 100) / 100,
        affected_employees: updatedPreview.length
      }
    });
  };

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (aiChatRef.current) {
      aiChatRef.current.scrollTop = aiChatRef.current.scrollHeight;
    }
  }, [aiConversation, aiLoading]);

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

  const handleDownloadSalaryReport = async (id, format) => {
    try {
      if (format === 'csv') {
        // Download CSV/Excel
        const res = await payrollV2Api.getSalaryReport(id, 'csv');
        const blob = new Blob([res.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `salary_report_${selectedRun?.period_label?.replace(/\s+/g, '_') || selectedRun?.month + '_' + selectedRun?.year}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // Generate PDF using jsPDF
        const res = await payrollV2Api.getSalaryReportJson(id);
        const data = res.data;
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
        const pageWidth = doc.internal.pageSize.getWidth();

        // Title
        doc.setFontSize(16);
        doc.text('SALARY REPORT', pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(12);
        doc.text(data.run.period_label || `${data.run.month}/${data.run.year}`, pageWidth / 2, 22, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Status: FINALIZED | Generated: ${new Date().toLocaleDateString('en-MY')}`, pageWidth / 2, 28, { align: 'center' });

        // Table data
        const tableData = data.employees.map((emp, idx) => [
          idx + 1,
          emp.emp_code || '',
          emp.employee_name,
          parseFloat(emp.basic_salary || 0).toFixed(2),
          parseFloat(emp.fixed_allowance || 0).toFixed(2),
          parseFloat(emp.ot_amount || 0).toFixed(2),
          parseFloat(emp.commission_amount || 0).toFixed(2),
          parseFloat(emp.bonus || 0).toFixed(2),
          parseFloat(emp.gross_salary || 0).toFixed(2),
          parseFloat(emp.epf_employee || 0).toFixed(2),
          parseFloat(emp.socso_employee || 0).toFixed(2),
          parseFloat(emp.eis_employee || 0).toFixed(2),
          parseFloat(emp.pcb || 0).toFixed(2),
          parseFloat(emp.total_deductions || 0).toFixed(2),
          parseFloat(emp.net_pay || 0).toFixed(2),
          emp.bank_name || '',
          emp.bank_account_no || ''
        ]);

        // Add totals row
        tableData.push([
          '', '', 'TOTAL',
          data.totals.basic_salary.toFixed(2),
          data.totals.fixed_allowance.toFixed(2),
          data.totals.ot_amount.toFixed(2),
          data.totals.commission_amount.toFixed(2),
          data.totals.bonus.toFixed(2),
          data.totals.gross_salary.toFixed(2),
          data.totals.epf_employee.toFixed(2),
          data.totals.socso_employee.toFixed(2),
          data.totals.eis_employee.toFixed(2),
          data.totals.pcb.toFixed(2),
          data.totals.total_deductions.toFixed(2),
          data.totals.net_pay.toFixed(2),
          '', ''
        ]);

        autoTable(doc, {
          startY: 35,
          head: [['#', 'Code', 'Name', 'Basic', 'Allow', 'OT', 'Comm', 'Bonus', 'Gross', 'EPF', 'SOCSO', 'EIS', 'PCB', 'Ded', 'Net', 'Bank', 'Account']],
          body: tableData,
          styles: { fontSize: 7, cellPadding: 1 },
          headStyles: { fillColor: [30, 41, 59], fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 15 },
            2: { cellWidth: 30 },
            3: { cellWidth: 18, halign: 'right' },
            4: { cellWidth: 15, halign: 'right' },
            5: { cellWidth: 15, halign: 'right' },
            6: { cellWidth: 15, halign: 'right' },
            7: { cellWidth: 15, halign: 'right' },
            8: { cellWidth: 18, halign: 'right' },
            9: { cellWidth: 15, halign: 'right' },
            10: { cellWidth: 15, halign: 'right' },
            11: { cellWidth: 12, halign: 'right' },
            12: { cellWidth: 15, halign: 'right' },
            13: { cellWidth: 15, halign: 'right' },
            14: { cellWidth: 18, halign: 'right' },
            15: { cellWidth: 25 },
            16: { cellWidth: 25 }
          },
          didParseCell: function(data) {
            // Bold the totals row
            if (data.row.index === tableData.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [241, 245, 249];
            }
          }
        });

        doc.save(`salary_report_${data.run.period_label?.replace(/\s+/g, '_') || data.run.month + '_' + data.run.year}.pdf`);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download: ' + (error.message || 'Unknown error'));
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);

    // Check if part-time employee
    const isPartTime = item.work_type === 'part_time' || item.employment_type === 'part_time';

    // Use backend-calculated values - no frontend recalculation
    const absentDays = parseFloat(item.absent_days) || 0;
    const absentDayDeduction = parseFloat(item.absent_day_deduction) || 0;
    const otHours = parseFloat(item.ot_hours) || 0;
    const otAmount = parseFloat(item.ot_amount) || 0;

    // For part-time: calculate normal hours (rounded to 0.5)
    const rawHours = parseFloat(item.total_work_hours) || 0;
    const partTimeHours = Math.floor(rawHours * 2) / 2;

    setItemForm({
      basic_salary: item.basic_salary || 0, fixed_allowance: item.fixed_allowance || 0,
      ot_hours: otHours, ot_amount: otAmount,
      ph_days_worked: item.ph_days_worked || 0, ph_pay: item.ph_pay || 0,
      incentive_amount: item.incentive_amount || 0, commission_amount: item.commission_amount || 0,
      trade_commission_amount: item.trade_commission_amount || 0, outstation_amount: item.outstation_amount || 0,
      bonus: item.bonus || 0, other_deductions: item.other_deductions || 0,
      deduction_remarks: item.deduction_remarks || '', notes: item.notes || '',
      short_hours: item.short_hours || 0, short_hours_deduction: item.short_hours_deduction || 0,
      absent_days: absentDays, absent_day_deduction: absentDayDeduction,
      attendance_bonus: item.attendance_bonus || 0, late_days: item.late_days || 0,
      epf_override: '',  // Empty means use calculated value, set value to override from KWSP table
      pcb_override: '',  // Empty means use calculated value, set value to override from MyTax
      claims_override: '', // Empty means use calculated value, set value to override claims amount
      part_time_hours: partTimeHours // For part-time: editable normal hours
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

  const calculateOTAmount = (basicSalary, otHours, workingDays) => {
    const wd = workingDays || selectedRun?.work_days_per_month || 22;
    if (!basicSalary || !otHours || otHours <= 0) return 0;
    // OT rate = hourly rate x 1.5
    return Math.round((basicSalary / wd / 8) * 1.5 * otHours * 100) / 100;
  };

  const calculatePHPay = (basicSalary, phDaysWorked, workingDays) => {
    const wd = workingDays || selectedRun?.work_days_per_month || 22;
    if (!basicSalary || !phDaysWorked || phDaysWorked <= 0) return 0;
    return Math.round((basicSalary / wd) * phDaysWorked * 100) / 100;
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

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Remove ${item.employee_name} from this payroll?\n\nThis employee will be available for selection in other payroll runs.`)) {
      return;
    }
    try {
      await payrollV2Api.deleteItem(item.id);
      fetchRunDetails(selectedRun.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to remove employee');
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
    const perkeso = (deductions.socso_employee || 0) + (deductions.eis_employee || 0);
    return `<!DOCTYPE html><html><head><title>Payslip - ${emp.name}</title>
      <style>body{font-family:Arial;padding:40px;max-width:800px;margin:0 auto}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #1e293b;padding-bottom:20px}.header h1{color:#1e293b;margin:0}.employee-info{display:flex;justify-content:space-between;margin-bottom:30px}.info-block h3{margin:0 0 10px;color:#1e293b}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f1f5f9}.section-title{background:#1e293b;color:white}.total-row{font-weight:bold;background:#f5f5f5}.amount{text-align:right}.employer-section{background:#f8fafc;border:1px solid #e2e8f0;padding:15px;margin-top:20px;border-radius:4px}@media print{body{padding:20px}}</style>
      </head><body><div class="header"><h1>${data.company?.name || 'Company'}</h1><p>PAYSLIP</p><p>For ${period.month_name || getMonthName(period.month)} ${period.year}</p></div>
      <div class="employee-info"><div class="info-block"><h3>Employee</h3><p><strong>Name:</strong> ${emp.name}</p><p><strong>ID:</strong> ${emp.code}</p><p><strong>Dept:</strong> ${emp.department || emp.outlet_name || '-'}</p></div>
      <div class="info-block"><h3>Payment</h3><p><strong>Bank:</strong> ${emp.bank_name || '-'}</p><p><strong>Account:</strong> ${emp.bank_account_no || '-'}</p></div></div>
      <table><tr class="section-title"><td colspan="2">EARNINGS</td></tr>
      <tr><td>Basic Salary</td><td class="amount">RM ${formatNum(earnings.basic_salary)}</td></tr>
      ${earnings.fixed_allowance > 0 ? `<tr><td>Allowance</td><td class="amount">RM ${formatNum(earnings.fixed_allowance)}</td></tr>` : ''}
      ${earnings.ot_amount > 0 ? `<tr><td>OT (${earnings.ot_hours} hrs)</td><td class="amount">RM ${formatNum(earnings.ot_amount)}</td></tr>` : ''}
      ${earnings.ph_pay > 0 ? `<tr><td>PH Pay (${earnings.ph_days_worked} days)</td><td class="amount">RM ${formatNum(earnings.ph_pay)}</td></tr>` : ''}
      ${earnings.incentive_amount > 0 ? `<tr><td>Incentive</td><td class="amount">RM ${formatNum(earnings.incentive_amount)}</td></tr>` : ''}
      ${earnings.commission_amount > 0 ? `<tr><td>Commission</td><td class="amount">RM ${formatNum(earnings.commission_amount)}</td></tr>` : ''}
      ${earnings.trade_commission_amount > 0 ? `<tr><td>Trade Commission</td><td class="amount">RM ${formatNum(earnings.trade_commission_amount)}</td></tr>` : ''}
      ${earnings.outstation_amount > 0 ? `<tr><td>Outstation</td><td class="amount">RM ${formatNum(earnings.outstation_amount)}</td></tr>` : ''}
      ${earnings.claims_amount > 0 ? `<tr><td>Claims</td><td class="amount">RM ${formatNum(earnings.claims_amount)}</td></tr>` : ''}
      ${earnings.bonus > 0 ? `<tr><td>Bonus</td><td class="amount">RM ${formatNum(earnings.bonus)}</td></tr>` : ''}
      ${earnings.attendance_bonus > 0 ? `<tr><td>Attendance Bonus</td><td class="amount">RM ${formatNum(earnings.attendance_bonus)}</td></tr>` : ''}
      <tr class="total-row"><td>GROSS PAY</td><td class="amount">RM ${formatNum(totals.gross_salary)}</td></tr></table>
      <table><tr class="section-title"><td colspan="2">DEDUCTIONS</td></tr>
      ${deductions.unpaid_leave_deduction > 0 ? `<tr><td>Unpaid Leave (${deductions.unpaid_leave_days} days)</td><td class="amount">RM ${formatNum(deductions.unpaid_leave_deduction)}</td></tr>` : ''}
      <tr><td>EPF (Employee)</td><td class="amount">RM ${formatNum(deductions.epf_employee)}</td></tr>
      <tr><td>SOCSO (Employee)</td><td class="amount">RM ${formatNum(deductions.socso_employee)}</td></tr>
      <tr><td>EIS (Employee)</td><td class="amount">RM ${formatNum(deductions.eis_employee)}</td></tr>
      <tr><td style="padding-left:20px;font-style:italic;color:#666">→ PERKESO Total</td><td class="amount" style="color:#666">RM ${formatNum(perkeso)}</td></tr>
      <tr><td>PCB (Tax)</td><td class="amount">RM ${formatNum(deductions.pcb)}</td></tr>
      ${deductions.short_hours_deduction > 0 ? `<tr><td>Short Hours (${deductions.short_hours} hrs)</td><td class="amount">RM ${formatNum(deductions.short_hours_deduction)}</td></tr>` : ''}
      ${deductions.advance_deduction > 0 ? `<tr><td>Advance Deduction</td><td class="amount">RM ${formatNum(deductions.advance_deduction)}</td></tr>` : ''}
      ${deductions.other_deductions > 0 ? `<tr><td>Other Deductions</td><td class="amount">RM ${formatNum(deductions.other_deductions)}</td></tr>` : ''}
      <tr class="total-row"><td>TOTAL DEDUCTIONS</td><td class="amount">RM ${formatNum(totals.total_deductions)}</td></tr></table>
      <table><tr style="background:#1e293b;color:white"><td><strong>NET PAY</strong></td><td class="amount" style="font-size:1.3em"><strong>RM ${formatNum(totals.net_pay)}</strong></td></tr></table>
      <div class="employer-section"><h4 style="margin:0 0 10px;color:#1e293b">Employer Contributions (For Reference)</h4>
      <table style="margin:0"><tr><td>EPF (Employer)</td><td class="amount">RM ${formatNum(employer.epf_employer)}</td></tr>
      <tr><td>SOCSO (Employer)</td><td class="amount">RM ${formatNum(employer.socso_employer)}</td></tr>
      <tr><td>EIS (Employer)</td><td class="amount">RM ${formatNum(employer.eis_employer)}</td></tr></table></div>
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

  // Inline edit handlers
  const startInlineEdit = (itemId, field, currentValue) => {
    if (selectedRun?.status !== 'draft') return;
    setInlineEditing({ itemId, field });
    setInlineValue(currentValue || 0);
  };

  const saveInlineEdit = async () => {
    if (!inlineEditing) return;
    const { itemId, field } = inlineEditing;
    try {
      const item = selectedRun.items.find(i => i.id === itemId);
      if (!item) return;
      const payload = {
        basic_salary: item.basic_salary || 0,
        fixed_allowance: item.fixed_allowance || 0,
        ot_hours: item.ot_hours || 0,
        ot_amount: item.ot_amount || 0,
        commission_amount: item.commission_amount || 0,
        trade_commission_amount: item.trade_commission_amount || 0,
        bonus: item.bonus || 0,
        other_deductions: item.other_deductions || 0,
        notes: item.notes || '',
      };
      // Map display field to payload field
      const fieldMap = {
        basic_salary: 'basic_salary',
        ot_amount: 'ot_amount',
        fixed_allowance: 'fixed_allowance',
        bonus: 'bonus',
        commission_amount: 'commission_amount',
        pcb: 'pcb_override',
        advance_deduction: 'advance_deduction',
      };
      const payloadField = fieldMap[field] || field;
      payload[payloadField] = parseFloat(inlineValue) || 0;
      await payrollV2Api.updateItem(itemId, payload);
      fetchRunDetails(selectedRun.id);
      fetchRuns();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update');
    }
    setInlineEditing(null);
  };

  const cancelInlineEdit = () => {
    setInlineEditing(null);
  };

  // Determine which optional columns have data
  const getVisibleColumns = (items) => {
    if (!items || items.length === 0) return {};
    const hasValue = (field) => items.some(item => parseFloat(item[field]) > 0);
    return {
      ot: hasValue('ot_amount'),
      allow: hasValue('fixed_allowance'),
      bonus: hasValue('bonus'),
      attendanceBonus: hasValue('attendance_bonus'),
      claims: hasValue('claims_amount'),
      comm: items.some(item => (parseFloat(item.commission_amount) || 0) + (parseFloat(item.trade_commission_amount) || 0) > 0),
      adv: hasValue('advance_deduction'),
      shortHrs: hasValue('short_hours_deduction'),
    };
  };

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
            <div className="header-actions">
              <button onClick={handleDeleteAllDrafts} className="add-btn outline" style={{color: '#dc3545', borderColor: '#dc3545'}}>
                Delete All Drafts
              </button>
              {isMimix ? (
                <button onClick={() => setShowAllOutletsModal(true)} className="add-btn outline">
                  Generate All Outlets
                </button>
              ) : (
                <button onClick={() => setShowAllDeptsModal(true)} className="add-btn outline">
                  Generate All Departments
                </button>
              )}
              <button onClick={() => setShowCreateModal(true)} className="add-btn">
                + New Payroll Run
              </button>
            </div>
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
                        {(run.outlet_name || run.department_name) && (
                          <span className="run-dept"> - {run.outlet_name || run.department_name}</span>
                        )}
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
                        {(selectedRun.outlet_name || selectedRun.department_name) && (
                          <span className="dept-tag"> - {selectedRun.outlet_name || selectedRun.department_name}</span>
                        )}
                      </h2>
                      {getStatusBadge(selectedRun.status)}
                    </div>
                    <div className="details-actions">
                      {selectedRun.status === 'draft' && (
                        <>
                          <button onClick={() => handleDownloadSalaryReport(selectedRun.id, 'csv')} className="download-btn">Download Excel</button>
                          <button onClick={() => handleRecalculateAll(selectedRun.id)} className="recalculate-btn">Recalculate OT</button>
                          <button onClick={() => handleFinalizeRun(selectedRun.id)} className="finalize-btn">Finalize</button>
                          <button onClick={() => handleDeleteRun(selectedRun.id)} className="delete-btn">Delete</button>
                        </>
                      )}
                      {selectedRun.status === 'finalized' && (
                        <>
                          <button onClick={() => handleDownloadSalaryReport(selectedRun.id, 'pdf')} className="download-btn">Download PDF</button>
                          <button onClick={() => handleDownloadBankFile(selectedRun.id)} className="download-btn" style={{marginLeft: '8px'}}>Bank File</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="summary-stats">
                    <div className="summary-stat"><span className="stat-label">Employees</span><span className="stat-value">{selectedRun.items?.length || 0}</span></div>
                    <div className="summary-stat"><span className="stat-label">Working Days</span><span className="stat-value">{selectedRun.work_days_per_month || 22}</span></div>
                    <div className="summary-stat"><span className="stat-label">Gross</span><span className="stat-value">{formatAmount(selectedRun.total_gross)}</span></div>
                    <div className="summary-stat"><span className="stat-label">Deductions</span><span className="stat-value">{formatAmount(selectedRun.total_deductions)}</span></div>
                    <div className="summary-stat highlight"><span className="stat-label">Net</span><span className="stat-value">{formatAmount(selectedRun.total_net)}</span></div>
                    {selectedRun.status === 'draft' && (
                      <div className="summary-stat ai-toggle" onClick={() => { setShowAIAssistant(!showAIAssistant); resetAIAssistant(); }}>
                        <span className="stat-value">🤖</span><span className="stat-label">AI</span>
                      </div>
                    )}
                  </div>

                  {/* AI Assistant Panel - Enhanced with Chat, Editable Changes & Confirmation */}
                  {showAIAssistant && selectedRun.status === 'draft' && (
                    <div className="ai-assistant-panel enhanced">
                      <div className="ai-header">
                        <h3>🤖 AI Payroll Assistant</h3>
                        <button onClick={resetAIAssistant} className="ai-close-btn">×</button>
                      </div>

                      {/* Chat Messages */}
                      <div className="ai-chat-messages" ref={aiChatRef}>
                        {aiConversation.length === 0 && (
                          <div className="ai-welcome">
                            <p>I can help you make payroll changes. Try:</p>
                            <ul>
                              <li>"Ali increase RM200 basic salary"</li>
                              <li>"Everyone get RM400 bonus this month"</li>
                              <li>"All employees bonus RM500, prorate if less than 1 year"</li>
                              <li>"Driver department add RM100 allowance"</li>
                            </ul>
                          </div>
                        )}
                        {aiConversation.map((msg, idx) => (
                          <div key={idx} className={`ai-message ${msg.role}`}>
                            <div className="ai-message-content">
                              {msg.role === 'user' ? msg.content : (
                                msg.content || (msg.analysis && msg.analysis.summary)
                              )}
                            </div>
                          </div>
                        ))}
                        {aiLoading && (
                          <div className="ai-message assistant">
                            <div className="ai-message-content typing">Analyzing...</div>
                          </div>
                        )}
                      </div>

                      {/* Editable Changes Preview */}
                      {aiAnalysis && aiMode === 'reviewing' && aiAnalysis.understood && aiAnalysis.preview?.length > 0 && (
                        <div className="ai-changes-preview">
                          <div className="ai-changes-header">
                            <h4>📝 Proposed Changes ({aiAnalysis.preview.length} employees)</h4>
                            {aiAnalysis.impact && (
                              <div className="ai-impact-summary">
                                <span>Total Increase: <strong>{formatAmount(aiAnalysis.preview.reduce((sum, c) => sum + (c.new_value - c.current_value), 0))}</strong></span>
                              </div>
                            )}
                          </div>
                          <div className="ai-changes-table-wrapper">
                            <table className="ai-changes-table">
                              <thead>
                                <tr>
                                  <th>Employee</th>
                                  <th>Field</th>
                                  <th>Current</th>
                                  <th>New Value</th>
                                  <th>Reason</th>
                                  <th>Gross Change</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiAnalysis.preview.map((change, idx) => (
                                  <tr key={idx}>
                                    <td>
                                      <strong>{change.employee_name}</strong>
                                      {change.years_employed !== null && (
                                        <small className="tenure-info">
                                          {change.years_employed < 1
                                            ? `(${change.months_employed} months)`
                                            : `(${change.years_employed} years)`}
                                        </small>
                                      )}
                                    </td>
                                    <td className="field-name">{change.field.replace(/_/g, ' ')}</td>
                                    <td className="amount">{formatAmount(change.current_value)}</td>
                                    <td className="amount editable">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={change.new_value}
                                        onChange={(e) => handleEditChange(idx, parseFloat(e.target.value) || 0)}
                                        className="change-input"
                                      />
                                    </td>
                                    <td className="reason">{change.reason}</td>
                                    <td className={`net-change ${(change.new_value - change.current_value) >= 0 ? 'positive' : 'negative'}`}>
                                      {(change.new_value - change.current_value) >= 0 ? '+' : ''}{formatAmount(change.new_value - change.current_value)}
                                    </td>
                                    <td>
                                      <button onClick={() => handleRemoveChange(idx)} className="remove-change-btn">×</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Confirmation Buttons */}
                          <div className="ai-confirmation">
                            <p className="confirm-message">Review the changes above. You can edit values before applying.</p>
                            <div className="ai-decision">
                              <button onClick={handleAIApply} className="ai-confirm-btn" disabled={aiLoading}>
                                ✅ Confirm & Apply Changes
                              </button>
                              <button onClick={handleAIDisagree} className="ai-modify-btn">
                                ✏️ Request Modification
                              </button>
                              <button onClick={resetAIAssistant} className="ai-cancel-btn">
                                ❌ Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Feedback Mode for Modifications */}
                      {aiMode === 'feedback' && (
                        <div className="ai-feedback-section">
                          <p>What would you like to change?</p>
                          <textarea
                            value={aiFeedback}
                            onChange={(e) => setAiFeedback(e.target.value)}
                            placeholder="e.g., Ali should get RM300 instead of RM200..."
                            rows={2}
                          />
                          <div className="ai-feedback-actions">
                            <button onClick={handleAIFeedback} className="ai-submit-feedback" disabled={!aiFeedback.trim() || aiLoading}>
                              Submit
                            </button>
                            <button onClick={() => setAiMode('reviewing')} className="ai-back-btn">
                              Back
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Compare Results */}
                      {aiComparison && (
                        <div className="ai-comparison">
                          <h4>📊 Comparison with {aiComparison.previous_period}</h4>
                          <div className="comparison-summary">
                            <span>Current: {formatAmount(aiComparison.summary.current_total_net)}</span>
                            <span>Previous: {formatAmount(aiComparison.summary.previous_total_net)}</span>
                            <span className={aiComparison.summary.difference >= 0 ? 'positive' : 'negative'}>
                              Difference: {aiComparison.summary.difference >= 0 ? '+' : ''}{formatAmount(aiComparison.summary.difference)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Input Section */}
                      <div className="ai-input-section">
                        <div className="ai-quick-actions">
                          <button onClick={handleAICompare} className="ai-quick-btn" disabled={aiLoading}>📊 Compare</button>
                        </div>
                        <div className="ai-input-row">
                          <textarea
                            value={aiInstruction}
                            onChange={(e) => setAiInstruction(e.target.value)}
                            placeholder="Describe the changes you want to make..."
                            rows={2}
                            disabled={aiLoading}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey && aiInstruction.trim()) {
                                e.preventDefault();
                                handleAIAnalyze();
                              }
                            }}
                          />
                          <button
                            onClick={handleAIAnalyze}
                            className="ai-send-btn"
                            disabled={aiLoading || !aiInstruction.trim()}
                          >
                            {aiLoading ? '...' : '➤'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Items Table */}
                  {(() => {
                    const vis = getVisibleColumns(selectedRun.items);
                    const isDraft = selectedRun.status === 'draft';
                    const renderCell = (item, field, value) => {
                      const isEditing = inlineEditing?.itemId === item.id && inlineEditing?.field === field;
                      if (isEditing) {
                        return (
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onBlur={saveInlineEdit}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                              autoFocus
                              style={{ width: '80px', padding: '2px 4px', fontSize: '0.85rem' }}
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          onClick={() => isDraft ? startInlineEdit(item.id, field, value) : null}
                          style={isDraft ? { cursor: 'pointer' } : {}}
                          title={isDraft ? 'Click to edit' : ''}
                        >
                          {formatAmount(value)}
                        </td>
                      );
                    };
                    return (
                    <div className="items-table full-breakdown">
                      <table>
                        <thead>
                          <tr>
                            <th>Employee</th><th>Basic</th><th>Deduct</th>
                            {vis.ot && <th>OT</th>}
                            {vis.allow && <th>Allow</th>}
                            {vis.bonus && <th>Bonus</th>}
                            {vis.attendanceBonus && <th>Att. Bonus</th>}
                            {vis.claims && <th>Claims</th>}
                            {vis.comm && <th>Comm.</th>}
                            <th>Gross</th><th>EPF</th><th>SOCSO</th><th>EIS</th><th>PCB</th>
                            {vis.adv && <th>Adv</th>}
                            {vis.shortHrs && <th>Deduct</th>}
                            <th>Net</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRun.items?.map(item => (
                            <tr key={item.id}>
                              <td className="employee-cell" style={{ cursor: 'pointer' }} onClick={() => setExpandedEmployee(expandedEmployee === item.id ? null : item.id)}>
                                <strong>{item.emp_code}</strong>
                                {expandedEmployee === item.id && <div style={{ fontSize: '0.8rem', color: '#555', marginTop: '2px' }}>{item.employee_name}</div>}
                              </td>
                              {renderCell(item, 'basic_salary', item.basic_salary)}
                              <td style={{color: '#dc3545'}}>
                                {(() => {
                                  const absentDed = parseFloat(item.absent_day_deduction) || 0;
                                  const shortHrsDed = parseFloat(item.short_hours_deduction) || 0;
                                  const unpaidDed = parseFloat(item.unpaid_leave_deduction) || 0;
                                  const otherDed = parseFloat(item.other_deductions) || 0;
                                  const totalDed = absentDed + shortHrsDed + unpaidDed + otherDed;
                                  return totalDed > 0 ? `-${formatAmount(totalDed)}` : '-';
                                })()}
                              </td>
                              {vis.ot && renderCell(item, 'ot_amount', item.ot_amount)}
                              {vis.allow && renderCell(item, 'fixed_allowance', item.fixed_allowance)}
                              {vis.bonus && renderCell(item, 'bonus', item.bonus)}
                              {vis.attendanceBonus && <td>{formatAmount(item.attendance_bonus)}</td>}
                              {vis.claims && <td>{formatAmount(item.claims_amount)}</td>}
                              {vis.comm && renderCell(item, 'commission_amount', (parseFloat(item.commission_amount) || 0) + (parseFloat(item.trade_commission_amount) || 0))}
                              <td><strong>{formatAmount(item.gross_salary)}</strong></td>
                              <td>{formatAmount(item.epf_employee)}</td>
                              <td>{formatAmount(item.socso_employee)}</td>
                              <td>{formatAmount(item.eis_employee)}</td>
                              {renderCell(item, 'pcb', item.pcb)}
                              {vis.adv && <td>{formatAmount(item.advance_deduction)}</td>}
                              {vis.shortHrs && <td>{formatAmount(item.short_hours_deduction)}</td>}
                              <td><strong>{formatAmount(item.net_pay)}</strong></td>
                              <td>
                                {isDraft && (
                                  <>
                                    <button onClick={() => handleRecalculateItem(item.id)} className="action-btn recalc" title="Recalculate">↻</button>
                                    <button onClick={() => handleEditItem(item)} className="action-btn edit" title="Full Edit">✎</button>
                                    <button onClick={() => handleDeleteItem(item)} className="action-btn delete" title="Remove from payroll">🗑</button>
                                  </>
                                )}
                                <button onClick={() => handleViewPayslip(item.id)} className="action-btn view" title="View Payslip">📄</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    );
                  })()}
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
                  <select
                    value={isMimix ? createForm.outlet_id : createForm.department_id}
                    onChange={(e) => setCreateForm({
                      ...createForm,
                      ...(isMimix ? { outlet_id: e.target.value } : { department_id: e.target.value })
                    })}
                  >
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
              <div className="modal-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <h2 style={{margin: 0}}>Edit - {editingItem.employee_name}</h2>
                {editingItem.days_worked != null && (() => {
                  // Use backend-calculated values - no frontend recalculation
                  const daysWorked = parseInt(editingItem.days_worked) || 0;
                  const standardDays = selectedRun?.work_days_per_month || 26;
                  const absentDays = parseFloat(editingItem.absent_days) || 0;
                  const shortHours = parseFloat(editingItem.short_hours) || 0;
                  const totalHours = parseFloat(editingItem.total_work_hours) || 0;
                  const otHours = parseFloat(editingItem.ot_hours) || 0;
                  const clickableStyle = { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' };
                  return (
                    <div style={{fontSize: '0.85rem', color: '#666', textAlign: 'right'}}>
                      <div
                        style={clickableStyle}
                        onClick={() => { fetchAttendanceDetails(editingItem.id); setAttendanceDetailsTab('days_worked'); }}
                        title="Click to see details"
                      >
                        Days Worked: <strong>{daysWorked}</strong> / {standardDays} {absentDays > 0 && <span style={{color: '#dc3545'}}>({absentDays} absent)</span>}
                      </div>
                      <div
                        style={clickableStyle}
                        onClick={() => { fetchAttendanceDetails(editingItem.id); setAttendanceDetailsTab('days_worked'); }}
                        title="Click to see details"
                      >
                        Total Hours: <strong>{totalHours.toFixed(1)}h</strong>
                      </div>
                      <div
                        style={{...clickableStyle, color: shortHours > 0 ? '#dc3545' : '#28a745'}}
                        onClick={() => { fetchAttendanceDetails(editingItem.id); setAttendanceDetailsTab('short_hours'); }}
                        title="Click to see details"
                      >
                        Short Hours: <strong>{shortHours > 0 ? `-${shortHours.toFixed(1)}h` : '0h'}</strong>
                      </div>
                      <div
                        style={clickableStyle}
                        onClick={() => { fetchAttendanceDetails(editingItem.id); setAttendanceDetailsTab('ot_hours'); }}
                        title="Click to see details"
                      >
                        OT Hours: <strong>{otHours.toFixed(1)}h</strong>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <form onSubmit={handleUpdateItem}>
                <div className="modal-scroll-content">
                  {/* Part-time salary breakdown */}
                  {(editingItem?.work_type === 'part_time' || editingItem?.employment_type === 'part_time' || editingItem?.work_type === 'PART TIMER') && (() => {
                    const normalHours = parseFloat(itemForm.part_time_hours) || 0;
                    const otHours = parseFloat(itemForm.ot_hours) || 0;
                    const hourlyRate = parseFloat(editingItem?.hourly_rate || 0);
                    // For part-time: OT is 1.5x hourly rate
                    const normalPay = normalHours * hourlyRate;
                    const otPay = otHours * hourlyRate * 1.5;
                    const totalSalary = normalPay + otPay;

                    const handlePartTimeHoursChange = (newHours) => {
                      const hours = Math.floor(newHours * 2) / 2; // Round to 0.5
                      const newBasicSalary = Math.round(hours * hourlyRate * 100) / 100;
                      const newOtAmount = Math.round(otHours * hourlyRate * 1.5 * 100) / 100;
                      setItemForm({
                        ...itemForm,
                        part_time_hours: hours,
                        basic_salary: newBasicSalary,
                        ot_amount: newOtAmount
                      });
                    };

                    const handlePartTimeOTHoursChange = (newOTHours) => {
                      const hours = Math.floor(newOTHours * 2) / 2; // Round to 0.5
                      const newOtAmount = Math.round(hours * hourlyRate * 1.5 * 100) / 100;
                      setItemForm({
                        ...itemForm,
                        ot_hours: hours,
                        ot_amount: newOtAmount
                      });
                    };

                    return (
                      <div style={{
                        background: 'linear-gradient(135deg, #e0f2fe, #f0f9ff)',
                        border: '1px solid #7dd3fc',
                        borderRadius: '8px',
                        padding: '15px',
                        marginBottom: '15px'
                      }}>
                        <div style={{fontWeight: '600', color: '#0369a1', marginBottom: '10px', fontSize: '0.9rem'}}>
                          Part-Time Salary Breakdown
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center', alignItems: 'end'}}>
                          <div>
                            <div style={{fontSize: '0.7rem', color: '#64748b', marginBottom: '4px'}}>Normal Hours</div>
                            <input
                              type="number"
                              step="0.5"
                              value={normalHours}
                              onChange={(e) => handlePartTimeHoursChange(parseFloat(e.target.value) || 0)}
                              style={{
                                width: '70px',
                                padding: '6px 8px',
                                border: '1px solid #7dd3fc',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </div>
                          <div>
                            <div style={{fontSize: '0.7rem', color: '#64748b', marginBottom: '4px'}}>OT Hours (1.5x)</div>
                            <input
                              type="number"
                              step="0.5"
                              value={otHours}
                              onChange={(e) => handlePartTimeOTHoursChange(parseFloat(e.target.value) || 0)}
                              style={{
                                width: '70px',
                                padding: '6px 8px',
                                border: '1px solid #7dd3fc',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </div>
                          <div>
                            <div style={{fontSize: '0.7rem', color: '#64748b', marginBottom: '4px'}}>Hourly Rate</div>
                            <div style={{fontSize: '1.1rem', fontWeight: '600', color: '#0f172a', padding: '6px 0'}}>
                              RM {hourlyRate.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div style={{fontSize: '0.7rem', color: '#64748b', marginBottom: '4px'}}>Total Salary</div>
                            <div style={{fontSize: '1.1rem', fontWeight: '600', color: '#059669', padding: '6px 0'}}>
                              RM {totalSalary.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div style={{fontSize: '0.75rem', color: '#64748b', marginTop: '10px', textAlign: 'center'}}>
                          ({normalHours.toFixed(1)}h × RM {hourlyRate.toFixed(2)}) + ({otHours.toFixed(1)}h × RM {hourlyRate.toFixed(2)} × 1.5) = <strong>RM {totalSalary.toFixed(2)}</strong>
                        </div>
                      </div>
                    );
                  })()}

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
                      {itemForm.basic_salary > 0 && (() => {
                        const wd = selectedRun?.work_days_per_month || 22;
                        const basic = parseFloat(itemForm.basic_salary) || 0;
                        const hourlyRate = basic / wd / 8;
                        return <small style={{color: '#666', fontSize: '0.75rem'}}>RM {basic.toFixed(0)} / {wd} days / 8h = RM {hourlyRate.toFixed(2)}/hr x 1.5 = RM {(hourlyRate * 1.5).toFixed(2)}/hr OT</small>;
                      })()}
                    </div>
                    <div className="form-group">
                      <label>OT Amount</label>
                      <input type="number" step="0.01" value={itemForm.ot_amount} onChange={(e) => setItemForm({ ...itemForm, ot_amount: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>PH Days Worked (Double Pay)</label>
                      <input type="number" step="0.5" value={itemForm.ph_days_worked} onChange={(e) => handlePHDaysChange(parseFloat(e.target.value) || 0)} />
                      {itemForm.basic_salary > 0 && (
                        <small style={{color: '#666', fontSize: '0.75rem'}}>
                          Daily rate: RM {(parseFloat(itemForm.basic_salary) / (selectedRun?.work_days_per_month || 22)).toFixed(2)} x 2 = RM {((parseFloat(itemForm.basic_salary) / (selectedRun?.work_days_per_month || 22)) * 2).toFixed(2)}/day
                        </small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>PH Pay (2x)</label>
                      <input type="number" step="0.01" value={itemForm.ph_pay} onChange={(e) => setItemForm({ ...itemForm, ph_pay: parseFloat(e.target.value) || 0 })} />
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
                      <label>Short Hours</label>
                      <input type="number" step="0.01" value={itemForm.short_hours} onChange={(e) => {
                        const hrs = parseFloat(e.target.value) || 0;
                        const wd = selectedRun?.work_days_per_month || 22;
                        const deduction = hrs > 0 ? Math.round((itemForm.basic_salary / wd / 8) * hrs * 100) / 100 : 0;
                        setItemForm({ ...itemForm, short_hours: hrs, short_hours_deduction: deduction });
                      }} />
                      {editingItem?.days_worked != null && editingItem?.total_work_hours != null && (
                        <small style={{color: '#666', fontSize: '0.75rem'}}>
                          Expected: {editingItem.days_worked * 8}h, Actual: {(parseFloat(editingItem.total_work_hours) - (itemForm.ot_hours || 0)).toFixed(1)}h (excl OT)
                        </small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Short Hours Deduction</label>
                      <input type="number" step="0.01" value={itemForm.short_hours_deduction} onChange={(e) => setItemForm({ ...itemForm, short_hours_deduction: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Absent Days</label>
                      <input type="number" step="0.5" value={itemForm.absent_days} onChange={(e) => {
                        const days = parseFloat(e.target.value) || 0;
                        const wd = selectedRun?.work_days_per_month || 22;
                        const deduction = days > 0 ? Math.round((itemForm.basic_salary / wd) * days * 100) / 100 : 0;
                        // Recalculate attendance bonus for Mimix
                        const lateDays = itemForm.late_days || 0;
                        const totalPenalty = lateDays + days;
                        let bonus = itemForm.attendance_bonus;
                        if (selectedRun?.company_id === 3) {
                          if (totalPenalty === 0) bonus = 400;
                          else if (totalPenalty === 1) bonus = 300;
                          else if (totalPenalty === 2) bonus = 200;
                          else if (totalPenalty === 3) bonus = 100;
                          else bonus = 0;
                        }
                        setItemForm({ ...itemForm, absent_days: days, absent_day_deduction: deduction, attendance_bonus: bonus });
                      }} />
                      {editingItem?.days_worked != null && editingItem?.work_type !== 'part_time' && editingItem?.employment_type !== 'part_time' && <small style={{color: '#666', fontSize: '0.75rem'}}>{editingItem.days_worked} days worked / {selectedRun?.work_days_per_month || 22} standard</small>}
                      {(editingItem?.work_type === 'part_time' || editingItem?.employment_type === 'part_time') && <small style={{color: '#666', fontSize: '0.75rem'}}>Part-time: paid by hours worked</small>}
                    </div>
                    <div className="form-group">
                      <label>Absent Day Deduction</label>
                      <input type="number" step="0.01" value={itemForm.absent_day_deduction} onChange={(e) => setItemForm({ ...itemForm, absent_day_deduction: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  {/* Mimix Attendance Bonus - only show for Mimix company */}
                  {selectedRun?.company_id === 3 && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Late Days</label>
                        <input type="number" step="1" value={itemForm.late_days} onChange={(e) => {
                          const days = parseFloat(e.target.value) || 0;
                          const absentDays = itemForm.absent_days || 0;
                          const totalPenalty = days + absentDays;
                          let bonus = 0;
                          if (totalPenalty === 0) bonus = 400;
                          else if (totalPenalty === 1) bonus = 300;
                          else if (totalPenalty === 2) bonus = 200;
                          else if (totalPenalty === 3) bonus = 100;
                          setItemForm({ ...itemForm, late_days: days, attendance_bonus: bonus });
                        }} />
                        <small style={{color: '#666', fontSize: '0.75rem'}}>Days clocked in after shift start time</small>
                      </div>
                      <div className="form-group">
                        <label>Attendance Bonus (RM)</label>
                        <input type="number" step="1" value={itemForm.attendance_bonus} onChange={(e) => setItemForm({ ...itemForm, attendance_bonus: parseFloat(e.target.value) || 0 })} />
                        <small style={{color: '#666', fontSize: '0.75rem'}}>RM400=0 late/absent, RM300=1, RM200=2, RM100=3, RM0=4+</small>
                      </div>
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label>Other Deductions</label>
                      <input type="number" step="0.01" value={itemForm.other_deductions} onChange={(e) => setItemForm({ ...itemForm, other_deductions: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="form-group">
                      <label>EPF Override (KWSP)</label>
                      <input
                        type="number"
                        step="1"
                        value={itemForm.epf_override}
                        onChange={(e) => setItemForm({ ...itemForm, epf_override: e.target.value })}
                        placeholder={`Calculated: ${statutoryPreview?.epf?.employee?.toFixed(0) || editingItem?.epf_employee || '0'}`}
                      />
                      <small style={{color: '#666', fontSize: '0.75rem'}}>Leave empty to use calculated EPF. Enter value from KWSP table to override.</small>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>PCB Override (MyTax)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.pcb_override}
                        onChange={(e) => setItemForm({ ...itemForm, pcb_override: e.target.value })}
                        placeholder={`Calculated: ${statutoryPreview?.pcb?.toFixed(2) || editingItem?.pcb || '0.00'}`}
                      />
                      <small style={{color: '#666', fontSize: '0.75rem'}}>Leave empty to use calculated PCB. Enter value from MyTax to override.</small>
                    </div>
                    <div className="form-group">
                      <label>Claims Override</label>
                      <input
                        type="number"
                        step="0.01"
                        value={itemForm.claims_override}
                        onChange={(e) => setItemForm({ ...itemForm, claims_override: e.target.value })}
                        placeholder={`Current: ${editingItem?.claims_amount || '0.00'}`}
                      />
                      <small style={{color: '#666', fontSize: '0.75rem'}}>Leave empty to use approved claims. Enter value to override total claims.</small>
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

        {/* Generate All Outlets Modal (Mimix) */}
        {showAllOutletsModal && (
          <div className="modal-overlay" onClick={() => setShowAllOutletsModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Generate All Outlets Payroll</h2>
              <p className="modal-description">
                This will create separate payroll runs for each outlet.
                Each outlet will have its own payroll with separate contributions.
              </p>
              <form onSubmit={handleCreateAllOutlets}>
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
                <div className="outlets-info">
                  <strong>Outlets to generate:</strong>
                  <ul>
                    {outlets.map(outlet => (
                      <li key={outlet.id}>{outlet.name}</li>
                    ))}
                  </ul>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAllOutletsModal(false)} className="cancel-btn" disabled={creatingAllOutlets}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn" disabled={creatingAllOutlets}>
                    {creatingAllOutlets ? 'Generating...' : 'Generate All'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Generate All Departments Modal */}
        {showAllDeptsModal && (
          <div className="modal-overlay" onClick={() => setShowAllDeptsModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Generate All Departments Payroll</h2>
              <p className="modal-description">
                This will create separate payroll runs for each department.
                Each department will have its own payroll with separate contributions.
              </p>
              <form onSubmit={handleCreateAllDepts}>
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
                <div className="outlets-info">
                  <strong>Departments to generate:</strong>
                  <ul>
                    {departments.map(dept => (
                      <li key={dept.id}>{dept.name}</li>
                    ))}
                  </ul>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAllDeptsModal(false)} className="cancel-btn" disabled={creatingAllDepts}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn" disabled={creatingAllDepts}>
                    {creatingAllDepts ? 'Generating...' : 'Generate All'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Attendance Details Modal */}
        {showAttendanceDetails && attendanceDetails && (
          <div className="modal-overlay" onClick={() => setShowAttendanceDetails(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()} style={{maxWidth: '800px'}}>
              <div className="modal-header">
                <h2>Attendance Details - {attendanceDetails.employee?.name}</h2>
                <button className="close-btn" onClick={() => setShowAttendanceDetails(false)}>&times;</button>
              </div>
              <div style={{padding: '0 20px'}}>
                <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
                  <button
                    className={`tab-btn ${attendanceDetailsTab === 'days_worked' ? 'active' : ''}`}
                    onClick={() => setAttendanceDetailsTab('days_worked')}
                  >
                    Days Worked ({attendanceDetails.summary?.days_worked || 0})
                  </button>
                  <button
                    className={`tab-btn ${attendanceDetailsTab === 'absent' ? 'active' : ''}`}
                    onClick={() => setAttendanceDetailsTab('absent')}
                  >
                    Absent ({attendanceDetails.summary?.days_absent || 0})
                  </button>
                  <button
                    className={`tab-btn ${attendanceDetailsTab === 'ot_hours' ? 'active' : ''}`}
                    onClick={() => setAttendanceDetailsTab('ot_hours')}
                  >
                    OT ({attendanceDetails.details?.ot_days?.length || 0})
                  </button>
                  <button
                    className={`tab-btn ${attendanceDetailsTab === 'leave' ? 'active' : ''}`}
                    onClick={() => setAttendanceDetailsTab('leave')}
                  >
                    Leave ({attendanceDetails.summary?.days_on_leave || 0})
                  </button>
                  {attendanceDetails.summary?.is_outlet_based && (
                    <button
                      className={`tab-btn ${attendanceDetailsTab === 'unscheduled' ? 'active' : ''}`}
                      onClick={() => setAttendanceDetailsTab('unscheduled')}
                      style={{background: attendanceDetailsTab === 'unscheduled' ? '#ff9800' : '', color: attendanceDetailsTab === 'unscheduled' ? '#fff' : '#ff9800', borderColor: '#ff9800'}}
                    >
                      No Schedule ({attendanceDetails.summary?.days_unscheduled || 0})
                    </button>
                  )}
                </div>

                {/* Summary Row */}
                <div style={{background: '#f8f9fa', padding: '10px 15px', borderRadius: '6px', marginBottom: '15px', display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '0.9rem'}}>
                  <span>Total Hours: <strong>{attendanceDetails.summary?.total_hours || 0}h</strong></span>
                  <span>Short Hours: <strong style={{color: '#dc3545'}}>{attendanceDetails.summary?.total_short_hours || 0}h</strong></span>
                  <span>OT Hours: <strong style={{color: '#28a745'}}>{attendanceDetails.summary?.total_ot_hours || 0}h</strong></span>
                </div>
              </div>

              <div className="modal-scroll-content" style={{maxHeight: '400px', overflowY: 'auto', padding: '0 20px 20px'}}>
                {attendanceDetailsTab === 'days_worked' && (() => {
                  // Create lookup for short hours by date
                  const shortHoursMap = {};
                  (attendanceDetails.details?.short_hours_days || []).forEach(d => {
                    shortHoursMap[d.date] = d.short_hours;
                  });
                  return (
                    <table className="data-table" style={{width: 'auto', minWidth: '520px'}}>
                      <thead>
                        <tr>
                          <th style={{width: '100px'}}>Date</th>
                          <th style={{width: '70px', textAlign: 'center'}}>Clock In</th>
                          <th style={{width: '70px', textAlign: 'center'}}>Clock Out</th>
                          <th style={{width: '55px', textAlign: 'center'}}>Hours</th>
                          <th style={{width: '55px', textAlign: 'center'}}>Short</th>
                          <th style={{width: '55px', textAlign: 'center'}}>OT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(attendanceDetails.details?.days_worked || []).map((day, i) => {
                          const formatTime = (timeVal) => {
                            if (!timeVal) return null;
                            if (typeof timeVal === 'string' && timeVal.match(/^\d{2}:\d{2}/)) {
                              return timeVal.substring(0, 5);
                            }
                            const d = new Date(timeVal);
                            return isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-MY', {hour: '2-digit', minute: '2-digit'});
                          };
                          const shortHrs = shortHoursMap[day.date] || 0;
                          // Show first clock in and last clock out
                          const clockIn = formatTime(day.clock_in);
                          const clockOut = formatTime(day.clock_out_2) || formatTime(day.clock_out);
                          return (
                            <tr key={i}>
                              <td>{new Date(day.date).toLocaleDateString('en-MY', {weekday: 'short', day: 'numeric', month: 'short'})}</td>
                              <td style={{textAlign: 'center'}}>{clockIn || '-'}</td>
                              <td style={{textAlign: 'center'}}>{clockOut || '-'}</td>
                              <td style={{textAlign: 'center'}}>{day.total_hours?.toFixed(1) || 0}h</td>
                              <td style={{textAlign: 'center', color: shortHrs > 0 ? '#dc3545' : '#999', fontWeight: shortHrs > 0 ? '600' : 'normal'}}>{shortHrs > 0 ? `-${shortHrs.toFixed(2)}h` : '-'}</td>
                              <td style={{textAlign: 'center', color: day.ot_hours > 0 ? '#28a745' : '#999', fontWeight: day.ot_hours > 0 ? '600' : 'normal'}}>{day.ot_hours > 0 ? `+${day.ot_hours?.toFixed(1)}h` : '-'}</td>
                            </tr>
                          );
                        })}
                        {(attendanceDetails.details?.days_worked || []).length === 0 && (
                          <tr><td colSpan="6" style={{textAlign: 'center', color: '#999'}}>No records</td></tr>
                        )}
                      </tbody>
                    </table>
                  );
                })()}

                {attendanceDetailsTab === 'absent' && (
                  <table className="data-table" style={{width: '100%'}}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Scheduled Start</th>
                        <th>Scheduled End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendanceDetails.details?.absent_days || []).map((day, i) => (
                        <tr key={i}>
                          <td>{new Date(day.date).toLocaleDateString('en-MY', {weekday: 'short', day: 'numeric', month: 'short'})}</td>
                          <td>{day.scheduled_start || '-'}</td>
                          <td>{day.scheduled_end || '-'}</td>
                        </tr>
                      ))}
                      {(attendanceDetails.details?.absent_days || []).length === 0 && (
                        <tr><td colSpan="3" style={{textAlign: 'center', color: '#999'}}>No absent days</td></tr>
                      )}
                    </tbody>
                  </table>
                )}

                {attendanceDetailsTab === 'ot_hours' && (
                  <table className="data-table" style={{width: '100%'}}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>OT Hours</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendanceDetails.details?.ot_days || []).map((day, i) => (
                        <tr key={i}>
                          <td>{new Date(day.date).toLocaleDateString('en-MY', {weekday: 'short', day: 'numeric', month: 'short'})}</td>
                          <td style={{color: '#28a745'}}>+{day.ot_hours}h</td>
                          <td>
                            <span className={`status-badge ${day.status || 'pending'}`}>
                              {day.status || 'pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(attendanceDetails.details?.ot_days || []).length === 0 && (
                        <tr><td colSpan="3" style={{textAlign: 'center', color: '#999'}}>No OT records</td></tr>
                      )}
                    </tbody>
                  </table>
                )}

                {attendanceDetailsTab === 'leave' && (
                  <table className="data-table" style={{width: '100%'}}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Leave Type</th>
                        <th>Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendanceDetails.details?.leave_days || []).map((day, i) => (
                        <tr key={i}>
                          <td>{new Date(day.date).toLocaleDateString('en-MY', {weekday: 'short', day: 'numeric', month: 'short'})}</td>
                          <td>{day.leave_type}</td>
                          <td>{day.is_paid ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                      {(attendanceDetails.details?.leave_days || []).length === 0 && (
                        <tr><td colSpan="3" style={{textAlign: 'center', color: '#999'}}>No leave records</td></tr>
                      )}
                    </tbody>
                  </table>
                )}

                {attendanceDetailsTab === 'unscheduled' && (
                  <>
                    <div style={{background: '#fff3cd', padding: '10px 15px', borderRadius: '6px', marginBottom: '15px', color: '#856404', fontSize: '0.85rem'}}>
                      <strong>Note:</strong> These days have clock-in records but NO schedule assigned. They will NOT be paid unless admin adds a schedule.
                    </div>
                    <table className="data-table" style={{width: 'auto', minWidth: '450px'}}>
                      <thead>
                        <tr>
                          <th style={{width: '110px'}}>Date</th>
                          <th style={{width: '70px', textAlign: 'center'}}>Clock In</th>
                          <th style={{width: '70px', textAlign: 'center'}}>Clock Out</th>
                          <th style={{width: '60px', textAlign: 'center'}}>Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(attendanceDetails.details?.unscheduled_days || []).map((day, i) => {
                          const formatTime = (timeVal) => {
                            if (!timeVal) return '-';
                            if (typeof timeVal === 'string' && timeVal.match(/^\d{2}:\d{2}/)) {
                              return timeVal.substring(0, 5);
                            }
                            const d = new Date(timeVal);
                            return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('en-MY', {hour: '2-digit', minute: '2-digit'});
                          };
                          return (
                            <tr key={i} style={{background: '#fff3cd'}}>
                              <td>{new Date(day.date).toLocaleDateString('en-MY', {weekday: 'short', day: 'numeric', month: 'short'})}</td>
                              <td style={{textAlign: 'center'}}>{formatTime(day.clock_in)}</td>
                              <td style={{textAlign: 'center'}}>{formatTime(day.clock_out)}</td>
                              <td style={{textAlign: 'center', color: '#856404'}}>{day.total_hours?.toFixed(1) || 0}h (unpaid)</td>
                            </tr>
                          );
                        })}
                        {(attendanceDetails.details?.unscheduled_days || []).length === 0 && (
                          <tr><td colSpan="4" style={{textAlign: 'center', color: '#999'}}>No unscheduled work days</td></tr>
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAttendanceDetails(false)} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default PayrollUnified;
