import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
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
  const [gpsModal, setGpsModal] = useState(null); // For showing GPS coordinates
  const [photoModal, setPhotoModal] = useState(null); // For showing selfie photos

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

  // Delete attendance record - Testing mode only
  // TODO: Remove this after real data starts
  const handleDelete = async (id) => {
    if (window.confirm('Delete this attendance record? This action cannot be undone.')) {
      try {
        await attendanceApi.delete(id);
        fetchData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete');
      }
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

  // Parse GPS location string to get coordinates
  const parseLocation = (locationStr) => {
    if (!locationStr) return null;
    try {
      // Format could be "lat,lng" or JSON object
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

  // Format coordinates for display
  const formatCoords = (coords) => {
    if (!coords) return '-';
    return `${coords.lat?.toFixed(6)}, ${coords.lng?.toFixed(6)}`;
  };

  // Open location in Google Maps
  const openInMaps = (coords) => {
    if (!coords) return;
    window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`, '_blank');
  };

  // Show GPS modal with record details
  const showGpsDetails = (record) => {
    setGpsModal(record);
  };

  // Show photo modal with selfie images
  const showPhotoDetails = (record) => {
    setPhotoModal(record);
  };

  // Check if record has any photos
  const hasPhotos = (record) => {
    return record.photo_in_1 || record.photo_out_1 || record.photo_in_2 || record.photo_out_2;
  };

  return (
    <Layout>
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
                    {!isSupervisor && <td>{record.outlet_name || '-'}</td>}
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
                          📷 View
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
                          📍 View
                        </button>
                      ) : (
                        <span className="no-gps">-</span>
                      )}
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
                      {/* Delete button - Testing mode only */}
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(record.id)}
                        title="Delete"
                        style={{ marginLeft: '4px', background: '#dc2626', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        🗑
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
          <span className="legend-icon">📷</span>
          <span>Selfie photo recorded</span>
        </div>
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
                        <span className="address-icon">📍</span>
                        <span className="address-text">{gpsModal.address_in_1}</span>
                      </div>
                    )}
                    <div className="gps-coords">
                      <span className="coords-label">Latitude:</span>
                      <span className="coords-value">{parseLocation(gpsModal.location_in_1)?.lat?.toFixed(6) || '-'}</span>
                    </div>
                    <div className="gps-coords">
                      <span className="coords-label">Longitude:</span>
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
                        <span className="address-icon">📍</span>
                        <span className="address-text">{gpsModal.address_out_2}</span>
                      </div>
                    )}
                    <div className="gps-coords">
                      <span className="coords-label">Latitude:</span>
                      <span className="coords-value">{parseLocation(gpsModal.location_out_2)?.lat?.toFixed(6) || '-'}</span>
                    </div>
                    <div className="gps-coords">
                      <span className="coords-label">Longitude:</span>
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
    </div>
    </Layout>
  );
};

export default Attendance;
