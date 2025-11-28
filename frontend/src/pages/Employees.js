import React, { useState, useEffect } from 'react';
import { employeeApi, departmentApi } from '../api';
import Layout from '../components/Layout';
import './Employees.css';

function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [filter, setFilter] = useState({ department_id: '', status: 'active', search: '' });
  const [stats, setStats] = useState(null);

  const [form, setForm] = useState({
    employee_id: '',
    name: '',
    email: '',
    phone: '',
    ic_number: '',
    department_id: '',
    position: '',
    join_date: '',
    status: 'active',
    bank_name: '',
    bank_account_no: '',
    bank_account_holder: ''
  });

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, deptRes, statsRes] = await Promise.all([
        employeeApi.getAll(filter),
        departmentApi.getAll(),
        employeeApi.getStats()
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        await employeeApi.update(editingEmployee.id, form);
      } else {
        await employeeApi.create(form);
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save employee');
    }
  };

  const handleEdit = (emp) => {
    setEditingEmployee(emp);
    setForm({
      employee_id: emp.employee_id,
      name: emp.name,
      email: emp.email || '',
      phone: emp.phone || '',
      ic_number: emp.ic_number || '',
      department_id: emp.department_id || '',
      position: emp.position || '',
      join_date: emp.join_date ? emp.join_date.split('T')[0] : '',
      status: emp.status,
      bank_name: emp.bank_name || '',
      bank_account_no: emp.bank_account_no || '',
      bank_account_holder: emp.bank_account_holder || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to deactivate this employee?')) {
      try {
        await employeeApi.delete(id);
        fetchData();
      } catch (error) {
        alert('Failed to deactivate employee');
      }
    }
  };

  const resetForm = () => {
    setEditingEmployee(null);
    setForm({
      employee_id: '',
      name: '',
      email: '',
      phone: '',
      ic_number: '',
      department_id: '',
      position: '',
      join_date: '',
      status: 'active',
      bank_name: '',
      bank_account_no: '',
      bank_account_holder: ''
    });
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>👥 Employees</h1>
            <p>Manage your team members</p>
          </div>
          <button onClick={openAddModal} className="add-btn">
            ➕ Add Employee
          </button>
        </header>

        {stats && (
          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-num">{stats.overview.total}</span>
              <span className="stat-text">Total</span>
            </div>
            <div className="stat-box highlight">
              <span className="stat-num">{stats.overview.active}</span>
              <span className="stat-text">Active</span>
            </div>
            <div className="stat-box">
              <span className="stat-num">{stats.overview.inactive}</span>
              <span className="stat-text">Inactive</span>
            </div>
            {stats.byDepartment.map(d => (
              <div key={d.name} className="stat-box">
                <span className="stat-num">{d.count}</span>
                <span className="stat-text">{d.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="filters-row">
          <input
            type="text"
            placeholder="🔍 Search name or ID..."
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
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
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="loading">☕ Loading...</div>
        ) : (
          <div className="employees-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Position</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-data">No employees found 🍃</td>
                  </tr>
                ) : (
                  employees.map(emp => (
                    <tr key={emp.id}>
                      <td><strong>{emp.employee_id}</strong></td>
                      <td>{emp.name}</td>
                      <td>{emp.department_name || '-'}</td>
                      <td>{emp.position || '-'}</td>
                      <td>{emp.phone || '-'}</td>
                      <td>
                        <span className={`status-badge ${emp.status}`}>
                          {emp.status}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => handleEdit(emp)} className="edit-btn">✏️</button>
                        {emp.status === 'active' && (
                          <button onClick={() => handleDelete(emp.id)} className="delete-btn">🗑️</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingEmployee ? '✏️ Edit Employee' : '➕ Add Employee'}</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Employee ID *</label>
                    <input
                      type="text"
                      value={form.employee_id}
                      onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                      placeholder="e.g. EMP001"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Full name"
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Department *</label>
                    <select
                      value={form.department_id}
                      onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                      required
                    >
                      <option value="">Select department</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Position</label>
                    <input
                      type="text"
                      value={form.position}
                      onChange={(e) => setForm({ ...form, position: e.target.value })}
                      placeholder="Job title"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="email@company.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>IC Number</label>
                    <input
                      type="text"
                      value={form.ic_number}
                      onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
                      placeholder="IC number"
                    />
                  </div>
                  <div className="form-group">
                    <label>Join Date</label>
                    <input
                      type="date"
                      value={form.join_date}
                      onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-section-title">🏦 Bank Details</div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Name</label>
                    <select
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    >
                      <option value="">Select bank</option>
                      <option value="Maybank">Maybank</option>
                      <option value="CIMB Bank">CIMB Bank</option>
                      <option value="Public Bank">Public Bank</option>
                      <option value="RHB Bank">RHB Bank</option>
                      <option value="Hong Leong Bank">Hong Leong Bank</option>
                      <option value="AmBank">AmBank</option>
                      <option value="Bank Islam">Bank Islam</option>
                      <option value="Bank Rakyat">Bank Rakyat</option>
                      <option value="OCBC Bank">OCBC Bank</option>
                      <option value="HSBC Bank">HSBC Bank</option>
                      <option value="Standard Chartered">Standard Chartered</option>
                      <option value="UOB Bank">UOB Bank</option>
                      <option value="Affin Bank">Affin Bank</option>
                      <option value="Alliance Bank">Alliance Bank</option>
                      <option value="BSN">BSN</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Account Number</label>
                    <input
                      type="text"
                      value={form.bank_account_no}
                      onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })}
                      placeholder="Bank account number"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Account Holder Name</label>
                  <input
                    type="text"
                    value={form.bank_account_holder}
                    onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })}
                    placeholder="Name as per bank account"
                  />
                </div>

                {editingEmployee && (
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}

                <div className="modal-actions">
                  <button type="button" onClick={() => setShowModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    {editingEmployee ? '💾 Update' : '➕ Add'}
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

export default Employees;
