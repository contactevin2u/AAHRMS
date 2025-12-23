import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentApi } from '../api';
import Layout from '../components/Layout';
import './Departments.css';

function Departments() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const viewEmployees = (deptId) => {
    navigate(`/admin/employees?department_id=${deptId}`);
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
      // New salary types
      'basic_allowance_bonus_ot': 'Basic + Allowance + Bonus + OT',
      'basic_commission': 'Basic + Commission',
      'basic_commission_allowance_bonus': 'Basic + Commission + Allowance + Bonus',
      'basic_upsell_outstation_ot_trip': 'Basic + Upsell Commission + Outstation + OT + Trip Commission',
      // Legacy types (for backward compatibility)
      'fixed_bonus_commission_allowance': 'Fixed + Bonus + Commission + Allowance',
      'commission_only': 'Commission Only',
      'basic_allowance_commission': 'Basic + Allowance + Commission',
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
                  <h3>{dept.name}</h3>
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
