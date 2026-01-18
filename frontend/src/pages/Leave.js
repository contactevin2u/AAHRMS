import React, { useState, useEffect } from 'react';
import { leaveApi, employeeApi } from '../api';
import Layout from '../components/Layout';
import './Leave.css';

function Leave() {
  const [activeTab, setActiveTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Filters
  const [filter, setFilter] = useState({
    employee_id: '',
    status: '',
    leave_type_id: '',
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
  }, [activeTab, filter]);

  const fetchInitialData = async () => {
    try {
      const [typesRes, empRes, countRes] = await Promise.all([
        leaveApi.getTypes(),
        employeeApi.getAll({ status: 'active' }),
        leaveApi.getPendingCount()
      ]);
      setLeaveTypes(typesRes.data);
      setEmployees(empRes.data);
      setPendingCount(countRes.data.count);
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
      const res = await leaveApi.getBalances({ year: filter.year });
      setBalances(res.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
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
    if (window.confirm('Delete this leave request?')) {
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
    if (window.confirm('Delete this holiday?')) {
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

  return (
    <Layout>
      <div className="leave-page">
        <header className="page-header">
          <div>
            <h1>Leave Management</h1>
            <p>Manage employee leave requests and balances</p>
          </div>
          <div className="header-actions">
            {pendingCount > 0 && (
              <span className="pending-badge">{pendingCount} Pending</span>
            )}
            <button onClick={() => setShowRequestModal(true)} className="add-btn">
              + New Request
            </button>
          </div>
        </header>

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
                          <td><strong>{req.employee_name}</strong></td>
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
                            {req.status === 'pending' && (
                              <>
                                <button onClick={() => handleApprove(req.id)} className="action-btn approve">Approve</button>
                                <button onClick={() => handleReject(req.id)} className="action-btn reject">Reject</button>
                              </>
                            )}
                            {/* Delete button - Testing mode, shows for all statuses */}
                            {/* TODO: Remove after real data starts */}
                            <button onClick={() => handleDelete(req.id)} className="action-btn delete">Delete</button>
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

        {/* Balances Tab */}
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
              <button onClick={handleInitializeAllBalances} className="add-btn">
                Initialize All Balances
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="balance-cards">
                {employees.map(emp => {
                  const empBalances = balances.filter(b => b.employee_id === emp.id);
                  return (
                    <div key={emp.id} className="balance-card">
                      <div className="balance-card-header">
                        <h3>{emp.name}</h3>
                        <span className="emp-code">{emp.employee_id}</span>
                      </div>
                      <div className="balance-items">
                        {leaveTypes.map(type => {
                          const balance = empBalances.find(b => b.leave_type_id === type.id);
                          return (
                            <div key={type.id} className="balance-item">
                              <span className="balance-type">{type.code}</span>
                              <span className="balance-value">
                                {balance ? (
                                  <>{balance.used_days} / {balance.entitled_days}</>
                                ) : (
                                  <span className="not-init">-</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        className="init-btn"
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setShowBalanceModal(true);
                        }}
                      >
                        + Add Balance
                      </button>
                    </div>
                  );
                })}
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
                            <button onClick={() => handleDeleteHoliday(h.id)} className="action-btn delete">
                              Delete
                            </button>
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
      </div>
    </Layout>
  );
}

export default Leave;
