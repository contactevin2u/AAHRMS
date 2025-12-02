import React, { useState, useEffect } from 'react';
import { payrollApi, departmentApi } from '../api';
import Layout from '../components/Layout';
import './SalaryEntry.css';

function SalaryEntry() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [filter, setFilter] = useState({ department_id: '', search: '' });
  const [message, setMessage] = useState(null);

  // Generate modal state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [generating, setGenerating] = useState(false);

  const currentDate = new Date();
  const [period, setPeriod] = useState({
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear()
  });

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchData();
  }, [period, filter]);

  const fetchDepartments = async () => {
    try {
      const res = await departmentApi.getAll();
      setDepartments(res.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const payrollRes = await payrollApi.getAll({
        month: period.month,
        year: period.year,
        department_id: filter.department_id
      });

      let data = payrollRes.data;

      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        data = data.filter(p =>
          p.employee_name?.toLowerCase().includes(searchLower) ||
          p.emp_id?.toLowerCase().includes(searchLower)
        );
      }

      setEmployees(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openGenerateModal = async () => {
    setShowGenerateModal(true);
    setLoadingAvailable(true);
    setSelectedEmployees([]);

    try {
      const res = await payrollApi.getAvailableEmployees(period.year, period.month);
      setAvailableEmployees(res.data);
    } catch (error) {
      console.error('Error fetching available employees:', error);
      setAvailableEmployees([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const toggleEmployeeSelection = (empId) => {
    setSelectedEmployees(prev => {
      if (prev.includes(empId)) {
        return prev.filter(id => id !== empId);
      } else {
        return [...prev, empId];
      }
    });
  };

  const selectAll = () => {
    setSelectedEmployees(availableEmployees.map(e => e.id));
  };

  const deselectAll = () => {
    setSelectedEmployees([]);
  };

  const handleGenerateSelected = async () => {
    if (selectedEmployees.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one employee' });
      return;
    }

    setGenerating(true);
    try {
      const res = await payrollApi.generate({
        month: period.month,
        year: period.year,
        employee_ids: selectedEmployees
      });
      setMessage({ type: 'success', text: res.data.message });
      setShowGenerateModal(false);
      fetchData();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to generate payroll' });
    } finally {
      setGenerating(false);
    }
  };

  const handleFieldChange = (empIndex, field, value) => {
    setEmployees(prev => {
      const updated = [...prev];
      updated[empIndex] = { ...updated[empIndex], [field]: value };
      return updated;
    });
  };

  const handleSave = async (emp, index) => {
    setSaving(prev => ({ ...prev, [emp.id]: true }));
    try {
      await payrollApi.update(emp.id, {
        basic_salary: emp.basic_salary || 0,
        allowance: emp.allowance || 0,
        commission: emp.commission || 0,
        trip_pay: emp.trip_pay || 0,
        ot_pay: emp.ot_pay || 0,
        outstation_pay: emp.outstation_pay || 0,
        bonus: emp.bonus || 0,
        other_deductions: emp.other_deductions || 0,
        sales_amount: emp.sales_amount || 0,
        trip_count: emp.trip_count || 0,
        ot_hours: emp.ot_hours || 0,
        outstation_days: emp.outstation_days || 0,
        notes: emp.notes || '',
        status: emp.status || 'draft'
      });

      setMessage({ type: 'success', text: `Saved ${emp.employee_name}'s salary` });
      fetchData();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to save ${emp.employee_name}'s salary` });
    } finally {
      setSaving(prev => ({ ...prev, [emp.id]: false }));
    }
  };

  const handleSaveAll = async () => {
    setMessage({ type: 'info', text: 'Saving all changes...' });
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      setSaving(prev => ({ ...prev, [emp.id]: true }));
      try {
        await payrollApi.update(emp.id, {
          basic_salary: emp.basic_salary || 0,
          allowance: emp.allowance || 0,
          commission: emp.commission || 0,
          trip_pay: emp.trip_pay || 0,
          ot_pay: emp.ot_pay || 0,
          outstation_pay: emp.outstation_pay || 0,
          bonus: emp.bonus || 0,
          other_deductions: emp.other_deductions || 0,
          sales_amount: emp.sales_amount || 0,
          trip_count: emp.trip_count || 0,
          ot_hours: emp.ot_hours || 0,
          outstation_days: emp.outstation_days || 0,
          notes: emp.notes || '',
          status: emp.status || 'draft'
        });
        successCount++;
      } catch (error) {
        errorCount++;
      } finally {
        setSaving(prev => ({ ...prev, [emp.id]: false }));
      }
    }

    setMessage({
      type: errorCount > 0 ? 'warning' : 'success',
      text: `Saved ${successCount} employees${errorCount > 0 ? `, ${errorCount} failed` : ''}`
    });
    fetchData();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount || 0);
  };

  const calculateGross = (emp) => {
    return (
      parseFloat(emp.basic_salary || 0) +
      parseFloat(emp.allowance || 0) +
      parseFloat(emp.commission || 0) +
      parseFloat(emp.trip_pay || 0) +
      parseFloat(emp.ot_pay || 0) +
      parseFloat(emp.outstation_pay || 0) +
      parseFloat(emp.bonus || 0)
    );
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <Layout>
      <div className="salary-entry-page">
        <header className="page-header">
          <div>
            <h1>💵 Salary Entry</h1>
            <p>Easy salary input for {months[period.month - 1]} {period.year}</p>
          </div>
          <div className="header-actions">
            <button onClick={handleSaveAll} className="save-all-btn" disabled={employees.length === 0}>
              💾 Save All
            </button>
          </div>
        </header>

        {message && (
          <div className={`message-banner ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="controls-row">
          <div className="period-selector">
            <select
              value={period.month}
              onChange={(e) => setPeriod({ ...period, month: parseInt(e.target.value) })}
            >
              {months.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={period.year}
              onChange={(e) => setPeriod({ ...period, year: parseInt(e.target.value) })}
            >
              {[2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filters">
            <input
              type="text"
              placeholder="Search name or ID..."
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              className="search-input"
            />
            <select
              value={filter.department_id}
              onChange={(e) => setFilter({ ...filter, department_id: e.target.value })}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <button onClick={openGenerateModal} className="generate-btn">
            ⚡ Generate Payroll
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No payroll records found</h3>
            <p>Click "Generate Payroll" to create records for {months[period.month - 1]} {period.year}</p>
            <button onClick={openGenerateModal} className="generate-btn large">
              ⚡ Generate Payroll
            </button>
          </div>
        ) : (
          <div className="salary-cards">
            {employees.map((emp, index) => (
              <div key={emp.id} className={`salary-card ${saving[emp.id] ? 'saving' : ''}`}>
                <div className="card-header">
                  <div className="employee-info">
                    <h3>{emp.employee_name}</h3>
                    <span className="emp-id">{emp.emp_id}</span>
                    <span className="dept-badge">{emp.department_name}</span>
                  </div>
                  <div className="card-actions">
                    <span className={`status-indicator ${emp.status}`}>{emp.status}</span>
                    <button
                      onClick={() => handleSave(emp, index)}
                      className="save-btn"
                      disabled={saving[emp.id]}
                    >
                      {saving[emp.id] ? '...' : '💾'}
                    </button>
                  </div>
                </div>

                <div className="salary-inputs">
                  <div className="input-group main">
                    <label>Basic Salary</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.basic_salary || ''}
                      onChange={(e) => handleFieldChange(index, 'basic_salary', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group">
                    <label>Allowance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.allowance || ''}
                      onChange={(e) => handleFieldChange(index, 'allowance', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group">
                    <label>Commission</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.commission || ''}
                      onChange={(e) => handleFieldChange(index, 'commission', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group">
                    <label>Trip Pay</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.trip_pay || ''}
                      onChange={(e) => handleFieldChange(index, 'trip_pay', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group">
                    <label>OT Pay</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.ot_pay || ''}
                      onChange={(e) => handleFieldChange(index, 'ot_pay', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group">
                    <label>Outstation</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.outstation_pay || ''}
                      onChange={(e) => handleFieldChange(index, 'outstation_pay', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group">
                    <label>Bonus</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.bonus || ''}
                      onChange={(e) => handleFieldChange(index, 'bonus', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="input-group deduction">
                    <label>Deductions</label>
                    <input
                      type="number"
                      step="0.01"
                      value={emp.other_deductions || ''}
                      onChange={(e) => handleFieldChange(index, 'other_deductions', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="card-footer">
                  <div className="summary-row">
                    <div className="summary-item">
                      <span className="label">Gross</span>
                      <span className="value">{formatCurrency(emp.gross_salary || calculateGross(emp))}</span>
                    </div>
                    <div className="summary-item statutory">
                      <span className="label">EPF</span>
                      <span className="value">-{formatCurrency(emp.epf_employee)}</span>
                    </div>
                    <div className="summary-item statutory">
                      <span className="label">SOCSO</span>
                      <span className="value">-{formatCurrency(emp.socso_employee)}</span>
                    </div>
                    <div className="summary-item statutory">
                      <span className="label">EIS</span>
                      <span className="value">-{formatCurrency(emp.eis_employee)}</span>
                    </div>
                    <div className="summary-item statutory">
                      <span className="label">PCB</span>
                      <span className="value">-{formatCurrency(emp.pcb)}</span>
                    </div>
                    <div className="summary-item net">
                      <span className="label">Net Pay</span>
                      <span className="value">{formatCurrency(emp.net_salary)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Generate Payroll Modal */}
        {showGenerateModal && (
          <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
            <div className="modal generate-modal" onClick={(e) => e.stopPropagation()}>
              <h2>⚡ Generate Payroll</h2>
              <p className="modal-subtitle">Select employees for {months[period.month - 1]} {period.year}</p>

              {loadingAvailable ? (
                <div className="modal-loading">Loading employees...</div>
              ) : availableEmployees.length === 0 ? (
                <div className="modal-empty">
                  <p>All active employees already have payroll records for this month.</p>
                </div>
              ) : (
                <>
                  <div className="selection-actions">
                    <button onClick={selectAll} className="select-btn">
                      Select All ({availableEmployees.length})
                    </button>
                    <button onClick={deselectAll} className="select-btn">
                      Deselect All
                    </button>
                    <span className="selected-count">
                      {selectedEmployees.length} selected
                    </span>
                  </div>

                  <div className="employee-list">
                    {availableEmployees.map(emp => (
                      <div
                        key={emp.id}
                        className={`employee-item ${selectedEmployees.includes(emp.id) ? 'selected' : ''}`}
                        onClick={() => toggleEmployeeSelection(emp.id)}
                      >
                        <div className="checkbox">
                          {selectedEmployees.includes(emp.id) ? '✓' : ''}
                        </div>
                        <div className="emp-details">
                          <span className="emp-name">{emp.name}</span>
                          <span className="emp-meta">{emp.emp_id} • {emp.department_name || 'No Dept'}</span>
                        </div>
                        <div className="emp-salary">
                          {formatCurrency(parseFloat(emp.default_basic_salary || 0) + parseFloat(emp.default_allowance || 0))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateSelected}
                  className="save-btn"
                  disabled={generating || selectedEmployees.length === 0}
                >
                  {generating ? 'Generating...' : `Generate ${selectedEmployees.length} Payroll`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default SalaryEntry;
