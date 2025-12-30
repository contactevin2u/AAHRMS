import React, { useState, useEffect, useCallback } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import './ESSSchedule.css';

function ESSSchedule() {
  const [activeTab, setActiveTab] = useState('calendar');

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  // Outlet calendar state
  const [outletSchedules, setOutletSchedules] = useState([]);
  const [outletLoading, setOutletLoading] = useState(false);
  const [colleagues, setColleagues] = useState([]);
  const [hasOutlet, setHasOutlet] = useState(true);

  // Swap requests state
  const [swapRequests, setSwapRequests] = useState([]);
  const [swapsLoading, setSwapsLoading] = useState(false);

  // Swap form state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedColleagueShift, setSelectedColleagueShift] = useState(null);
  const [myShifts, setMyShifts] = useState([]);
  const [colleagueShifts, setColleagueShifts] = useState([]);
  const [swapForm, setSwapForm] = useState({
    requester_shift_id: '',
    target_id: '',
    target_shift_id: '',
    reason: ''
  });
  const [swapSubmitting, setSwapSubmitting] = useState(false);

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

  // Fetch outlet calendar
  const fetchOutletCalendar = useCallback(async () => {
    try {
      setOutletLoading(true);
      const res = await essApi.getOutletCalendar(currentYear, currentMonth);
      setOutletSchedules(res.data || []);
      setHasOutlet(true);
    } catch (error) {
      console.error('Error fetching outlet calendar:', error);
      if (error.response?.status === 400) {
        setHasOutlet(false);
      }
    } finally {
      setOutletLoading(false);
    }
  }, [currentYear, currentMonth]);

  // Fetch colleagues
  const fetchColleagues = useCallback(async () => {
    try {
      const res = await essApi.getOutletColleagues();
      setColleagues(res.data || []);
    } catch (error) {
      console.error('Error fetching colleagues:', error);
    }
  }, []);

  // Fetch swap requests
  const fetchSwapRequests = useCallback(async () => {
    try {
      setSwapsLoading(true);
      const res = await essApi.getSwapRequests();
      setSwapRequests(res.data || []);
    } catch (error) {
      console.error('Error fetching swap requests:', error);
    } finally {
      setSwapsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'outlet') {
      fetchOutletCalendar();
      fetchColleagues();
    } else if (activeTab === 'swaps') {
      fetchSwapRequests();
    } else if (activeTab === 'requests') {
      fetchExtraShiftRequests();
    }
  }, [activeTab, fetchOutletCalendar, fetchColleagues, fetchSwapRequests]);

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

  // Generate outlet calendar days
  const generateOutletCalendarDays = () => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const startPadding = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days = [];

    for (let i = 0; i < startPadding; i++) {
      days.push({ date: null, isCurrentMonth: false, shifts: [] });
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const shifts = outletSchedules.filter(s => s.schedule_date.split('T')[0] === dateStr);
      days.push({
        date: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        shifts
      });
    }

    return days;
  };

  // Handle day click
  const handleDayClick = (day) => {
    if (!day.isCurrentMonth || !day.date) return;
    setSelectedDay(day);
  };

  // Handle outlet shift click (for swap request)
  const handleOutletShiftClick = async (shift) => {
    if (shift.is_mine) return; // Can't swap with your own shift

    // Check if shift is in the future
    if (new Date(shift.schedule_date) < new Date().setHours(0, 0, 0, 0)) {
      alert('Cannot swap past shifts');
      return;
    }

    setSelectedColleagueShift(shift);
    setSwapForm({
      requester_shift_id: '',
      target_id: shift.employee_id,
      target_shift_id: shift.id,
      reason: ''
    });

    // Fetch my upcoming shifts
    try {
      const res = await essApi.getMyShifts();
      setMyShifts(res.data || []);
    } catch (error) {
      console.error('Error fetching my shifts:', error);
    }

    setShowSwapModal(true);
  };

  // Handle swap request submit
  const handleSubmitSwap = async (e) => {
    e.preventDefault();

    if (!swapForm.requester_shift_id) {
      alert('Please select one of your shifts to swap');
      return;
    }

    try {
      setSwapSubmitting(true);
      await essApi.createSwapRequest(swapForm);
      setShowSwapModal(false);
      setSelectedColleagueShift(null);
      setSwapForm({ requester_shift_id: '', target_id: '', target_shift_id: '', reason: '' });
      alert('Swap request sent! Waiting for colleague approval.');
      fetchSwapRequests();
    } catch (error) {
      console.error('Error submitting swap request:', error);
      alert(error.response?.data?.error || 'Failed to submit swap request');
    } finally {
      setSwapSubmitting(false);
    }
  };

  // Handle swap response (accept/reject)
  const handleSwapResponse = async (id, response) => {
    const confirmMsg = response === 'accepted'
      ? 'Accept this swap request?'
      : 'Reject this swap request?';

    if (!window.confirm(confirmMsg)) return;

    try {
      await essApi.respondToSwap(id, response);
      fetchSwapRequests();
      alert(response === 'accepted'
        ? 'Accepted! Waiting for admin approval.'
        : 'Swap request rejected.');
    } catch (error) {
      console.error('Error responding to swap:', error);
      alert(error.response?.data?.error || 'Failed to respond');
    }
  };

  // Handle cancel swap request
  const handleCancelSwap = async (id) => {
    if (!window.confirm('Cancel this swap request?')) return;

    try {
      await essApi.cancelSwapRequest(id);
      fetchSwapRequests();
    } catch (error) {
      console.error('Error cancelling swap:', error);
      alert(error.response?.data?.error || 'Failed to cancel');
    }
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

  // Handle cancel extra shift request
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
  const outletCalendarDays = generateOutletCalendarDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const getStatusClass = (schedule) => {
    if (!schedule) return '';
    if (schedule.attended) return 'attended';
    if (new Date(schedule.schedule_date) < new Date().setHours(0, 0, 0, 0)) return 'absent';
    return 'scheduled';
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-MY', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  };

  const getSwapStatusLabel = (request) => {
    switch (request.status) {
      case 'pending_target':
        return request.is_incoming ? 'Needs Your Response' : 'Waiting for Colleague';
      case 'pending_admin':
        return 'Waiting for Admin';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return request.status;
    }
  };

  const incomingSwaps = swapRequests.filter(r => r.is_incoming && r.status === 'pending_target');
  const outgoingSwaps = swapRequests.filter(r => r.is_outgoing);

  return (
    <ESSLayout title="My Schedule">
      <div className="ess-schedule-page">
        {/* Tabs */}
        <div className="ess-schedule-tabs">
          <button
            className={activeTab === 'calendar' ? 'active' : ''}
            onClick={() => setActiveTab('calendar')}
          >
            My Schedule
          </button>
          <button
            className={activeTab === 'outlet' ? 'active' : ''}
            onClick={() => setActiveTab('outlet')}
          >
            Outlet
          </button>
          <button
            className={activeTab === 'swaps' ? 'active' : ''}
            onClick={() => setActiveTab('swaps')}
          >
            Swaps
            {incomingSwaps.length > 0 && (
              <span className="badge">{incomingSwaps.length}</span>
            )}
          </button>
          <button
            className={activeTab === 'requests' ? 'active' : ''}
            onClick={() => setActiveTab('requests')}
          >
            Extra
          </button>
        </div>

        {/* My Schedule Tab */}
        {activeTab === 'calendar' && (
          <>
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

            <div className="calendar-nav-ess">
              <button onClick={goToPrevMonth}>&lt;</button>
              <span className="current-month">
                {monthNames[currentMonth - 1]} {currentYear}
              </span>
              <button onClick={goToNextMonth}>&gt;</button>
            </div>

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
          </>
        )}

        {/* Outlet Calendar Tab */}
        {activeTab === 'outlet' && (
          <>
            {!hasOutlet ? (
              <div className="no-outlet-message">
                You are not assigned to an outlet
              </div>
            ) : (
              <>
                <div className="outlet-calendar-info">
                  <p>Tap on a colleague's shift to request a swap</p>
                </div>

                <div className="calendar-nav-ess">
                  <button onClick={goToPrevMonth}>&lt;</button>
                  <span className="current-month">
                    {monthNames[currentMonth - 1]} {currentYear}
                  </span>
                  <button onClick={goToNextMonth}>&gt;</button>
                </div>

                {outletLoading ? (
                  <div className="loading">Loading outlet schedule...</div>
                ) : (
                  <div className="outlet-calendar">
                    <div className="calendar-header-row">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                        <div key={i} className="calendar-header-cell">{day}</div>
                      ))}
                    </div>

                    <div className="calendar-body outlet-body">
                      {outletCalendarDays.map((day, index) => (
                        <div
                          key={index}
                          className={`calendar-day outlet-day ${day.isCurrentMonth ? '' : 'other'} ${day.isToday ? 'today' : ''}`}
                        >
                          <span className="day-num">{day.date || ''}</span>
                          <div className="outlet-shifts">
                            {day.shifts.slice(0, 3).map((shift, i) => (
                              <div
                                key={i}
                                className={`outlet-shift ${shift.is_mine ? 'mine' : 'colleague'}`}
                                onClick={() => !shift.is_mine && handleOutletShiftClick(shift)}
                                title={`${shift.employee_name}: ${shift.shift_start}-${shift.shift_end}`}
                              >
                                <span className="shift-name">{shift.employee_name?.split(' ')[0]}</span>
                                <span className="shift-time">{shift.shift_start}</span>
                              </div>
                            ))}
                            {day.shifts.length > 3 && (
                              <div className="more-shifts">+{day.shifts.length - 3}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="outlet-legend">
                  <div className="legend-item">
                    <span className="dot mine"></span> My Shift
                  </div>
                  <div className="legend-item">
                    <span className="dot colleague"></span> Colleague (tap to swap)
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Swaps Tab */}
        {activeTab === 'swaps' && (
          <div className="swaps-section">
            {swapsLoading ? (
              <div className="loading">Loading swap requests...</div>
            ) : (
              <>
                {/* Incoming Requests */}
                {incomingSwaps.length > 0 && (
                  <div className="swap-group">
                    <h3>Incoming Requests</h3>
                    {incomingSwaps.map(request => (
                      <div key={request.id} className="swap-card incoming">
                        <div className="swap-header">
                          <span className="swap-from">{request.requester_name}</span>
                          <span className="swap-action">wants to swap</span>
                        </div>
                        <div className="swap-details">
                          <div className="swap-shift">
                            <span className="label">Their shift:</span>
                            <span>{formatDate(request.requester_shift_date)} ({request.requester_shift_start}-{request.requester_shift_end})</span>
                          </div>
                          <div className="swap-shift">
                            <span className="label">Your shift:</span>
                            <span>{formatDate(request.target_shift_date)} ({request.target_shift_start}-{request.target_shift_end})</span>
                          </div>
                        </div>
                        {request.reason && (
                          <div className="swap-reason">Note: {request.reason}</div>
                        )}
                        <div className="swap-actions">
                          <button
                            className="btn-accept"
                            onClick={() => handleSwapResponse(request.id, 'accepted')}
                          >
                            Accept
                          </button>
                          <button
                            className="btn-reject"
                            onClick={() => handleSwapResponse(request.id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Outgoing Requests */}
                <div className="swap-group">
                  <h3>My Requests</h3>
                  {outgoingSwaps.length === 0 ? (
                    <div className="no-swaps">
                      No swap requests. Go to Outlet tab to request a swap.
                    </div>
                  ) : (
                    outgoingSwaps.map(request => (
                      <div key={request.id} className={`swap-card outgoing ${request.status}`}>
                        <div className="swap-header">
                          <span className="swap-with">Swap with {request.target_name}</span>
                          <span className={`swap-status ${request.status}`}>
                            {getSwapStatusLabel(request)}
                          </span>
                        </div>
                        <div className="swap-details">
                          <div className="swap-shift">
                            <span className="label">Give:</span>
                            <span>{formatDate(request.requester_shift_date)} ({request.requester_shift_start}-{request.requester_shift_end})</span>
                          </div>
                          <div className="swap-shift">
                            <span className="label">Take:</span>
                            <span>{formatDate(request.target_shift_date)} ({request.target_shift_start}-{request.target_shift_end})</span>
                          </div>
                        </div>
                        {request.status === 'pending_target' && (
                          <button
                            className="btn-cancel"
                            onClick={() => handleCancelSwap(request.id)}
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Extra Shift Requests Tab */}
        {activeTab === 'requests' && (
          <div className="requests-section">
            <button
              className="new-request-btn"
              onClick={() => setShowRequestForm(true)}
            >
              + Request Extra Shift
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

        {/* Selected Day Detail Modal */}
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

        {/* Swap Request Modal */}
        {showSwapModal && selectedColleagueShift && (
          <div className="swap-modal-overlay" onClick={() => setShowSwapModal(false)}>
            <div className="swap-modal" onClick={e => e.stopPropagation()}>
              <h3>Request Shift Swap</h3>

              <div className="swap-target-info">
                <p>You want to take:</p>
                <div className="target-shift">
                  <strong>{selectedColleagueShift.employee_name}'s shift</strong>
                  <span>{formatDate(selectedColleagueShift.schedule_date)}</span>
                  <span>{selectedColleagueShift.shift_start} - {selectedColleagueShift.shift_end}</span>
                </div>
              </div>

              <form onSubmit={handleSubmitSwap}>
                <div className="form-group">
                  <label>Select your shift to give:</label>
                  <select
                    value={swapForm.requester_shift_id}
                    onChange={e => setSwapForm(prev => ({ ...prev, requester_shift_id: e.target.value }))}
                    required
                  >
                    <option value="">-- Select your shift --</option>
                    {myShifts.map(shift => (
                      <option key={shift.id} value={shift.id}>
                        {formatDate(shift.schedule_date)} ({shift.shift_start}-{shift.shift_end})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Reason (optional):</label>
                  <textarea
                    value={swapForm.reason}
                    onChange={e => setSwapForm(prev => ({ ...prev, reason: e.target.value }))}
                    rows="2"
                    placeholder="Why do you want to swap?"
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setShowSwapModal(false)}
                    disabled={swapSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit" disabled={swapSubmitting}>
                    {swapSubmitting ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Extra Shift Request Form Modal */}
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
