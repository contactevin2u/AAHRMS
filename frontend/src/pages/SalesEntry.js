import React, { useState, useEffect } from 'react';
import { salesApi, departmentApi, employeeApi } from '../api';
import Layout from '../components/Layout';
import './Settings.css';

function SalesEntry() {
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [indoorSalesDeptId, setIndoorSalesDeptId] = useState(null);

  // Date filters
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Form for adding sales
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    sales_date: '',
    total_sales: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Get departments to find Indoor Sales
      const deptRes = await departmentApi.getAll();
      const indoorDept = deptRes.data.find(d => d.payroll_structure_code === 'indoor_sales');

      if (indoorDept) {
        setIndoorSalesDeptId(indoorDept.id);

        // Fetch Indoor Sales employees and their sales data
        const [salesRes, empRes] = await Promise.all([
          salesApi.getIndoorSalesData(year, month),
          employeeApi.getAll({ department_id: indoorDept.id, status: 'active' })
        ]);

        setSalesData(salesRes.data.employees || []);
        setEmployees(empRes.data || []);
      } else {
        setSalesData([]);
        setEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSales = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.sales_date || !form.total_sales) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      await salesApi.create({
        employee_id: parseInt(form.employee_id),
        sales_date: form.sales_date,
        total_sales: parseFloat(form.total_sales),
        description: form.description
      });

      setShowAddModal(false);
      setForm({ employee_id: '', sales_date: '', total_sales: '', description: '' });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add sales record');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getMonthName = (m) => {
    return new Date(2000, m - 1).toLocaleString('en-MY', { month: 'long' });
  };

  if (!indoorSalesDeptId && !loading) {
    return (
      <Layout>
        <div className="settings-page">
          <header className="page-header">
            <div>
              <h1>Sales Entry</h1>
              <p>Enter sales data for Indoor Sales commission calculation</p>
            </div>
          </header>
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <h3>No Indoor Sales Department Found</h3>
            <p>Please set up the Indoor Sales department first.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="settings-page">
        <header className="page-header">
          <div>
            <h1>Indoor Sales - Sales Entry</h1>
            <p>Enter sales data for commission calculation (Basic RM4000 OR 6% Commission - whichever is higher)</p>
          </div>
          <div>
            <button onClick={() => setShowAddModal(true)} className="add-btn">
              + Add Sales Record
            </button>
          </div>
        </header>

        {/* Month/Year Selector */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div>
            <label style={{ marginRight: '10px' }}>Month:</label>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{getMonthName(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ marginRight: '10px' }}>Year:</label>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {[2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              {salesData.map(emp => (
                <div key={emp.id} style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '10px' }}>
                    {emp.name} ({emp.emp_code})
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#666', fontSize: '13px' }}>Total Sales ({getMonthName(month)} {year})</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196f3' }}>
                      {formatCurrency(emp.total_monthly_sales)}
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: '#f5f5f5',
                    padding: '10px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span>Basic Salary:</span>
                      <span>{formatCurrency(emp.calculation?.basic_salary)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span>6% Commission:</span>
                      <span>{formatCurrency(emp.calculation?.commission_amount)}</span>
                    </div>
                    <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #ddd' }} />
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 'bold',
                      color: emp.calculation?.used_method === 'commission' ? '#4caf50' : '#ff9800'
                    }}>
                      <span>Final ({emp.calculation?.used_method}):</span>
                      <span>{formatCurrency(emp.calculation?.higher_amount)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {salesData.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#666' }}>
                  No Indoor Sales employees found for this period.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Sales Modal */}
        {showAddModal && (
          <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add Sales Record</h2>
              <form onSubmit={handleAddSales}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employee_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Sales Date *</label>
                  <input
                    type="date"
                    value={form.sales_date}
                    onChange={(e) => setForm({ ...form, sales_date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Total Sales Amount (RM) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.total_sales}
                    onChange={(e) => setForm({ ...form, total_sales: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description (Optional)</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g., Daily sales summary"
                    rows="2"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={() => setShowAddModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn" disabled={saving}>
                    {saving ? 'Saving...' : 'Add Sales'}
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

export default SalesEntry;
