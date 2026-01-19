import React, { useState, useEffect } from 'react';
import { leaveApi, departmentApi, outletsApi } from '../api';
import Layout from '../components/Layout';
import './LeaveBalances.css';

function LeaveBalances() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  // Get company_id from adminInfo
  const [companyId] = useState(() => {
    try {
      const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
      if (adminInfo.role === 'super_admin') {
        const selectedCompanyId = localStorage.getItem('selectedCompanyId');
        return selectedCompanyId ? parseInt(selectedCompanyId) : null;
      }
      return adminInfo.company_id;
    } catch {
      return null;
    }
  });

  const isMimix = companyId === 3;

  // Filters
  const [filter, setFilter] = useState({
    outlet_id: '',
    department_id: '',
    search: ''
  });

  // Grouping
  const [expandedGroups, setExpandedGroups] = useState({});
  const [groupByEnabled, setGroupByEnabled] = useState(true);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editForm, setEditForm] = useState({
    al_entitled: 0,
    al_used: 0,
    ml_entitled: 0,
    ml_used: 0,
    hl_entitled: 0,
    hl_used: 0
  });
  const [saving, setSaving] = useState(false);

  // Unpaid leave detail modal
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);
  const [unpaidEmployee, setUnpaidEmployee] = useState(null);
  const [unpaidData, setUnpaidData] = useState(null);
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);

  useEffect(() => {
    fetchData();
  }, [year, filter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [balancesRes, deptRes, outletsRes] = await Promise.all([
        leaveApi.getBalancesTable({ year, ...filter }),
        departmentApi.getAll(),
        outletsApi.getAll()
      ]);

      setEmployees(balancesRes.data.employees || []);
      setDepartments(deptRes.data || []);
      setOutlets(outletsRes.data || []);

      // Expand all groups by default
      const expanded = {};
      (outletsRes.data || []).forEach(o => { expanded['outlet-' + o.id] = true; });
      (deptRes.data || []).forEach(d => { expanded['dept-' + d.id] = true; });
      expanded['no-group'] = true;
      setExpandedGroups(expanded);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group employees by outlet or department
  const getEmployeesByGroup = () => {
    const grouped = {};
    employees.forEach(emp => {
      let groupKey, groupName;
      if (isMimix && emp.outlet_id) {
        groupKey = 'outlet-' + emp.outlet_id;
        groupName = emp.outlet_name || 'Unknown Outlet';
      } else if (!isMimix && emp.department_id) {
        groupKey = 'dept-' + emp.department_id;
        groupName = emp.department_name || 'Unknown Department';
      } else {
        groupKey = 'no-group';
        groupName = isMimix ? 'No Outlet Assigned' : 'No Department Assigned';
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          group_id: isMimix ? emp.outlet_id : emp.department_id,
          group_name: groupName,
          group_type: isMimix ? 'outlet' : 'department',
          employees: []
        };
      }
      grouped[groupKey].employees.push(emp);
    });
    return grouped;
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Edit balance modal
  const handleEdit = (emp) => {
    setEditingEmployee(emp);
    setEditForm({
      al_entitled: emp.al_entitled || 0,
      al_used: emp.al_used || 0,
      ml_entitled: emp.ml_entitled || 0,
      ml_used: emp.ml_used || 0,
      hl_entitled: emp.hl_entitled || 0,
      hl_used: emp.hl_used || 0
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee) return;
    setSaving(true);
    try {
      const updates = [];

      // Update AL if balance_id exists
      if (editingEmployee.al_balance_id) {
        updates.push(leaveApi.updateBalance(editingEmployee.al_balance_id, {
          entitled_days: editForm.al_entitled,
          used_days: editForm.al_used,
          carried_forward: 0
        }));
      }

      // Update ML if balance_id exists
      if (editingEmployee.ml_balance_id) {
        updates.push(leaveApi.updateBalance(editingEmployee.ml_balance_id, {
          entitled_days: editForm.ml_entitled,
          used_days: editForm.ml_used,
          carried_forward: 0
        }));
      }

      // Update HL if balance_id exists
      if (editingEmployee.hl_balance_id) {
        updates.push(leaveApi.updateBalance(editingEmployee.hl_balance_id, {
          entitled_days: editForm.hl_entitled,
          used_days: editForm.hl_used,
          carried_forward: 0
        }));
      }

      await Promise.all(updates);
      setShowEditModal(false);
      fetchData();
    } catch (error) {
      console.error('Error saving balance:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // View unpaid leave details
  const handleViewUnpaid = async (emp) => {
    setUnpaidEmployee(emp);
    setShowUnpaidModal(true);
    setLoadingUnpaid(true);
    try {
      const res = await leaveApi.getUnpaidMonthly(emp.id, year);
      setUnpaidData(res.data);
    } catch (error) {
      console.error('Error fetching unpaid details:', error);
      setUnpaidData(null);
    } finally {
      setLoadingUnpaid(false);
    }
  };

  // Format balance display: available/entitled
  const formatBalance = (available, entitled) => {
    return `${available}/${entitled}`;
  };

  // Render table row
  const renderRow = (emp) => {
    const ulDays = parseFloat(emp.ul_days) || 0;
    const isNegativeUL = ulDays > 0;

    return (
      <tr key={emp.id}>
        <td>{emp.emp_code}</td>
        <td>{isMimix ? emp.outlet_name : emp.department_name}</td>
        <td className="name-col">{emp.name}</td>
        <td className="balance-cell">
          {formatBalance(emp.al_available, emp.al_entitled)}
        </td>
        <td className="balance-cell">
          {formatBalance(emp.ml_available, emp.ml_entitled)}
        </td>
        <td className="balance-cell">
          {formatBalance(emp.hl_available, emp.hl_entitled)}
        </td>
        <td className={`balance-cell ul-cell ${isNegativeUL ? 'negative' : ''}`}>
          {isNegativeUL ? (
            <span
              className="ul-value clickable"
              onClick={() => handleViewUnpaid(emp)}
            >
              -{ulDays}
            </span>
          ) : (
            <span>0</span>
          )}
        </td>
        <td className="actions-col">
          <button className="edit-btn" onClick={() => handleEdit(emp)} title="Edit balances">
            Edit
          </button>
        </td>
      </tr>
    );
  };

  // Generate year options
  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    yearOptions.push(y);
  }

  return (
    <Layout>
      <div className="leave-balances-page">
        <div className="page-header">
          <div>
            <h1>Leave Balance Management</h1>
            <p>View and manage employee leave balances</p>
          </div>
        </div>

        {/* Filters Row */}
        <div className="filters-row">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

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

          <input
            type="text"
            placeholder="Search by name or ID..."
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          />

          <button
            className={`group-toggle-btn ${groupByEnabled ? 'active' : ''}`}
            onClick={() => setGroupByEnabled(!groupByEnabled)}
          >
            {groupByEnabled ? 'Grouped View' : 'Flat View'}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : groupByEnabled ? (
          // Grouped View
          <div className="employees-grouped">
            {Object.entries(getEmployeesByGroup()).map(([groupKey, group]) => (
              <div
                key={groupKey}
                className={`employee-group ${group.group_type === 'outlet' ? 'outlet-group' : 'dept-group'}`}
              >
                <div className="group-header" onClick={() => toggleGroup(groupKey)}>
                  <div className="group-header-left">
                    <span className="collapse-icon">
                      {expandedGroups[groupKey] ? '▼' : '▶'}
                    </span>
                    <span className="group-name">{group.group_name}</span>
                    <span className="group-count">({group.employees.length} employees)</span>
                  </div>
                </div>
                {expandedGroups[groupKey] && (
                  <div className="leave-balances-table">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>{isMimix ? 'Outlet' : 'Dept'}</th>
                          <th>Name</th>
                          <th className="balance-header">AL</th>
                          <th className="balance-header">ML</th>
                          <th className="balance-header">HL</th>
                          <th className="balance-header">UL</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.employees.map(emp => renderRow(emp))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {Object.keys(getEmployeesByGroup()).length === 0 && (
              <div className="no-data-centered">No employees found</div>
            )}
          </div>
        ) : (
          // Flat View
          <div className="leave-balances-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{isMimix ? 'Outlet' : 'Dept'}</th>
                  <th>Name</th>
                  <th className="balance-header">AL</th>
                  <th className="balance-header">ML</th>
                  <th className="balance-header">HL</th>
                  <th className="balance-header">UL</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan="8" className="no-data">No employees found</td></tr>
                ) : (
                  employees.map(emp => renderRow(emp))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editingEmployee && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Leave Balances</h2>
              <p className="modal-subtitle">{editingEmployee.name} ({editingEmployee.emp_code})</p>

              <div className="balance-edit-section">
                <h3>Annual Leave (AL)</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Entitled Days</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.al_entitled}
                      onChange={(e) => setEditForm({ ...editForm, al_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Used Days</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.al_used}
                      onChange={(e) => setEditForm({ ...editForm, al_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Available</label>
                    <input
                      type="text"
                      value={editForm.al_entitled - editForm.al_used}
                      disabled
                      className="calculated-field"
                    />
                  </div>
                </div>
              </div>

              <div className="balance-edit-section">
                <h3>Medical Leave (ML)</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Entitled Days</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.ml_entitled}
                      onChange={(e) => setEditForm({ ...editForm, ml_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Used Days</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.ml_used}
                      onChange={(e) => setEditForm({ ...editForm, ml_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Available</label>
                    <input
                      type="text"
                      value={editForm.ml_entitled - editForm.ml_used}
                      disabled
                      className="calculated-field"
                    />
                  </div>
                </div>
              </div>

              <div className="balance-edit-section">
                <h3>Hospitalization Leave (HL)</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Entitled Days</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.hl_entitled}
                      onChange={(e) => setEditForm({ ...editForm, hl_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Used Days</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.hl_used}
                      onChange={(e) => setEditForm({ ...editForm, hl_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Available</label>
                    <input
                      type="text"
                      value={editForm.hl_entitled - editForm.hl_used}
                      disabled
                      className="calculated-field"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unpaid Leave Detail Modal */}
        {showUnpaidModal && unpaidEmployee && (
          <div className="modal-overlay" onClick={() => setShowUnpaidModal(false)}>
            <div className="modal unpaid-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Unpaid Leave Details</h2>
              <p className="modal-subtitle">{unpaidEmployee.name} ({unpaidEmployee.emp_code}) - {year}</p>

              {loadingUnpaid ? (
                <div className="loading">Loading...</div>
              ) : unpaidData ? (
                <>
                  <div className="unpaid-summary">
                    <span className="total-label">Total Unpaid Leave:</span>
                    <span className="total-value">{unpaidData.total_unpaid_days} days</span>
                  </div>

                  {unpaidData.monthly_breakdown.length === 0 ? (
                    <div className="no-unpaid">No unpaid leave records found</div>
                  ) : (
                    <div className="monthly-breakdown">
                      {unpaidData.monthly_breakdown.map(month => (
                        <div key={month.month} className="month-section">
                          <div className="month-header">
                            <span className="month-name">{month.month_name}</span>
                            <span className="month-total">{month.total_days} days</span>
                          </div>
                          <div className="month-requests">
                            {month.requests.map(req => (
                              <div key={req.id} className="request-item">
                                <div className="request-dates">
                                  {new Date(req.start_date).toLocaleDateString()}
                                  {req.start_date !== req.end_date && (
                                    <> - {new Date(req.end_date).toLocaleDateString()}</>
                                  )}
                                </div>
                                <div className="request-days">{req.total_days} day(s)</div>
                                {req.reason && (
                                  <div className="request-reason">{req.reason}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="error">Failed to load unpaid leave details</div>
              )}

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowUnpaidModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default LeaveBalances;
