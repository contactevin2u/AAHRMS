import React, { useState, useEffect, useCallback } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { canApproveShiftSwap, isSupervisorOrManager } from '../../utils/permissions';
import './ESSCalendar.css';

function ESSCalendar() {
  const [activeTab, setActiveTab] = useState('calendar');

  // Get employee info from localStorage
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const showApprovalSection = canApproveShiftSwap(employeeInfo);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [publicHolidays, setPublicHolidays] = useState({});

  // Outlet calendar state
  const [outletSchedules, setOutletSchedules] = useState([]);
  const [outletLoading, setOutletLoading] = useState(false);
  const [hasOutlet, setHasOutlet] = useState(true);

  // Date staff popup state
  const [showDatePopup, setShowDatePopup] = useState(false);
  const [datePopupData, setDatePopupData] = useState({ date: null, staff: [], holiday: null });
  const [selectedStaff, setSelectedStaff] = useState([]);
  const [dateStaffLoading, setDateStaffLoading] = useState(false);

  // Swap requests state
  const [swapRequests, setSwapRequests] = useState([]);
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Team schedules state (supervisor/manager only)
  const [teamEmployees, setTeamEmployees] = useState([]);
  const [teamOutlets, setTeamOutlets] = useState([]);
  const [teamSchedules, setTeamSchedules] = useState({});
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamExtraRequests, setTeamExtraRequests] = useState([]);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    employee_id: '',
    schedule_date: '',
    shift_start: '09:00',
    shift_end: '18:00'
  });
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Swap form state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapAction, setSwapAction] = useState('swap'); // 'swap' or 'replace'
  const [selectedColleagueShift, setSelectedColleagueShift] = useState(null);
  const [myShifts, setMyShifts] = useState([]);
  const [swapForm, setSwapForm] = useState({
    requester_shift_id: '',
    target_id: '',
    target_shift_id: '',
    reason: ''
  });
  const [swapSubmitting, setSwapSubmitting] = useState(false);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Fetch schedule data and holidays
  const fetchScheduleData = useCallback(async () => {
    try {
      setLoading(true);
      const [schedRes, holidayRes] = await Promise.all([
        essApi.getMySchedule(currentYear, currentMonth),
        essApi.getPublicHolidays(currentYear, currentMonth)
      ]);
      setSchedules(schedRes.data.schedules || {});
      setSummary(schedRes.data.summary || null);
      setPublicHolidays(holidayRes.data || {});
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
      const [schedRes, holidayRes] = await Promise.all([
        essApi.getOutletCalendar(currentYear, currentMonth),
        essApi.getPublicHolidays(currentYear, currentMonth)
      ]);
      setOutletSchedules(schedRes.data || []);
      setPublicHolidays(holidayRes.data || {});
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

  // Fetch pending approvals (for supervisor/manager)
  const fetchPendingApprovals = useCallback(async () => {
    if (!showApprovalSection) return;

    try {
      setApprovalsLoading(true);
      const res = await essApi.getPendingSwapApprovals();
      setPendingApprovals(res.data || []);
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
    } finally {
      setApprovalsLoading(false);
    }
  }, [showApprovalSection]);

  // Fetch team schedules (supervisor/manager only)
  const fetchTeamSchedules = useCallback(async () => {
    if (!isSupervisorOrManager(employeeInfo)) return;

    try {
      setTeamLoading(true);
      const [empRes, schedRes, extraRes] = await Promise.all([
        essApi.getTeamEmployees(),
        essApi.getTeamSchedules({ year: currentYear, month: currentMonth }),
        essApi.getTeamExtraShiftRequests()
      ]);
      setTeamEmployees(empRes.data.employees || []);
      setTeamOutlets(empRes.data.outlets || []);
      setTeamSchedules(schedRes.data.schedules || {});
      setTeamExtraRequests(extraRes.data || []);
    } catch (error) {
      console.error('Error fetching team schedules:', error);
    } finally {
      setTeamLoading(false);
    }
  }, [employeeInfo, currentYear, currentMonth]);

  useEffect(() => {
    if (activeTab === 'outlet') {
      fetchOutletCalendar();
    } else if (activeTab === 'swaps') {
      fetchSwapRequests();
      if (showApprovalSection) {
        fetchPendingApprovals();
      }
    } else if (activeTab === 'team') {
      fetchTeamSchedules();
    }
  }, [activeTab, fetchOutletCalendar, fetchSwapRequests, fetchPendingApprovals, showApprovalSection, fetchTeamSchedules]);

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
      const holiday = publicHolidays[dateStr];
      days.push({
        date: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        schedule,
        holiday
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
      days.push({ date: null, isCurrentMonth: false, shifts: [], holiday: null });
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const shifts = outletSchedules.filter(s => s.schedule_date.split('T')[0] === dateStr);
      const holiday = publicHolidays[dateStr];
      days.push({
        date: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        shifts,
        holiday,
        staffCount: shifts.length
      });
    }

    return days;
  };

  // Handle day click on My Schedule
  const handleDayClick = (day) => {
    if (!day.isCurrentMonth || !day.date) return;
    setSelectedDay(day);
  };

  // Handle outlet day click - show staff popup
  const handleOutletDayClick = async (day) => {
    if (!day.isCurrentMonth || !day.date) return;

    setDateStaffLoading(true);
    setShowDatePopup(true);
    setSelectedStaff([]);

    try {
      const res = await essApi.getDateStaff(day.dateStr);
      setDatePopupData({
        date: day.dateStr,
        staff: res.data || [],
        holiday: day.holiday
      });
    } catch (error) {
      console.error('Error fetching date staff:', error);
      setDatePopupData({
        date: day.dateStr,
        staff: [],
        holiday: day.holiday
      });
    } finally {
      setDateStaffLoading(false);
    }
  };

  // Toggle staff selection
  const toggleStaffSelection = (staffMember) => {
    if (!staffMember.can_swap) return;

    setSelectedStaff(prev => {
      const isSelected = prev.some(s => s.schedule_id === staffMember.schedule_id);
      if (isSelected) {
        return prev.filter(s => s.schedule_id !== staffMember.schedule_id);
      } else {
        return [...prev, staffMember];
      }
    });
  };

  // Handle swap/replace action
  const handleSwapAction = async (action) => {
    if (selectedStaff.length === 0) return;

    // For now, only support single employee swap
    const target = selectedStaff[0];
    setSwapAction(action);
    setSelectedColleagueShift({
      id: target.schedule_id,
      employee_id: target.employee_id,
      employee_name: target.employee_name,
      schedule_date: target.schedule_date,
      shift_start: target.shift_start,
      shift_end: target.shift_end
    });

    setSwapForm({
      requester_shift_id: '',
      target_id: target.employee_id,
      target_shift_id: target.schedule_id,
      reason: ''
    });

    try {
      const res = await essApi.getMyShifts();
      setMyShifts(res.data || []);
    } catch (error) {
      console.error('Error fetching my shifts:', error);
    }

    setShowDatePopup(false);
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
      setSelectedStaff([]);
      alert('Swap request sent! Waiting for colleague approval.');
      fetchSwapRequests();
    } catch (error) {
      console.error('Error submitting swap request:', error);
      alert(error.response?.data?.error || 'Failed to submit swap request');
    } finally {
      setSwapSubmitting(false);
    }
  };

  // Handle swap response (accept/reject by target)
  const handleSwapResponse = async (id, response) => {
    const confirmMsg = response === 'accepted'
      ? 'Accept this swap request?'
      : 'Reject this swap request?';

    if (!window.confirm(confirmMsg)) return;

    try {
      await essApi.respondToSwap(id, response);
      fetchSwapRequests();
      alert(response === 'accepted'
        ? 'Accepted! Waiting for supervisor approval.'
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

  // Supervisor approval handlers
  const handleSupervisorApprove = async (id) => {
    if (!window.confirm('Approve this shift swap?')) return;

    try {
      setSubmitting(true);
      await essApi.supervisorApproveSwap(id);
      alert('Shift swap approved. Schedules have been updated.');
      fetchPendingApprovals();
    } catch (error) {
      console.error('Error approving swap:', error);
      alert(error.response?.data?.error || 'Failed to approve swap');
    } finally {
      setSubmitting(false);
    }
  };

  const openSupervisorRejectModal = (swap) => {
    setSelectedSwap(swap);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleSupervisorReject = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      setSubmitting(true);
      await essApi.supervisorRejectSwap(selectedSwap.id, rejectReason);
      alert('Shift swap rejected.');
      setShowRejectModal(false);
      setSelectedSwap(null);
      setRejectReason('');
      fetchPendingApprovals();
    } catch (error) {
      console.error('Error rejecting swap:', error);
      alert(error.response?.data?.error || 'Failed to reject swap');
    } finally {
      setSubmitting(false);
    }
  };

  // Team schedule handlers (supervisor/manager)
  const openAddScheduleModal = (date = null) => {
    setEditingSchedule(null);
    setScheduleForm({
      employee_id: '',
      schedule_date: date || '',
      shift_start: '09:00',
      shift_end: '18:00'
    });
    setShowAddScheduleModal(true);
  };

  const openEditScheduleModal = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      employee_id: schedule.employee_id,
      schedule_date: schedule.schedule_date.split('T')[0],
      shift_start: schedule.shift_start,
      shift_end: schedule.shift_end
    });
    setShowAddScheduleModal(true);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!scheduleForm.employee_id || !scheduleForm.schedule_date || !scheduleForm.shift_start || !scheduleForm.shift_end) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setScheduleSubmitting(true);
      if (editingSchedule) {
        await essApi.updateTeamSchedule(editingSchedule.id, {
          shift_start: scheduleForm.shift_start,
          shift_end: scheduleForm.shift_end
        });
        alert('Schedule updated successfully');
      } else {
        await essApi.createTeamSchedule(scheduleForm);
        alert('Schedule created successfully');
      }
      setShowAddScheduleModal(false);
      fetchTeamSchedules();
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert(error.response?.data?.error || 'Failed to save schedule');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Delete this schedule?')) return;

    try {
      await essApi.deleteTeamSchedule(scheduleId);
      alert('Schedule deleted');
      fetchTeamSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert(error.response?.data?.error || 'Failed to delete schedule');
    }
  };

  const handleApproveExtraShift = async (id) => {
    if (!window.confirm('Approve this extra shift request?')) return;

    try {
      await essApi.approveExtraShift(id);
      alert('Extra shift approved and schedule created');
      fetchTeamSchedules();
    } catch (error) {
      console.error('Error approving extra shift:', error);
      alert(error.response?.data?.error || 'Failed to approve');
    }
  };

  const handleRejectExtraShift = async (id) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;

    try {
      await essApi.rejectExtraShift(id, reason);
      alert('Extra shift request rejected');
      fetchTeamSchedules();
    } catch (error) {
      console.error('Error rejecting extra shift:', error);
      alert(error.response?.data?.error || 'Failed to reject');
    }
  };

  // Generate team calendar days
  const generateTeamCalendarDays = () => {
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
      const shifts = teamSchedules[dateStr] || [];
      days.push({
        date: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === new Date().toISOString().split('T')[0],
        shifts,
        staffCount: shifts.length
      });
    }

    return days;
  };

  const teamCalendarDays = isSupervisorOrManager(employeeInfo) ? generateTeamCalendarDays() : [];

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

  const formatFullDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-MY', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const getSwapStatusLabel = (request) => {
    switch (request.status) {
      case 'pending_target':
        return request.is_incoming ? 'Needs Your Response' : 'Waiting for Colleague';
      case 'pending_supervisor':
        return 'Waiting for Supervisor';
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
    <ESSLayout>
      <div className="ess-calendar-page">
        {/* Page Header */}
        <div className="ess-page-header">
          <div className="header-content">
            <h1>Calendar</h1>
            <p>View schedule and manage shift swaps</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="ess-tabs">
          <button
            className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            My Schedule
          </button>
          <button
            className={`tab-btn ${activeTab === 'outlet' ? 'active' : ''}`}
            onClick={() => setActiveTab('outlet')}
          >
            Outlet
          </button>
          {isSupervisorOrManager(employeeInfo) && (
            <button
              className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
              onClick={() => setActiveTab('team')}
            >
              Team
              {teamExtraRequests.length > 0 && (
                <span className="tab-badge">{teamExtraRequests.length}</span>
              )}
            </button>
          )}
          <button
            className={`tab-btn ${activeTab === 'swaps' ? 'active' : ''}`}
            onClick={() => setActiveTab('swaps')}
          >
            Swaps
            {(incomingSwaps.length > 0 || pendingApprovals.length > 0) && (
              <span className="tab-badge">{incomingSwaps.length + pendingApprovals.length}</span>
            )}
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
              <div className="ess-loading">
                <div className="spinner"></div>
                <p>Loading schedule...</p>
              </div>
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
                      className={`calendar-day ${day.isCurrentMonth ? '' : 'other'} ${day.isToday ? 'today' : ''} ${day.schedule ? getStatusClass(day.schedule) : ''} ${day.holiday ? 'holiday' : ''}`}
                      onClick={() => handleDayClick(day)}
                    >
                      <span className="day-num">{day.date || ''}</span>
                      {day.schedule && (
                        <div className="shift-indicator">
                          {day.schedule.shift_start}
                        </div>
                      )}
                      {day.holiday && (
                        <div className="holiday-name" title={day.holiday}>
                          {day.holiday.substring(0, 6)}
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
              <div className="legend-item">
                <span className="dot holiday"></span> Holiday
              </div>
            </div>
          </>
        )}

        {/* Outlet Calendar Tab */}
        {activeTab === 'outlet' && (
          <>
            {!hasOutlet ? (
              <div className="empty-state">
                <span className="empty-icon">&#x1F3E2;</span>
                <p>You are not assigned to an outlet</p>
              </div>
            ) : (
              <>
                <div className="outlet-calendar-info">
                  <p>Tap on any date to view staff and request shift swap</p>
                </div>

                <div className="calendar-nav-ess">
                  <button onClick={goToPrevMonth}>&lt;</button>
                  <span className="current-month">
                    {monthNames[currentMonth - 1]} {currentYear}
                  </span>
                  <button onClick={goToNextMonth}>&gt;</button>
                </div>

                {outletLoading ? (
                  <div className="ess-loading">
                    <div className="spinner"></div>
                    <p>Loading outlet schedule...</p>
                  </div>
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
                          className={`calendar-day outlet-day ${day.isCurrentMonth ? '' : 'other'} ${day.isToday ? 'today' : ''} ${day.holiday ? 'holiday' : ''}`}
                          onClick={() => handleOutletDayClick(day)}
                        >
                          <span className="day-num">{day.date || ''}</span>
                          {day.staffCount > 0 && (
                            <div className="staff-count">
                              {day.staffCount} staff
                            </div>
                          )}
                          {day.holiday && (
                            <div className="holiday-name" title={day.holiday}>
                              {day.holiday.substring(0, 8)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="calendar-legend">
                  <div className="legend-item">
                    <span className="dot mine"></span> My Shift
                  </div>
                  <div className="legend-item">
                    <span className="dot colleague"></span> Colleague
                  </div>
                  <div className="legend-item">
                    <span className="dot holiday"></span> Holiday
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Team Schedules Tab (Supervisor/Manager only) */}
        {activeTab === 'team' && isSupervisorOrManager(employeeInfo) && (
          <div className="team-schedules-section">
            {teamLoading ? (
              <div className="ess-loading">
                <div className="spinner"></div>
                <p>Loading team schedules...</p>
              </div>
            ) : (
              <>
                {/* Add Schedule Button */}
                <div className="team-header">
                  <button className="add-schedule-btn" onClick={() => openAddScheduleModal()}>
                    + Add Schedule
                  </button>
                </div>

                {/* Extra Shift Requests */}
                {teamExtraRequests.length > 0 && (
                  <div className="extra-requests-section">
                    <h3>Extra Shift Requests ({teamExtraRequests.length})</h3>
                    <div className="requests-list">
                      {teamExtraRequests.map(req => (
                        <div key={req.id} className="request-card">
                          <div className="request-info">
                            <strong>{req.employee_name}</strong>
                            <span className="request-date">{formatDate(req.request_date)}</span>
                            <span className="request-time">{req.shift_start} - {req.shift_end}</span>
                            {req.reason && <p className="request-reason">{req.reason}</p>}
                          </div>
                          <div className="request-actions">
                            <button className="approve-btn" onClick={() => handleApproveExtraShift(req.id)}>Approve</button>
                            <button className="reject-btn" onClick={() => handleRejectExtraShift(req.id)}>Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team Calendar */}
                <div className="calendar-nav-ess">
                  <button onClick={goToPrevMonth}>&lt;</button>
                  <span className="current-month">
                    {monthNames[currentMonth - 1]} {currentYear}
                  </span>
                  <button onClick={goToNextMonth}>&gt;</button>
                </div>

                <div className="team-employees-info">
                  <span>{teamEmployees.length} team members</span>
                  {teamOutlets.length > 1 && <span> • {teamOutlets.length} outlets</span>}
                </div>

                <div className="ess-calendar team-calendar">
                  <div className="calendar-header-row">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                      <div key={i} className="calendar-header-cell">{day}</div>
                    ))}
                  </div>

                  <div className="calendar-body">
                    {teamCalendarDays.map((day, index) => (
                      <div
                        key={index}
                        className={`calendar-day team-day ${day.isCurrentMonth ? '' : 'other'} ${day.isToday ? 'today' : ''}`}
                        onClick={() => day.isCurrentMonth && day.date && openAddScheduleModal(day.dateStr)}
                      >
                        <span className="day-num">{day.date || ''}</span>
                        {day.staffCount > 0 && (
                          <div className="staff-count">{day.staffCount} staff</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Schedule List */}
                <div className="team-schedule-list">
                  <h3>Schedules This Month</h3>
                  {Object.keys(teamSchedules).length === 0 ? (
                    <p className="no-schedules">No schedules for this month</p>
                  ) : (
                    Object.entries(teamSchedules)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([date, shifts]) => (
                        <div key={date} className="schedule-day-group">
                          <div className="schedule-date-header">{formatDate(date)}</div>
                          {shifts.map(shift => (
                            <div key={shift.id} className="schedule-item">
                              <span className="emp-name">{shift.employee_name}</span>
                              <span className="shift-time">{shift.shift_start} - {shift.shift_end}</span>
                              <div className="schedule-actions">
                                <button className="edit-btn" onClick={() => openEditScheduleModal(shift)}>Edit</button>
                                <button className="delete-btn" onClick={() => handleDeleteSchedule(shift.id)}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Swaps Tab */}
        {activeTab === 'swaps' && (
          <div className="swaps-section">
            {swapsLoading || approvalsLoading ? (
              <div className="ess-loading">
                <div className="spinner"></div>
                <p>Loading swap requests...</p>
              </div>
            ) : (
              <>
                {/* Supervisor Approval Section */}
                {showApprovalSection && pendingApprovals.length > 0 && (
                  <div className="approval-section">
                    <h3>Pending Approvals</h3>
                    <div className="approval-list">
                      {pendingApprovals.map(swap => (
                        <div key={swap.id} className="approval-card">
                          <div className="approval-header">
                            <span className="approval-outlet">{swap.outlet_name}</span>
                            <span className="approval-status">Pending Your Approval</span>
                          </div>
                          <div className="approval-details">
                            <div className="swap-party">
                              <strong>{swap.requester_name}</strong>
                              <span>{formatDate(swap.requester_shift_date)}</span>
                              <span>{swap.requester_shift_start} - {swap.requester_shift_end}</span>
                            </div>
                            <div className="swap-arrow">&#x21C4;</div>
                            <div className="swap-party">
                              <strong>{swap.target_name}</strong>
                              <span>{formatDate(swap.target_shift_date)}</span>
                              <span>{swap.target_shift_start} - {swap.target_shift_end}</span>
                            </div>
                          </div>
                          <div className="approval-actions">
                            <button
                              className="approve-btn"
                              onClick={() => handleSupervisorApprove(swap.id)}
                              disabled={submitting}
                            >
                              Approve
                            </button>
                            <button
                              className="reject-btn"
                              onClick={() => openSupervisorRejectModal(swap)}
                              disabled={submitting}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                    <div className="empty-state small">
                      <p>No swap requests. Go to Outlet tab and tap on a date to request a swap.</p>
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

        {/* Selected Day Detail Modal */}
        {selectedDay && selectedDay.schedule && (
          <div className="ess-modal-overlay" onClick={() => setSelectedDay(null)}>
            <div className="ess-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {new Date(selectedDay.dateStr).toLocaleDateString('en-MY', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                </h2>
                <button className="close-btn" onClick={() => setSelectedDay(null)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                {selectedDay.holiday && (
                  <div className="holiday-banner">
                    {selectedDay.holiday}
                  </div>
                )}
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
              </div>
              <div className="modal-footer">
                <button className="cancel-btn" onClick={() => setSelectedDay(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Date Staff Popup */}
        {showDatePopup && (
          <div className="ess-modal-overlay" onClick={() => { setShowDatePopup(false); setSelectedStaff([]); }}>
            <div className="ess-modal date-staff-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{datePopupData.date ? formatFullDate(datePopupData.date) : 'Loading...'}</h2>
                <button className="close-btn" onClick={() => { setShowDatePopup(false); setSelectedStaff([]); }}>&#x2715;</button>
              </div>

              <div className="modal-body">
                {datePopupData.holiday && (
                  <div className="holiday-banner">
                    {datePopupData.holiday}
                  </div>
                )}

                {dateStaffLoading ? (
                  <div className="ess-loading">
                    <div className="spinner"></div>
                    <p>Loading staff...</p>
                  </div>
                ) : datePopupData.staff.length === 0 ? (
                  <div className="empty-state small">
                    <p>No staff scheduled for this date</p>
                  </div>
                ) : (
                  <div className="staff-list">
                    <div className="staff-list-header">
                      <span>Select staff to swap/replace shift:</span>
                    </div>
                    {datePopupData.staff.map(staff => (
                      <div
                        key={staff.schedule_id}
                        className={`staff-item ${staff.is_mine ? 'mine' : ''} ${!staff.can_swap ? 'disabled' : ''} ${selectedStaff.some(s => s.schedule_id === staff.schedule_id) ? 'selected' : ''}`}
                        onClick={() => toggleStaffSelection(staff)}
                      >
                        <div className="staff-checkbox">
                          {staff.can_swap ? (
                            <input
                              type="checkbox"
                              checked={selectedStaff.some(s => s.schedule_id === staff.schedule_id)}
                              onChange={() => {}}
                            />
                          ) : (
                            <span className="checkbox-disabled">{staff.is_mine ? 'You' : '-'}</span>
                          )}
                        </div>
                        <div className="staff-info">
                          <div className="staff-name">{staff.employee_name}</div>
                          <div className="staff-position">{staff.position}</div>
                        </div>
                        <div className="staff-shift">
                          {staff.shift_start} - {staff.shift_end}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedStaff.length > 0 && (
                <div className="modal-footer swap-actions-footer">
                  <button
                    className="swap-btn"
                    onClick={() => handleSwapAction('swap')}
                  >
                    Swap Shift
                  </button>
                  <button
                    className="replace-btn"
                    onClick={() => handleSwapAction('replace')}
                  >
                    Replace Shift
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Swap Request Modal */}
        {showSwapModal && selectedColleagueShift && (
          <div className="ess-modal-overlay" onClick={() => setShowSwapModal(false)}>
            <div className="ess-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{swapAction === 'swap' ? 'Swap Shift' : 'Replace Shift'}</h2>
                <button className="close-btn" onClick={() => setShowSwapModal(false)}>&#x2715;</button>
              </div>

              <form onSubmit={handleSubmitSwap}>
                <div className="modal-body">
                  <div className="swap-target-info">
                    <p>Request to {swapAction} with:</p>
                    <div className="target-shift">
                      <strong>{selectedColleagueShift.employee_name}'s shift</strong>
                      <span>{formatDate(selectedColleagueShift.schedule_date)}</span>
                      <span>{selectedColleagueShift.shift_start} - {selectedColleagueShift.shift_end}</span>
                    </div>
                  </div>

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
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setShowSwapModal(false)}
                    disabled={swapSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={swapSubmitting}>
                    {swapSubmitting ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Supervisor Reject Modal */}
        {showRejectModal && selectedSwap && (
          <div className="ess-modal-overlay" onClick={() => setShowRejectModal(false)}>
            <div className="ess-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Reject Shift Swap</h2>
                <button className="close-btn" onClick={() => setShowRejectModal(false)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                <p className="reject-info">
                  Rejecting swap between <strong>{selectedSwap.requester_name}</strong> and <strong>{selectedSwap.target_name}</strong>
                </p>
                <div className="form-group">
                  <label>Rejection Reason *</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter reason for rejection"
                    rows="3"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="cancel-btn" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="reject-submit-btn"
                  onClick={handleSupervisorReject}
                  disabled={submitting || !rejectReason.trim()}
                >
                  {submitting ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Schedule Modal */}
        {showAddScheduleModal && (
          <div className="modal-overlay" onClick={() => setShowAddScheduleModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</h2>
                <button className="close-btn" onClick={() => setShowAddScheduleModal(false)}>&times;</button>
              </div>
              <form onSubmit={handleSaveSchedule}>
                <div className="form-group">
                  <label>Employee</label>
                  <select
                    value={scheduleForm.employee_id}
                    onChange={e => setScheduleForm({...scheduleForm, employee_id: e.target.value})}
                    required
                    disabled={!!editingSchedule}
                  >
                    <option value="">Select Employee</option>
                    {teamEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.outlet_name ? `(${emp.outlet_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={scheduleForm.schedule_date}
                    onChange={e => setScheduleForm({...scheduleForm, schedule_date: e.target.value})}
                    required
                    disabled={!!editingSchedule}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Shift Start</label>
                    <input
                      type="time"
                      value={scheduleForm.shift_start}
                      onChange={e => setScheduleForm({...scheduleForm, shift_start: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Shift End</label>
                    <input
                      type="time"
                      value={scheduleForm.shift_end}
                      onChange={e => setScheduleForm({...scheduleForm, shift_end: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowAddScheduleModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={scheduleSubmitting}>
                    {scheduleSubmitting ? 'Saving...' : (editingSchedule ? 'Update' : 'Create')}
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

export default ESSCalendar;
