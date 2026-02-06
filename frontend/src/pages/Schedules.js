import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { schedulesApi, outletsApi, employeeApi, leaveApi, attendanceApi } from '../api';
import './Schedules.css';

function Schedules({ outletId: propOutletId, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User info
  const [adminInfo, setAdminInfo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Data
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [roster, setRoster] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [publicHolidays, setPublicHolidays] = useState([]);
  const [schedulePermissions, setSchedulePermissions] = useState(null);

  // Week navigation
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(today.setDate(diff));
  });

  // Tabs for requests (only for admin)
  const [activeTab, setActiveTab] = useState('schedule');
  const [extraShiftRequests, setExtraShiftRequests] = useState([]);
  const [swapRequests, setSwapRequests] = useState([]);

  // Workers without schedule (for suggestion notes)
  const [workersWithoutSchedule, setWorkersWithoutSchedule] = useState([]);

  // Assign schedule modal (for workers without schedule)
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningRecord, setAssigningRecord] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Shift template management
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    code: '',
    name: '',
    color: '#22C55E',
    start_time: '09:00',
    end_time: '18:00',
    is_off: false
  });

  // Get user info on mount
  useEffect(() => {
    const storedInfo = localStorage.getItem('adminInfo');
    if (storedInfo) {
      const info = JSON.parse(storedInfo);
      setAdminInfo(info);
      // Admin roles: super_admin, boss, admin. Others are supervisors/managers
      setIsAdmin(['super_admin', 'boss', 'admin', 'director'].includes(info.role));
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [outletsRes, templatesRes, permissionsRes] = await Promise.all([
          outletsApi.getAll(),
          schedulesApi.getTemplates(),
          schedulesApi.getPermissions().catch(() => ({ data: null }))
        ]);

        // Set schedule permissions
        if (permissionsRes.data) {
          setSchedulePermissions(permissionsRes.data);
        }

        const allOutlets = outletsRes.data || [];
        setOutlets(allOutlets);
        setTemplates(templatesRes.data || []);

        // Pre-select outlet if propOutletId is provided
        if (propOutletId) {
          const lockedOutlet = allOutlets.find(o => o.id === parseInt(propOutletId));
          if (lockedOutlet) {
            setSelectedOutlet(lockedOutlet);
          }
        } else if (adminInfo && !isAdmin && adminInfo.outlet_id) {
          // For non-admin (supervisor), filter to their outlet only
          const myOutlet = allOutlets.find(o => o.id === adminInfo.outlet_id);
          if (myOutlet) {
            setSelectedOutlet(myOutlet);
          }
        } else if (allOutlets.length > 0) {
          setSelectedOutlet(allOutlets[0]);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (adminInfo) {
      fetchInitialData();
    }
  }, [adminInfo, isAdmin]);

  // Get week dates
  const getWeekDates = useCallback(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      dates.push({
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-MY', { weekday: 'short' }).toUpperCase(),
        dayNum: date.getDate(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6
      });
    }
    return dates;
  }, [currentWeekStart]);

  // Fetch roster for selected outlet
  const fetchRoster = useCallback(async () => {
    if (!selectedOutlet) return;

    try {
      setLoading(true);
      const startDate = currentWeekStart.toISOString().split('T')[0];
      const res = await schedulesApi.getWeeklyRoster(selectedOutlet.id, startDate);
      setRoster(res.data.roster || []);

      // Fetch public holidays for the week
      const year = currentWeekStart.getFullYear();
      const month = currentWeekStart.getMonth() + 1;
      try {
        const phRes = await leaveApi.getHolidays({ year, limit: 100 });
        setPublicHolidays(phRes.data || []);
      } catch (e) {
        setPublicHolidays([]);
      }
    } catch (error) {
      console.error('Error fetching roster:', error);
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet, currentWeekStart]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Fetch workers who clocked in without schedule (for suggestion notes)
  const fetchWorkersWithoutSchedule = useCallback(async () => {
    if (!selectedOutlet || !isAdmin) {
      setWorkersWithoutSchedule([]);
      return;
    }

    try {
      const weekDates = getWeekDates();
      const startDate = weekDates[0].date;
      const endDate = weekDates[6].date;

      // Fetch attendance records for this outlet and date range
      const res = await attendanceApi.getAll({
        outlet_id: selectedOutlet.id,
        start_date: startDate,
        end_date: endDate
      });

      // Filter records that have no schedule (has_schedule = false or null)
      const noScheduleRecords = (res.data || []).filter(r =>
        r.has_schedule === false || r.has_schedule === null
      );

      // Group by employee and date
      const grouped = {};
      noScheduleRecords.forEach(r => {
        const key = `${r.employee_id}-${r.work_date}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: r.id,  // clock_in_record id for API call
            employee_id: r.employee_id,
            employee_name: r.employee_name,
            emp_code: r.emp_code,
            work_date: r.work_date,
            clock_in_1: r.clock_in_1,
            clock_out_2: r.clock_out_2,
            total_hours: r.total_hours
          };
        }
      });

      setWorkersWithoutSchedule(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching workers without schedule:', error);
      setWorkersWithoutSchedule([]);
    }
  }, [selectedOutlet, isAdmin, getWeekDates]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      fetchWorkersWithoutSchedule();
    }
  }, [activeTab, fetchWorkersWithoutSchedule, currentWeekStart]);

  // Fetch pending requests (admin only)
  const fetchRequests = useCallback(async () => {
    if (!isAdmin || !selectedOutlet) return;

    try {
      const [extraRes, swapRes] = await Promise.all([
        schedulesApi.getExtraShiftRequests({ status: 'pending', outlet_id: selectedOutlet.id }),
        schedulesApi.getPendingSwapRequests(selectedOutlet.id)
      ]);
      setExtraShiftRequests(extraRes.data || []);
      setSwapRequests(swapRes.data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  }, [isAdmin, selectedOutlet]);

  useEffect(() => {
    if (activeTab === 'requests' || activeTab === 'swaps') {
      fetchRequests();
    }
  }, [activeTab, fetchRequests]);

  // Navigation
  const goToPrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToThisWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(today.setDate(diff)));
  };

  // Check if date is public holiday
  const isPublicHoliday = (dateStr) => {
    return publicHolidays.some(ph => ph.date?.split('T')[0] === dateStr);
  };

  // Check if a date can be edited based on permissions
  const canEditDate = (dateStr) => {
    if (!schedulePermissions) return true; // If permissions not loaded, allow (backend will enforce)

    // Full access - can edit all dates
    if (schedulePermissions.can_edit_all) return true;

    // Restricted access (supervisor) - can only edit T+3 onwards
    if (schedulePermissions.can_edit_future_only && schedulePermissions.min_edit_date) {
      return dateStr >= schedulePermissions.min_edit_date;
    }

    // No edit access
    return false;
  };

  // Get restriction message for a date
  const getDateRestrictionMessage = (dateStr) => {
    if (!schedulePermissions) return null;
    if (schedulePermissions.can_edit_all) return null;

    if (schedulePermissions.can_edit_future_only && schedulePermissions.min_edit_date) {
      if (dateStr < schedulePermissions.min_edit_date) {
        return schedulePermissions.restriction_message || 'You cannot edit this date';
      }
    }

    if (!schedulePermissions.can_edit_all && !schedulePermissions.can_edit_future_only) {
      return schedulePermissions.restriction_message || 'You do not have permission to edit schedules';
    }

    return null;
  };

  // Get shift code/color for display
  const getShiftDisplay = (shift) => {
    if (!shift || !shift.shift_code) return null;
    return {
      code: shift.shift_code,
      color: shift.shift_color || '#94a3b8'
    };
  };

  // Handle shift cell click - cycle through shifts
  const handleShiftClick = async (employeeId, date) => {
    if (saving) return;

    // Check edit permission for this date
    if (!canEditDate(date)) {
      const message = getDateRestrictionMessage(date);
      alert(message || 'You cannot edit this schedule');
      return;
    }

    const employee = roster.find(e => e.employee_id === employeeId);
    if (!employee) return;

    const currentShift = employee.shifts.find(s => s.date === date);
    const workTemplates = templates.filter(t => !t.is_off);

    // If no templates available, show error
    if (workTemplates.length === 0) {
      alert('No shift templates found. Please set up shift templates first.');
      return;
    }

    // Find next template in cycle: template1 -> template2 -> OFF -> template1
    let nextTemplateIndex = -1;
    if (!currentShift?.shift_template_id) {
      nextTemplateIndex = 0;
    } else {
      const currentIndex = workTemplates.findIndex(t => t.id === currentShift.shift_template_id);
      nextTemplateIndex = currentIndex + 1;
      if (nextTemplateIndex >= workTemplates.length) {
        nextTemplateIndex = -1; // OFF
      }
    }

    try {
      setSaving(true);
      if (nextTemplateIndex === -1) {
        // Clear the schedule (OFF)
        await schedulesApi.clearSchedule(employeeId, date);
      } else {
        // Assign shift
        const template = workTemplates[nextTemplateIndex];
        await schedulesApi.assignShift({
          employee_id: employeeId,
          schedule_date: date,
          shift_template_id: template.id,
          outlet_id: selectedOutlet.id
        });
      }

      // Update local state
      const assignedTemplate = nextTemplateIndex >= 0 ? workTemplates[nextTemplateIndex] : null;

      setRoster(prev => prev.map(emp => {
        if (emp.employee_id !== employeeId) return emp;

        const shiftIndex = emp.shifts.findIndex(s => s.date === date);
        let newShifts = [...emp.shifts];

        if (!assignedTemplate) {
          // OFF - clear the shift
          if (shiftIndex >= 0) {
            newShifts[shiftIndex] = { date, shift_code: null, shift_color: null, shift_template_id: null };
          }
        } else {
          const newShift = {
            date,
            shift_template_id: assignedTemplate.id,
            shift_code: assignedTemplate.code,
            shift_color: assignedTemplate.color,
            is_off: false
          };
          if (shiftIndex >= 0) {
            newShifts[shiftIndex] = newShift;
          } else {
            newShifts.push(newShift);
          }
        }

        return { ...emp, shifts: newShifts };
      }));
    } catch (error) {
      console.error('Error updating shift:', error);
      alert(error.response?.data?.error || 'Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  // Calculate coverage for a day
  const getCoverage = (date) => {
    const working = roster.filter(emp => {
      const shift = emp.shifts.find(s => s.date === date);
      return shift?.shift_code && !shift?.is_off;
    }).length;

    const required = selectedOutlet?.min_staff || 2; // Default minimum staff
    return { working, required };
  };

  // Get outlet summary (for admin view)
  const getOutletSummary = (outlet) => {
    // This would ideally come from an API call, but for now we'll calculate if we have the data
    // For simplicity, just show the outlet and a placeholder
    const isSelected = selectedOutlet?.id === outlet.id;
    return {
      name: outlet.name,
      isSelected,
      needsAttention: false // Would need API to determine this
    };
  };

  // Copy last week's schedule
  const copyLastWeek = async () => {
    if (!selectedOutlet) return;

    if (!window.confirm('Copy last week\'s schedule to this week? This will overwrite existing assignments.')) {
      return;
    }

    try {
      setSaving(true);

      // Calculate last week's dates
      const lastWeekStart = new Date(currentWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      // Get last week's roster
      const lastWeekRes = await schedulesApi.getWeeklyRoster(
        selectedOutlet.id,
        lastWeekStart.toISOString().split('T')[0]
      );

      const lastWeekRoster = lastWeekRes.data.roster || [];
      const weekDates = getWeekDates();

      // Create assignments for this week based on last week
      const assignments = [];
      lastWeekRoster.forEach(emp => {
        emp.shifts.forEach((shift, index) => {
          if (shift.shift_template_id) {
            assignments.push({
              employee_id: emp.employee_id,
              schedule_date: weekDates[index].date,
              shift_template_id: shift.shift_template_id
            });
          }
        });
      });

      if (assignments.length > 0) {
        await schedulesApi.bulkAssignShifts(selectedOutlet.id, assignments);
      }

      fetchRoster();
      alert('Schedule copied successfully!');
    } catch (error) {
      console.error('Error copying schedule:', error);
      alert(error.response?.data?.error || 'Failed to copy schedule');
    } finally {
      setSaving(false);
    }
  };

  // Handle request approvals
  const handleApproveExtraShift = async (id) => {
    try {
      await schedulesApi.approveExtraShift(id);
      fetchRequests();
      fetchRoster();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve');
    }
  };

  const handleRejectExtraShift = async (id) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      await schedulesApi.rejectExtraShift(id, reason);
      fetchRequests();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reject');
    }
  };

  const handleApproveSwap = async (id) => {
    if (!window.confirm('Approve this shift swap?')) return;
    try {
      await schedulesApi.approveSwap(id);
      fetchRequests();
      fetchRoster();
      alert('Shift swap approved!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve');
    }
  };

  const handleRejectSwap = async (id) => {
    const reason = prompt('Rejection reason:');
    try {
      await schedulesApi.rejectSwap(id, reason || '');
      fetchRequests();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reject');
    }
  };

  // Assign schedule for workers without schedule
  const openAssignScheduleModal = (record) => {
    setAssigningRecord(record);
    setSelectedTemplateId('');
    setShowAssignModal(true);
  };

  const handleAssignSchedule = async () => {
    if (!selectedTemplateId) {
      alert('Please select a shift template');
      return;
    }

    try {
      await attendanceApi.approveWithSchedule(assigningRecord.record_id || assigningRecord.id, {
        shift_template_id: parseInt(selectedTemplateId)
      });
      alert('Schedule assigned and attendance approved!');
      setShowAssignModal(false);
      setAssigningRecord(null);
      fetchWorkersWithoutSchedule();
      fetchRoster();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign schedule');
    }
  };

  // Template management functions
  const openAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      code: '',
      name: '',
      color: '#22C55E',
      start_time: '09:00',
      end_time: '18:00',
      is_off: false
    });
    setShowTemplateModal(true);
  };

  const openEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      code: template.code || '',
      name: template.name || '',
      color: template.color || '#22C55E',
      start_time: template.start_time || '09:00',
      end_time: template.end_time || '18:00',
      is_off: template.is_off || false
    });
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!templateForm.code.trim()) {
      alert('Please enter a shift code');
      return;
    }

    try {
      setSaving(true);
      if (editingTemplate) {
        await schedulesApi.updateTemplate(editingTemplate.id, templateForm);
      } else {
        await schedulesApi.createTemplate(templateForm);
      }

      // Refresh templates
      const res = await schedulesApi.getTemplates();
      setTemplates(res.data || []);
      setShowTemplateModal(false);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save shift template');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this shift template? This will not affect existing schedules.')) return;

    try {
      await schedulesApi.deleteTemplate(id);
      const res = await schedulesApi.getTemplates();
      setTemplates(res.data || []);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete template');
    }
  };

  const weekDates = getWeekDates();
  const weekLabel = `${weekDates[0].dayNum} - ${weekDates[6].dayNum} ${new Date(weekDates[0].date).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}`;

  const isOutletLocked = !!propOutletId;

  const content = (
      <div className="schedules-page-v2">
        {!embedded && (
        <header className="page-header">
          <div>
            <h1>Staff Schedules</h1>
            <p>{isAdmin ? 'Manage all outlet schedules' : `${selectedOutlet?.name || 'Your Outlet'} Schedule`}</p>
          </div>
        </header>
        )}

        {/* Tabs - Admin only sees requests tabs */}
        {isAdmin && (
          <div className="schedule-tabs">
            <button
              className={activeTab === 'schedule' ? 'active' : ''}
              onClick={() => setActiveTab('schedule')}
            >
              Schedule
            </button>
            <button
              className={activeTab === 'shifts' ? 'active' : ''}
              onClick={() => setActiveTab('shifts')}
            >
              Manage Shifts
            </button>
            <button
              className={activeTab === 'requests' ? 'active' : ''}
              onClick={() => setActiveTab('requests')}
            >
              Extra Shifts
              {extraShiftRequests.length > 0 && <span className="badge">{extraShiftRequests.length}</span>}
            </button>
            <button
              className={activeTab === 'swaps' ? 'active' : ''}
              onClick={() => setActiveTab('swaps')}
            >
              Swap Requests
              {swapRequests.length > 0 && <span className="badge">{swapRequests.length}</span>}
            </button>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className={`schedule-layout ${isAdmin ? 'admin-view' : 'supervisor-view'}`}>
            {/* Left Panel - Outlet List (Admin only, hidden when outlet locked) */}
            {isAdmin && !isOutletLocked && (
              <div className="outlet-list-panel">
                <h3>Outlets</h3>
                <div className="outlet-items">
                  {outlets.map(outlet => {
                    const summary = getOutletSummary(outlet);
                    return (
                      <button
                        key={outlet.id}
                        className={`outlet-item ${summary.isSelected ? 'selected' : ''} ${summary.needsAttention ? 'warning' : ''}`}
                        onClick={() => setSelectedOutlet(outlet)}
                      >
                        <span className="outlet-indicator">{summary.isSelected ? '●' : '○'}</span>
                        <span className="outlet-name">{outlet.name}</span>
                        {summary.needsAttention && <span className="warning-icon">⚠️</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Right Panel - Schedule Grid */}
            <div className="schedule-grid-panel">
              {/* Week Navigation */}
              <div className="week-nav">
                <div className="outlet-title">
                  {selectedOutlet?.name || 'Select Outlet'}
                </div>
                <div className="week-controls">
                  <button onClick={goToPrevWeek} className="nav-btn">&lt;</button>
                  <span className="week-label">Week: {weekLabel}</span>
                  <button onClick={goToNextWeek} className="nav-btn">&gt;</button>
                  <button onClick={goToThisWeek} className="today-btn">This Week</button>
                </div>
              </div>

              {loading ? (
                <div className="loading">Loading schedule...</div>
              ) : !selectedOutlet ? (
                <div className="no-data">Select an outlet to view schedule</div>
              ) : (
                <>
                  {/* Schedule Grid */}
                  <div className="roster-grid">
                    <table>
                      <thead>
                        <tr>
                          <th className="staff-col">Staff</th>
                          {weekDates.map(d => (
                            <th key={d.date} className={`day-col ${d.isWeekend ? 'weekend' : ''}`}>
                              <div className="day-header">
                                <span className="day-name">{d.dayName}</span>
                                <span className="day-num">{d.dayNum}</span>
                                {isPublicHoliday(d.date) && <span className="ph-marker">★PH</span>}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {roster.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="no-staff">No staff assigned to this outlet</td>
                          </tr>
                        ) : (
                          roster.map(emp => (
                            <tr key={emp.employee_id}>
                              <td className="staff-name">{emp.name.split(' ')[0]}</td>
                              {weekDates.map((d, idx) => {
                                const shift = emp.shifts.find(s => s.date === d.date);
                                const display = getShiftDisplay(shift);
                                const isLocked = !canEditDate(d.date);

                                return (
                                  <td
                                    key={d.date}
                                    className={`shift-cell ${d.isWeekend ? 'weekend' : ''} ${display ? 'has-shift' : 'off'} ${isLocked ? 'locked' : ''}`}
                                    onClick={() => handleShiftClick(emp.employee_id, d.date)}
                                    style={{
                                      cursor: isLocked ? 'not-allowed' : 'pointer',
                                      opacity: isLocked ? 0.6 : 1
                                    }}
                                    title={isLocked ? getDateRestrictionMessage(d.date) : 'Click to change shift'}
                                  >
                                    {display ? (
                                      <span
                                        className="shift-badge"
                                        style={{ backgroundColor: display.color }}
                                      >
                                        {display.code}
                                      </span>
                                    ) : (
                                      <span className="off-badge">⚪</span>
                                    )}
                                    {isLocked && <span className="lock-icon">🔒</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}

                        {/* Coverage Row */}
                        <tr className="coverage-row">
                          <td className="coverage-label">Coverage</td>
                          {weekDates.map(d => {
                            const coverage = getCoverage(d.date);
                            const isLow = coverage.working < coverage.required;
                            return (
                              <td key={d.date} className={`coverage-cell ${isLow ? 'low' : 'ok'}`}>
                                {coverage.working}/{coverage.required}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Legend and Actions */}
                  <div className="schedule-footer">
                    <div className="shift-legend">
                      <span className="legend-label">Shifts:</span>
                      {templates.filter(t => !t.is_off).map(t => (
                        <span
                          key={t.id}
                          className="legend-item"
                          style={{ backgroundColor: t.color }}
                        >
                          {t.code}
                        </span>
                      ))}
                      <span className="legend-item off">⚪ OFF</span>
                    </div>
                    <div className="schedule-actions">
                      <button
                        onClick={copyLastWeek}
                        className="copy-btn"
                        disabled={saving}
                      >
                        Copy Last Week
                      </button>
                    </div>
                  </div>

                  {/* Suggestion Notes - Workers without schedule */}
                  {isAdmin && workersWithoutSchedule.length > 0 && (
                    <div className="schedule-suggestions">
                      <div className="suggestion-header">
                        <span className="warning-icon">⚠️</span>
                        <h4>Employees Clocked In Without Schedule</h4>
                        <span className="suggestion-count">{workersWithoutSchedule.length} records</span>
                      </div>
                      <p className="suggestion-desc">
                        The following employees have clock-in records but no scheduled shift. Consider adding schedules or reviewing their attendance.
                      </p>
                      <div className="suggestion-list">
                        {workersWithoutSchedule.map((record, idx) => (
                          <div key={idx} className="suggestion-item">
                            <div className="suggestion-employee">
                              <span className="emp-name">{record.employee_name}</span>
                              <span className="emp-code">{record.emp_code}</span>
                            </div>
                            <div className="suggestion-date">
                              {new Date(record.work_date).toLocaleDateString('en-MY', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short'
                              })}
                            </div>
                            <div className="suggestion-time">
                              {record.clock_in_1?.substring(0, 5) || '--:--'} - {record.clock_out_2?.substring(0, 5) || '--:--'}
                            </div>
                            <div className="suggestion-hours">
                              {record.total_hours ? `${parseFloat(record.total_hours).toFixed(1)}h` : '-'}
                            </div>
                            <button
                              className="suggestion-assign-btn"
                              onClick={() => openAssignScheduleModal(record)}
                            >
                              Assign
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Help text */}
                  <div className="help-text">
                    Click on a cell to cycle through shifts: {templates.filter(t => !t.is_off).map(t => t.code).join(' → ')} → OFF
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Extra Shift Requests Tab */}
        {activeTab === 'requests' && (
          <div className="requests-container">
            {extraShiftRequests.length === 0 ? (
              <div className="no-data">No pending extra shift requests</div>
            ) : (
              <div className="requests-list">
                {extraShiftRequests.map(req => (
                  <div key={req.id} className="request-card">
                    <div className="request-info">
                      <strong>{req.employee_name}</strong>
                      <span className="date">
                        {new Date(req.request_date).toLocaleDateString('en-MY', {
                          weekday: 'short', day: 'numeric', month: 'short'
                        })}
                      </span>
                      <span className="time">{req.shift_start} - {req.shift_end}</span>
                      {req.reason && <p className="reason">{req.reason}</p>}
                    </div>
                    <div className="request-actions">
                      <button className="btn-approve" onClick={() => handleApproveExtraShift(req.id)}>Approve</button>
                      <button className="btn-reject" onClick={() => handleRejectExtraShift(req.id)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Swap Requests Tab */}
        {activeTab === 'swaps' && (
          <div className="requests-container">
            {swapRequests.length === 0 ? (
              <div className="no-data">No pending shift swap requests</div>
            ) : (
              <div className="requests-list">
                {swapRequests.map(req => (
                  <div key={req.id} className="request-card swap-request">
                    <div className="request-info">
                      <div className="swap-header">
                        <strong>{req.requester_name}</strong>
                        <span className="swap-arrow">↔</span>
                        <strong>{req.target_name}</strong>
                      </div>
                      <div className="swap-details">
                        <div className="swap-shift">
                          <span className="label">Gives:</span>
                          {new Date(req.requester_shift_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        <div className="swap-shift">
                          <span className="label">Takes:</span>
                          {new Date(req.target_shift_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button className="btn-approve" onClick={() => handleApproveSwap(req.id)}>Approve</button>
                      <button className="btn-reject" onClick={() => handleRejectSwap(req.id)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manage Shifts Tab */}
        {activeTab === 'shifts' && (
          <div className="shifts-management">
            <div className="shifts-header">
              <h3>Shift Templates</h3>
              <p>Define the shift types available for scheduling</p>
              <button className="add-shift-btn" onClick={openAddTemplate}>
                + Add New Shift
              </button>
            </div>

            <div className="shifts-grid">
              {templates.length === 0 ? (
                <div className="no-data">No shift templates found. Create your first shift template.</div>
              ) : (
                templates.map(template => (
                  <div key={template.id} className={`shift-card ${template.is_off ? 'off-shift' : ''}`}>
                    <div className="shift-card-header">
                      <span
                        className="shift-color-badge"
                        style={{ backgroundColor: template.color }}
                      >
                        {template.code}
                      </span>
                      <div className="shift-card-actions">
                        <button className="edit-btn" onClick={() => openEditTemplate(template)}>Edit</button>
                        <button className="delete-btn" onClick={() => handleDeleteTemplate(template.id)}>Delete</button>
                      </div>
                    </div>
                    <div className="shift-card-body">
                      <h4>{template.name || template.code}</h4>
                      {template.is_off ? (
                        <p className="shift-time off">Day Off</p>
                      ) : (
                        <p className="shift-time">
                          {template.start_time || '--:--'} - {template.end_time || '--:--'}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Shift Template Modal */}
        {showTemplateModal && (
          <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
            <div className="modal shift-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingTemplate ? 'Edit Shift' : 'Add New Shift'}</h2>
                <button className="close-btn" onClick={() => setShowTemplateModal(false)}>&times;</button>
              </div>

              <form onSubmit={handleSaveTemplate}>
                <div className="modal-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Shift Code *</label>
                      <input
                        type="text"
                        value={templateForm.code}
                        onChange={e => setTemplateForm({ ...templateForm, code: e.target.value.toUpperCase() })}
                        placeholder="e.g., AM, PM, EVE"
                        maxLength={10}
                        required
                      />
                      <small>Short code shown on calendar (max 10 chars)</small>
                    </div>
                    <div className="form-group">
                      <label>Color</label>
                      <div className="color-picker">
                        <input
                          type="color"
                          value={templateForm.color}
                          onChange={e => setTemplateForm({ ...templateForm, color: e.target.value })}
                        />
                        <span>{templateForm.color}</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Shift Name</label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                      placeholder="e.g., Morning Shift, Afternoon Shift"
                    />
                  </div>

                  <div className="form-group checkbox-inline">
                    <label>
                      <input
                        type="checkbox"
                        checked={templateForm.is_off}
                        onChange={e => setTemplateForm({ ...templateForm, is_off: e.target.checked })}
                      />
                      This is a day off (no working hours)
                    </label>
                  </div>

                  {!templateForm.is_off && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Start Time</label>
                        <input
                          type="time"
                          value={templateForm.start_time}
                          onChange={e => setTemplateForm({ ...templateForm, start_time: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>End Time</label>
                        <input
                          type="time"
                          value={templateForm.end_time}
                          onChange={e => setTemplateForm({ ...templateForm, end_time: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Preview */}
                  <div className="shift-preview">
                    <span className="preview-label">Preview:</span>
                    <span
                      className="shift-badge preview"
                      style={{ backgroundColor: templateForm.color }}
                    >
                      {templateForm.code || 'CODE'}
                    </span>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowTemplateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : (editingTemplate ? 'Update Shift' : 'Create Shift')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Schedule Modal */}
        {showAssignModal && assigningRecord && (
          <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
            <div className="modal assign-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Assign Schedule</h3>
                <button className="close-btn" onClick={() => setShowAssignModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="assign-info">
                  <p><strong>Employee:</strong> {assigningRecord.employee_name}</p>
                  <p><strong>Date:</strong> {new Date(assigningRecord.work_date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p><strong>Clock Time:</strong> {assigningRecord.clock_in_1?.substring(0, 5) || '--:--'} - {assigningRecord.clock_out_2?.substring(0, 5) || '--:--'}</p>
                </div>

                <div className="form-group">
                  <label>Select Shift Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                    className="shift-select"
                  >
                    <option value="">-- Select Shift --</option>
                    {templates.filter(t => !t.is_off).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.code} - {t.name} ({t.shift_start?.substring(0, 5)} - {t.shift_end?.substring(0, 5)})
                      </option>
                    ))}
                  </select>
                </div>

                <p className="assign-note">
                  This will create a schedule for this date and approve the attendance.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAssignSchedule}>Assign & Approve</button>
              </div>
            </div>
          </div>
        )}
      </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
}

export default Schedules;
