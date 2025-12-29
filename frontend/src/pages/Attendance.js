import React, { useState, useEffect } from 'react';
import { attendanceApi, employeeApi, outletsApi } from '../api';
import './Attendance.css';

const Attendance = () => {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: '',
    outlet_id: '',
    employee_id: ''
  });
  const [editModal, setEditModal] = useState(null);

  const admin = JSON.parse(localStorage.getItem('admin') || '{}');
  const isSupervisor = admin.role === 'supervisor';

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [recordsRes, employeesRes, outletsRes] = await Promise.all([
        attendanceApi.getAll(filters),
        employeeApi.getAll(),
        outletsApi.getAll().catch(() => ({ data: [] }))
      ]);
      setRecords(recordsRes.data);
      setEmployees(employeesRes.data);
      setOutlets(outletsRes.data || []);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectRecord = (id) => {
    setSelectedRecords(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const pendingIds = records.filter(r => r.status === 'pending').map(r => r.id);
    if (selectedRecords.length === pendingIds.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(pendingIds);
    }
  };

  const handleApprove = async (id) => {
    try {
      await attendanceApi.approve(id);
      fetchData();
    } catch (error) {
      alert('Failed to approve');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    try {
      await attendanceApi.reject(id, reason);
      fetchData();
    } catch (error) {
      alert('Failed to reject');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedRecords.length === 0) {
      alert('Select records to approve');
      return;
    }
    try {
      await attendanceApi.bulkApprove(selectedRecords);
      setSelectedRecords([]);
      fetchData();
    } catch (error) {
      alert('Failed to bulk approve');
    }
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time.substring(0, 5); // HH:MM
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'status-pending',
      approved: 'status-approved',
      rejected: 'status-rejected'
    };
    return badges[status] || 'status-pending';
  };

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const pendingCount = records.filter(r => r.status === 'pending').length;

  return (
    <div className="attendance-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Attendance Management</h1>
          <p>View and approve employee clock-in records</p>
        </div>
        {pendingCount > 0 && (
          <div className="pending-badge">
            {pendingCount} Pending
          </div>
        )}
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label>Month</label>
          <select name="month" value={filters.month} onChange={handleFilterChange}>
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Year</label>
          <select name="year" value={filters.year} onChange={handleFilterChange}>
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {!isSupervisor && outlets.length > 0 && (
          <div className="filter-group">
            <label>Outlet</label>
            <select name="outlet_id" value={filters.outlet_id} onChange={handleFilterChange}>
              <option value="">All Outlets</option>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="filter-group">
          <label>Employee</label>
          <select name="employee_id" value={filters.employee_id} onChange={handleFilterChange}>
            <option value="">All Employees</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {selectedRecords.length > 0 && (
          <button className="bulk-approve-btn" onClick={handleBulkApprove}>
            Approve Selected ({selectedRecords.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedRecords.length > 0 &&
                      selectedRecords.length === records.filter(r => r.status === 'pending').length}
                  />
                </th>
                <th>Date</th>
                <th>Employee</th>
                {!isSupervisor && <th>Outlet</th>}
                <th className="time-col">Clock In 1<br/><small>Start Work</small></th>
                <th className="time-col">Clock Out 1<br/><small>Break</small></th>
                <th className="time-col">Clock In 2<br/><small>Return</small></th>
                <th className="time-col">Clock Out 2<br/><small>End Work</small></th>
                <th>Total Hours</th>
                <th>OT Hours</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={isSupervisor ? 11 : 12} className="no-data">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                records.map(record => (
                  <tr key={record.id} className={selectedRecords.includes(record.id) ? 'selected' : ''}>
                    <td className="checkbox-col">
                      {record.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedRecords.includes(record.id)}
                          onChange={() => handleSelectRecord(record.id)}
                        />
                      )}
                    </td>
                    <td><strong>{formatDate(record.work_date)}</strong></td>
                    <td>
                      <div className="employee-info">
                        <span className="emp-name">{record.employee_name}</span>
                        <span className="emp-code">{record.emp_code}</span>
                      </div>
                    </td>
                    {!isSupervisor && <td>{record.outlet_name || '-'}</td>}
                    <td className="time-cell">
                      {formatTime(record.clock_in_1)}
                      {record.location_in_1 && <span className="has-location" title="Has GPS">📍</span>}
                    </td>
                    <td className="time-cell">{formatTime(record.clock_out_1)}</td>
                    <td className="time-cell">{formatTime(record.clock_in_2)}</td>
                    <td className="time-cell">
                      {formatTime(record.clock_out_2)}
                      {record.location_out_2 && <span className="has-location" title="Has GPS">📍</span>}
                    </td>
                    <td className="hours-cell">
                      {record.total_hours ? `${parseFloat(record.total_hours).toFixed(1)}h` : '-'}
                    </td>
                    <td className="hours-cell ot">
                      {record.ot_hours > 0 ? `${parseFloat(record.ot_hours).toFixed(1)}h` : '-'}
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusBadge(record.status)}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      {record.status === 'pending' ? (
                        <>
                          <button
                            className="approve-btn"
                            onClick={() => handleApprove(record.id)}
                            title="Approve"
                          >
                            ✓
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() => handleReject(record.id)}
                            title="Reject"
                          >
                            ✗
                          </button>
                        </>
                      ) : (
                        <span className="approved-by">
                          {record.approved_by_name && `by ${record.approved_by_name}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="attendance-legend">
        <div className="legend-item">
          <span className="legend-icon">📍</span>
          <span>GPS location recorded</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">Standard hours:</span>
          <span className="legend-value">8.5 hours</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">OT calculation:</span>
          <span className="legend-value">Hours above 8.5h</span>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
