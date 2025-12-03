import React, { useState, useEffect } from 'react';
import { payrollV2Api, departmentApi } from '../api';
import Layout from '../components/Layout';
import './PayrollV2.css';

function PayrollV2() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [departments, setDepartments] = useState([]);

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
    incentive_amount: 0,
    commission_amount: 0,
    bonus: 0,
    other_earnings: 0,
    other_deductions: 0,
    notes: ''
  });

  useEffect(() => {
    fetchRuns();
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await departmentApi.getAll();
      setDepartments(res.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
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

  const handleCreateRun = async (e) => {
    e.preventDefault();
    try {
      const res = await payrollV2Api.createRun(createForm);
      setShowCreateModal(false);
      fetchRuns();
      fetchRunDetails(res.data.run.id);

      // Show warning if some employees were skipped
      if (res.data.warning) {
        alert(res.data.warning + '\n\nPlease set their basic salary in Employees page.');
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
    setItemForm({
      basic_salary: item.basic_salary || 0,
      fixed_allowance: item.fixed_allowance || 0,
      ot_hours: item.ot_hours || 0,
      ot_amount: item.ot_amount || 0,
      incentive_amount: item.incentive_amount || 0,
      commission_amount: item.commission_amount || 0,
      bonus: item.bonus || 0,
      other_earnings: item.other_earnings || 0,
      other_deductions: item.other_deductions || 0,
      notes: item.notes || ''
    });
    setShowItemModal(true);
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
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6b5344; padding-bottom: 20px; }
          .header h1 { color: #6b5344; margin: 0; }
          .header p { color: #9a8072; margin: 5px 0; }
          .employee-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-block { }
          .info-block h3 { margin: 0 0 10px 0; color: #6b5344; }
          .info-block p { margin: 5px 0; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5e6dc; color: #6b5344; }
          .section-title { background: #6b5344; color: white; font-weight: bold; }
          .total-row { font-weight: bold; background: #f5f5f5; }
          .amount { text-align: right; }
          .footer { margin-top: 40px; text-align: center; color: #9a8072; font-size: 12px; }
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
            <p><strong>Department:</strong> ${emp.department || '-'}</p>
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
          ${earnings.ot_amount > 0 ? `<tr><td>OT</td><td class="amount">RM ${formatNum(earnings.ot_amount)}</td></tr>` : ''}
          ${earnings.incentive_amount > 0 ? `<tr><td>Incentive</td><td class="amount">RM ${formatNum(earnings.incentive_amount)}</td></tr>` : ''}
          ${earnings.commission_amount > 0 ? `<tr><td>Commission</td><td class="amount">RM ${formatNum(earnings.commission_amount)}</td></tr>` : ''}
          ${earnings.bonus > 0 ? `<tr><td>Bonus</td><td class="amount">RM ${formatNum(earnings.bonus)}</td></tr>` : ''}
          ${earnings.claims_amount > 0 ? `<tr><td>Claims</td><td class="amount">RM ${formatNum(earnings.claims_amount)}</td></tr>` : ''}
          ${earnings.other_earnings > 0 ? `<tr><td>Other Additions</td><td class="amount">RM ${formatNum(earnings.other_earnings)}</td></tr>` : ''}
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
          <tr style="background: #6b5344; color: white;"><td><strong>NET PAY</strong></td><td class="amount" style="font-size: 1.3em;"><strong>RM ${formatNum(totals.net_pay)}</strong></td></tr>
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
                {runs.map(run => (
                  <div
                    key={run.id}
                    className={`run-card ${selectedRun?.id === run.id ? 'selected' : ''}`}
                    onClick={() => fetchRunDetails(run.id)}
                  >
                    <div className="run-period">
                      {getMonthName(run.month)} {run.year}
                      {run.department_name && (
                        <span className="run-dept"> - {run.department_name}</span>
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
                </div>

                {/* Items Table */}
                <div className="items-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Basic</th>
                        <th>Allowance</th>
                        <th>Gross</th>
                        <th>EPF</th>
                        <th>SOCSO</th>
                        <th>EIS</th>
                        <th>PCB</th>
                        <th>Total Ded.</th>
                        <th>Net</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRun.items?.map(item => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.employee_name}</strong>
                            <br />
                            <small>{item.emp_code}</small>
                          </td>
                          <td>{formatAmount(item.basic_salary)}</td>
                          <td>{formatAmount(item.fixed_allowance)}</td>
                          <td><strong>{formatAmount(item.gross_salary)}</strong></td>
                          <td>{formatAmount(item.epf_employee)}</td>
                          <td>{formatAmount(item.socso_employee)}</td>
                          <td>{formatAmount(item.eis_employee)}</td>
                          <td>{formatAmount(item.pcb)}</td>
                          <td>{formatAmount(item.total_deductions)}</td>
                          <td><strong>{formatAmount(item.net_pay)}</strong></td>
                          <td>
                            {selectedRun.status === 'draft' && (
                              <button onClick={() => handleEditItem(item)} className="action-btn edit">
                                Edit
                              </button>
                            )}
                            <button onClick={() => handleViewPayslip(item.id)} className="action-btn view">
                              Payslip
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
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
                  <label>Department</label>
                  <select
                    value={createForm.department_id}
                    onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })}
                  >
                    <option value="">All Departments</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="info-box">
                  {createForm.department_id
                    ? `This will create payroll items for active employees in the selected department.`
                    : `This will create payroll items for all active employees.`
                  }
                  {' '}Unpaid leave and approved claims will be auto-calculated.
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
        {showItemModal && editingItem && (
          <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Payroll - {editingItem.employee_name}</h2>
              <form onSubmit={handleUpdateItem}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Basic Salary (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.basic_salary}
                      onChange={(e) => setItemForm({ ...itemForm, basic_salary: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Allowance (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.fixed_allowance}
                      onChange={(e) => setItemForm({ ...itemForm, fixed_allowance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>OT Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={itemForm.ot_hours}
                      onChange={(e) => setItemForm({ ...itemForm, ot_hours: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>OT Amount (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.ot_amount}
                      onChange={(e) => setItemForm({ ...itemForm, ot_amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Incentive (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.incentive_amount}
                      onChange={(e) => setItemForm({ ...itemForm, incentive_amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Commission (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.commission_amount}
                      onChange={(e) => setItemForm({ ...itemForm, commission_amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Bonus (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.bonus}
                      onChange={(e) => setItemForm({ ...itemForm, bonus: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Other Additions (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemForm.other_earnings}
                      onChange={(e) => setItemForm({ ...itemForm, other_earnings: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Other Deductions (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.other_deductions}
                    onChange={(e) => setItemForm({ ...itemForm, other_deductions: parseFloat(e.target.value) || 0 })}
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

                {/* Auto-calculated info */}
                <div className="auto-info">
                  <h4>Auto-calculated values:</h4>
                  <p>Unpaid Leave: {editingItem.unpaid_leave_days} days = RM {formatNum(editingItem.unpaid_leave_deduction)}</p>
                  <p>Claims: RM {formatNum(editingItem.claims_amount)}</p>
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
        )}
      </div>
    </Layout>
  );
}

export default PayrollV2;
