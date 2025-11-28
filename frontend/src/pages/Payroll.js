import React, { useState, useEffect } from 'react';
import { payrollApi, departmentApi } from '../api';
import Layout from '../components/Layout';
import './Payroll.css';

function Payroll() {
  const [payrolls, setPayrolls] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [summary, setSummary] = useState(null);

  const currentDate = new Date();
  const [filter, setFilter] = useState({
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear(),
    department_id: ''
  });

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchPayroll();
  }, [filter]);

  const fetchDepartments = async () => {
    try {
      const res = await departmentApi.getAll();
      setDepartments(res.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchPayroll = async () => {
    try {
      setLoading(true);
      const [payrollRes, summaryRes] = await Promise.all([
        payrollApi.getAll(filter),
        payrollApi.getSummary(filter.year, filter.month)
      ]);
      setPayrolls(payrollRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Error fetching payroll:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await payrollApi.generate({ month: filter.month, year: filter.year });
      alert(res.data.message);
      fetchPayroll();
    } catch (error) {
      alert('Failed to generate payroll');
    }
  };

  const handleSavePayroll = async (e) => {
    e.preventDefault();
    try {
      await payrollApi.update(selectedPayroll.id, selectedPayroll);
      setSelectedPayroll(null);
      fetchPayroll();
    } catch (error) {
      alert('Failed to save');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount || 0);
  };

  return (
    <Layout>
      <div className="payroll-page">
        <header className="page-header">
          <div>
            <h1>💰 Payroll</h1>
            <p>Manage monthly salaries</p>
          </div>
          <button onClick={handleGenerate} className="generate-btn">
            ⚡ Generate Payroll
          </button>
        </header>

        <div className="filters-row">
          <select
            value={filter.month}
            onChange={(e) => setFilter({ ...filter, month: parseInt(e.target.value) })}
          >
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={filter.year}
            onChange={(e) => setFilter({ ...filter, year: parseInt(e.target.value) })}
          >
            {[2023, 2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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

        {summary?.summary && (
          <div className="summary-row">
            <div className="summary-box total">
              <span className="sum-label">Total Payroll</span>
              <span className="sum-value">{formatCurrency(summary.summary.total_payroll)}</span>
            </div>
            <div className="summary-box">
              <span className="sum-label">Employees</span>
              <span className="sum-value">{summary.summary.total_employees}</span>
            </div>
            <div className="summary-box">
              <span className="sum-label">Basic</span>
              <span className="sum-value">{formatCurrency(summary.summary.total_basic)}</span>
            </div>
            <div className="summary-box">
              <span className="sum-label">Commission</span>
              <span className="sum-value">{formatCurrency(summary.summary.total_commission)}</span>
            </div>
            <div className="summary-box">
              <span className="sum-label">Allowance</span>
              <span className="sum-value">{formatCurrency(summary.summary.total_allowance)}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">☕ Loading...</div>
        ) : (
          <div className="payroll-table">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Basic</th>
                  <th>Commission</th>
                  <th>Allowance</th>
                  <th>Trip/OT</th>
                  <th>Bonus</th>
                  <th>Deductions</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="no-data">
                      No payroll records. Click "Generate Payroll" to create records for all active employees 🍃
                    </td>
                  </tr>
                ) : (
                  payrolls.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.employee_name}</strong><br/><small>{p.emp_id}</small></td>
                      <td>{p.department_name}</td>
                      <td>{formatCurrency(p.basic_salary)}</td>
                      <td>{formatCurrency(p.commission)}</td>
                      <td>{formatCurrency(p.allowance)}</td>
                      <td>{formatCurrency(parseFloat(p.trip_pay || 0) + parseFloat(p.ot_pay || 0))}</td>
                      <td>{formatCurrency(p.bonus)}</td>
                      <td className="deduction">{formatCurrency(p.deductions)}</td>
                      <td className="total-col"><strong>{formatCurrency(p.total_salary)}</strong></td>
                      <td>
                        <span className={`status-badge ${p.status}`}>{p.status}</span>
                      </td>
                      <td>
                        <button onClick={() => setSelectedPayroll({...p})} className="edit-btn">✏️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedPayroll && (
          <div className="modal-overlay" onClick={() => setSelectedPayroll(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>✏️ Edit Payroll - {selectedPayroll.employee_name}</h2>
              <p className="modal-subtitle">{selectedPayroll.department_name} | {months[filter.month - 1]} {filter.year}</p>

              <form onSubmit={handleSavePayroll}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Basic Salary</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.basic_salary || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, basic_salary: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Allowance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.allowance || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, allowance: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Sales Amount (for commission)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.sales_amount || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, sales_amount: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Commission</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.commission || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, commission: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Trip Count</label>
                    <input
                      type="number"
                      value={selectedPayroll.trip_count || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, trip_count: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Trip Pay</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.trip_pay || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, trip_pay: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>OT Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedPayroll.ot_hours || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, ot_hours: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>OT Pay</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.ot_pay || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, ot_pay: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Outstation Days</label>
                    <input
                      type="number"
                      value={selectedPayroll.outstation_days || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, outstation_days: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Outstation Pay</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.outstation_pay || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, outstation_pay: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Bonus</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.bonus || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, bonus: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Deductions</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPayroll.deductions || ''}
                      onChange={(e) => setSelectedPayroll({...selectedPayroll, deductions: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={selectedPayroll.status}
                    onChange={(e) => setSelectedPayroll({...selectedPayroll, status: e.target.value})}
                  >
                    <option value="draft">Draft</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={selectedPayroll.notes || ''}
                    onChange={(e) => setSelectedPayroll({...selectedPayroll, notes: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={() => setSelectedPayroll(null)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    💾 Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Payroll;
