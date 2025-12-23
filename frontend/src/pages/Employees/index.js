import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi, probationApi, earningsApi } from '../../api';
import Layout from '../../components/Layout';
import * as XLSX from 'xlsx';

// Import sub-components
import EmployeeForm, { INITIAL_FORM_STATE } from './EmployeeForm';
import EmployeeTable from './EmployeeTable';
import EmployeeStats from './EmployeeStats';
import EmployeeFilters from './EmployeeFilters';
import BulkActionBar from './BulkActionBar';
import ImportModal from './ImportModal';
import BulkEditModal from './BulkEditModal';
import ProbationModal from './ProbationModal';

import '../Employees.css';

function Employees() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Main data state
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Commission & Allowance types
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);

  // Filter state
  const [filter, setFilter] = useState({
    department_id: searchParams.get('department_id') || '',
    status: 'active',
    search: '',
    employment_type: ''
  });

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showProbationModal, setShowProbationModal] = useState(false);

  // Form state
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [employeeCommissions, setEmployeeCommissions] = useState([]);
  const [employeeAllowances, setEmployeeAllowances] = useState([]);
  const [salaryAutoPopulated, setSalaryAutoPopulated] = useState(false);

  // Import state
  const [importData, setImportData] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Bulk selection state
  const [selectedEmployees, setSelectedEmployees] = useState([]);
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

  // Probation state
  const [probationEmployee, setProbationEmployee] = useState(null);
  const [probationAction, setProbationAction] = useState('confirm');
  const [extensionMonths, setExtensionMonths] = useState(1);
  const [probationNotes, setProbationNotes] = useState('');
  const [processingProbation, setProcessingProbation] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, deptRes, statsRes, commTypesRes, allowTypesRes] = await Promise.all([
        employeeApi.getAll(filter),
        departmentApi.getAll(),
        employeeApi.getStats(),
        earningsApi.getCommissionTypes(),
        earningsApi.getAllowanceTypes()
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setStats(statsRes.data);
      setCommissionTypes(commTypesRes.data);
      setAllowanceTypes(allowTypesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  const goToDepartments = () => navigate('/admin/departments');

  // Form reset
  const resetForm = () => {
    setEditingEmployee(null);
    setSalaryAutoPopulated(false);
    setEmployeeCommissions([]);
    setEmployeeAllowances([]);
    setForm(INITIAL_FORM_STATE);
  };

  // Department change handler with salary auto-population
  const handleDepartmentChange = async (deptId) => {
    setForm(prev => ({ ...prev, department_id: deptId }));
    setSalaryAutoPopulated(false);

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

  // CRUD Operations
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
      default_basic_salary: emp.default_basic_salary || '',
      default_allowance: emp.default_allowance || '',
      commission_rate: emp.commission_rate || '',
      per_trip_rate: emp.per_trip_rate || '',
      ot_rate: emp.ot_rate || '',
      outstation_rate: emp.outstation_rate || '',
      default_bonus: emp.default_bonus || '',
      default_incentive: emp.default_incentive || '',
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

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedEmployees(employees.map(emp => emp.id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleSelectEmployee = (empId) => {
    setSelectedEmployees(prev =>
      prev.includes(empId)
        ? prev.filter(id => id !== empId)
        : [...prev, empId]
    );
  };

  // Bulk operations
  const handleBulkEditSubmit = async (e) => {
    e.preventDefault();

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

  // Import handlers
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

        const mappedData = jsonData.map(row => ({
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
          bank_name: row['Bank Name'] || row['Bank'] || row['bank_name'] || '',
          bank_account_no: row['Account Number'] || row['Bank Account'] || row['bank_account_no'] || row['Bank Account No'] || '',
          bank_account_holder: row['Account Holder'] || row['Account Name'] || row['bank_account_holder'] || '',
          epf_number: row['EPF Number'] || row['epf_number'] || row['EPF No'] || '',
          socso_number: row['SOCSO Number'] || row['socso_number'] || row['SOCSO No'] || '',
          tax_number: row['Tax Number'] || row['tax_number'] || row['Tax No'] || row['PCB Number'] || '',
          epf_contribution_type: row['EPF Type'] || row['epf_contribution_type'] || 'normal',
          marital_status: row['Marital Status'] || row['marital_status'] || 'single',
          spouse_working: row['Spouse Working'] || row['spouse_working'] || 'false',
          children_count: row['Children Count'] || row['children_count'] || row['No of Children'] || '0',
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
    e.target.value = '';
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
        'Date of Birth': '1990-05-15',
        'Address': '123 Jalan Example, 50000 Kuala Lumpur',
        'Department': 'Office',
        'Position': 'Manager',
        'Join Date': '2024-01-15',
        'Status': 'active',
        'Bank Name': 'Maybank',
        'Account Number': '1234567890',
        'Account Holder': 'John Doe',
        'EPF Number': 'EPF12345',
        'SOCSO Number': 'SOCSO12345',
        'Tax Number': 'TAX12345',
        'EPF Type': 'normal',
        'Marital Status': 'married',
        'Spouse Working': 'true',
        'Children Count': '2',
        'Basic Salary': '3500.00',
        'Allowance': '500.00',
        'Commission Rate': '0',
        'Per Trip Rate': '0',
        'OT Rate': '15.00',
        'Outstation Rate': '0',
        'Bonus': '500.00',
        'Incentive': '200.00'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  // Probation handlers
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

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>Employees</h1>
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
            <button onClick={() => { resetForm(); setShowModal(true); }} className="add-btn">
              + Add Employee
            </button>
          </div>
        </header>

        <EmployeeStats stats={stats} />

        <EmployeeFilters
          filter={filter}
          setFilter={setFilter}
          departments={departments}
        />

        <BulkActionBar
          selectedCount={selectedEmployees.length}
          onBulkEdit={() => {
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
          }}
          onBulkDelete={handleBulkDelete}
          onClearSelection={() => setSelectedEmployees([])}
        />

        <EmployeeTable
          employees={employees}
          selectedEmployees={selectedEmployees}
          onSelectAll={handleSelectAll}
          onSelectEmployee={handleSelectEmployee}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onProbationReview={openProbationModal}
          goToDepartments={goToDepartments}
          loading={loading}
        />

        {/* Employee Form Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingEmployee ? 'Edit Employee' : 'Add Employee'}</h2>
              <EmployeeForm
                form={form}
                setForm={setForm}
                editingEmployee={editingEmployee}
                departments={departments}
                commissionTypes={commissionTypes}
                allowanceTypes={allowanceTypes}
                employeeCommissions={employeeCommissions}
                setEmployeeCommissions={setEmployeeCommissions}
                employeeAllowances={employeeAllowances}
                setEmployeeAllowances={setEmployeeAllowances}
                salaryAutoPopulated={salaryAutoPopulated}
                onDepartmentChange={handleDepartmentChange}
                onSubmit={handleSubmit}
                onCancel={() => setShowModal(false)}
              />
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <ImportModal
            importData={importData}
            importResult={importResult}
            importing={importing}
            onImport={handleImport}
            onClose={() => {
              setShowImportModal(false);
              setImportData(null);
              setImportResult(null);
            }}
            onDownloadTemplate={downloadTemplate}
          />
        )}

        {/* Bulk Edit Modal */}
        {showBulkEditModal && (
          <BulkEditModal
            selectedCount={selectedEmployees.length}
            bulkEditForm={bulkEditForm}
            setBulkEditForm={setBulkEditForm}
            departments={departments}
            bulkUpdating={bulkUpdating}
            onSubmit={handleBulkEditSubmit}
            onClose={() => setShowBulkEditModal(false)}
          />
        )}

        {/* Probation Modal */}
        {showProbationModal && (
          <ProbationModal
            employee={probationEmployee}
            probationAction={probationAction}
            setProbationAction={setProbationAction}
            extensionMonths={extensionMonths}
            setExtensionMonths={setExtensionMonths}
            probationNotes={probationNotes}
            setProbationNotes={setProbationNotes}
            processingProbation={processingProbation}
            onConfirm={handleProbationConfirm}
            onExtend={handleProbationExtend}
            onClose={() => setShowProbationModal(false)}
          />
        )}
      </div>
    </Layout>
  );
}

export default Employees;
