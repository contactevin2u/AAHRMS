import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi } from '../../api';
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

  // Check if company uses outlets
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const usesOutlets = adminInfo.company_id === 3; // Mimix

  // Fetch reference data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const deptRes = await departmentApi.getAll();
        setDepartments(deptRes.data || []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>Add Employee</h1>
            <p>Create a new employee record</p>
          </div>
          <div className="header-actions">
            <button className="cancel-btn" onClick={() => navigate('/admin/employees')}>
              Cancel
            </button>
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
          <form onSubmit={handleSubmit}>
            <EmployeeForm
              form={form}
              setForm={setForm}
              departments={departments}
              outlets={outlets}
              usesOutlets={usesOutlets}
              isEditing={false}
            />

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button type="button" className="cancel-btn" onClick={() => navigate('/admin/employees')}>
                Cancel
              </button>
              <button type="submit" className="save-btn" disabled={saving}>
                {saving ? 'Creating...' : 'Create Employee'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

export default EmployeeAdd;
