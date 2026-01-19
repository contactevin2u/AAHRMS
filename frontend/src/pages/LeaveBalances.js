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

  // Format number - remove unnecessary decimals
  const formatNum = (num) => {
    const n = parseFloat(num) || 0;
    return Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, '');
  };

  // Format balance display: available/entitled
  const formatBalance = (available, entitled) => {
    return `${formatNum(available)}/${formatNum(entitled)}`;
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
            {groupByEnabled ? 'Grouped' : 'Flat'}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : groupByEnabled ? (
          // Grouped View
          <div className="leave-groups">
            {Object.entries(getEmployeesByGroup()).map(([groupKey, group]) => (
              <div
                key={groupKey}
                className={`leave-group ${group.group_type === 'outlet' ? 'outlet-group' : 'dept-group'}`}
              >
                <div className="group-header" onClick={() => toggleGroup(groupKey)}>
                  <span className="collapse-icon">
                    {expandedGroups[groupKey] ? '▼' : '▶'}
                  </span>
                  <span className="group-name">{group.group_name}</span>
                  <span className="group-count">({group.employees.length} employees)</span>
                </div>
                {expandedGroups[groupKey] && (
                  <div className="table-wrapper">
                    <table className="balance-table grouped">
                      <thead>
                        <tr>
                          <th className="col-id">ID</th>
                          <th className="col-name">Name</th>
                          <th className="col-balance">AL</th>
                          <th className="col-balance">ML</th>
                          <th className="col-balance">HL</th>
                          <th className="col-balance">UL</th>
                          <th className="col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.employees.map(emp => {
                          const ulDays = parseFloat(emp.ul_days) || 0;
                          const isNegativeUL = ulDays > 0;
                          return (
                            <tr key={emp.id}>
                              <td className="col-id">{emp.emp_code}</td>
                              <td className="col-name">{emp.name}</td>
                              <td className="balance-cell al">{formatBalance(emp.al_available, emp.al_entitled)}</td>
                              <td className="balance-cell ml">{formatBalance(emp.ml_available, emp.ml_entitled)}</td>
                              <td className="balance-cell hl">{formatBalance(emp.hl_available, emp.hl_entitled)}</td>
                              <td className={`balance-cell ul ${isNegativeUL ? 'negative' : ''}`}>
                                {isNegativeUL ? (
                                  <span className="clickable" onClick={() => handleViewUnpaid(emp)}>
                                    -{formatNum(ulDays)}
                                  </span>
                                ) : '0'}
                              </td>
                              <td className="col-actions">
                                <button className="edit-btn" onClick={() => handleEdit(emp)}>Edit</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {Object.keys(getEmployeesByGroup()).length === 0 && (
              <div className="no-data">No employees found</div>
            )}
          </div>
        ) : (
          // Flat View
          <div className="table-wrapper">
            <table className="balance-table">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-dept">Dept/Outlet</th>
                  <th className="col-name">Name</th>
                  <th className="col-balance">AL</th>
                  <th className="col-balance">ML</th>
                  <th className="col-balance">HL</th>
                  <th className="col-balance">UL</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan="8" className="no-data">No employees found</td></tr>
                ) : (
                  employees.map(emp => {
                    const ulDays = parseFloat(emp.ul_days) || 0;
                    const isNegativeUL = ulDays > 0;
                    return (
                      <tr key={emp.id}>
                        <td className="col-id">{emp.emp_code}</td>
                        <td className="col-dept">{emp.department_name || emp.outlet_name || '-'}</td>
                        <td className="col-name">{emp.name}</td>
                        <td className="balance-cell al">{formatBalance(emp.al_available, emp.al_entitled)}</td>
                        <td className="balance-cell ml">{formatBalance(emp.ml_available, emp.ml_entitled)}</td>
                        <td className="balance-cell hl">{formatBalance(emp.hl_available, emp.hl_entitled)}</td>
                        <td className={`balance-cell ul ${isNegativeUL ? 'negative' : ''}`}>
                          {isNegativeUL ? (
                            <span className="clickable" onClick={() => handleViewUnpaid(emp)}>
                              -{formatNum(ulDays)}
                            </span>
                          ) : '0'}
                        </td>
                        <td className="col-actions">
                          <button className="edit-btn" onClick={() => handleEdit(emp)}>Edit</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editingEmployee && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Leave Balances</h2>
              <p className="modal-subtitle">{editingEmployee.name} ({editingEmployee.emp_code})</p>

              <div className="edit-section">
                <h3>Annual Leave (AL)</h3>
                <div className="edit-row">
                  <div className="edit-field">
                    <label>Entitled</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.al_entitled}
                      onChange={(e) => setEditForm({ ...editForm, al_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Used</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.al_used}
                      onChange={(e) => setEditForm({ ...editForm, al_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Available</label>
                    <input type="text" value={formatNum(editForm.al_entitled - editForm.al_used)} disabled />
                  </div>
                </div>
              </div>

              <div className="edit-section">
                <h3>Medical Leave (ML)</h3>
                <div className="edit-row">
                  <div className="edit-field">
                    <label>Entitled</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.ml_entitled}
                      onChange={(e) => setEditForm({ ...editForm, ml_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Used</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.ml_used}
                      onChange={(e) => setEditForm({ ...editForm, ml_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Available</label>
                    <input type="text" value={formatNum(editForm.ml_entitled - editForm.ml_used)} disabled />
                  </div>
                </div>
              </div>

              <div className="edit-section">
                <h3>Hospitalization Leave (HL)</h3>
                <div className="edit-row">
                  <div className="edit-field">
                    <label>Entitled</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.hl_entitled}
                      onChange={(e) => setEditForm({ ...editForm, hl_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Used</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.hl_used}
                      onChange={(e) => setEditForm({ ...editForm, hl_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Available</label>
                    <input type="text" value={formatNum(editForm.hl_entitled - editForm.hl_used)} disabled />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="save-btn" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unpaid Leave Detail Modal */}
        {showUnpaidModal && unpaidEmployee && (
          <div className="modal-overlay" onClick={() => setShowUnpaidModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Unpaid Leave Details</h2>
              <p className="modal-subtitle">{unpaidEmployee.name} - {year}</p>

              {loadingUnpaid ? (
                <div className="loading">Loading...</div>
              ) : unpaidData ? (
                <>
                  <div className="unpaid-total">
                    Total: <strong>{formatNum(unpaidData.total_unpaid_days)} days</strong>
                  </div>

                  {unpaidData.monthly_breakdown.length === 0 ? (
                    <div className="no-data">No unpaid leave records</div>
                  ) : (
                    <div className="unpaid-list">
                      {unpaidData.monthly_breakdown.map(month => (
                        <div key={month.month} className="unpaid-month">
                          <div className="month-header">
                            <span>{month.month_name}</span>
                            <span className="month-days">{formatNum(month.total_days)} days</span>
                          </div>
                          {month.requests.map(req => (
                            <div key={req.id} className="unpaid-item">
                              <span className="dates">
                                {new Date(req.start_date).toLocaleDateString()}
                                {req.start_date !== req.end_date && ` - ${new Date(req.end_date).toLocaleDateString()}`}
                              </span>
                              <span className="days">{formatNum(req.total_days)}d</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="error">Failed to load data</div>
              )}

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowUnpaidModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default LeaveBalances;
