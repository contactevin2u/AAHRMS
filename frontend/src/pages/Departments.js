import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentApi } from '../api';
import Layout from '../components/Layout';
import './Departments.css';

function Departments() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDept, setEditingDept] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const viewEmployees = (deptId) => {
    navigate(`/admin/employees?department_id=${deptId}`);
  };

  const startEdit = (dept) => {
    setEditingDept(dept.id);
    setEditName(dept.name);
  };

  const cancelEdit = () => {
    setEditingDept(null);
    setEditName('');
  };

  const saveEdit = async (deptId) => {
    if (!editName.trim()) return;
    try {
      setSaving(true);
      await departmentApi.update(deptId, { name: editName.trim() });
      setEditingDept(null);
      fetchDepartments();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update department name');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const res = await departmentApi.getAll();
      setDepartments(res.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSalaryTypeLabel = (type) => {
    const labels = {
      // Current payroll structures
      'basic_trip_upsell_outstation_ot': 'Basic + Trip Commission (RM30) + Upsell (10%) + Outstation (RM100/day) + OT',
      'basic_or_commission_higher': 'Basic RM4,000 OR 6% Commission (whichever higher)',
      'basic_allowance_commission': 'Basic + Allowance + Commission',
      'basic_allowance_commission_tier': 'Basic + Allowance + Commission (by tier)',
      // Legacy types (for backward compatibility)
      'basic_allowance_bonus_ot': 'Basic + Allowance + Bonus + OT',
      'basic_commission': 'Basic + Commission',
      'basic_commission_allowance_bonus': 'Basic + Commission + Allowance + Bonus',
      'basic_upsell_outstation_ot_trip': 'Basic + Upsell + Outstation + OT + Trip',
      'fixed_bonus_commission_allowance': 'Fixed + Bonus + Commission + Allowance',
      'commission_only': 'Commission Only',
      'basic_trip_commission_outstation_ot': 'Basic + Trip + Commission + Outstation + OT'
    };
    return labels[type] || type;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount || 0);
  };

  return (
    <Layout>
      <div className="departments-page">
        <header className="page-header">
          <div>
            <h1>Departments</h1>
            <p>View department salary configurations</p>
          </div>
        </header>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="no-departments">
            <p>No departments found.</p>
          </div>
        ) : (
          <div className="departments-grid">
            {departments.map(dept => (
              <div key={dept.id} className="dept-card">
                <div className="dept-header">
                  {editingDept === dept.id ? (
                    <div className="dept-name-edit">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(dept.id);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        className="dept-name-input"
                      />
                      <button className="dept-save-btn" onClick={() => saveEdit(dept.id)} disabled={saving}>
                        {saving ? '...' : '✓'}
                      </button>
                      <button className="dept-cancel-btn" onClick={cancelEdit} disabled={saving}>✕</button>
                    </div>
                  ) : (
                    <div className="dept-name-row">
                      <h3>{dept.name}</h3>
                      <button
                        className="dept-edit-btn"
                        onClick={() => startEdit(dept)}
                        title="Edit department name"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <span
                    className="employee-count clickable"
                    onClick={() => viewEmployees(dept.id)}
                    title="View employees in this department"
                  >
                    {dept.employee_count || 0} employees
                  </span>
                </div>
                <div className="dept-type">
                  <span className="type-label">Salary Type:</span>
                  <span className="type-value">{getSalaryTypeLabel(dept.salary_type)}</span>
                </div>

                {dept.salary_config && (
                  <div className="config-preview">
                    {dept.salary_config.basic_salary > 0 && (
                      <div className="config-item">
                        <span>Basic:</span>
                        <span>{formatCurrency(dept.salary_config.basic_salary)}</span>
                      </div>
                    )}
                    {dept.salary_config.has_commission && (
                      <div className="config-item">
                        <span>Commission:</span>
                        <span>{dept.salary_config.commission_rate}%</span>
                      </div>
                    )}
                    {dept.salary_config.has_allowance && (
                      <div className="config-item">
                        <span>Allowance:</span>
                        <span>{formatCurrency(dept.salary_config.allowance_amount)}</span>
                      </div>
                    )}
                    {dept.salary_config.has_per_trip && (
                      <div className="config-item">
                        <span>Per Trip:</span>
                        <span>{formatCurrency(dept.salary_config.per_trip_rate)}</span>
                      </div>
                    )}
                    {dept.salary_config.has_ot && (
                      <div className="config-item">
                        <span>OT Rate:</span>
                        <span>{formatCurrency(dept.salary_config.ot_rate)}/hr</span>
                      </div>
                    )}
                    {dept.salary_config.has_outstation && (
                      <div className="config-item">
                        <span>Outstation:</span>
                        <span>{formatCurrency(dept.salary_config.outstation_rate)}/day</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="dept-actions">
                  <button
                    onClick={() => viewEmployees(dept.id)}
                    className="view-employees-btn"
                  >
                    View Employees
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Departments;
