import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { schedulesApi, outletsApi, employeeApi } from '../api';
import './Schedules.css';

function Schedules() {
  const [activeTab, setActiveTab] = useState('calendar');
  const [viewMode, setViewMode] = useState('month'); // month or week

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [outlets, setOutlets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // create or edit
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    schedule_date: '',
    shift_start: '09:00',
    shift_end: '18:00',
    break_duration: 60,
    repeat_weekly: false,
    end_date: '',
    days_of_week: [1, 2, 3, 4, 5] // Mon-Fri
  });

  // Extra shift requests
  const [extraShiftRequests, setExtraShiftRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Fetch outlets and employees
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [outletsRes, employeesRes] = await Promise.all([
          outletsApi.getAll(),
          employeeApi.getAll({ status: 'active' })
        ]);
        setOutlets(outletsRes.data || []);
        setEmployees(employeesRes.data || []);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch calendar data
  const fetchCalendarData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await schedulesApi.getCalendar(currentYear, currentMonth, selectedOutlet || undefined);
      setSchedules(res.data.schedules || {});
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth, selectedOutlet]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Fetch extra shift requests
  const fetchExtraShiftRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const res = await schedulesApi.getExtraShiftRequests({
        status: 'pending',
        outlet_id: selectedOutlet || undefined
      });
      setExtraShiftRequests(res.data || []);
    } catch (error) {
      console.error('Error fetching extra shift requests:', error);
    } finally {
      setRequestsLoading(false);
    }
  }, [selectedOutlet]);

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchExtraShiftRequests();
    }
  }, [activeTab, fetchExtraShiftRequests]);

  // Calendar navigation
  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 2, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const startPadding = firstDay.getDay(); // 0 = Sunday
    const totalDays = lastDay.getDate();

    const days = [];

    // Add padding for days before month start
    for (let i = 0; i < startPadding; i++) {
      days.push({ date: null, isCurrentMonth: false });
    }

    // Add days of the month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const daySchedules = schedules[dateStr] || [];
      days.push({
        date: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        schedules: daySchedules
      });
    }

    return days;
  };

  // Handle cell click
  const handleCellClick = (day) => {
    if (!day.isCurrentMonth || !day.date) return;

    setSelectedDate(day.dateStr);
    setFormData(prev => ({
      ...prev,
      schedule_date: day.dateStr,
      end_date: day.dateStr
    }));
    setModalMode('create');
    setSelectedSchedule(null);
    setShowModal(true);
  };

  // Handle schedule click (for editing)
  const handleScheduleClick = (e, schedule, dateStr) => {
    e.stopPropagation();
    setSelectedSchedule(schedule);
    setSelectedDate(dateStr);
    setFormData({
      employee_id: schedule.employee_id,
      schedule_date: dateStr,
      shift_start: schedule.shift_start,
      shift_end: schedule.shift_end,
      break_duration: schedule.break_duration || 60,
      repeat_weekly: false,
      end_date: '',
      days_of_week: []
    });
    setModalMode('edit');
    setShowModal(true);
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (modalMode === 'create') {
        if (formData.repeat_weekly && formData.end_date) {
          // Bulk create
          await schedulesApi.bulkCreate({
            employee_id: formData.employee_id,
            start_date: formData.schedule_date,
            end_date: formData.end_date,
            shift_start: formData.shift_start,
            shift_end: formData.shift_end,
            break_duration: formData.break_duration,
            days_of_week: formData.days_of_week
          });
        } else {
          // Single create
          await schedulesApi.create({
            employee_id: formData.employee_id,
            schedule_date: formData.schedule_date,
            shift_start: formData.shift_start,
            shift_end: formData.shift_end,
            break_duration: formData.break_duration
          });
        }
      } else {
        // Update
        await schedulesApi.update(selectedSchedule.id, {
          shift_start: formData.shift_start,
          shift_end: formData.shift_end,
          break_duration: formData.break_duration
        });
      }

      setShowModal(false);
      fetchCalendarData();
    } catch (error) {
      console.error('Error saving schedule:', error);
      const errData = error.response?.data;
      const errMsg = errData?.details
        ? `${errData.error}: ${errData.details}`
        : (errData?.error || 'Failed to save schedule');
      alert(errMsg);
    }
  };

  // Handle delete schedule
  const handleDelete = async () => {
    if (!selectedSchedule || !window.confirm('Delete this schedule?')) return;

    try {
      await schedulesApi.delete(selectedSchedule.id);
      setShowModal(false);
      fetchCalendarData();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      const errData = error.response?.data;
      const errMsg = errData?.details
        ? `${errData.error}: ${errData.details}`
        : (errData?.error || 'Failed to delete schedule');
      alert(errMsg);
    }
  };

  // Handle extra shift approval
  const handleApproveExtraShift = async (id) => {
    try {
      await schedulesApi.approveExtraShift(id);
      fetchExtraShiftRequests();
      fetchCalendarData();
    } catch (error) {
      console.error('Error approving request:', error);
      alert(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleRejectExtraShift = async (id) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;

    try {
      await schedulesApi.rejectExtraShift(id, reason);
      fetchExtraShiftRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert(error.response?.data?.error || 'Failed to reject request');
    }
  };

  const calendarDays = generateCalendarDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Filter employees by selected outlet
  const filteredEmployees = selectedOutlet
    ? employees.filter(e => e.outlet_id === parseInt(selectedOutlet))
    : employees;

  return (
    <Layout>
      <div className="schedules-page">
        <header className="page-header">
          <div>
            <h1>Employee Schedules</h1>
            <p>Manage staff work schedules</p>
          </div>
        </header>

        {/* Tabs */}
        <div className="schedule-tabs">
          <button
            className={activeTab === 'calendar' ? 'active' : ''}
            onClick={() => setActiveTab('calendar')}
          >
            Calendar
          </button>
          <button
            className={activeTab === 'requests' ? 'active' : ''}
            onClick={() => setActiveTab('requests')}
          >
            Extra Shift Requests
            {extraShiftRequests.length > 0 && (
              <span className="badge">{extraShiftRequests.length}</span>
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="schedule-filters">
          <select
            value={selectedOutlet}
            onChange={(e) => setSelectedOutlet(e.target.value)}
          >
            <option value="">All Outlets</option>
            {outlets.map(outlet => (
              <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
            ))}
          </select>

          {activeTab === 'calendar' && (
            <div className="calendar-nav">
              <button onClick={goToPrevMonth}>&lt;</button>
              <span className="current-month">
                {monthNames[currentMonth - 1]} {currentYear}
              </span>
              <button onClick={goToNextMonth}>&gt;</button>
              <button onClick={goToToday} className="today-btn">Today</button>
            </div>
          )}
        </div>

        {/* Calendar View */}
        {activeTab === 'calendar' && (
          <div className="calendar-container">
            {loading ? (
              <div className="loading">Loading schedules...</div>
            ) : (
              <div className="calendar-grid">
                {/* Day headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="calendar-header">{day}</div>
                ))}

                {/* Calendar cells */}
                {calendarDays.map((day, index) => (
                  <div
                    key={index}
                    className={`calendar-cell ${day.isCurrentMonth ? '' : 'other-month'} ${day.isToday ? 'today' : ''}`}
                    onClick={() => handleCellClick(day)}
                  >
                    {day.date && (
                      <>
                        <span className="day-number">{day.date}</span>
                        <div className="cell-schedules">
                          {day.schedules?.slice(0, 3).map((schedule, i) => (
                            <div
                              key={i}
                              className={`schedule-chip ${schedule.status}`}
                              onClick={(e) => handleScheduleClick(e, schedule, day.dateStr)}
                              title={`${schedule.employee_name}: ${schedule.shift_start}-${schedule.shift_end}`}
                            >
                              <span className="emp-name">{schedule.employee_name?.split(' ')[0]}</span>
                              <span className="shift-time">{schedule.shift_start}</span>
                            </div>
                          ))}
                          {day.schedules?.length > 3 && (
                            <div className="more-schedules">
                              +{day.schedules.length - 3} more
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Extra Shift Requests */}
        {activeTab === 'requests' && (
          <div className="requests-container">
            {requestsLoading ? (
              <div className="loading">Loading requests...</div>
            ) : extraShiftRequests.length === 0 ? (
              <div className="no-data">No pending extra shift requests</div>
            ) : (
              <div className="requests-list">
                {extraShiftRequests.map(request => (
                  <div key={request.id} className="request-card">
                    <div className="request-info">
                      <div className="request-header">
                        <strong>{request.employee_name}</strong>
                        <span className="employee-code">({request.employee_code})</span>
                      </div>
                      <div className="request-details">
                        <span className="date">
                          {new Date(request.request_date).toLocaleDateString('en-MY', {
                            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </span>
                        <span className="time">{request.shift_start} - {request.shift_end}</span>
                        {request.outlet_name && (
                          <span className="outlet">{request.outlet_name}</span>
                        )}
                      </div>
                      {request.reason && (
                        <p className="reason">{request.reason}</p>
                      )}
                      <small className="created-at">
                        Requested: {new Date(request.created_at).toLocaleString('en-MY')}
                      </small>
                    </div>
                    <div className="request-actions">
                      <button
                        className="btn-approve"
                        onClick={() => handleApproveExtraShift(request.id)}
                      >
                        Approve
                      </button>
                      <button
                        className="btn-reject"
                        onClick={() => handleRejectExtraShift(request.id)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schedule Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal schedule-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{modalMode === 'create' ? 'Add Schedule' : 'Edit Schedule'}</h2>
                <button className="close-btn" onClick={() => setShowModal(false)}>&times;</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {modalMode === 'create' && (
                    <div className="form-group">
                      <label>Employee</label>
                      <select
                        value={formData.employee_id}
                        onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
                        required
                      >
                        <option value="">Select Employee</option>
                        {filteredEmployees.map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.employee_id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {modalMode === 'edit' && (
                    <div className="form-group">
                      <label>Employee</label>
                      <input type="text" value={selectedSchedule?.employee_name || ''} disabled />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={formData.schedule_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, schedule_date: e.target.value }))}
                      required
                      disabled={modalMode === 'edit'}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Shift Start</label>
                      <input
                        type="time"
                        value={formData.shift_start}
                        onChange={(e) => setFormData(prev => ({ ...prev, shift_start: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Shift End</label>
                      <input
                        type="time"
                        value={formData.shift_end}
                        onChange={(e) => setFormData(prev => ({ ...prev, shift_end: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Break Duration (minutes)</label>
                    <input
                      type="number"
                      value={formData.break_duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, break_duration: parseInt(e.target.value) }))}
                      min="0"
                      max="120"
                    />
                  </div>

                  {modalMode === 'create' && (
                    <>
                      <div className="form-group checkbox-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={formData.repeat_weekly}
                            onChange={(e) => setFormData(prev => ({ ...prev, repeat_weekly: e.target.checked }))}
                          />
                          Repeat weekly
                        </label>
                      </div>

                      {formData.repeat_weekly && (
                        <>
                          <div className="form-group">
                            <label>End Date</label>
                            <input
                              type="date"
                              value={formData.end_date}
                              onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                              min={formData.schedule_date}
                              required={formData.repeat_weekly}
                            />
                          </div>

                          <div className="form-group">
                            <label>Days of Week</label>
                            <div className="days-selector">
                              {[
                                { value: 0, label: 'Sun' },
                                { value: 1, label: 'Mon' },
                                { value: 2, label: 'Tue' },
                                { value: 3, label: 'Wed' },
                                { value: 4, label: 'Thu' },
                                { value: 5, label: 'Fri' },
                                { value: 6, label: 'Sat' }
                              ].map(day => (
                                <label key={day.value} className="day-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={formData.days_of_week.includes(day.value)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormData(prev => ({
                                          ...prev,
                                          days_of_week: [...prev.days_of_week, day.value].sort()
                                        }));
                                      } else {
                                        setFormData(prev => ({
                                          ...prev,
                                          days_of_week: prev.days_of_week.filter(d => d !== day.value)
                                        }));
                                      }
                                    }}
                                  />
                                  {day.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                <div className="modal-footer">
                  {modalMode === 'edit' && (
                    <button type="button" className="btn-danger" onClick={handleDelete}>
                      Delete
                    </button>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {modalMode === 'create' ? 'Create Schedule' : 'Update Schedule'}
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

export default Schedules;
