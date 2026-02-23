import React, { useState, useEffect, useMemo } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { toast } from 'react-toastify';
import { isMimixCompany, isSupervisorOrManager } from '../../utils/permissions';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSTeamSchedule.css';

function ESSTeamSchedule({ embedded = false }) {
  const { t, language } = useLanguage();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [employees, setEmployees] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDaySchedules, setSelectedDaySchedules] = useState([]);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState([]); // Multi-select employees
  const [selectedShift, setSelectedShift] = useState(null);
  const [showWeeklyStats, setShowWeeklyStats] = useState(false);
  const [selectedDateLocked, setSelectedDateLocked] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [statsWeekStart, setStatsWeekStart] = useState(() => {
    // Default to Monday of current week
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split('T')[0];
  });

  const isMimix = isMimixCompany(employeeInfo);
  const canManageSchedules = isSupervisorOrManager(employeeInfo) || employeeInfo?.permissions?.can_manage_schedule;

  // Get initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getShortName = (name) => {
    if (!name) return '?';
    const firstName = name.split(' ')[0];
    return firstName.length > 8 ? firstName.substring(0, 7) + '.' : firstName;
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedOutlet || selectedDepartment) {
      fetchTeamSchedules();
      fetchWeeklyStats();
    }
  }, [currentMonth, selectedOutlet, selectedDepartment]);

  const fetchInitialData = async () => {
    try {
      const [empRes, templatesRes] = await Promise.all([
        essApi.getTeamEmployees(),
        essApi.getShiftTemplates()
      ]);

      setEmployees(empRes.data.employees || []);
      setOutlets(empRes.data.outlets || []);
      setDepartments(empRes.data.departments || []);
      setShiftTemplates(templatesRes.data || []);

      if (empRes.data.outlets?.length > 0) {
        setSelectedOutlet(empRes.data.outlets[0].id.toString());
      } else if (empRes.data.departments?.length > 0) {
        setSelectedDepartment(empRes.data.departments[0].id.toString());
      } else {
        // No outlets or departments assigned - stop loading
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      toast.error('Failed to load data');
      setLoading(false);
    }
  };

  const fetchTeamSchedules = async () => {
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;
      const params = { year, month };

      if (isMimix && selectedOutlet) params.outlet_id = selectedOutlet;
      if (!isMimix && selectedDepartment) params.department_id = selectedDepartment;

      const response = await essApi.getTeamSchedules(params);
      setSchedules(response.data.schedules || {});
    } catch (error) {
      console.error('Error fetching schedules:', error);
      setSchedules({});
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyStats = async (weekStart = statsWeekStart) => {
    try {
      const params = { week_start: weekStart };
      if (isMimix && selectedOutlet) params.outlet_id = selectedOutlet;
      if (!isMimix && selectedDepartment) params.department_id = selectedDepartment;

      const response = await essApi.getWeeklyStats(params);
      setWeeklyStats(response.data);
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
    }
  };

  // Navigate weeks in stats modal
  const prevWeek = () => {
    const date = new Date(statsWeekStart);
    date.setDate(date.getDate() - 7);
    const newWeekStart = date.toISOString().split('T')[0];
    setStatsWeekStart(newWeekStart);
    fetchWeeklyStats(newWeekStart);
  };

  const nextWeek = () => {
    const date = new Date(statsWeekStart);
    date.setDate(date.getDate() + 7);
    const newWeekStart = date.toISOString().split('T')[0];
    setStatsWeekStart(newWeekStart);
    fetchWeeklyStats(newWeekStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    const newWeekStart = monday.toISOString().split('T')[0];
    setStatsWeekStart(newWeekStart);
    fetchWeeklyStats(newWeekStart);
  };

  const handleAssignShift = async () => {
    if (selectedEmployees.length === 0 || !selectedShift || !selectedDate) {
      toast.warning('Please select employee(s) and shift');
      return;
    }

    setAssigning(true);
    try {
      if (selectedEmployees.length === 1) {
        // Single employee - use single API
        await essApi.createTeamSchedule({
          employee_id: selectedEmployees[0].id,
          schedule_date: selectedDate,
          shift_template_id: selectedShift.id
        });
        toast.success(`${selectedShift.code} assigned to ${selectedEmployees[0].name}`);
      } else {
        // Multiple employees - use bulk API
        const schedules = selectedEmployees.map(emp => ({
          employee_id: emp.id,
          schedule_date: selectedDate,
          shift_template_id: selectedShift.id
        }));
        const res = await essApi.createTeamSchedulesBulk(schedules);
        const created = res.data.created?.length || 0;
        const updated = res.data.updated?.length || 0;
        toast.success(`${selectedShift.code} assigned to ${created + updated} employees`);
      }
      // Clear selected employees but keep shift for next batch
      setSelectedEmployees([]);
      fetchTeamSchedules();
      fetchWeeklyStats();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to assign shift');
    } finally {
      setAssigning(false);
    }
  };

  // Toggle employee selection (multi-select)
  const toggleEmployeeSelection = (emp) => {
    setSelectedEmployees(prev => {
      const isSelected = prev.some(e => e.id === emp.id);
      if (isSelected) {
        return prev.filter(e => e.id !== emp.id);
      } else {
        return [...prev, emp];
      }
    });
  };

  // Select all unscheduled employees
  const selectAllUnscheduled = () => {
    const unscheduled = filteredEmployees.filter(emp =>
      !schedules[selectedDate]?.some(s => s.employee_id === emp.id)
    );
    setSelectedEmployees(unscheduled);
  };

  // Clear employee selection
  const clearEmployeeSelection = () => {
    setSelectedEmployees([]);
  };

  const handleDelete = async (scheduleId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Remove this schedule?')) return;

    try {
      await essApi.deleteTeamSchedule(scheduleId);
      toast.success('Removed');
      fetchTeamSchedules();
      fetchWeeklyStats();
      if (showDayDetail) {
        setSelectedDaySchedules(prev => prev.filter(s => s.id !== scheduleId));
      }
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const openAddModal = (date) => {
    setSelectedDate(formatDateKey(date));
    setSelectedEmployees([]);
    // Indoor Sales: auto-select the WORK shift
    if (isIndoorSales) {
      const workShift = shiftTemplates.find(t => !t.is_off && t.code?.toUpperCase() === 'WORK');
      setSelectedShift(workShift || null);
    } else {
      setSelectedShift(null);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEmployees([]);
    setSelectedShift(null);
  };

  const openDayDetail = (date, daySchedules, isLocked = false) => {
    setSelectedDate(formatDateKey(date));
    setSelectedDaySchedules(daySchedules);
    setSelectedDateLocked(isLocked);
    setShowDayDetail(true);
  };

  const formatDateKey = (date) => {
    if (!date) return '';
    // Use local date components to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (dateStr) => {
    // Parse date string as local date (not UTC)
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));

    return days;
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const days = getDaysInMonth(currentMonth);
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const filteredEmployees = employees.filter(emp => {
    if (isMimix && selectedOutlet) return emp.outlet_id?.toString() === selectedOutlet;
    if (!isMimix && selectedDepartment) return emp.department_id?.toString() === selectedDepartment;
    return true;
  });

  // Indoor Sales: auto-select WORK shift, skip shift selection
  const selectedDeptObj = departments.find(d => d.id.toString() === selectedDepartment);
  const isIndoorSales = selectedDeptObj?.name?.toLowerCase().includes('indoor sales');

  // Calculate day summary (shift counts)
  const getDaySummary = (daySchedules) => {
    const summary = {};
    daySchedules.forEach(s => {
      if (s.status === 'leave' || s.is_leave) {
        const code = s.leave_code || s.shift_code || 'LV';
        if (!summary[code]) {
          summary[code] = { count: 0, color: '#F59E0B', isLeave: true };
        }
        summary[code].count++;
      } else if (s.status !== 'off') {
        const code = s.shift_code || 'WORK';
        if (!summary[code]) {
          summary[code] = { count: 0, color: s.shift_color || '#3B82F6' };
        }
        summary[code].count++;
      }
    });
    return summary;
  };

  if (!canManageSchedules) {
    const accessDenied = (
      <div className="ts-access-denied">
        <div className="ts-denied-icon">🔒</div>
        <h2>{t('teamSchedule.accessDenied')}</h2>
        <p>{t('teamSchedule.accessDeniedMessage')}</p>
      </div>
    );
    return embedded ? accessDenied : <ESSLayout>{accessDenied}</ESSLayout>;
  }

  const content = (
    <div className="ts-container">
        {/* Header */}
        <div className="ts-header">
          <div className="ts-header-left">
            <h1>{t('schedule.teamSchedule')}</h1>
            <span className="ts-team-count">{filteredEmployees.length} {t('teamSchedule.members')}</span>
          </div>
          <div className="ts-header-right">
            {weeklyStats?.warnings?.length > 0 && (
              <button className="ts-warning-btn" onClick={() => setShowWeeklyStats(true)}>
                ⚠️ {weeklyStats.warnings.length}
              </button>
            )}
            <button className="ts-stats-btn" onClick={() => setShowWeeklyStats(true)}>
              📊
            </button>
          </div>
        </div>

        {/* Shift Legend - Only show working shifts (no schedule = off day) */}
        {shiftTemplates.length > 0 && (
          <div className="ts-shift-legend">
            {shiftTemplates.filter(t => !t.is_off).map(t => (
              <div key={t.id} className="ts-shift-chip" style={{ backgroundColor: t.color + '20', borderColor: t.color }}>
                <span className="ts-shift-dot" style={{ backgroundColor: t.color }}></span>
                <span className="ts-shift-code">{t.code}</span>
                <span className="ts-shift-time">{t.start_time}-{t.end_time}</span>
              </div>
            ))}
            <div className="ts-shift-chip leave">
              <span className="ts-shift-dot" style={{ backgroundColor: '#F59E0B' }}></span>
              <span className="ts-shift-code">Leave</span>
              <span className="ts-shift-time">Approved</span>
            </div>
            <div className="ts-shift-chip off">
              <span className="ts-shift-code">-</span>
              <span className="ts-shift-time">No schedule = Off</span>
            </div>
          </div>
        )}

        {/* Filter Pills */}
        <div className="ts-filters">
          {isMimix && outlets.length > 1 && (
            <div className="ts-filter-pills">
              {outlets.map(o => (
                <button
                  key={o.id}
                  className={`ts-pill ${selectedOutlet === o.id.toString() ? 'active' : ''}`}
                  onClick={() => setSelectedOutlet(o.id.toString())}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
          {!isMimix && departments.length > 1 && (
            <div className="ts-filter-pills">
              {departments.map(d => (
                <button
                  key={d.id}
                  className={`ts-pill ${selectedDepartment === d.id.toString() ? 'active' : ''}`}
                  onClick={() => setSelectedDepartment(d.id.toString())}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Month Navigation */}
        <div className="ts-month-nav">
          <button className="ts-nav-btn" onClick={prevMonth}>‹</button>
          <div className="ts-month-display" onClick={goToday}>
            <span className="ts-month-name">
              {currentMonth.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { month: 'long', year: 'numeric' })}
            </span>
            <span className="ts-today-hint">{t('teamSchedule.tapForToday')}</span>
          </div>
          <button className="ts-nav-btn" onClick={nextMonth}>›</button>
        </div>

        {loading ? (
          <div className="ts-loading">
            <div className="ts-spinner"></div>
            <span>{t('common.loading')}</span>
          </div>
        ) : outlets.length === 0 && departments.length === 0 ? (
          <div className="ts-loading">
            <p>No outlets or departments assigned. Please contact admin to assign your managed outlets.</p>
          </div>
        ) : (
          /* Calendar View */
          <div className="ts-calendar">
            {/* Day Headers */}
            <div className="ts-day-headers">
              {dayNames.map((day, i) => (
                <div key={i} className={`ts-day-header ${i === 0 || i === 6 ? 'weekend' : ''}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="ts-calendar-grid">
              {days.map((date, idx) => {
                if (!date) return <div key={idx} className="ts-day-cell empty"></div>;

                const dateKey = formatDateKey(date);
                const daySchedules = schedules[dateKey] || [];
                const isToday = formatDateKey(new Date()) === dateKey;
                const isPast = date < new Date().setHours(0, 0, 0, 0);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                // T+2 rule: Can only edit schedules 2+ days in advance
                // Managers, directors, and designated schedule managers are exempt
                const isExemptFromLock = ['admin', 'director'].includes(employeeInfo?.employee_role) || employeeInfo?.permissions?.can_manage_schedule;
                const twoDaysFromNow = new Date();
                twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
                twoDaysFromNow.setHours(0, 0, 0, 0);
                const isLocked = !isExemptFromLock && date < twoDaysFromNow;
                const workingSchedules = daySchedules.filter(s => s.status !== 'off' && s.status !== 'leave' && !s.is_leave);
                const leaveSchedules = daySchedules.filter(s => s.status === 'leave' || s.is_leave);
                const daySummary = getDaySummary(daySchedules);

                return (
                  <div
                    key={idx}
                    className={`ts-day-cell ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${isWeekend ? 'weekend' : ''} ${isLocked && !isPast ? 'locked' : ''}`}
                    onClick={() => daySchedules.length > 0 ? openDayDetail(date, daySchedules, isLocked) : (!isLocked && openAddModal(date))}
                  >
                    <div className="ts-day-number">{date.getDate()}</div>

                    {/* Shift Summary Pills */}
                    {Object.keys(daySummary).length > 0 && (
                      <div className="ts-day-summary">
                        {Object.entries(daySummary).map(([code, data]) => (
                          <span
                            key={code}
                            className="ts-summary-pill"
                            style={{ backgroundColor: data.color }}
                          >
                            {code}: {data.count}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Employee avatars - working */}
                    {workingSchedules.length > 0 && (
                      <div className="ts-day-avatars">
                        {workingSchedules.slice(0, 3).map((s, i) => (
                          <div
                            key={i}
                            className="ts-avatar"
                            style={{ backgroundColor: s.shift_color || '#3B82F6' }}
                            title={`${s.emp_code || s.employee_name} (${s.shift_code || 'Work'})`}
                          >
                            {s.emp_code || getInitials(s.employee_name)}
                          </div>
                        ))}
                        {workingSchedules.length > 3 && (
                          <div className="ts-avatar more">+{workingSchedules.length - 3}</div>
                        )}
                      </div>
                    )}

                    {/* Employee avatars - on leave */}
                    {leaveSchedules.length > 0 && (
                      <div className="ts-day-avatars">
                        {leaveSchedules.slice(0, 2).map((s, i) => (
                          <div
                            key={`lv-${i}`}
                            className="ts-avatar on-leave"
                            style={{ backgroundColor: '#F59E0B' }}
                            title={`${s.emp_code || s.employee_name} (${s.leave_code || s.shift_code})`}
                          >
                            {s.emp_code || getInitials(s.employee_name)}
                          </div>
                        ))}
                        {leaveSchedules.length > 2 && (
                          <div className="ts-avatar more">+{leaveSchedules.length - 2}</div>
                        )}
                      </div>
                    )}

                    {!isLocked && daySchedules.length === 0 && (
                      <div className="ts-add-hint">+</div>
                    )}
                    {isLocked && !isPast && daySchedules.length === 0 && (
                      <div className="ts-locked-hint">🔒</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Team Members Panel */}
        <div className="ts-team-panel">
          <div className="ts-panel-header">
            <span>Team Members</span>
            {weeklyStats && (
              <span className="ts-panel-hint">
                {weeklyStats.warnings?.length > 0 ? `⚠️ ${weeklyStats.warnings.length} need rest` : '✓ All good'}
              </span>
            )}
          </div>
          <div className="ts-team-list">
            {filteredEmployees.map(emp => {
              const empStats = weeklyStats?.employees?.find(e => e.id === emp.id);
              return (
                <div
                  key={emp.id}
                  className={`ts-team-member ${empStats?.warning ? 'warning' : ''}`}
                >
                  <div className="ts-member-avatar">{emp.employee_id || getInitials(emp.name)}</div>
                  <div className="ts-member-info">
                    <div className="ts-member-name" title={emp.name}>{emp.employee_id || emp.name}</div>
                    {empStats && (
                      <div className="ts-member-stats">
                        {empStats.work_days}d work · {empStats.off_days}d off
                        {empStats.unscheduled_days > 0 && <span className="ts-unscheduled"> · {empStats.unscheduled_days} unset</span>}
                      </div>
                    )}
                  </div>
                  {empStats?.warning && <span className="ts-warning-icon">⚠️</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Detail Modal */}
        {showDayDetail && (
          <div className="ts-modal-overlay" onClick={() => setShowDayDetail(false)}>
            <div className="ts-modal ts-day-modal" onClick={e => e.stopPropagation()}>
              <div className="ts-modal-header">
                <h3>{formatDisplayDate(selectedDate)}</h3>
                <button className="ts-close-btn" onClick={() => setShowDayDetail(false)}>×</button>
              </div>

              {/* Day Summary */}
              <div className="ts-day-summary-panel">
                {Object.entries(getDaySummary(selectedDaySchedules)).map(([code, data]) => (
                  <div key={code} className="ts-summary-card" style={{ borderColor: data.color }}>
                    <span className="ts-summary-code" style={{ color: data.color }}>{code}</span>
                    <span className="ts-summary-count">{data.count}</span>
                  </div>
                ))}
                {selectedDaySchedules.filter(s => s.status === 'off').length > 0 && (
                  <div className="ts-summary-card off">
                    <span className="ts-summary-code">OFF</span>
                    <span className="ts-summary-count">{selectedDaySchedules.filter(s => s.status === 'off').length}</span>
                  </div>
                )}
              </div>

              <div className="ts-day-list">
                {selectedDaySchedules.map((s, i) => {
                  const isLeave = s.status === 'leave' || s.is_leave;
                  return (
                    <div key={i} className={`ts-day-item ${s.status === 'off' ? 'off' : ''} ${isLeave ? 'on-leave' : ''}`}>
                      <div
                        className="ts-day-avatar"
                        style={{ backgroundColor: isLeave ? '#F59E0B' : (s.status === 'off' ? '#fecaca' : (s.shift_color || '#3B82F6')) }}
                      >
                        {s.emp_code || getInitials(s.employee_name)}
                      </div>
                      <div className="ts-day-info">
                        <div className="ts-day-name" title={s.employee_name}>{s.emp_code || s.employee_name}</div>
                        <div className="ts-day-shift">
                          {isLeave ? (
                            <>
                              <span className="ts-shift-badge" style={{ backgroundColor: '#F59E0B' }}>
                                {s.leave_code || s.shift_code}
                              </span>
                              <span className="ts-shift-hours">{s.leave_name || 'Leave'}</span>
                            </>
                          ) : s.status === 'off' ? '🏖️ Day Off' : (
                            <>
                              <span className="ts-shift-badge" style={{ backgroundColor: s.shift_color || '#3B82F6' }}>
                                {s.shift_code || 'WORK'}
                              </span>
                              <span className="ts-shift-hours">{s.shift_start} - {s.shift_end}</span>
                              {s.has_half_day_leave && (
                                <span className="ts-shift-badge" style={{ backgroundColor: '#F59E0B', marginLeft: '4px' }}>
                                  {s.leave_code} ({s.half_day_leave_period})
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {!selectedDateLocked && !isLeave && (
                        <button className="ts-delete-btn" onClick={(e) => handleDelete(s.id, e)}>🗑️</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedDateLocked && (
                <div className="ts-locked-notice">🔒 This date is locked (T+2 rule)</div>
              )}

              {!selectedDateLocked && (
                <button
                  className="ts-add-more-btn"
                  onClick={() => {
                    setShowDayDetail(false);
                    // Parse date string as local date (not UTC)
                    const [year, month, day] = selectedDate.split('-').map(Number);
                    openAddModal(new Date(year, month - 1, day));
                  }}
                >
                  + Add More
                </button>
              )}
            </div>
          </div>
        )}

        {/* Add Schedule Modal */}
        {showModal && (
          <div className="ts-modal-overlay" onClick={closeModal}>
            <div className="ts-modal ts-assign-modal" onClick={e => e.stopPropagation()}>
              <div className="ts-modal-header">
                <h3>Assign Shift</h3>
                <button className="ts-close-btn" onClick={closeModal}>×</button>
              </div>
              <div className="ts-modal-date">{formatDisplayDate(selectedDate)}</div>

              {/* Step 1: Select Shift - hidden for Indoor Sales (always WORK full day) */}
              {!isIndoorSales && (
                <div className="ts-assign-section">
                  <label>1. Select Shift</label>
                  <div className="ts-shift-grid">
                    {shiftTemplates.filter(t => !t.is_off).map(t => {
                      const isSelected = selectedShift?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          className={`ts-shift-btn ${isSelected ? 'selected' : ''}`}
                          style={{
                            backgroundColor: isSelected ? t.color : t.color + '15',
                            borderColor: t.color,
                            color: isSelected ? '#fff' : t.color
                          }}
                          onClick={() => setSelectedShift(t)}
                        >
                          <span className="ts-shift-code-lg">{t.code}</span>
                          <span className="ts-shift-time-sm">{t.start_time}-{t.end_time}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="ts-hint">No schedule = Day Off (don't need to assign)</p>
                </div>
              )}

              {/* Select Employees */}
              <div className="ts-assign-section">
                <div className="ts-section-header">
                  <label>{isIndoorSales ? 'Select Employees' : '2. Select Employees'} {selectedEmployees.length > 0 && <span className="ts-select-count">({selectedEmployees.length} selected)</span>}</label>
                  <div className="ts-quick-actions">
                    <button className="ts-quick-btn" onClick={selectAllUnscheduled}>Select All</button>
                    {selectedEmployees.length > 0 && (
                      <button className="ts-quick-btn clear" onClick={clearEmployeeSelection}>Clear</button>
                    )}
                  </div>
                </div>
                <div className="ts-employee-grid">
                  {filteredEmployees.map(emp => {
                    const isSelected = selectedEmployees.some(e => e.id === emp.id);
                    const alreadyScheduled = schedules[selectedDate]?.some(s => s.employee_id === emp.id);
                    return (
                      <button
                        key={emp.id}
                        className={`ts-emp-btn ${isSelected ? 'selected' : ''} ${alreadyScheduled ? 'scheduled' : ''}`}
                        onClick={() => !alreadyScheduled && toggleEmployeeSelection(emp)}
                        disabled={alreadyScheduled}
                      >
                        <span className="ts-emp-initials">{emp.employee_id || getInitials(emp.name)}</span>
                        <span className="ts-emp-name" title={emp.name}>{emp.employee_id || emp.name}</span>
                        {alreadyScheduled && <span className="ts-scheduled-badge">✓</span>}
                        {isSelected && !alreadyScheduled && <span className="ts-selected-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected employees summary */}
              {selectedEmployees.length > 0 && selectedShift && (
                <div className="ts-selection-summary">
                  Assign <strong>{selectedShift.code}</strong> to: {selectedEmployees.map(e => e.employee_id || e.name.split(' ')[0]).join(', ')}
                </div>
              )}

              <div className="ts-assign-actions">
                <button className="ts-btn-cancel" onClick={closeModal}>Done</button>
                <button
                  className="ts-btn-save"
                  onClick={handleAssignShift}
                  disabled={selectedEmployees.length === 0 || !selectedShift || assigning}
                >
                  {assigning ? 'Assigning...' : `Assign ${selectedShift?.code || 'Shift'} (${selectedEmployees.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Stats Modal */}
        {showWeeklyStats && weeklyStats && (
          <div className="ts-modal-overlay" onClick={() => setShowWeeklyStats(false)}>
            <div className="ts-modal ts-stats-modal" onClick={e => e.stopPropagation()}>
              <div className="ts-modal-header">
                <h3>Weekly Overview</h3>
                <button className="ts-close-btn" onClick={() => setShowWeeklyStats(false)}>×</button>
              </div>

              {/* Week Navigation */}
              <div className="ts-week-nav">
                <button className="ts-week-btn" onClick={prevWeek}>&lt;</button>
                <div className="ts-week-display">
                  <span className="ts-week-dates">
                    {new Date(weeklyStats.week_start).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} - {new Date(weeklyStats.week_end).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <button className="ts-today-btn" onClick={goToCurrentWeek}>Today</button>
                </div>
                <button className="ts-week-btn" onClick={nextWeek}>&gt;</button>
              </div>

              {/* Warnings */}
              {weeklyStats.warnings?.length > 0 && (
                <div className="ts-warnings-panel">
                  <div className="ts-warnings-header">⚠️ Attention Needed</div>
                  {weeklyStats.warnings.map((w, i) => (
                    <div key={i} className="ts-warning-item">
                      <span className="ts-warning-name">{w.emp_code || w.name}</span>
                      <span className="ts-warning-text">{w.warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Employee Stats */}
              <div className="ts-emp-stats-list">
                {weeklyStats.employees?.map(emp => (
                  <div key={emp.id} className={`ts-emp-stat-row ${emp.warning ? 'warning' : ''}`}>
                    <div className="ts-emp-stat-name" title={emp.name}>{emp.emp_code || emp.name}</div>
                    <div className="ts-emp-stat-bars">
                      <div className="ts-stat-bar work" style={{ width: `${(emp.work_days / 7) * 100}%` }}>
                        {emp.work_days}d
                      </div>
                      {emp.off_days > 0 && (
                        <div className="ts-stat-bar off" style={{ width: `${(emp.off_days / 7) * 100}%` }}>
                          {emp.off_days}d
                        </div>
                      )}
                      {emp.unscheduled_days > 0 && (
                        <div className="ts-stat-bar unset" style={{ width: `${(emp.unscheduled_days / 7) * 100}%` }}>
                          {emp.unscheduled_days}d
                        </div>
                      )}
                    </div>
                    {emp.warning && <span className="ts-emp-warning-badge">⚠️</span>}
                  </div>
                ))}
              </div>

              <div className="ts-stats-legend">
                <span className="ts-legend-item"><span className="ts-legend-dot work"></span> Work</span>
                <span className="ts-legend-item"><span className="ts-legend-dot off"></span> Off</span>
                <span className="ts-legend-item"><span className="ts-legend-dot unset"></span> Unscheduled</span>
              </div>
            </div>
          </div>
        )}

      </div>
  );

  return embedded ? content : <ESSLayout>{content}</ESSLayout>;
}

export default ESSTeamSchedule;
