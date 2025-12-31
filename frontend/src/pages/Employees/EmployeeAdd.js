import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi, earningsApi } from '../../api';
import api from '../../api';
import Layout from '../../components/Layout';
import EmployeeForm, { INITIAL_FORM_STATE } from './EmployeeForm';
import '../Employees.css';

function EmployeeAdd() {
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [form, setForm] = useState({
    ...INITIAL_FORM_STATE,
    join_date: new Date().toISOString().split('T')[0] // Default to today
  });

  // Reference data
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [employeeCommissions, setEmployeeCommissions] = useState([]);
  const [employeeAllowances, setEmployeeAllowances] = useState([]);

  // Check if company uses outlets
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const usesOutlets = adminInfo.company_id === 3; // Mimix

  // Fetch reference data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, commRes, allowRes] = await Promise.all([
          departmentApi.getAll(),
          earningsApi.getCommissionTypes().catch(() => ({ data: [] })),
          earningsApi.getAllowanceTypes().catch(() => ({ data: [] }))
        ]);

        setDepartments(deptRes.data || []);
        setCommissionTypes(commRes.data || []);
        setAllowanceTypes(allowRes.data || []);

        if (usesOutlets) {
          try {
            const outletRes = await api.get('/outlets');
            setOutlets(outletRes.data || []);
          } catch (e) {
            console.error('Error fetching outlets:', e);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };

    fetchData();
  }, [usesOutlets]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      // Validate required fields
      if (!form.employee_id) {
        throw new Error('Employee ID is required');
      }
      if (!form.name) {
        throw new Error('Name is required');
      }

      // Prepare data for API
      const submitData = {
        ...form,
        department_id: form.department_id || null,
        outlet_id: form.outlet_id || null,
        default_basic_salary: form.default_basic_salary ? parseFloat(form.default_basic_salary) : null,
        default_allowance: form.default_allowance ? parseFloat(form.default_allowance) : null,
        children_count: parseInt(form.children_count) || 0,
        probation_months: parseInt(form.probation_months) || 3
      };

      await employeeApi.create(submitData);
      navigate('/admin/employees');
    } catch (err) {
      console.error('Error creating employee:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create employee');
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/employees');
  };

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>Add Employee</h1>
            <p>Create a new employee record</p>
          </div>
        </header>

        {error && (
          <div className="error-banner" style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <div className="employee-form-container" style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0'
        }}>
          <EmployeeForm
            form={form}
            setForm={setForm}
            editingEmployee={null}
            departments={departments}
            outlets={outlets}
            usesOutlets={usesOutlets}
            commissionTypes={commissionTypes}
            allowanceTypes={allowanceTypes}
            employeeCommissions={employeeCommissions}
            setEmployeeCommissions={setEmployeeCommissions}
            employeeAllowances={employeeAllowances}
            setEmployeeAllowances={setEmployeeAllowances}
            salaryAutoPopulated={false}
            onDepartmentChange={() => {}}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />

          <div className="modal-actions" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" className="cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className="save-btn" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default EmployeeAdd;
