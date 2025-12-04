import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi } from '../api';
import Layout from '../components/Layout';
import * as XLSX from 'xlsx';
import './Employees.css';

function Employees() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [filter, setFilter] = useState({
    department_id: searchParams.get('department_id') || '',
    status: 'active',
    search: ''
  });
  const [stats, setStats] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [salaryAutoPopulated, setSalaryAutoPopulated] = useState(false);
  const fileInputRef = useRef(null);

  const goToDepartments = () => {
    navigate('/admin/departments');
  };

  // Handle department selection and auto-populate salary from department config
  const handleDepartmentChange = async (deptId) => {
    setForm(prev => ({ ...prev, department_id: deptId }));
    setSalaryAutoPopulated(false);

    // Only auto-populate for new employees (not editing)
    if (!editingEmployee && deptId) {
      try {
        const res = await departmentApi.getOne(deptId);
        const config = res.data.salary_config;

        if (config) {
          setForm(prev => ({
            ...prev,
            department_id: deptId,
            default_basic_salary: config.basic_salary || '',
            default_allowance: config.has_allowance ? (config.allowance_amount || '') : '',
            commission_rate: config.has_commission ? (config.commission_rate || '') : '',
            per_trip_rate: config.has_per_trip ? (config.per_trip_rate || '') : '',
            ot_rate: config.has_ot ? (config.ot_rate || '') : '',
            outstation_rate: config.has_outstation ? (config.outstation_rate || '') : ''
          }));
          setSalaryAutoPopulated(true);
        }
      } catch (error) {
        console.error('Error fetching department config:', error);
      }
    }
  };

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
    bank_account_holder: '',
    // Statutory fields
    epf_number: '',
    socso_number: '',
    tax_number: '',
    epf_contribution_type: 'normal',
    marital_status: 'single',
    spouse_working: false,
    children_count: 0,
    date_of_birth: '',
    // Default salary fields
    default_basic_salary: '',
    default_allowance: '',
    commission_rate: '',
    per_trip_rate: '',
    ot_rate: '',
    outstation_rate: '',
    // Additional earning fields
    default_bonus: '',
    trade_commission_rate: '',
    default_incentive: '',
    default_other_earnings: '',
    other_earnings_description: ''
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
      bank_account_holder: emp.bank_account_holder || '',
      epf_number: emp.epf_number || '',
      socso_number: emp.socso_number || '',
      tax_number: emp.tax_number || '',
      epf_contribution_type: emp.epf_contribution_type || 'normal',
      marital_status: emp.marital_status || 'single',
      spouse_working: emp.spouse_working || false,
      children_count: emp.children_count || 0,
      date_of_birth: emp.date_of_birth ? emp.date_of_birth.split('T')[0] : '',
      // Salary fields
      default_basic_salary: emp.default_basic_salary || '',
      default_allowance: emp.default_allowance || '',
      commission_rate: emp.commission_rate || '',
      per_trip_rate: emp.per_trip_rate || '',
      ot_rate: emp.ot_rate || '',
      outstation_rate: emp.outstation_rate || '',
      // Additional earning fields
      default_bonus: emp.default_bonus || '',
      trade_commission_rate: emp.trade_commission_rate || '',
      default_incentive: emp.default_incentive || '',
      default_other_earnings: emp.default_other_earnings || '',
      other_earnings_description: emp.other_earnings_description || ''
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
    setSalaryAutoPopulated(false);
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
      bank_account_holder: '',
      epf_number: '',
      socso_number: '',
      tax_number: '',
      epf_contribution_type: 'normal',
      marital_status: 'single',
      spouse_working: false,
      children_count: 0,
      date_of_birth: '',
      // Salary fields
      default_basic_salary: '',
      default_allowance: '',
      commission_rate: '',
      per_trip_rate: '',
      ot_rate: '',
      outstation_rate: '',
      // Additional earning fields
      default_bonus: '',
      trade_commission_rate: '',
      default_incentive: '',
      default_other_earnings: '',
      other_earnings_description: ''
    });
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  // Excel Import Functions
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Map Excel columns to our field names
        const mappedData = jsonData.map(row => ({
          employee_id: row['Employee ID'] || row['employee_id'] || row['ID'] || '',
          name: row['Name'] || row['Full Name'] || row['name'] || '',
          email: row['Email'] || row['email'] || '',
          phone: row['Phone'] || row['phone'] || row['Contact'] || '',
          ic_number: row['IC Number'] || row['IC'] || row['ic_number'] || row['NRIC'] || '',
          department: row['Department'] || row['department'] || row['Dept'] || '',
          position: row['Position'] || row['position'] || row['Job Title'] || row['Role'] || '',
          join_date: row['Join Date'] || row['join_date'] || row['Start Date'] || '',
          bank_name: row['Bank Name'] || row['Bank'] || row['bank_name'] || '',
          bank_account_no: row['Account Number'] || row['Bank Account'] || row['bank_account_no'] || '',
          bank_account_holder: row['Account Holder'] || row['Account Name'] || row['bank_account_holder'] || '',
          status: row['Status'] || row['status'] || 'active'
        }));

        setImportData(mappedData);
        setImportResult(null);
        setShowImportModal(true);
      } catch (error) {
        alert('Error reading Excel file. Please make sure it\'s a valid .xlsx or .xls file.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  const handleImport = async () => {
    if (!importData || importData.length === 0) return;

    setImporting(true);
    try {
      const res = await employeeApi.bulkImport(importData);
      setImportResult(res.data);
      fetchData();
    } catch (error) {
      setImportResult({
        success: 0,
        failed: importData.length,
        errors: [error.response?.data?.error || 'Import failed']
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Employee ID': 'EMP001',
        'Name': 'John Doe',
        'Email': 'john@company.com',
        'Phone': '0123456789',
        'IC Number': '901234-56-7890',
        'Department': 'Office',
        'Position': 'Manager',
        'Join Date': '2024-01-15',
        'Bank Name': 'Maybank',
        'Account Number': '1234567890',
        'Account Holder': 'John Doe',
        'Status': 'active'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
      { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 12 },
      { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 10 }
    ];

    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportData(null);
    setImportResult(null);
  };

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>👥 Employees</h1>
            <p>Manage your team members</p>
          </div>
          <div className="header-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
            />
            <button onClick={() => fileInputRef.current?.click()} className="import-btn">
              📥 Import Excel
            </button>
            <button onClick={openAddModal} className="add-btn">
              ➕ Add Employee
            </button>
          </div>
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
                      <td>
                        {emp.department_name ? (
                          <span
                            className="department-link"
                            onClick={goToDepartments}
                            title="Go to Departments"
                          >
                            {emp.department_name}
                          </span>
                        ) : '-'}
                      </td>
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
                      onChange={(e) => handleDepartmentChange(e.target.value)}
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

                <div className="form-section-title">📋 Statutory Information</div>

                <div className="form-row">
                  <div className="form-group">
                    <label>EPF Number</label>
                    <input
                      type="text"
                      value={form.epf_number}
                      onChange={(e) => setForm({ ...form, epf_number: e.target.value })}
                      placeholder="EPF member number"
                    />
                  </div>
                  <div className="form-group">
                    <label>SOCSO Number</label>
                    <input
                      type="text"
                      value={form.socso_number}
                      onChange={(e) => setForm({ ...form, socso_number: e.target.value })}
                      placeholder="SOCSO number"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tax Number (PCB)</label>
                    <input
                      type="text"
                      value={form.tax_number}
                      onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                      placeholder="Income tax number"
                    />
                  </div>
                  <div className="form-group">
                    <label>Date of Birth</label>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Marital Status</label>
                    <select
                      value={form.marital_status}
                      onChange={(e) => setForm({ ...form, marital_status: e.target.value })}
                    >
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Spouse Working?</label>
                    <select
                      value={form.spouse_working ? 'yes' : 'no'}
                      onChange={(e) => setForm({ ...form, spouse_working: e.target.value === 'yes' })}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Number of Children</label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={form.children_count}
                      onChange={(e) => setForm({ ...form, children_count: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="form-section-title">
                  💰 Default Salary (for Payroll)
                  {salaryAutoPopulated && !editingEmployee && (
                    <span className="auto-populated-hint">
                      ✨ Auto-filled from department config (editable)
                    </span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Basic Salary (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_basic_salary}
                      onChange={(e) => setForm({ ...form, default_basic_salary: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Allowance (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_allowance}
                      onChange={(e) => setForm({ ...form, default_allowance: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.commission_rate}
                      onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Per Trip Rate (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.per_trip_rate}
                      onChange={(e) => setForm({ ...form, per_trip_rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>OT Rate (RM/hour)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.ot_rate}
                      onChange={(e) => setForm({ ...form, ot_rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Outstation Rate (RM/day)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.outstation_rate}
                      onChange={(e) => setForm({ ...form, outstation_rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-section-title">🎁 Additional Earnings (Optional)</div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Default Bonus (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_bonus}
                      onChange={(e) => setForm({ ...form, default_bonus: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Default Incentive (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_incentive}
                      onChange={(e) => setForm({ ...form, default_incentive: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Trade Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.trade_commission_rate}
                      onChange={(e) => setForm({ ...form, trade_commission_rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Other Earnings (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_other_earnings}
                      onChange={(e) => setForm({ ...form, default_other_earnings: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Other Earnings Description</label>
                    <input
                      type="text"
                      value={form.other_earnings_description}
                      onChange={(e) => setForm({ ...form, other_earnings_description: e.target.value })}
                      placeholder="e.g., Transport allowance, Housing, etc."
                    />
                  </div>
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

        {/* Import Modal */}
        {showImportModal && (
          <div className="modal-overlay" onClick={closeImportModal}>
            <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
              <h2>📥 Import Employees from Excel</h2>

              {!importResult ? (
                <>
                  <div className="import-info">
                    <p><strong>{importData?.length || 0}</strong> employees found in file</p>
                    <button onClick={downloadTemplate} className="template-btn">
                      📄 Download Template
                    </button>
                  </div>

                  {importData && importData.length > 0 && (
                    <div className="import-preview">
                      <h4>Preview (first 5 rows):</h4>
                      <div className="preview-table-wrapper">
                        <table className="preview-table">
                          <thead>
                            <tr>
                              <th>Employee ID</th>
                              <th>Name</th>
                              <th>Department</th>
                              <th>Position</th>
                              <th>Phone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importData.slice(0, 5).map((emp, idx) => (
                              <tr key={idx}>
                                <td>{emp.employee_id || '-'}</td>
                                <td>{emp.name || '-'}</td>
                                <td>{emp.department || '-'}</td>
                                <td>{emp.position || '-'}</td>
                                <td>{emp.phone || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {importData.length > 5 && (
                        <p className="more-rows">...and {importData.length - 5} more rows</p>
                      )}
                    </div>
                  )}

                  <div className="import-note">
                    <strong>Note:</strong> Department names must match exactly (Office, Indoor Sales, Outdoor Sales, Driver).
                    Existing employees will be updated if Employee ID matches.
                  </div>

                  <div className="modal-actions">
                    <button type="button" onClick={closeImportModal} className="cancel-btn">
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      className="save-btn"
                      disabled={importing || !importData || importData.length === 0}
                    >
                      {importing ? '⏳ Importing...' : `📥 Import ${importData?.length || 0} Employees`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={`import-result ${importResult.failed > 0 ? 'has-errors' : 'success'}`}>
                    <div className="result-summary">
                      <div className="result-item success">
                        <span className="result-num">{importResult.success}</span>
                        <span className="result-label">Successful</span>
                      </div>
                      <div className="result-item failed">
                        <span className="result-num">{importResult.failed}</span>
                        <span className="result-label">Failed</span>
                      </div>
                    </div>

                    {importResult.errors && importResult.errors.length > 0 && (
                      <div className="error-list">
                        <h4>Errors:</h4>
                        <ul>
                          {importResult.errors.slice(0, 10).map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                          {importResult.errors.length > 10 && (
                            <li>...and {importResult.errors.length - 10} more errors</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button onClick={closeImportModal} className="save-btn">
                      ✓ Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Employees;
