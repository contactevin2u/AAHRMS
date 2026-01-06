import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi, probationApi, earningsApi, positionsApi, outletsApi } from '../api';
import Layout from '../components/Layout';
import * as XLSX from 'xlsx';
import './Employees.css';

function Employees() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get company_id from adminInfo (or selectedCompanyId for super_admin)
  const [companyId, setCompanyId] = useState(() => {
    try {
      const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
      // For super_admin, check selectedCompanyId first
      if (adminInfo.role === 'super_admin') {
        const selectedCompanyId = localStorage.getItem('selectedCompanyId');
        return selectedCompanyId ? parseInt(selectedCompanyId) : null;
      }
      return adminInfo.company_id;
    } catch {
      return null;
    }
  });

  // Listen for company changes (for super_admin switching companies)
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        if (adminInfo.role === 'super_admin') {
          const selectedCompanyId = localStorage.getItem('selectedCompanyId');
          setCompanyId(selectedCompanyId ? parseInt(selectedCompanyId) : null);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also check on mount
    handleStorageChange();
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isMimix = companyId === 3;
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [filter, setFilter] = useState({
    department_id: searchParams.get('department_id') || '',
    outlet_id: searchParams.get('outlet_id') || '',
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

  // Commission & Allowance state
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employeeCommissions, setEmployeeCommissions] = useState([]);
  const [employeeAllowances, setEmployeeAllowances] = useState([]);

  // Bulk selection state
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [viewMode, setViewMode] = useState('simple'); // 'simple' or 'detailed'
  const [bulkEditForm, setBulkEditForm] = useState({
    department_id: '',
    outlet_id: '',
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

  // Inline editing state
  const [updatingCell, setUpdatingCell] = useState(null);

  // Quick Add Employee state
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    employee_id: '',
    name: '',
    ic_number: ''
  });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState(null);

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
    outlet_id: '',
    position_id: '',
    position: '',  // Keep for backward compatibility display
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
      const [empRes, deptRes, outletsRes, statsRes, commTypesRes, allowTypesRes, positionsRes] = await Promise.all([
        employeeApi.getAll(filter),
        departmentApi.getAll(),
        outletsApi.getAll(),
        employeeApi.getStats(),
        earningsApi.getCommissionTypes(),
        earningsApi.getAllowanceTypes(),
        positionsApi.getAll()
      ]);

      setEmployees(empRes.data);
      setDepartments(deptRes.data || []);
      setOutlets(outletsRes.data || []);
      setStats(statsRes.data);
      setCommissionTypes(commTypesRes.data);
      setAllowanceTypes(allowTypesRes.data);
      setPositions(positionsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let employeeId;
      if (editingEmployee) {
        await employeeApi.update(editingEmployee.id, form);
        employeeId = editingEmployee.id;
      } else {
        const res = await employeeApi.create(form);
        employeeId = res.data.id;
      }

      // Save commissions and allowances
      if (employeeId) {
        const validCommissions = employeeCommissions.filter(c => c.commission_type_id && c.amount > 0);
        const validAllowances = employeeAllowances.filter(a => a.allowance_type_id && a.amount > 0);

        await Promise.all([
          earningsApi.bulkSaveCommissions(employeeId, validCommissions),
          earningsApi.bulkSaveAllowances(employeeId, validAllowances)
        ]);
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save employee');
    }
  };

  const handleEdit = async (emp) => {
    setEditingEmployee(emp);
    setForm({
      employee_id: emp.employee_id,
      name: emp.name,
      email: emp.email || '',
      phone: emp.phone || '',
      ic_number: emp.ic_number || '',
      department_id: emp.department_id || '',
      outlet_id: emp.outlet_id || '',
      position_id: emp.position_id || '',
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

    // Fetch employee commissions and allowances
    try {
      const [commRes, allowRes] = await Promise.all([
        earningsApi.getEmployeeCommissions(emp.id),
        earningsApi.getEmployeeAllowances(emp.id)
      ]);
      setEmployeeCommissions(commRes.data.map(c => ({
        commission_type_id: c.commission_type_id,
        amount: c.amount,
        commission_name: c.commission_name
      })));
      setEmployeeAllowances(allowRes.data.map(a => ({
        allowance_type_id: a.allowance_type_id,
        amount: a.amount,
        allowance_name: a.allowance_name
      })));
    } catch (error) {
      console.error('Error fetching employee earnings:', error);
      setEmployeeCommissions([]);
      setEmployeeAllowances([]);
    }

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

  // Inline editing handler - update employee field directly from table
  const handleInlineUpdate = async (empId, field, value) => {
    const cellKey = `${empId}-${field}`;
    setUpdatingCell(cellKey);

    try {
      // Build the update payload
      const updateData = { [field]: value || null };

      // For position, we need to handle position_id and also update position text
      if (field === 'position_id') {
        const selectedPosition = positions.find(p => p.id === parseInt(value));
        updateData.position = selectedPosition?.name || '';
      }

      // Use PATCH for partial update (only updates specified fields)
      await employeeApi.patch(empId, updateData);

      // Update local state optimistically
      setEmployees(prev => prev.map(emp => {
        if (emp.id === empId) {
          const updated = { ...emp, ...updateData };
          // Update display names
          if (field === 'outlet_id') {
            const outlet = outlets.find(o => o.id === parseInt(value));
            updated.outlet_name = outlet?.name || '';
          }
          if (field === 'position_id') {
            const pos = positions.find(p => p.id === parseInt(value));
            updated.position = pos?.name || '';
          }
          return updated;
        }
        return emp;
      }));
    } catch (error) {
      console.error('Error updating employee:', error);
      alert(error.response?.data?.error || 'Failed to update');
      // Refresh data on error to reset
      fetchData();
    } finally {
      setUpdatingCell(null);
    }
  };

  const handleResetPassword = async (emp) => {
    if (!emp.ic_number) {
      alert('Cannot reset password: This employee has no IC number on record.');
      return;
    }
    if (window.confirm(`Reset password for ${emp.name}?\n\nThe new password will be their IC number (without dashes).`)) {
      try {
        const res = await employeeApi.resetPassword(emp.id);
        alert(res.data.message);
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to reset password');
      }
    }
  };

  const resetForm = () => {
    setEditingEmployee(null);
    setSalaryAutoPopulated(false);
    setEmployeeCommissions([]);
    setEmployeeAllowances([]);
    setForm({
      employee_id: '',
      name: '',
      email: '',
      phone: '',
      ic_number: '',
      department_id: '',
      outlet_id: '',
      position_id: '',
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

  // Quick Add Employee functions
  const openQuickAddModal = () => {
    setQuickAddForm({ employee_id: '', name: '', ic_number: '' });
    setQuickAddResult(null);
    setShowQuickAddModal(true);
  };

  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    setQuickAddLoading(true);
    setQuickAddResult(null);
    try {
      const res = await employeeApi.quickAdd(quickAddForm);
      setQuickAddResult({
        success: true,
        message: res.data.message,
        login_info: res.data.login_info
      });
      fetchData(); // Refresh employee list
    } catch (error) {
      setQuickAddResult({
        success: false,
        message: error.response?.data?.error || 'Failed to add employee'
      });
    } finally {
      setQuickAddLoading(false);
    }
  };

  const closeQuickAddModal = () => {
    setShowQuickAddModal(false);
    setQuickAddForm({ employee_id: '', name: '', ic_number: '' });
    setQuickAddResult(null);
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
      outlet_id: '',
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
            <h1>Employees</h1>
            <p>View your team members</p>
          </div>
          <div className="header-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
            />
            <div className="view-toggle">
              <button
                onClick={() => setViewMode('simple')}
                className={`toggle-btn ${viewMode === 'simple' ? 'active' : ''}`}
              >
                Simple
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`toggle-btn ${viewMode === 'detailed' ? 'active' : ''}`}
              >
                Detailed
              </button>
            </div>
            <button onClick={downloadTemplate} className="template-btn">
              Download Template
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="import-btn">
              Upload Employees
            </button>
            <button onClick={openQuickAddModal} className="quick-add-btn">
              Quick Add
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
          {isMimix ? (
            <select
              value={filter.outlet_id}
              onChange={(e) => setFilter({ ...filter, outlet_id: e.target.value })}
            >
              <option value="">All Outlets</option>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={filter.department_id}
              onChange={(e) => setFilter({ ...filter, department_id: e.target.value })}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
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
        ) : viewMode === 'simple' ? (
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
                  <th>{isMimix ? 'Outlet' : 'Department'}</th>
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
                        {/* Inline Outlet/Department Dropdown */}
                        <td className="inline-edit-cell">
                          {isMimix ? (
                            <select
                              className={`inline-select ${updatingCell === `${emp.id}-outlet_id` ? 'updating' : ''}`}
                              value={emp.outlet_id || ''}
                              onChange={(e) => handleInlineUpdate(emp.id, 'outlet_id', e.target.value)}
                              disabled={updatingCell === `${emp.id}-outlet_id`}
                            >
                              <option value="">-- Select --</option>
                              {outlets.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                          ) : emp.department_name ? (
                            <span
                              className="department-link"
                              onClick={goToDepartments}
                              title="Go to Departments"
                            >
                              {emp.department_name}
                            </span>
                          ) : '-'}
                        </td>
                        {/* Inline Position Dropdown */}
                        <td className="inline-edit-cell">
                          <select
                            className={`inline-select ${updatingCell === `${emp.id}-position_id` ? 'updating' : ''}`}
                            value={emp.position_id || ''}
                            onChange={(e) => handleInlineUpdate(emp.id, 'position_id', e.target.value)}
                            disabled={updatingCell === `${emp.id}-position_id`}
                          >
                            <option value="">-- Select --</option>
                            {positions.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        {/* Inline Employment Type Dropdown */}
                        <td className="inline-edit-cell">
                          <select
                            className={`inline-select employment-select ${emp.employment_type || 'probation'} ${updatingCell === `${emp.id}-employment_type` ? 'updating' : ''}`}
                            value={emp.employment_type || 'probation'}
                            onChange={(e) => handleInlineUpdate(emp.id, 'employment_type', e.target.value)}
                            disabled={updatingCell === `${emp.id}-employment_type`}
                          >
                            <option value="probation">Probation</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="contract">Contract</option>
                          </select>
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
                        {/* Inline Status Dropdown */}
                        <td className="inline-edit-cell">
                          <select
                            className={`inline-select status-select ${emp.status} ${updatingCell === `${emp.id}-status` ? 'updating' : ''}`}
                            value={emp.status}
                            onChange={(e) => handleInlineUpdate(emp.id, 'status', e.target.value)}
                            disabled={updatingCell === `${emp.id}-status`}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td>
                          <button onClick={() => handleEdit(emp)} className="edit-btn" title="Edit">✏️</button>
                          <button onClick={() => handleResetPassword(emp)} className="reset-pwd-btn" title="Reset Password">🔑</button>
                          {emp.status === 'active' && (
                            <button onClick={() => handleDelete(emp.id)} className="delete-btn" title="Deactivate">🗑️</button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="employees-table detailed-view">
            <div className="table-scroll-wrapper">
              <table>
                <thead>
                  <tr>
                    <th className="checkbox-col sticky-col">
                      <input
                        type="checkbox"
                        checked={employees.length > 0 && selectedEmployees.length === employees.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="sticky-col">ID</th>
                    <th className="sticky-col">Name</th>
                    <th>IC Number</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>{isMimix ? 'Outlet' : 'Department'}</th>
                    <th>Position</th>
                    <th>Join Date</th>
                    <th>Basic Salary</th>
                    <th>Allowance</th>
                    <th>Bank</th>
                    <th>Account No</th>
                    <th>EPF No</th>
                    <th>SOCSO No</th>
                    <th>Tax No</th>
                    <th>Marital</th>
                    <th>Status</th>
                    <th className="sticky-col-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan="19" className="no-data">No employees found</td>
                    </tr>
                  ) : (
                    employees.map(emp => (
                      <tr key={emp.id} className={selectedEmployees.includes(emp.id) ? 'selected' : ''}>
                        <td className="checkbox-col sticky-col">
                          <input
                            type="checkbox"
                            checked={selectedEmployees.includes(emp.id)}
                            onChange={() => handleSelectEmployee(emp.id)}
                          />
                        </td>
                        <td className="sticky-col"><strong>{emp.employee_id}</strong></td>
                        <td className="sticky-col name-col">{emp.name}</td>
                        <td>{emp.ic_number || '-'}</td>
                        <td>{emp.phone || '-'}</td>
                        <td>{emp.email || '-'}</td>
                        <td>{isMimix ? (emp.outlet_name || '-') : (emp.department_name || '-')}</td>
                        <td>{emp.position || '-'}</td>
                        <td>{emp.join_date ? new Date(emp.join_date).toLocaleDateString('en-MY') : '-'}</td>
                        <td className="money-col">RM {parseFloat(emp.default_basic_salary || 0).toFixed(2)}</td>
                        <td className="money-col">RM {parseFloat(emp.default_allowance || 0).toFixed(2)}</td>
                        <td>{emp.bank_name || '-'}</td>
                        <td>{emp.bank_account_no || '-'}</td>
                        <td>{emp.epf_number || '-'}</td>
                        <td>{emp.socso_number || '-'}</td>
                        <td>{emp.tax_number || '-'}</td>
                        <td>{emp.marital_status || '-'}</td>
                        <td>
                          <span className={`status-badge ${emp.status}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="sticky-col-right">
                          <button onClick={() => handleEdit(emp)} className="edit-btn" title="Edit">✏️</button>
                          <button onClick={() => handleResetPassword(emp)} className="reset-pwd-btn" title="Reset Password">🔑</button>
                          {emp.status === 'active' && (
                            <button onClick={() => handleDelete(emp.id)} className="delete-btn" title="Deactivate">🗑️</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
                  {isMimix ? (
                    <div className="form-group">
                      <label>Outlet *</label>
                      <select
                        value={form.outlet_id}
                        onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                        required
                      >
                        <option value="">Select outlet</option>
                        {outlets.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
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
                  )}
                  <div className="form-group">
                    <label>Position *</label>
                    <select
                      value={form.position_id}
                      onChange={(e) => setForm({ ...form, position_id: e.target.value })}
                      required
                    >
                      <option value="">Select position</option>
                      {positions
                        .filter(p => !form.department_id || p.department_id === parseInt(form.department_id) || !p.department_id)
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>IC Number *</label>
                    <input
                      type="text"
                      value={form.ic_number}
                      onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
                      placeholder="e.g. 901234-56-7890"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number *</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="e.g. 0123456789"
                      required
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
                    <label>Join Date *</label>
                    <input
                      type="date"
                      value={form.join_date}
                      onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                      required
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

                {/* Commissions Section */}
                <div className="form-section-title">
                  💵 Commissions
                  <button
                    type="button"
                    className="btn-add-small"
                    onClick={() => setEmployeeCommissions([...employeeCommissions, { commission_type_id: '', amount: '' }])}
                    style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px' }}
                  >
                    + Add
                  </button>
                </div>

                {employeeCommissions.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>No commissions assigned. Click "+ Add" to add commission types.</p>
                ) : (
                  employeeCommissions.map((comm, index) => (
                    <div className="form-row" key={index} style={{ alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label>Commission Type</label>
                        <select
                          value={comm.commission_type_id}
                          onChange={(e) => {
                            const updated = [...employeeCommissions];
                            updated[index].commission_type_id = e.target.value;
                            setEmployeeCommissions(updated);
                          }}
                        >
                          <option value="">Select Type</option>
                          {commissionTypes.map(ct => (
                            <option key={ct.id} value={ct.id}>{ct.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Amount (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={comm.amount}
                          onChange={(e) => {
                            const updated = [...employeeCommissions];
                            updated[index].amount = e.target.value;
                            setEmployeeCommissions(updated);
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = employeeCommissions.filter((_, i) => i !== index);
                          setEmployeeCommissions(updated);
                        }}
                        style={{ padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}

                {/* Allowances Section */}
                <div className="form-section-title">
                  🎯 Allowances
                  <button
                    type="button"
                    className="btn-add-small"
                    onClick={() => setEmployeeAllowances([...employeeAllowances, { allowance_type_id: '', amount: '' }])}
                    style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px' }}
                  >
                    + Add
                  </button>
                </div>

                {employeeAllowances.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>No allowances assigned. Click "+ Add" to add allowance types.</p>
                ) : (
                  employeeAllowances.map((allow, index) => (
                    <div className="form-row" key={index} style={{ alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label>Allowance Type</label>
                        <select
                          value={allow.allowance_type_id}
                          onChange={(e) => {
                            const updated = [...employeeAllowances];
                            updated[index].allowance_type_id = e.target.value;
                            setEmployeeAllowances(updated);
                          }}
                        >
                          <option value="">Select Type</option>
                          {allowanceTypes.map(at => (
                            <option key={at.id} value={at.id}>{at.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Amount (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={allow.amount}
                          onChange={(e) => {
                            const updated = [...employeeAllowances];
                            updated[index].amount = e.target.value;
                            setEmployeeAllowances(updated);
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = employeeAllowances.filter((_, i) => i !== index);
                          setEmployeeAllowances(updated);
                        }}
                        style={{ padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}

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
                  {isMimix ? (
                    <div className="form-group">
                      <label>Outlet</label>
                      <select
                        value={bulkEditForm.outlet_id}
                        onChange={(e) => setBulkEditForm({ ...bulkEditForm, outlet_id: e.target.value })}
                      >
                        <option value="">-- No Change --</option>
                        {outlets.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
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
                  )}
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

        {/* Quick Add Employee Modal */}
        {showQuickAddModal && (
          <div className="modal-overlay" onClick={closeQuickAddModal}>
            <div className="modal quick-add-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Quick Add Employee</h2>
              <p className="modal-subtitle">Add employee with minimal info for immediate ESS access</p>

              {!quickAddResult ? (
                <form onSubmit={handleQuickAddSubmit}>
                  <div className="form-group">
                    <label>Employee ID *</label>
                    <input
                      type="text"
                      value={quickAddForm.employee_id}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, employee_id: e.target.value.toUpperCase() })}
                      placeholder="e.g. EMP001"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      value={quickAddForm.name}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, name: e.target.value })}
                      placeholder="Enter full name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>IC Number *</label>
                    <input
                      type="text"
                      value={quickAddForm.ic_number}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, ic_number: e.target.value })}
                      placeholder="e.g. 901234-56-7890"
                      required
                    />
                    <small className="form-hint">IC number will be used as initial password (without dashes)</small>
                  </div>

                  <div className="modal-actions">
                    <button type="button" onClick={closeQuickAddModal} className="cancel-btn">
                      Cancel
                    </button>
                    <button type="submit" className="save-btn" disabled={quickAddLoading}>
                      {quickAddLoading ? 'Adding...' : 'Add Employee'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={`quick-add-result ${quickAddResult.success ? 'success' : 'error'}`}>
                  <div className="result-icon">{quickAddResult.success ? '✓' : '✗'}</div>
                  <p className="result-message">{quickAddResult.message}</p>

                  {quickAddResult.success && quickAddResult.login_info && (
                    <div className="login-info-box">
                      <h4>Employee Login Details:</h4>
                      <div className="info-row">
                        <span className="label">Employee ID:</span>
                        <span className="value">{quickAddResult.login_info.employee_id}</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Password:</span>
                        <span className="value">{quickAddResult.login_info.password}</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Login URL:</span>
                        <span className="value">/ess/login</span>
                      </div>
                    </div>
                  )}

                  <div className="modal-actions">
                    {quickAddResult.success ? (
                      <>
                        <button onClick={() => {
                          setQuickAddResult(null);
                          setQuickAddForm({ employee_id: '', name: '', ic_number: '' });
                        }} className="add-another-btn">
                          Add Another
                        </button>
                        <button onClick={closeQuickAddModal} className="save-btn">
                          Done
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setQuickAddResult(null)} className="save-btn">
                        Try Again
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Employees;
