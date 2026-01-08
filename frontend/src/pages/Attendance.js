import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { attendanceApi, employeeApi, outletsApi, departmentApi } from '../api';
import { toast } from 'react-toastify';
import './Attendance.css';

const Attendance = () => {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: '',
    outlet_id: '',
    department_id: '',
    employee_id: ''
  });
  const [gpsModal, setGpsModal] = useState(null);
  const [photoModal, setPhotoModal] = useState(null);

  // Manual attendance modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: '',
    work_date: new Date().toISOString().split('T')[0],
    total_work_hours: '',
    ot_hours: '',
    notes: ''
  });

  // Inline editing state
  const [editingCell, setEditingCell] = useState(null); // { recordId, field }
  const [editValue, setEditValue] = useState('');

  const admin = JSON.parse(localStorage.getItem('admin') || '{}');
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isSupervisor = admin.role === 'supervisor';
  const isAAAlive = adminInfo.company_id === 1;

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [recordsRes, employeesRes, outletsRes, departmentsRes] = await Promise.all([
        attendanceApi.getAll(filters),
        employeeApi.getAll(),
        outletsApi.getAll().catch(() => ({ data: [] })),
        departmentApi.getAll().catch(() => ({ data: [] }))
      ]);
      setRecords(recordsRes.data);
      setEmployees(employeesRes.data);
      setOutlets(outletsRes.data || []);
      setDepartments(departmentsRes.data || []);
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
      toast.success('Attendance approved');
      fetchData();
    } catch (error) {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    try {
      await attendanceApi.reject(id, reason);
      toast.success('Attendance rejected');
      fetchData();
    } catch (error) {
      toast.error('Failed to reject');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this attendance record? This action cannot be undone.')) {
      try {
        await attendanceApi.delete(id);
        toast.success('Record deleted');
        fetchData();
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to delete');
      }
    }
  };

  const handleBulkApprove = async () => {
    if (selectedRecords.length === 0) {
      toast.warning('Select records to approve');
      return;
    }
    try {
      await attendanceApi.bulkApprove(selectedRecords);
      setSelectedRecords([]);
      toast.success(`Approved ${selectedRecords.length} records`);
      fetchData();
    } catch (error) {
      toast.error('Failed to bulk approve');
    }
  };

  // Handle manual attendance creation
  const handleCreateManual = async (e) => {
    e.preventDefault();
    try {
      await attendanceApi.createManual(manualForm);
      toast.success('Manual attendance created and approved');
      setShowManualModal(false);
      setManualForm({
        employee_id: '',
        work_date: new Date().toISOString().split('T')[0],
        total_work_hours: '',
        ot_hours: '',
        notes: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create manual attendance');
    }
  };

  // Start inline edit
  const startEdit = (recordId, field, currentValue) => {
    setEditingCell({ recordId, field });
    setEditValue(currentValue?.toString() || '');
  };

  // Save inline edit
  const saveEdit = async () => {
    if (!editingCell) return;

    try {
      const data = { [editingCell.field]: parseFloat(editValue) || 0 };
      await attendanceApi.editHours(editingCell.recordId, data);
      toast.success('Hours updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update hours');
    }
    setEditingCell(null);
    setEditValue('');
  };

  // Cancel inline edit
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Check if cell is being edited
  const isEditing = (recordId, field) => {
    return editingCell?.recordId === recordId && editingCell?.field === field;
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time.substring(0, 5);
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

  const parseLocation = (locationStr) => {
    if (!locationStr) return null;
    try {
      if (typeof locationStr === 'string' && locationStr.includes(',')) {
        const [lat, lng] = locationStr.split(',').map(s => parseFloat(s.trim()));
        return { lat, lng };
      }
      if (typeof locationStr === 'object') {
        return { lat: locationStr.lat || locationStr.latitude, lng: locationStr.lng || locationStr.longitude };
      }
      const parsed = JSON.parse(locationStr);
      return { lat: parsed.lat || parsed.latitude, lng: parsed.lng || parsed.longitude };
    } catch {
      return null;
    }
  };

  const openInMaps = (coords) => {
    if (!coords) return;
    window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`, '_blank');
  };

  const showGpsDetails = (record) => {
    setGpsModal(record);
  };

  const showPhotoDetails = (record) => {
    setPhotoModal(record);
  };

  const hasPhotos = (record) => {
    return record.photo_in_1 || record.photo_out_1 || record.photo_in_2 || record.photo_out_2;
  };

  // Render editable hours cell
  const renderEditableHours = (record, field, value, isWorkHours = false) => {
    if (isEditing(record.id, field)) {
      return (
        <input
          type="number"
          step="0.1"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyPress}
          autoFocus
          className="inline-edit-hours"
          style={{ width: '60px', padding: '2px 4px' }}
        />
      );
    }

    const numValue = parseFloat(value) || 0;
    const displayValue = value ? `${numValue.toFixed(1)}h` : '-';
    // Show red if work hours less than 8 (not including break)
    const isUnderHours = isWorkHours && numValue > 0 && numValue < 8;

    return (
      <span
        className={`editable-hours ${isUnderHours ? 'under-hours' : ''}`}
        onClick={() => startEdit(record.id, field, value)}
        title={isUnderHours ? 'Under 8 hours - Click to edit' : 'Click to edit'}
        style={isUnderHours ? { color: '#dc2626', fontWeight: 'bold' } : {}}
      >
        {displayValue}
      </span>
    );
  };

  return (
    <Layout>
    <div className="attendance-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Attendance Management</h1>
          <p>View and approve employee clock-in records</p>
        </div>
        <div className="header-actions">
          {pendingCount > 0 && (
            <div className="pending-badge">
              {pendingCount} Pending
            </div>
          )}
          <button
            className="create-manual-btn"
            onClick={() => setShowManualModal(true)}
          >
            + Create Manual
          </button>
        </div>
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

        {!isSupervisor && isAAAlive && departments.length > 0 && (
          <div className="filter-group">
            <label>Department</label>
            <select name="department_id" value={filters.department_id} onChange={handleFilterChange}>
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {!isSupervisor && !isAAAlive && outlets.length > 0 && (
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
                {!isSupervisor && <th>{isAAAlive ? 'Department' : 'Outlet'}</th>}
                <th className="time-col">Clock In 1<br/><small>Start Work</small></th>
                <th className="time-col">Clock Out 1<br/><small>Break</small></th>
                <th className="time-col">Clock In 2<br/><small>Return</small></th>
                <th className="time-col">Clock Out 2<br/><small>End Work</small></th>
                <th>Selfie</th>
                <th>GPS Location</th>
                <th>Total Hours</th>
                <th>OT Hours</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={isSupervisor ? 13 : 14} className="no-data">
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
                    {!isSupervisor && <td>{isAAAlive ? (record.department_name || '-') : (record.outlet_name || '-')}</td>}
                    <td className="time-cell">
                      {formatTime(record.clock_in_1)}
                    </td>
                    <td className="time-cell">{formatTime(record.clock_out_1)}</td>
                    <td className="time-cell">{formatTime(record.clock_in_2)}</td>
                    <td className="time-cell">
                      {formatTime(record.clock_out_2)}
                    </td>
                    <td className="photo-cell">
                      {hasPhotos(record) ? (
                        <button
                          className="photo-btn"
                          onClick={() => showPhotoDetails(record)}
                          title="View Selfie Photos"
                        >
                          View
                        </button>
                      ) : (
                        <span className="no-photo">-</span>
                      )}
                    </td>
                    <td className="gps-cell">
                      {(record.location_in_1 || record.location_out_2) ? (
                        <button
                          className="gps-btn"
                          onClick={() => showGpsDetails(record)}
                          title="View GPS Coordinates"
                        >
                          View
                        </button>
                      ) : (
                        <span className="no-gps">-</span>
                      )}
                    </td>
                    <td className="hours-cell">
                      {renderEditableHours(record, 'total_work_hours', record.total_hours, true)}
                    </td>
                    <td className="hours-cell ot">
                      {renderEditableHours(record, 'ot_hours', record.ot_hours, false)}
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
                            Approve
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() => handleReject(record.id)}
                            title="Reject"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="approved-by">
                          {record.approved_by_name && `by ${record.approved_by_name}`}
                        </span>
                      )}
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(record.id)}
                        title="Delete"
                        style={{ marginLeft: '4px', background: '#dc2626', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Del
                      </button>
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
          <span className="legend-label">Standard hours:</span>
          <span className="legend-value">{isAAAlive ? '8 hours (+ 1hr break)' : '8.5 hours'}</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">OT calculation:</span>
          <span className="legend-value">{isAAAlive ? 'Hours above 8h @ 1.0x' : 'Hours above 8.5h'}</span>
        </div>
        <div className="legend-item">
          <span className="legend-hint">Click on hours to edit</span>
        </div>
      </div>

      {/* Manual Attendance Modal */}
      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal manual-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Manual Attendance</h2>
              <button className="close-btn" onClick={() => setShowManualModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="modal-subtitle">Create attendance record for employee who didn't clock in</p>

              <form onSubmit={handleCreateManual}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={manualForm.employee_id}
                    onChange={(e) => setManualForm({ ...manualForm, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.employee_id} - {e.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Work Date *</label>
                  <input
                    type="date"
                    value={manualForm.work_date}
                    onChange={(e) => setManualForm({ ...manualForm, work_date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Total Work Hours *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={manualForm.total_work_hours}
                      onChange={(e) => setManualForm({ ...manualForm, total_work_hours: e.target.value })}
                      placeholder="e.g., 8"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>OT Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="16"
                      value={manualForm.ot_hours}
                      onChange={(e) => setManualForm({ ...manualForm, ot_hours: e.target.value })}
                      placeholder="e.g., 2"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                    placeholder="Reason for manual entry..."
                    rows="3"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowManualModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    Create & Approve
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* GPS Location Modal */}
      {gpsModal && (
        <div className="modal-overlay" onClick={() => setGpsModal(null)}>
          <div className="modal gps-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>GPS Locations</h2>
              <button className="close-btn" onClick={() => setGpsModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="gps-record-info">
                <strong>{gpsModal.employee_name}</strong>
                <span className="gps-date">{formatDate(gpsModal.work_date)}</span>
              </div>

              <div className="gps-locations-list">
                {gpsModal.location_in_1 && (
                  <div className="gps-location-item">
                    <div className="gps-location-header">
                      <span className="gps-label">Clock In (Start Work)</span>
                      <span className="gps-time">{formatTime(gpsModal.clock_in_1)}</span>
                    </div>
                    {gpsModal.address_in_1 && (
                      <div className="gps-address">
                        <span className="address-text">{gpsModal.address_in_1}</span>
                      </div>
                    )}
                    <div className="gps-coords">
                      <span className="coords-label">Lat:</span>
                      <span className="coords-value">{parseLocation(gpsModal.location_in_1)?.lat?.toFixed(6) || '-'}</span>
                      <span className="coords-label">Lng:</span>
                      <span className="coords-value">{parseLocation(gpsModal.location_in_1)?.lng?.toFixed(6) || '-'}</span>
                    </div>
                    <button
                      className="open-map-btn"
                      onClick={() => openInMaps(parseLocation(gpsModal.location_in_1))}
                    >
                      Open in Google Maps
                    </button>
                  </div>
                )}

                {gpsModal.location_out_2 && (
                  <div className="gps-location-item">
                    <div className="gps-location-header">
                      <span className="gps-label">Clock Out (End Work)</span>
                      <span className="gps-time">{formatTime(gpsModal.clock_out_2)}</span>
                    </div>
                    {gpsModal.address_out_2 && (
                      <div className="gps-address">
                        <span className="address-text">{gpsModal.address_out_2}</span>
                      </div>
                    )}
                    <div className="gps-coords">
                      <span className="coords-label">Lat:</span>
                      <span className="coords-value">{parseLocation(gpsModal.location_out_2)?.lat?.toFixed(6) || '-'}</span>
                      <span className="coords-label">Lng:</span>
                      <span className="coords-value">{parseLocation(gpsModal.location_out_2)?.lng?.toFixed(6) || '-'}</span>
                    </div>
                    <button
                      className="open-map-btn"
                      onClick={() => openInMaps(parseLocation(gpsModal.location_out_2))}
                    >
                      Open in Google Maps
                    </button>
                  </div>
                )}

                {!gpsModal.location_in_1 && !gpsModal.location_out_2 && (
                  <p className="no-gps-data">No GPS data recorded for this entry</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {photoModal && (
        <div className="modal-overlay" onClick={() => setPhotoModal(null)}>
          <div className="modal photo-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Selfie Photos</h2>
              <button className="close-btn" onClick={() => setPhotoModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="photo-record-info">
                <strong>{photoModal.employee_name}</strong>
                <span className="photo-date">{formatDate(photoModal.work_date)}</span>
              </div>

              <div className="photos-grid">
                {photoModal.photo_in_1 && (
                  <div className="photo-item">
                    <div className="photo-label">
                      <span>Clock In (Start)</span>
                      <span className="photo-time">{formatTime(photoModal.clock_in_1)}</span>
                    </div>
                    <div className="photo-container">
                      <img
                        src={photoModal.photo_in_1}
                        alt="Clock In 1"
                        onClick={() => window.open(photoModal.photo_in_1, '_blank')}
                      />
                    </div>
                  </div>
                )}

                {photoModal.photo_out_1 && (
                  <div className="photo-item">
                    <div className="photo-label">
                      <span>Clock Out (Break)</span>
                      <span className="photo-time">{formatTime(photoModal.clock_out_1)}</span>
                    </div>
                    <div className="photo-container">
                      <img
                        src={photoModal.photo_out_1}
                        alt="Clock Out 1"
                        onClick={() => window.open(photoModal.photo_out_1, '_blank')}
                      />
                    </div>
                  </div>
                )}

                {photoModal.photo_in_2 && (
                  <div className="photo-item">
                    <div className="photo-label">
                      <span>Clock In (Return)</span>
                      <span className="photo-time">{formatTime(photoModal.clock_in_2)}</span>
                    </div>
                    <div className="photo-container">
                      <img
                        src={photoModal.photo_in_2}
                        alt="Clock In 2"
                        onClick={() => window.open(photoModal.photo_in_2, '_blank')}
                      />
                    </div>
                  </div>
                )}

                {photoModal.photo_out_2 && (
                  <div className="photo-item">
                    <div className="photo-label">
                      <span>Clock Out (End)</span>
                      <span className="photo-time">{formatTime(photoModal.clock_out_2)}</span>
                    </div>
                    <div className="photo-container">
                      <img
                        src={photoModal.photo_out_2}
                        alt="Clock Out 2"
                        onClick={() => window.open(photoModal.photo_out_2, '_blank')}
                      />
                    </div>
                  </div>
                )}

                {!hasPhotos(photoModal) && (
                  <p className="no-photo-data">No selfie photos recorded for this entry</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .create-manual-btn {
          background: #1976d2;
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }
        .create-manual-btn:hover {
          background: #1565c0;
        }
        .editable-hours {
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }
        .editable-hours:hover {
          background-color: #e3f2fd;
        }
        .inline-edit-hours {
          border: 1px solid #1976d2;
          border-radius: 4px;
          font-size: 13px;
        }
        .manual-modal .form-row {
          display: flex;
          gap: 16px;
        }
        .manual-modal .form-row .form-group {
          flex: 1;
        }
        .manual-modal .form-group {
          margin-bottom: 16px;
        }
        .manual-modal label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
        }
        .manual-modal input,
        .manual-modal select,
        .manual-modal textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
        }
        .manual-modal .modal-subtitle {
          color: #666;
          margin-bottom: 20px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }
        .cancel-btn {
          padding: 10px 20px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          cursor: pointer;
        }
        .save-btn {
          padding: 10px 20px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
        .save-btn:hover {
          background: #1565c0;
        }
        .legend-hint {
          font-style: italic;
          color: #888;
          font-size: 12px;
        }
        .approve-btn {
          background: #4caf50;
          color: white;
          border: none;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          margin-right: 4px;
        }
        .reject-btn {
          background: #ff9800;
          color: white;
          border: none;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
      `}</style>
    </div>
    </Layout>
  );
};

export default Attendance;
