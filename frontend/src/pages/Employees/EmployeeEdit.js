import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employeeApi, departmentApi, earningsApi } from '../../api';
import api from '../../api';
import Layout from '../../components/Layout';
import EmployeeForm, { INITIAL_FORM_STATE } from './EmployeeForm';
import '../Employees.css';

// Helper to detect ID type from IC number
const detectIDType = (idNumber) => {
  if (!idNumber) return 'ic';
  const clean = idNumber.replace(/[-\s]/g, '');
  if (!/^\d{12}$/.test(clean)) return 'passport';
  const month = parseInt(clean.substring(2, 4));
  const day = parseInt(clean.substring(4, 6));
  if (month < 1 || month > 12) return 'passport';
  if (day < 1 || day > 31) return 'passport';
  return 'ic';
};

function EmployeeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [editingEmployee, setEditingEmployee] = useState(null);

  // Reference data
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [positions, setPositions] = useState([]);
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [employeeCommissions, setEmployeeCommissions] = useState([]);
  const [employeeAllowances, setEmployeeAllowances] = useState([]);

  // Check if company uses outlets
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const usesOutlets = adminInfo.company_id === 3; // Mimix

  // Fetch reference data and employee data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch reference data
      const [empRes, deptRes, commRes, allowRes] = await Promise.all([
        employeeApi.getOne(id),
        departmentApi.getAll(),
        earningsApi.getCommissionTypes().catch(() => ({ data: [] })),
        earningsApi.getAllowanceTypes().catch(() => ({ data: [] }))
      ]);

      // Fetch outlets and positions if needed (for outlet-based companies like Mimix)
      if (usesOutlets) {
        try {
          const [outletRes, positionsRes] = await Promise.all([
            api.get('/outlets'),
            api.get('/positions')
          ]);
          setOutlets(outletRes.data || []);
          setPositions(positionsRes.data || []);
        } catch (e) {
          console.error('Error fetching outlets/positions:', e);
        }
      }

      setDepartments(deptRes.data || []);
      setCommissionTypes(commRes.data || []);
      setAllowanceTypes(allowRes.data || []);

      const employee = empRes.data;
      setEditingEmployee(employee);

      // Auto-detect ID type from ic_number
      const detectedIdType = employee.id_type || detectIDType(employee.ic_number);

      // Populate form with employee data
      setForm({
        employee_id: employee.employee_id || '',
        name: employee.name || '',
        email: employee.email || '',
        phone: employee.phone || '',
        ic_number: employee.ic_number || '',
        id_type: detectedIdType,
        department_id: employee.department_id || '',
        outlet_id: employee.outlet_id || '',
        position: employee.position || '',
        position_id: employee.position_id || '',
        join_date: employee.join_date ? employee.join_date.split('T')[0] : '',
        status: employee.status || 'active',
        address: employee.address || '',
        bank_name: employee.bank_name || '',
        bank_account_no: employee.bank_account_no || '',
        bank_account_holder: employee.bank_account_holder || '',
        epf_number: employee.epf_number || '',
        socso_number: employee.socso_number || '',
        tax_number: employee.tax_number || '',
        epf_contribution_type: employee.epf_contribution_type || 'normal',
        marital_status: employee.marital_status || 'single',
        spouse_working: employee.spouse_working || false,
        children_count: employee.children_count || 0,
        date_of_birth: employee.date_of_birth ? employee.date_of_birth.split('T')[0] : '',
        default_basic_salary: employee.default_basic_salary || '',
        default_allowance: employee.default_allowance || '',
        commission_rate: employee.commission_rate || '',
        per_trip_rate: employee.per_trip_rate || '',
        ot_rate: employee.ot_rate || '',
        outstation_rate: employee.outstation_rate || '',
        default_bonus: employee.default_bonus || '',
        default_incentive: employee.default_incentive || '',
        employment_type: employee.employment_type || 'probation',
        probation_months: employee.probation_months || 3,
        salary_before_confirmation: employee.salary_before_confirmation || '',
        salary_after_confirmation: employee.salary_after_confirmation || '',
        increment_amount: employee.increment_amount || '',
        probation_notes: employee.probation_notes || ''
      });

      // Load employee commissions and allowances
      if (employee.commissions) {
        setEmployeeCommissions(employee.commissions.map(c => ({
          commission_type_id: c.commission_type_id,
          amount: c.amount
        })));
      }

      if (employee.allowances) {
        setEmployeeAllowances(employee.allowances.map(a => ({
          allowance_type_id: a.allowance_type_id,
          amount: a.amount
        })));
      }

    } catch (err) {
      console.error('Error fetching employee:', err);
      setError('Failed to load employee data');
    } finally {
      setLoading(false);
    }
  }, [id, usesOutlets]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDepartmentChange = async (deptId) => {
    setForm(prev => ({ ...prev, department_id: deptId }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError(null);

      const payload = {
        ...form,
        commissions: employeeCommissions.filter(c => c.commission_type_id && c.amount),
        allowances: employeeAllowances.filter(a => a.allowance_type_id && a.amount)
      };

      await employeeApi.update(id, payload);

      alert('Employee updated successfully');
      navigate('/admin/employees');

    } catch (err) {
      console.error('Error updating employee:', err);
      setError(err.response?.data?.error || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/employees');
  };

  if (loading) {
    return (
      <Layout>
        <div className="employees-page">
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p>Loading employee data...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error && !editingEmployee) {
    return (
      <Layout>
        <div className="employees-page">
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p style={{ color: '#dc2626' }}>{error}</p>
            <button
              className="btn-primary"
              onClick={() => navigate('/admin/employees')}
              style={{ marginTop: '20px' }}
            >
              Back to Employees
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="employees-page">
        <header className="page-header">
          <div>
            <h1>Edit Employee</h1>
            <p>Update employee information for {editingEmployee?.name || editingEmployee?.employee_id}</p>
          </div>
          <button className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
        </header>

        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#dc2626'
          }}>
            {error}
          </div>
        )}

        <div className="card" style={{ padding: '24px' }}>
          <EmployeeForm
            form={form}
            setForm={setForm}
            editingEmployee={editingEmployee}
            departments={departments}
            outlets={outlets}
            usesOutlets={usesOutlets}
            positions={positions}
            commissionTypes={commissionTypes}
            allowanceTypes={allowanceTypes}
            employeeCommissions={employeeCommissions}
            setEmployeeCommissions={setEmployeeCommissions}
            employeeAllowances={employeeAllowances}
            setEmployeeAllowances={setEmployeeAllowances}
            salaryAutoPopulated={false}
            onDepartmentChange={handleDepartmentChange}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />

          {saving && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                background: 'white',
                padding: '24px',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                Saving changes...
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default EmployeeEdit;
