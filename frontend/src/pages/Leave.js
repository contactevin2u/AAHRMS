import React, { useState, useEffect } from 'react';
import { leaveApi, employeeApi, outletsApi, departmentApi } from '../api';
import Layout from '../components/Layout';
import './Leave.css';

function Leave({ departmentId: propDeptId, embedded = false }) {
  const isDeptLocked = !!propDeptId;
  const [activeTab, setActiveTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState({});

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

  // Grouping for balances table
  const [groupByEnabled, setGroupByEnabled] = useState(true);
  const [balanceSearch, setBalanceSearch] = useState('');

  // Edit balance modal (table style)
  const [showEditBalanceModal, setShowEditBalanceModal] = useState(false);
  const [editingBalance, setEditingBalance] = useState(null);
  const [editBalanceForm, setEditBalanceForm] = useState({
    al_entitled: 0, al_used: 0,
    ml_entitled: 0, ml_used: 0,
    hl_entitled: 0, hl_used: 0
  });
  const [savingBalance, setSavingBalance] = useState(false);

  // Unpaid leave detail modal
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);
  const [unpaidEmployee, setUnpaidEmployee] = useState(null);
  const [unpaidData, setUnpaidData] = useState(null);
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);

  // Filters
  const [filter, setFilter] = useState({
    employee_id: '',
    status: '',
    leave_type_id: '',
    outlet_id: '',
    department_id: propDeptId || '',
    year: new Date().getFullYear()
  });

  // Modals
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Forms
  const [requestForm, setRequestForm] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: ''
  });

  const [balanceForm, setBalanceForm] = useState({
    leave_type_id: '',
    entitled_days: 0
  });

  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '',
    is_recurring: false
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchRequests();
    } else if (activeTab === 'balances') {
      fetchBalances();
    } else if (activeTab === 'holidays') {
      fetchHolidays();
    }
  }, [activeTab, filter, balanceSearch]);

  const fetchInitialData = async () => {
    try {
      const empParams = { status: 'active' };
      if (propDeptId) empParams.department_id = propDeptId;
      const [typesRes, empRes, countRes, outletsRes, deptsRes] = await Promise.all([
        leaveApi.getTypes(),
        employeeApi.getAll(empParams),
        leaveApi.getPendingCount(),
        outletsApi.getAll().catch(() => ({ data: [] })),
        departmentApi.getAll().catch(() => ({ data: [] }))
      ]);
      setLeaveTypes(typesRes.data);
      setEmployees(empRes.data);
      setPendingCount(countRes.data.count);
      setOutlets(outletsRes.data || []);
      setDepartments(deptsRes.data || []);
      // Collapse all groups by default - click to expand
      setExpandedGroups({});
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await leaveApi.getRequests(filter);
      setRequests(res.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const params = { year: filter.year, search: balanceSearch };
      if (filter.outlet_id) params.outlet_id = filter.outlet_id;
      if (filter.department_id) params.department_id = filter.department_id;
      const res = await leaveApi.getBalancesTable(params);
      setBalances(res.data.employees || []);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group balances by outlet or department (table style from LeaveBalances)
  const getBalancesByGroup = () => {
    const grouped = {};
    balances.forEach(emp => {
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

  // Format number - remove unnecessary decimals
  const formatNum = (num) => {
    const n = parseFloat(num) || 0;
    return Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, '');
  };

  // Format balance display: available/entitled
  const formatBalance = (available, entitled) => {
    return `${formatNum(available)}/${formatNum(entitled)}`;
  };

  // Edit balance handler (table style)
  const handleEditBalance = (emp) => {
    setEditingBalance(emp);
    setEditBalanceForm({
      al_entitled: emp.al_entitled || 0,
      al_used: emp.al_used || 0,
      ml_entitled: emp.ml_entitled || 0,
      ml_used: emp.ml_used || 0,
      hl_entitled: emp.hl_entitled || 0,
      hl_used: emp.hl_used || 0
    });
    setShowEditBalanceModal(true);
  };

  const handleSaveBalanceEdit = async () => {
    if (!editingBalance) return;
    setSavingBalance(true);
    try {
      const updates = [];
      if (editingBalance.al_balance_id) {
        updates.push(leaveApi.updateBalance(editingBalance.al_balance_id, {
          entitled_days: editBalanceForm.al_entitled,
          used_days: editBalanceForm.al_used,
          carried_forward: 0
        }));
      }
      if (editingBalance.ml_balance_id) {
        updates.push(leaveApi.updateBalance(editingBalance.ml_balance_id, {
          entitled_days: editBalanceForm.ml_entitled,
          used_days: editBalanceForm.ml_used,
          carried_forward: 0
        }));
      }
      if (editingBalance.hl_balance_id) {
        updates.push(leaveApi.updateBalance(editingBalance.hl_balance_id, {
          entitled_days: editBalanceForm.hl_entitled,
          used_days: editBalanceForm.hl_used,
          carried_forward: 0
        }));
      }
      await Promise.all(updates);
      setShowEditBalanceModal(false);
      fetchBalances();
    } catch (error) {
      console.error('Error saving balance:', error);
      alert('Failed to save changes');
    } finally {
      setSavingBalance(false);
    }
  };

  // View unpaid leave details
  const handleViewUnpaid = async (emp) => {
    setUnpaidEmployee(emp);
    setShowUnpaidModal(true);
    setLoadingUnpaid(true);
    try {
      const res = await leaveApi.getUnpaidMonthly(emp.id, filter.year);
      setUnpaidData(res.data);
    } catch (error) {
      console.error('Error fetching unpaid details:', error);
      setUnpaidData(null);
    } finally {
      setLoadingUnpaid(false);
    }
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await leaveApi.getHolidays({ year: filter.year });
      setHolidays(res.data);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    try {
      await leaveApi.createRequest(requestForm);
      setShowRequestModal(false);
      setRequestForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' });
      fetchRequests();
      fetchInitialData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create leave request');
    }
  };

  const handleApprove = async (id) => {
    if (window.confirm('Approve this leave request?')) {
      try {
        await leaveApi.approveRequest(id);
        fetchRequests();
        fetchBalances(); // Refresh balances after approval (deducts from entitlement)
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to approve request');
      }
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Enter rejection reason:');
    if (reason) {
      try {
        await leaveApi.rejectRequest(id, { rejection_reason: reason });
        fetchRequests();
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to reject request');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this leave request?\n\n⚠️ This action cannot be undone.')) {
      try {
        await leaveApi.deleteRequest(id);
        fetchRequests();
        fetchInitialData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete request');
      }
    }
  };

  const handleInitializeBalance = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await leaveApi.initializeBalances(selectedEmployee.id, {
        year: filter.year,
        balances: [balanceForm]
      });
      setShowBalanceModal(false);
      setBalanceForm({ leave_type_id: '', entitled_days: 0 });
      setSelectedEmployee(null);
      fetchBalances();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to initialize balance');
    }
  };

  const handleCreateHoliday = async (e) => {
    e.preventDefault();
    try {
      await leaveApi.createHoliday(holidayForm);
      setShowHolidayModal(false);
      setHolidayForm({ name: '', date: '', is_recurring: false });
      fetchHolidays();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create holiday');
    }
  };

  const handleDeleteHoliday = async (id) => {
    if (window.confirm('Delete this holiday?\n\n⚠️ This action cannot be undone.')) {
      try {
        await leaveApi.deleteHoliday(id);
        fetchHolidays();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete holiday');
      }
    }
  };

  const handleInitializeAllBalances = async () => {
    if (!window.confirm(`Initialize leave balances for all employees for year ${filter.year}?\n\nThis will create leave balances for employees who don't have them yet.`)) {
      return;
    }
    try {
      setLoading(true);
      const res = await leaveApi.initializeAllBalances({ year: filter.year });
      alert(`Initialization complete!\n\nInitialized: ${res.data.initialized}\nSkipped (already exists): ${res.data.skipped}\nFailed: ${res.data.failed}`);
      fetchBalances();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to initialize balances');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const classes = {
      pending: 'status-badge pending',
      approved: 'status-badge approved',
      rejected: 'status-badge rejected',
      cancelled: 'status-badge cancelled'
    };
    return <span className={classes[status] || 'status-badge'}>{status}</span>;
  };

  // Get pending requests for the alert card
  const pendingRequests = requests.filter(r => r.status === 'pending');

  const content = (
      <div className="leave-page">
        <header className="page-header">
          <div>
            <h1>Leave Management</h1>
            <p>Manage employee leave requests and balances</p>
          </div>
          <div className="header-actions">
            <button onClick={() => setShowRequestModal(true)} className="add-btn">
              + New Request
            </button>
          </div>
        </header>

        {/* Pending Requests Alert Card */}
        {pendingCount > 0 && (
          <div className="pending-alert-card">
            <div className="pending-alert-header">
              <div className="pending-alert-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="pending-alert-text">
                <strong>{pendingCount} Leave Request{pendingCount > 1 ? 's' : ''} Pending Approval</strong>
                <span>Review and approve/reject these requests</span>
              </div>
              <button
                className="view-pending-btn"
                onClick={() => {
                  setActiveTab('requests');
                  setFilter({ ...filter, status: 'pending' });
                }}
              >
                View All Pending
              </button>
            </div>
            {pendingRequests.length > 0 && activeTab !== 'requests' && (
              <div className="pending-preview-list">
                {pendingRequests.slice(0, 3).map(req => (
                  <div key={req.id} className="pending-preview-item">
                    <div className="pending-preview-info">
                      <span className="pending-preview-name">
                        {req.employee_name}
                        <span className="pending-preview-dept"> ({req.emp_code}) - {isMimix ? req.outlet_name : req.department_name}</span>
                      </span>
                      <span className="pending-preview-detail">
                        {req.leave_type_name} • {formatDate(req.start_date)} - {formatDate(req.end_date)} ({req.total_days} days)
                      </span>
                    </div>
                    <div className="pending-preview-actions">
                      <button onClick={() => handleApprove(req.id)} className="btn-approve-sm" title="Approve">✓</button>
                      <button onClick={() => handleReject(req.id)} className="btn-reject-sm" title="Reject">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Leave Requests
          </button>
          <button
            className={`tab ${activeTab === 'balances' ? 'active' : ''}`}
            onClick={() => setActiveTab('balances')}
          >
            Leave Balances
          </button>
          <button
            className={`tab ${activeTab === 'holidays' ? 'active' : ''}`}
            onClick={() => setActiveTab('holidays')}
          >
            Public Holidays
          </button>
        </div>

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <>
            <div className="filters-row">
              <select
                value={filter.employee_id}
                onChange={(e) => setFilter({ ...filter, employee_id: e.target.value })}
              >
                <option value="">All Employees</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={filter.leave_type_id}
                onChange={(e) => setFilter({ ...filter, leave_type_id: e.target.value })}
              >
                <option value="">All Types</option>
                {leaveTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Leave Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="no-data">No leave requests found</td>
                      </tr>
                    ) : (
                      requests.map(req => (
                        <tr key={req.id}>
                          <td>
                            <strong>{req.employee_name}</strong>
                            <div className="employee-sub-info">
                              {req.emp_code} • {isMimix ? req.outlet_name : req.department_name}
                            </div>
                          </td>
                          <td>
                            <span className={`leave-type ${req.is_paid ? 'paid' : 'unpaid'}`}>
                              {req.leave_type_name}
                            </span>
                          </td>
                          <td>{formatDate(req.start_date)}</td>
                          <td>{formatDate(req.end_date)}</td>
                          <td>{req.total_days}</td>
                          <td>{getStatusBadge(req.status)}</td>
                          <td className="reason-cell">{req.reason || '-'}</td>
                          <td>
                            <div className="action-buttons">
                              {req.status === 'pending' && (
                                <>
                                  <button onClick={() => handleApprove(req.id)} className="action-btn approve" title="Approve">✓</button>
                                  <button onClick={() => handleReject(req.id)} className="action-btn reject" title="Reject">✕</button>
                                </>
                              )}
                              {/* Delete button - Testing mode, shows for all statuses */}
                              {/* TODO: Remove after real data starts */}
                              <button onClick={() => handleDelete(req.id)} className="action-btn delete" title="Delete">🗑</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Balances Tab - Table Layout */}
        {activeTab === 'balances' && (
          <>
            <div className="filters-row">
              <select
                value={filter.year}
                onChange={(e) => setFilter({ ...filter, year: parseInt(e.target.value) })}
              >
                {[2023, 2024, 2025, 2026, 2027].map(y => (
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
              ) : !isDeptLocked ? (
                <select
                  value={filter.department_id}
                  onChange={(e) => setFilter({ ...filter, department_id: e.target.value })}
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : null}
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={balanceSearch}
                onChange={(e) => setBalanceSearch(e.target.value)}
                className="search-input"
              />
              <button
                className={`group-toggle-btn ${groupByEnabled ? 'active' : ''}`}
                onClick={() => setGroupByEnabled(!groupByEnabled)}
              >
                {groupByEnabled ? 'Grouped' : 'Flat'}
              </button>
              <button onClick={handleInitializeAllBalances} className="add-btn">
                Initialize All
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading...</div>
            ) : groupByEnabled ? (
              // Grouped View
              <div className="leave-groups">
                {Object.entries(getBalancesByGroup()).map(([groupKey, group]) => (
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
                                    <button className="edit-btn" onClick={() => handleEditBalance(emp)}>Edit</button>
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
                {Object.keys(getBalancesByGroup()).length === 0 && (
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
                    {balances.length === 0 ? (
                      <tr><td colSpan="8" className="no-data">No employees found</td></tr>
                    ) : (
                      balances.map(emp => {
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
                              <button className="edit-btn" onClick={() => handleEditBalance(emp)}>Edit</button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Holidays Tab */}
        {activeTab === 'holidays' && (
          <>
            <div className="filters-row">
              <select
                value={filter.year}
                onChange={(e) => setFilter({ ...filter, year: parseInt(e.target.value) })}
              >
                {[2023, 2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button onClick={() => setShowHolidayModal(true)} className="add-btn small">
                + Add Holiday
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Holiday Name</th>
                      <th>Recurring</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="no-data">No public holidays found</td>
                      </tr>
                    ) : (
                      holidays.map(h => (
                        <tr key={h.id}>
                          <td><strong>{formatDate(h.date)}</strong></td>
                          <td>{h.name}</td>
                          <td>{h.is_recurring ? 'Yes' : 'No'}</td>
                          <td>
                            <div className="action-buttons">
                              <button onClick={() => handleDeleteHoliday(h.id)} className="action-btn delete" title="Delete">🗑</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* New Request Modal */}
        {showRequestModal && (
          <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>New Leave Request</h2>
              <form onSubmit={handleCreateRequest}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={requestForm.employee_id}
                    onChange={(e) => setRequestForm({ ...requestForm, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Leave Type *</label>
                  <select
                    value={requestForm.leave_type_id}
                    onChange={(e) => setRequestForm({ ...requestForm, leave_type_id: e.target.value })}
                    required
                  >
                    <option value="">Select leave type</option>
                    {leaveTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name} {type.is_paid ? '(Paid)' : '(Unpaid)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      value={requestForm.start_date}
                      onChange={(e) => setRequestForm({ ...requestForm, start_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date *</label>
                    <input
                      type="date"
                      value={requestForm.end_date}
                      onChange={(e) => setRequestForm({ ...requestForm, end_date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason</label>
                  <textarea
                    value={requestForm.reason}
                    onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                    rows="3"
                    placeholder="Optional reason for leave"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowRequestModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Submit Request</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Balance Modal */}
        {showBalanceModal && selectedEmployee && (
          <div className="modal-overlay" onClick={() => setShowBalanceModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add Leave Balance</h2>
              <p className="modal-subtitle">For: <strong>{selectedEmployee.name}</strong></p>
              <form onSubmit={handleInitializeBalance}>
                <div className="form-group">
                  <label>Leave Type *</label>
                  <select
                    value={balanceForm.leave_type_id}
                    onChange={(e) => setBalanceForm({ ...balanceForm, leave_type_id: e.target.value })}
                    required
                  >
                    <option value="">Select leave type</option>
                    {leaveTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Entitled Days *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={balanceForm.entitled_days}
                    onChange={(e) => setBalanceForm({ ...balanceForm, entitled_days: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowBalanceModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Save Balance</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Holiday Modal */}
        {showHolidayModal && (
          <div className="modal-overlay" onClick={() => setShowHolidayModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add Public Holiday</h2>
              <form onSubmit={handleCreateHoliday}>
                <div className="form-group">
                  <label>Holiday Name *</label>
                  <input
                    type="text"
                    value={holidayForm.name}
                    onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                    placeholder="e.g. Chinese New Year"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={holidayForm.is_recurring}
                      onChange={(e) => setHolidayForm({ ...holidayForm, is_recurring: e.target.checked })}
                    />
                    <span>Recurring every year</span>
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowHolidayModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Add Holiday</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Balance Modal (Table Style) */}
        {showEditBalanceModal && editingBalance && (
          <div className="modal-overlay" onClick={() => setShowEditBalanceModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Leave Balances</h2>
              <p className="modal-subtitle">{editingBalance.name} ({editingBalance.emp_code})</p>

              <div className="edit-section">
                <h3>Annual Leave (AL)</h3>
                <div className="edit-row">
                  <div className="edit-field">
                    <label>Entitled</label>
                    <input
                      type="number"
                      min="0"
                      value={editBalanceForm.al_entitled}
                      onChange={(e) => setEditBalanceForm({ ...editBalanceForm, al_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Used</label>
                    <input
                      type="number"
                      min="0"
                      value={editBalanceForm.al_used}
                      onChange={(e) => setEditBalanceForm({ ...editBalanceForm, al_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Available</label>
                    <input type="text" value={formatNum(editBalanceForm.al_entitled - editBalanceForm.al_used)} disabled />
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
                      value={editBalanceForm.ml_entitled}
                      onChange={(e) => setEditBalanceForm({ ...editBalanceForm, ml_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Used</label>
                    <input
                      type="number"
                      min="0"
                      value={editBalanceForm.ml_used}
                      onChange={(e) => setEditBalanceForm({ ...editBalanceForm, ml_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Available</label>
                    <input type="text" value={formatNum(editBalanceForm.ml_entitled - editBalanceForm.ml_used)} disabled />
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
                      value={editBalanceForm.hl_entitled}
                      onChange={(e) => setEditBalanceForm({ ...editBalanceForm, hl_entitled: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Used</label>
                    <input
                      type="number"
                      min="0"
                      value={editBalanceForm.hl_used}
                      onChange={(e) => setEditBalanceForm({ ...editBalanceForm, hl_used: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="edit-field">
                    <label>Available</label>
                    <input type="text" value={formatNum(editBalanceForm.hl_entitled - editBalanceForm.hl_used)} disabled />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowEditBalanceModal(false)}>Cancel</button>
                <button className="save-btn" onClick={handleSaveBalanceEdit} disabled={savingBalance}>
                  {savingBalance ? 'Saving...' : 'Save'}
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
              <p className="modal-subtitle">{unpaidEmployee.name} - {filter.year}</p>

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
  );

  return embedded ? content : <Layout>{content}</Layout>;
}

export default Leave;
