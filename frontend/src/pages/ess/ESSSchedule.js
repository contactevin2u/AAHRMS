import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import './ESSSchedule.css';

function ESSSchedule() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('calendar');

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  // Extra shift requests
  const [extraShiftRequests, setExtraShiftRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Request form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({
    request_date: '',
    shift_start: '09:00',
    shift_end: '18:00',
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Fetch schedule data
  const fetchScheduleData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await essApi.getMySchedule(currentYear, currentMonth);
      setSchedules(res.data.schedules || {});
      setSummary(res.data.summary || null);
    } catch (error) {
      console.error('Error fetching schedule:', error);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => {
    fetchScheduleData();
  }, [fetchScheduleData]);

  // Fetch extra shift requests
  const fetchExtraShiftRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const res = await essApi.getExtraShiftRequests();
      setExtraShiftRequests(res.data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

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

  // Generate calendar days
  const generateCalendarDays = () => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const startPadding = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days = [];

    for (let i = 0; i < startPadding; i++) {
      days.push({ date: null, isCurrentMonth: false });
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const schedule = schedules[dateStr];
      days.push({
        date: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        schedule
      });
    }

    return days;
  };

  // Handle day click
  const handleDayClick = (day) => {
    if (!day.isCurrentMonth || !day.date) return;
    setSelectedDay(day);
  };

  // Handle extra shift request submit
  const handleSubmitRequest = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);
      await essApi.submitExtraShiftRequest(requestForm);
      setShowRequestForm(false);
      setRequestForm({
        request_date: '',
        shift_start: '09:00',
        shift_end: '18:00',
        reason: ''
      });
      fetchExtraShiftRequests();
      alert('Extra shift request submitted successfully');
    } catch (error) {
      console.error('Error submitting request:', error);
      alert(error.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle cancel request
  const handleCancelRequest = async (id) => {
    if (!window.confirm('Cancel this request?')) return;

    try {
      await essApi.cancelExtraShiftRequest(id);
      fetchExtraShiftRequests();
    } catch (error) {
      console.error('Error cancelling request:', error);
      alert(error.response?.data?.error || 'Failed to cancel request');
    }
  };

  const calendarDays = generateCalendarDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const getStatusClass = (schedule) => {
    if (!schedule) return '';
    if (schedule.attended) return 'attended';
    if (new Date(schedule.schedule_date) < new Date().setHours(0, 0, 0, 0)) return 'absent';
    return 'scheduled';
  };

  return (
    <ESSLayout title="My Schedule">
      <div className="ess-schedule-page">
        {/* Tabs */}
        <div className="ess-schedule-tabs">
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
            My Requests
          </button>
        </div>

        {activeTab === 'calendar' && (
          <>
            {/* Summary */}
            {summary && (
              <div className="schedule-summary">
                <div className="summary-item">
                  <span className="value">{summary.total_scheduled}</span>
                  <span className="label">Scheduled</span>
                </div>
                <div className="summary-item attended">
                  <span className="value">{summary.attended}</span>
                  <span className="label">Attended</span>
                </div>
                <div className="summary-item upcoming">
                  <span className="value">{summary.upcoming}</span>
                  <span className="label">Upcoming</span>
                </div>
              </div>
            )}

            {/* Calendar Navigation */}
            <div className="calendar-nav-ess">
              <button onClick={goToPrevMonth}>&lt;</button>
              <span className="current-month">
                {monthNames[currentMonth - 1]} {currentYear}
              </span>
              <button onClick={goToNextMonth}>&gt;</button>
            </div>

            {/* Calendar */}
            {loading ? (
              <div className="loading">Loading schedule...</div>
            ) : (
              <div className="ess-calendar">
                <div className="calendar-header-row">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <div key={i} className="calendar-header-cell">{day}</div>
                  ))}
                </div>

                <div className="calendar-body">
                  {calendarDays.map((day, index) => (
                    <div
                      key={index}
                      className={`calendar-day ${day.isCurrentMonth ? '' : 'other'} ${day.isToday ? 'today' : ''} ${day.schedule ? getStatusClass(day.schedule) : ''}`}
                      onClick={() => handleDayClick(day)}
                    >
                      <span className="day-num">{day.date || ''}</span>
                      {day.schedule && (
                        <div className="shift-indicator">
                          {day.schedule.shift_start}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="calendar-legend">
              <div className="legend-item">
                <span className="dot scheduled"></span> Scheduled
              </div>
              <div className="legend-item">
                <span className="dot attended"></span> Attended
              </div>
              <div className="legend-item">
                <span className="dot absent"></span> Absent
              </div>
            </div>

            {/* Request Extra Shift Button */}
            <button
              className="request-shift-btn"
              onClick={() => setShowRequestForm(true)}
            >
              Request Extra Shift
            </button>
          </>
        )}

        {activeTab === 'requests' && (
          <div className="requests-section">
            <button
              className="new-request-btn"
              onClick={() => setShowRequestForm(true)}
            >
              + New Request
            </button>

            {requestsLoading ? (
              <div className="loading">Loading requests...</div>
            ) : extraShiftRequests.length === 0 ? (
              <div className="no-requests">No extra shift requests</div>
            ) : (
              <div className="requests-list-ess">
                {extraShiftRequests.map(request => (
                  <div key={request.id} className={`request-item ${request.status}`}>
                    <div className="request-date">
                      {new Date(request.request_date).toLocaleDateString('en-MY', {
                        weekday: 'short', day: 'numeric', month: 'short'
                      })}
                    </div>
                    <div className="request-time">
                      {request.shift_start} - {request.shift_end}
                    </div>
                    <div className={`request-status ${request.status}`}>
                      {request.status}
                    </div>
                    {request.reason && (
                      <div className="request-reason">{request.reason}</div>
                    )}
                    {request.status === 'pending' && (
                      <button
                        className="cancel-btn"
                        onClick={() => handleCancelRequest(request.id)}
                      >
                        Cancel
                      </button>
                    )}
                    {request.status === 'rejected' && request.rejection_reason && (
                      <div className="rejection-reason">
                        Reason: {request.rejection_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected Day Detail */}
        {selectedDay && selectedDay.schedule && (
          <div className="day-detail-overlay" onClick={() => setSelectedDay(null)}>
            <div className="day-detail-modal" onClick={e => e.stopPropagation()}>
              <h3>
                {new Date(selectedDay.dateStr).toLocaleDateString('en-MY', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                })}
              </h3>
              <div className="detail-row">
                <span className="label">Shift:</span>
                <span className="value">
                  {selectedDay.schedule.shift_start} - {selectedDay.schedule.shift_end}
                </span>
              </div>
              {selectedDay.schedule.outlet_name && (
                <div className="detail-row">
                  <span className="label">Outlet:</span>
                  <span className="value">{selectedDay.schedule.outlet_name}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="label">Status:</span>
                <span className={`status-badge ${getStatusClass(selectedDay.schedule)}`}>
                  {selectedDay.schedule.attended ? 'Attended' :
                   new Date(selectedDay.dateStr) < new Date().setHours(0, 0, 0, 0) ? 'Absent' : 'Scheduled'}
                </span>
              </div>
              <button className="close-detail" onClick={() => setSelectedDay(null)}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Request Form Modal */}
        {showRequestForm && (
          <div className="request-form-overlay" onClick={() => setShowRequestForm(false)}>
            <div className="request-form-modal" onClick={e => e.stopPropagation()}>
              <h3>Request Extra Shift</h3>
              <form onSubmit={handleSubmitRequest}>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={requestForm.request_date}
                    onChange={e => setRequestForm(prev => ({ ...prev, request_date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Time</label>
                    <input
                      type="time"
                      value={requestForm.shift_start}
                      onChange={e => setRequestForm(prev => ({ ...prev, shift_start: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End Time</label>
                    <input
                      type="time"
                      value={requestForm.shift_end}
                      onChange={e => setRequestForm(prev => ({ ...prev, shift_end: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason (optional)</label>
                  <textarea
                    value={requestForm.reason}
                    onChange={e => setRequestForm(prev => ({ ...prev, reason: e.target.value }))}
                    rows="3"
                    placeholder="Why do you need this extra shift?"
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setShowRequestForm(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSSchedule;
