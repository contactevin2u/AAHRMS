import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentApi } from '../api';
import Layout from '../components/Layout';
import './Departments.css';

function Departments() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState(null);

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

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await departmentApi.updateSalaryConfig(selectedDept.id, selectedDept.salary_config);
      setSelectedDept(null);
      fetchDepartments();
    } catch (error) {
      alert('Failed to save configuration');
    }
  };

  const getSalaryTypeLabel = (type) => {
    const labels = {
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
            <h1>🏢 Departments</h1>
            <p>Manage department salary configurations</p>
          </div>
        </header>

        {loading ? (
          <div className="loading">☕ Loading...</div>
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
                    👥 View Employees
                  </button>
                  <button
                    onClick={() => setSelectedDept({
                      ...dept,
                      salary_config: dept.salary_config || {
                        basic_salary: 0,
                        has_commission: false,
                        commission_rate: 0,
                        has_allowance: false,
                        allowance_amount: 0,
                        has_per_trip: false,
                        per_trip_rate: 0,
                        has_ot: false,
                        ot_rate: 0,
                        has_outstation: false,
                        outstation_rate: 0
                      }
                    })}
                    className="config-btn"
                  >
                    ⚙️ Configure Salary
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedDept && (
          <div className="modal-overlay" onClick={() => setSelectedDept(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>⚙️ Salary Config - {selectedDept.name}</h2>
              <p className="modal-subtitle">{getSalaryTypeLabel(selectedDept.salary_type)}</p>

              <form onSubmit={handleSaveConfig}>
                <div className="form-group">
                  <label>Basic Salary (MYR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedDept.salary_config.basic_salary || ''}
                    onChange={(e) => setSelectedDept({
                      ...selectedDept,
                      salary_config: {...selectedDept.salary_config, basic_salary: e.target.value}
                    })}
                    placeholder="0.00"
                  />
                </div>

                <div className="config-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={selectedDept.salary_config.has_commission || false}
                      onChange={(e) => setSelectedDept({
                        ...selectedDept,
                        salary_config: {...selectedDept.salary_config, has_commission: e.target.checked}
                      })}
                    />
                    <span>Enable Commission</span>
                  </label>
                  {selectedDept.salary_config.has_commission && (
                    <div className="form-group inline">
                      <label>Commission Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDept.salary_config.commission_rate || ''}
                        onChange={(e) => setSelectedDept({
                          ...selectedDept,
                          salary_config: {...selectedDept.salary_config, commission_rate: e.target.value}
                        })}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>

                <div className="config-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={selectedDept.salary_config.has_allowance || false}
                      onChange={(e) => setSelectedDept({
                        ...selectedDept,
                        salary_config: {...selectedDept.salary_config, has_allowance: e.target.checked}
                      })}
                    />
                    <span>Enable Allowance</span>
                  </label>
                  {selectedDept.salary_config.has_allowance && (
                    <div className="form-group inline">
                      <label>Allowance Amount (MYR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDept.salary_config.allowance_amount || ''}
                        onChange={(e) => setSelectedDept({
                          ...selectedDept,
                          salary_config: {...selectedDept.salary_config, allowance_amount: e.target.value}
                        })}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>

                <div className="config-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={selectedDept.salary_config.has_per_trip || false}
                      onChange={(e) => setSelectedDept({
                        ...selectedDept,
                        salary_config: {...selectedDept.salary_config, has_per_trip: e.target.checked}
                      })}
                    />
                    <span>Enable Per Trip Pay</span>
                  </label>
                  {selectedDept.salary_config.has_per_trip && (
                    <div className="form-group inline">
                      <label>Per Trip Rate (MYR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDept.salary_config.per_trip_rate || ''}
                        onChange={(e) => setSelectedDept({
                          ...selectedDept,
                          salary_config: {...selectedDept.salary_config, per_trip_rate: e.target.value}
                        })}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>

                <div className="config-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={selectedDept.salary_config.has_ot || false}
                      onChange={(e) => setSelectedDept({
                        ...selectedDept,
                        salary_config: {...selectedDept.salary_config, has_ot: e.target.checked}
                      })}
                    />
                    <span>Enable Overtime (OT)</span>
                  </label>
                  {selectedDept.salary_config.has_ot && (
                    <div className="form-group inline">
                      <label>OT Hourly Rate (MYR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDept.salary_config.ot_rate || ''}
                        onChange={(e) => setSelectedDept({
                          ...selectedDept,
                          salary_config: {...selectedDept.salary_config, ot_rate: e.target.value}
                        })}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>

                <div className="config-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={selectedDept.salary_config.has_outstation || false}
                      onChange={(e) => setSelectedDept({
                        ...selectedDept,
                        salary_config: {...selectedDept.salary_config, has_outstation: e.target.checked}
                      })}
                    />
                    <span>Enable Outstation Allowance</span>
                  </label>
                  {selectedDept.salary_config.has_outstation && (
                    <div className="form-group inline">
                      <label>Outstation Daily Rate (MYR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedDept.salary_config.outstation_rate || ''}
                        onChange={(e) => setSelectedDept({
                          ...selectedDept,
                          salary_config: {...selectedDept.salary_config, outstation_rate: e.target.value}
                        })}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={() => setSelectedDept(null)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    💾 Save Config
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Departments;
