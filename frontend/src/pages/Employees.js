import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi, probationApi } from '../api';
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
    search: '',
    employment_type: ''
  });

  // Probation action modal state
  const [showProbationModal, setShowProbationModal] = useState(false);
  const [probationEmployee, setProbationEmployee] = useState(null);
  const [probationAction, setProbationAction] = useState('confirm'); // 'confirm' or 'extend'
  const [extensionMonths, setExtensionMonths] = useState(1);
  const [probationNotes, setProbationNotes] = useState('');
  const [processingProbation, setProcessingProbation] = useState(false);
  const [stats, setStats] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [salaryAutoPopulated, setSalaryAutoPopulated] = useState(false);
  const fileInputRef = useRef(null);

  // Bulk selection state
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({
    department_id: '',
    position: '',
    status: '',
    bank_name: '',
    default_basic_salary: '',
    default_allowance: '',
    commission_rate: '',
    per_trip_rate: '',
    ot_rate: '',
    outstation_rate: ''
  });
  const [bulkUpdating, setBulkUpdating] = useState(false);

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
    address: '',
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
    default_incentive: '',
    // Probation fields
    employment_type: 'probation',
    probation_months: 3,
    salary_before_confirmation: '',
    salary_after_confirmation: '',
    increment_amount: '',
    probation_notes: ''
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
      address: emp.address || '',
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
      default_incentive: emp.default_incentive || '',
      // Probation fields
      employment_type: emp.employment_type || 'probation',
      probation_months: emp.probation_months || 3,
      salary_before_confirmation: emp.salary_before_confirmation || '',
      salary_after_confirmation: emp.salary_after_confirmation || '',
      increment_amount: emp.increment_amount || '',
      probation_notes: emp.probation_notes || ''
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
      address: '',
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
      default_incentive: '',
      // Probation fields
      employment_type: 'probation',
      probation_months: 3,
      salary_before_confirmation: '',
      salary_after_confirmation: '',
      increment_amount: '',
      probation_notes: ''
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

        // Map Excel columns to our field names (supporting multiple column name formats)
        const mappedData = jsonData.map(row => ({
          // Personal Info
          employee_id: row['Employee ID'] || row['employee_id'] || row['ID'] || '',
          name: row['Name'] || row['Full Name'] || row['name'] || '',
          email: row['Email'] || row['email'] || '',
          phone: row['Phone'] || row['phone'] || row['Contact'] || row['Phone No'] || '',
          ic_number: row['IC Number'] || row['IC'] || row['ic_number'] || row['NRIC'] || row['IC/NRIC'] || '',
          department: row['Department'] || row['department'] || row['Dept'] || '',
          position: row['Position'] || row['position'] || row['Job Title'] || row['Role'] || '',
          join_date: row['Join Date'] || row['join_date'] || row['Start Date'] || '',
          date_of_birth: row['Date of Birth'] || row['date_of_birth'] || row['DOB'] || row['Birthday'] || '',
          address: row['Address'] || row['address'] || '',
          status: row['Status'] || row['status'] || 'active',
          // Bank Details
          bank_name: row['Bank Name'] || row['Bank'] || row['bank_name'] || '',
          bank_account_no: row['Account Number'] || row['Bank Account'] || row['bank_account_no'] || row['Bank Account No'] || '',
          bank_account_holder: row['Account Holder'] || row['Account Name'] || row['bank_account_holder'] || '',
          // Statutory Info
          epf_number: row['EPF Number'] || row['epf_number'] || row['EPF No'] || '',
          socso_number: row['SOCSO Number'] || row['socso_number'] || row['SOCSO No'] || '',
          tax_number: row['Tax Number'] || row['tax_number'] || row['Tax No'] || row['PCB Number'] || '',
          epf_contribution_type: row['EPF Type'] || row['epf_contribution_type'] || 'normal',
          marital_status: row['Marital Status'] || row['marital_status'] || 'single',
          spouse_working: row['Spouse Working'] || row['spouse_working'] || 'false',
          children_count: row['Children Count'] || row['children_count'] || row['No of Children'] || '0',
          // Salary & Compensation
          default_basic_salary: row['Basic Salary'] || row['default_basic_salary'] || '',
          default_allowance: row['Allowance'] || row['default_allowance'] || '',
          commission_rate: row['Commission Rate'] || row['commission_rate'] || row['Commission (%)'] || '',
          per_trip_rate: row['Per Trip Rate'] || row['per_trip_rate'] || '',
          ot_rate: row['OT Rate'] || row['ot_rate'] || row['Overtime Rate'] || '',
          outstation_rate: row['Outstation Rate'] || row['outstation_rate'] || '',
          default_bonus: row['Bonus'] || row['default_bonus'] || row['Default Bonus'] || '',
          default_incentive: row['Incentive'] || row['default_incentive'] || row['Default Incentive'] || ''
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
        // Personal Info
        'Employee ID': 'EMP001',
        'Name': 'John Doe',
        'Email': 'john@company.com',
        'Phone': '0123456789',
        'IC Number': '901234-56-7890',
        'Date of Birth': '1990-05-15',
        'Address': '123 Jalan Example, 50000 Kuala Lumpur',
        'Department': 'Office',
        'Position': 'Manager',
        'Join Date': '2024-01-15',
        'Status': 'active',
        // Bank Details
        'Bank Name': 'Maybank',
        'Account Number': '1234567890',
        'Account Holder': 'John Doe',
        // Statutory Info
        'EPF Number': 'EPF12345',
        'SOCSO Number': 'SOCSO12345',
        'Tax Number': 'TAX12345',
        'EPF Type': 'normal',
        'Marital Status': 'married',
        'Spouse Working': 'true',
        'Children Count': '2',
        // Salary & Compensation
        'Basic Salary': '3500.00',
        'Allowance': '500.00',
        'Commission Rate': '0',
        'Per Trip Rate': '0',
        'OT Rate': '15.00',
        'Outstation Rate': '0',
        'Bonus': '500.00',
        'Incentive': '200.00'
      },
      {
        // Example 2 - Sales Employee
        'Employee ID': 'EMP002',
        'Name': 'Jane Smith',
        'Email': 'jane@company.com',
        'Phone': '0198765432',
        'IC Number': '880512-14-5678',
        'Date of Birth': '1988-05-12',
        'Address': '456 Jalan Sample, 40000 Shah Alam',
        'Department': 'Indoor Sales',
        'Position': 'Sales Executive',
        'Join Date': '2024-02-01',
        'Status': 'active',
        'Bank Name': 'CIMB Bank',
        'Account Number': '9876543210',
        'Account Holder': 'Jane Smith',
        'EPF Number': 'EPF23456',
        'SOCSO Number': 'SOCSO23456',
        'Tax Number': 'TAX23456',
        'EPF Type': 'normal',
        'Marital Status': 'single',
        'Spouse Working': 'false',
        'Children Count': '0',
        'Basic Salary': '2500.00',
        'Allowance': '300.00',
        'Commission Rate': '5.00',
        'Per Trip Rate': '0',
        'OT Rate': '12.00',
        'Outstation Rate': '0',
        'Bonus': '0',
        'Incentive': '100.00'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');

    // Set column widths for all columns
    ws['!cols'] = [
      { wch: 12 }, // Employee ID
      { wch: 20 }, // Name
      { wch: 25 }, // Email
      { wch: 15 }, // Phone
      { wch: 18 }, // IC Number
      { wch: 12 }, // Date of Birth
      { wch: 40 }, // Address
      { wch: 15 }, // Department
      { wch: 18 }, // Position
      { wch: 12 }, // Join Date
      { wch: 10 }, // Status
      { wch: 18 }, // Bank Name
      { wch: 18 }, // Account Number
      { wch: 20 }, // Account Holder
      { wch: 12 }, // EPF Number
      { wch: 14 }, // SOCSO Number
      { wch: 12 }, // Tax Number
      { wch: 10 }, // EPF Type
      { wch: 14 }, // Marital Status
      { wch: 14 }, // Spouse Working
      { wch: 14 }, // Children Count
      { wch: 12 }, // Basic Salary
      { wch: 12 }, // Allowance
      { wch: 14 }, // Commission Rate
      { wch: 14 }, // Per Trip Rate
      { wch: 10 }, // OT Rate
      { wch: 14 }, // Outstation Rate
      { wch: 10 }, // Bonus
      { wch: 10 }  // Incentive
    ];

    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportData(null);
    setImportResult(null);
  };

  // Bulk selection functions
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedEmployees(employees.map(emp => emp.id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleSelectEmployee = (empId) => {
    setSelectedEmployees(prev => {
      if (prev.includes(empId)) {
        return prev.filter(id => id !== empId);
      } else {
        return [...prev, empId];
      }
    });
  };

  const clearSelection = () => {
    setSelectedEmployees([]);
  };

  // Bulk Edit
  const openBulkEditModal = () => {
    setBulkEditForm({
      department_id: '',
      position: '',
      status: '',
      bank_name: '',
      default_basic_salary: '',
      default_allowance: '',
      commission_rate: '',
      per_trip_rate: '',
      ot_rate: '',
      outstation_rate: ''
    });
    setShowBulkEditModal(true);
  };

  const handleBulkEditSubmit = async (e) => {
    e.preventDefault();

    // Filter out empty values
    const updates = {};
    Object.entries(bulkEditForm).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        updates[key] = value;
      }
    });

    if (Object.keys(updates).length === 0) {
      alert('Please fill in at least one field to update');
      return;
    }

    setBulkUpdating(true);
    try {
      const res = await employeeApi.bulkUpdate(selectedEmployees, updates);
      alert(res.data.message);
      setShowBulkEditModal(false);
      setSelectedEmployees([]);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update employees');
    } finally {
      setBulkUpdating(false);
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    const activeSelected = employees.filter(
      emp => selectedEmployees.includes(emp.id) && emp.status === 'active'
    );

    if (activeSelected.length === 0) {
      alert('No active employees selected to deactivate');
      return;
    }

    if (!window.confirm(`Are you sure you want to deactivate ${activeSelected.length} employee(s)?`)) {
      return;
    }

    try {
      const res = await employeeApi.bulkDelete(activeSelected.map(emp => emp.id));
      alert(res.data.message);
      setSelectedEmployees([]);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to deactivate employees');
    }
  };

  // Probation modal functions
  const openProbationModal = (emp) => {
    setProbationEmployee(emp);
    setProbationAction('confirm');
    setExtensionMonths(1);
    setProbationNotes('');
    setShowProbationModal(true);
  };

  const handleProbationConfirm = async () => {
    if (!probationEmployee) return;

    setProcessingProbation(true);
    try {
      await probationApi.confirm(probationEmployee.id, {
        notes: probationNotes,
        generate_letter: true
      });
      alert('Employee confirmed successfully! Confirmation letter has been generated.');
      setShowProbationModal(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to confirm employee');
    } finally {
      setProcessingProbation(false);
    }
  };

  const handleProbationExtend = async () => {
    if (!probationEmployee) return;

    setProcessingProbation(true);
    try {
      await probationApi.extend(probationEmployee.id, {
        extension_months: extensionMonths,
        notes: probationNotes
      });
      alert(`Probation extended by ${extensionMonths} month(s)`);
      setShowProbationModal(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to extend probation');
    } finally {
      setProcessingProbation(false);
    }
  };

  // Calculate increment when salary fields change
  const handleSalaryChange = (field, value) => {
    const newForm = { ...form, [field]: value };

    if (field === 'salary_before_confirmation' || field === 'salary_after_confirmation') {
      const before = parseFloat(newForm.salary_before_confirmation) || 0;
      const after = parseFloat(newForm.salary_after_confirmation) || 0;
      if (before > 0 && after > 0) {
        newForm.increment_amount = (after - before).toFixed(2);
      }
    }

    setForm(newForm);
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
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
            />
            <button onClick={downloadTemplate} className="template-btn">
              Download Template
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="import-btn">
              Upload Employees
            </button>
            <button onClick={openAddModal} className="add-btn">
              + Add Employee
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
          <select
            value={filter.employment_type}
            onChange={(e) => setFilter({ ...filter, employment_type: e.target.value })}
          >
            <option value="">All Employment Types</option>
            <option value="probation">On Probation</option>
            <option value="confirmed">Confirmed</option>
            <option value="contract">Contract</option>
          </select>
        </div>

        {/* Bulk Action Bar */}
        {selectedEmployees.length > 0 && (
          <div className="bulk-action-bar">
            <span className="selected-count">
              {selectedEmployees.length} employee(s) selected
            </span>
            <div className="bulk-actions">
              <button onClick={openBulkEditModal} className="bulk-edit-btn">
                ✏️ Bulk Edit
              </button>
              <button onClick={handleBulkDelete} className="bulk-delete-btn">
                🗑️ Deactivate Selected
              </button>
              <button onClick={clearSelection} className="bulk-clear-btn">
                ✕ Clear Selection
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">☕ Loading...</div>
        ) : (
          <div className="employees-table">
            <table>
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={employees.length > 0 && selectedEmployees.length === employees.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Position</th>
                  <th>Employment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="no-data">No employees found</td>
                  </tr>
                ) : (
                  employees.map(emp => {
                    const isPendingReview = emp.employment_type === 'probation' &&
                      emp.probation_end_date &&
                      new Date(emp.probation_end_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                    return (
                      <tr key={emp.id} className={`${selectedEmployees.includes(emp.id) ? 'selected' : ''} ${isPendingReview ? 'pending-review' : ''}`}>
                        <td className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectedEmployees.includes(emp.id)}
                            onChange={() => handleSelectEmployee(emp.id)}
                          />
                        </td>
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
                        <td>
                          <span className={`employment-badge ${emp.employment_type || 'probation'}`}>
                            {emp.employment_type === 'confirmed' ? 'Confirmed' :
                             emp.employment_type === 'contract' ? 'Contract' : 'Probation'}
                          </span>
                          {isPendingReview && (
                            <button
                              className="review-btn"
                              onClick={() => openProbationModal(emp)}
                              title="Review probation"
                            >
                              Review
                            </button>
                          )}
                        </td>
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
                    );
                  })
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

                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Full address"
                    rows="2"
                  />
                </div>

                <div className="form-section-title">Bank Details</div>

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

                <div className="form-section-title">📋 Probation & Confirmation</div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Employment Type</label>
                    <select
                      value={form.employment_type}
                      onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                    >
                      <option value="probation">Probation</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="contract">Contract</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Probation Duration (months)</label>
                    <select
                      value={form.probation_months}
                      onChange={(e) => setForm({ ...form, probation_months: parseInt(e.target.value) })}
                      disabled={form.employment_type === 'confirmed'}
                    >
                      <option value={1}>1 month</option>
                      <option value={2}>2 months</option>
                      <option value={3}>3 months</option>
                      <option value={4}>4 months</option>
                      <option value={5}>5 months</option>
                      <option value={6}>6 months</option>
                    </select>
                  </div>
                </div>

                {form.employment_type === 'probation' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Salary Before Confirmation (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.salary_before_confirmation}
                          onChange={(e) => handleSalaryChange('salary_before_confirmation', e.target.value)}
                          placeholder="Current basic salary"
                        />
                      </div>
                      <div className="form-group">
                        <label>Salary After Confirmation (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.salary_after_confirmation}
                          onChange={(e) => handleSalaryChange('salary_after_confirmation', e.target.value)}
                          placeholder="New salary after confirmation"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Increment Amount (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.increment_amount}
                          onChange={(e) => setForm({ ...form, increment_amount: e.target.value })}
                          placeholder="Auto-calculated"
                          readOnly
                        />
                      </div>
                      <div className="form-group">
                        <label>Probation End Date</label>
                        <input
                          type="text"
                          value={form.join_date && form.probation_months ?
                            new Date(new Date(form.join_date).setMonth(new Date(form.join_date).getMonth() + form.probation_months)).toLocaleDateString() :
                            'Set join date first'}
                          disabled
                        />
                      </div>
                    </div>
                  </>
                )}

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
                              <th>IC Number</th>
                              <th>Basic Salary</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importData.slice(0, 5).map((emp, idx) => (
                              <tr key={idx}>
                                <td>{emp.employee_id || '-'}</td>
                                <td>{emp.name || '-'}</td>
                                <td>{emp.department || '-'}</td>
                                <td>{emp.ic_number || '-'}</td>
                                <td>{emp.default_basic_salary ? `RM ${emp.default_basic_salary}` : '-'}</td>
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
                    <strong>Mandatory Fields:</strong> Employee ID, Name, Department, IC Number, Basic Salary
                    <br /><br />
                    <strong>Note:</strong> Department names must match exactly (Office, Indoor Sales, Outdoor Sales, Driver).
                    If Employee ID already exists, the record will be updated instead of creating a duplicate.
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

        {/* Bulk Edit Modal */}
        {showBulkEditModal && (
          <div className="modal-overlay" onClick={() => setShowBulkEditModal(false)}>
            <div className="modal bulk-edit-modal" onClick={(e) => e.stopPropagation()}>
              <h2>✏️ Bulk Edit ({selectedEmployees.length} employees)</h2>
              <p className="bulk-edit-note">Only fill in the fields you want to update. Empty fields will be left unchanged.</p>
              <form onSubmit={handleBulkEditSubmit}>
                <div className="form-section-title">Basic Info</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Department</label>
                    <select
                      value={bulkEditForm.department_id}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, department_id: e.target.value })}
                    >
                      <option value="">-- No Change --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Position</label>
                    <input
                      type="text"
                      value={bulkEditForm.position}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, position: e.target.value })}
                      placeholder="Leave empty for no change"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={bulkEditForm.status}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, status: e.target.value })}
                    >
                      <option value="">-- No Change --</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Bank Name</label>
                    <select
                      value={bulkEditForm.bank_name}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, bank_name: e.target.value })}
                    >
                      <option value="">-- No Change --</option>
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
                      <option value="UOB Bank">UOB Bank</option>
                      <option value="BSN">BSN</option>
                    </select>
                  </div>
                </div>

                <div className="form-section-title">💰 Salary Settings</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Basic Salary (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bulkEditForm.default_basic_salary}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, default_basic_salary: e.target.value })}
                      placeholder="Leave empty for no change"
                    />
                  </div>
                  <div className="form-group">
                    <label>Allowance (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bulkEditForm.default_allowance}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, default_allowance: e.target.value })}
                      placeholder="Leave empty for no change"
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
                      value={bulkEditForm.commission_rate}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, commission_rate: e.target.value })}
                      placeholder="Leave empty for no change"
                    />
                  </div>
                  <div className="form-group">
                    <label>Per Trip Rate (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bulkEditForm.per_trip_rate}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, per_trip_rate: e.target.value })}
                      placeholder="Leave empty for no change"
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
                      value={bulkEditForm.ot_rate}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, ot_rate: e.target.value })}
                      placeholder="Leave empty for no change"
                    />
                  </div>
                  <div className="form-group">
                    <label>Outstation Rate (RM/day)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bulkEditForm.outstation_rate}
                      onChange={(e) => setBulkEditForm({ ...bulkEditForm, outstation_rate: e.target.value })}
                      placeholder="Leave empty for no change"
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={() => setShowBulkEditModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn" disabled={bulkUpdating}>
                    {bulkUpdating ? '⏳ Updating...' : `💾 Update ${selectedEmployees.length} Employees`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Probation Review Modal */}
        {showProbationModal && probationEmployee && (
          <div className="modal-overlay" onClick={() => setShowProbationModal(false)}>
            <div className="modal probation-modal" onClick={(e) => e.stopPropagation()}>
              <h2>📋 Probation Review</h2>

              <div className="probation-info">
                <div className="info-row">
                  <span className="label">Employee:</span>
                  <span className="value">{probationEmployee.name} ({probationEmployee.employee_id})</span>
                </div>
                <div className="info-row">
                  <span className="label">Department:</span>
                  <span className="value">{probationEmployee.department_name}</span>
                </div>
                <div className="info-row">
                  <span className="label">Position:</span>
                  <span className="value">{probationEmployee.position}</span>
                </div>
                <div className="info-row">
                  <span className="label">Join Date:</span>
                  <span className="value">{probationEmployee.join_date ? new Date(probationEmployee.join_date).toLocaleDateString() : '-'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Probation End:</span>
                  <span className="value highlight">{probationEmployee.probation_end_date ? new Date(probationEmployee.probation_end_date).toLocaleDateString() : '-'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Current Salary:</span>
                  <span className="value">RM {parseFloat(probationEmployee.default_basic_salary || 0).toFixed(2)}</span>
                </div>
                {probationEmployee.salary_after_confirmation && (
                  <div className="info-row">
                    <span className="label">New Salary (After Confirm):</span>
                    <span className="value highlight">RM {parseFloat(probationEmployee.salary_after_confirmation).toFixed(2)}</span>
                  </div>
                )}
                {probationEmployee.increment_amount && (
                  <div className="info-row">
                    <span className="label">Increment:</span>
                    <span className="value">+ RM {parseFloat(probationEmployee.increment_amount).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="action-tabs">
                <button
                  className={`tab ${probationAction === 'confirm' ? 'active' : ''}`}
                  onClick={() => setProbationAction('confirm')}
                >
                  Confirm Employee
                </button>
                <button
                  className={`tab ${probationAction === 'extend' ? 'active' : ''}`}
                  onClick={() => setProbationAction('extend')}
                >
                  Extend Probation
                </button>
              </div>

              {probationAction === 'confirm' && (
                <div className="action-content">
                  <p>Confirm this employee's employment. Their salary will be updated to the post-probation amount and a confirmation letter will be generated.</p>
                  <div className="form-group">
                    <label>Notes (optional)</label>
                    <textarea
                      value={probationNotes}
                      onChange={(e) => setProbationNotes(e.target.value)}
                      placeholder="Any notes for this confirmation..."
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {probationAction === 'extend' && (
                <div className="action-content">
                  <p>Extend the probation period for this employee.</p>
                  <div className="form-group">
                    <label>Extension Period</label>
                    <select
                      value={extensionMonths}
                      onChange={(e) => setExtensionMonths(parseInt(e.target.value))}
                    >
                      <option value={1}>1 month</option>
                      <option value={2}>2 months</option>
                      <option value={3}>3 months</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reason for Extension</label>
                    <textarea
                      value={probationNotes}
                      onChange={(e) => setProbationNotes(e.target.value)}
                      placeholder="Reason for extending probation..."
                      rows={3}
                    />
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" onClick={() => setShowProbationModal(false)} className="cancel-btn">
                  Cancel
                </button>
                {probationAction === 'confirm' ? (
                  <button
                    onClick={handleProbationConfirm}
                    className="save-btn confirm-btn"
                    disabled={processingProbation}
                  >
                    {processingProbation ? 'Processing...' : 'Confirm Employment'}
                  </button>
                ) : (
                  <button
                    onClick={handleProbationExtend}
                    className="save-btn extend-btn"
                    disabled={processingProbation}
                  >
                    {processingProbation ? 'Processing...' : `Extend by ${extensionMonths} month(s)`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Employees;
