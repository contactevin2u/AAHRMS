import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi } from '../../api';
import api from '../../api';
import Layout from '../../components/Layout';

// Import sub-components
import EmployeeTable from './EmployeeTable';
import EmployeeStats from './EmployeeStats';
import EmployeeFilters from './EmployeeFilters';
import EmployeeDetailModal from './EmployeeDetailModal';

import '../Employees.css';

function Employees() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Check if company uses outlets (Mimix = company_id 3)
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const usesOutlets = adminInfo.company_id === 3;

  // Main data state
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filter, setFilter] = useState({
    department_id: searchParams.get('department_id') || '',
    status: 'active',
    search: '',
    employment_type: ''
  });

  // Selection state (for viewing purposes)
  const [selectedEmployees, setSelectedEmployees] = useState([]);

  // View employee detail modal
  const [viewEmployee, setViewEmployee] = useState(null);

  // Quick Add Modal state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ employee_id: '', name: '', ic_number: '', outlet_id: '' });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
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

      // Fetch outlets if company uses them
      if (usesOutlets) {
        try {
          const outletRes = await api.get('/outlets');
          setOutlets(outletRes.data || []);
        } catch (e) {
          console.error('Error fetching outlets:', e);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, usesOutlets]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  const goToDepartments = () => navigate('/admin/departments');

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

  // Quick Add handlers
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    setQuickAddLoading(true);
    setQuickAddResult(null);

    try {
      const response = await employeeApi.quickAdd(quickAddForm);
      setQuickAddResult({
        success: true,
        message: 'Employee created successfully!',
        employee: response.data.employee,
        loginInfo: response.data.login_info
      });
      fetchData(); // Refresh the list
    } catch (error) {
      setQuickAddResult({
        success: false,
        message: error.response?.data?.error || 'Failed to create employee'
      });
    } finally {
      setQuickAddLoading(false);
    }
  };

  const resetQuickAdd = () => {
    setQuickAddForm({ employee_id: '', name: '', ic_number: '', outlet_id: '' });
    setQuickAddResult(null);
  };

  const closeQuickAdd = () => {
    setShowQuickAdd(false);
    resetQuickAdd();
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
            <button className="quick-add-btn" onClick={() => setShowQuickAdd(true)}>
              + Quick Add
            </button>
            <button className="add-btn" onClick={() => navigate('/admin/employees/add')}>
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

        <EmployeeTable
          employees={employees}
          selectedEmployees={selectedEmployees}
          onSelectAll={handleSelectAll}
          onSelectEmployee={handleSelectEmployee}
          onViewEmployee={setViewEmployee}
          onEditEmployee={(emp) => navigate(`/admin/employees/edit/${emp.id}`)}
          goToDepartments={goToDepartments}
          loading={loading}
          usesOutlets={usesOutlets}
        />

        {/* Employee Detail Modal */}
        {viewEmployee && (
          <EmployeeDetailModal
            employee={viewEmployee}
            onClose={() => setViewEmployee(null)}
            onEdit={(emp) => {
              setViewEmployee(null);
              navigate(`/admin/employees/edit/${emp.id}`);
            }}
          />
        )}

        {/* Quick Add Modal */}
        {showQuickAdd && (
          <div className="modal-overlay" onClick={closeQuickAdd}>
            <div className="modal quick-add-modal" onClick={e => e.stopPropagation()}>
              <h2>Quick Add Employee</h2>
              <p className="modal-subtitle">Create employee with minimal info for immediate ESS access</p>

              {!quickAddResult ? (
                <form onSubmit={handleQuickAdd}>
                  <div className="form-group">
                    <label>Employee ID *</label>
                    <input
                      type="text"
                      value={quickAddForm.employee_id}
                      onChange={(e) => setQuickAddForm({...quickAddForm, employee_id: e.target.value.toUpperCase()})}
                      placeholder="e.g., EMP001"
                      required
                    />
                    <span className="form-hint">Unique identifier for the employee</span>
                  </div>

                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      value={quickAddForm.name}
                      onChange={(e) => setQuickAddForm({...quickAddForm, name: e.target.value})}
                      placeholder="Employee full name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>IC Number (MyKad) *</label>
                    <input
                      type="text"
                      value={quickAddForm.ic_number}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9-]/g, '');
                        setQuickAddForm({...quickAddForm, ic_number: value});
                      }}
                      placeholder="e.g., 901234-12-5678"
                      maxLength="14"
                      required
                    />
                    <span className="form-hint">IC will be used as initial password (without dashes)</span>
                  </div>

                  {usesOutlets && (
                    <div className="form-group">
                      <label>Outlet *</label>
                      <select
                        value={quickAddForm.outlet_id}
                        onChange={(e) => setQuickAddForm({...quickAddForm, outlet_id: e.target.value})}
                        required
                      >
                        <option value="">Select outlet</option>
                        {outlets.map(outlet => (
                          <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                        ))}
                      </select>
                      <span className="form-hint">Assign employee to an outlet</span>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button type="button" className="cancel-btn" onClick={closeQuickAdd}>Cancel</button>
                    <button type="submit" className="save-btn" disabled={quickAddLoading}>
                      {quickAddLoading ? 'Creating...' : 'Create Employee'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={`quick-add-result ${quickAddResult.success ? 'success' : 'error'}`}>
                  <div className="result-icon">
                    {quickAddResult.success ? '✓' : '✕'}
                  </div>
                  <p className="result-message">{quickAddResult.message}</p>

                  {quickAddResult.success && quickAddResult.loginInfo && (
                    <div className="login-info-box">
                      <h4>ESS Login Credentials</h4>
                      <div className="info-row">
                        <span className="label">Employee ID</span>
                        <span className="value">{quickAddResult.loginInfo.employee_id}</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Login Method</span>
                        <span className="value">IC Number Tab</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Password</span>
                        <span className="value">{quickAddResult.loginInfo.initial_password}</span>
                      </div>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button className="add-another-btn" onClick={resetQuickAdd}>Add Another</button>
                    <button className="save-btn" onClick={closeQuickAdd}>Done</button>
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
