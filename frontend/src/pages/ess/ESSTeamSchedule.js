import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { toast } from 'react-toastify';
import { isMimixCompany, isSupervisorOrManager } from '../../utils/permissions';
import './ESSTeamSchedule.css';

function ESSTeamSchedule() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [employees, setEmployees] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
  const [selectedDaySchedules, setSelectedDaySchedules] = useState([]);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    shift_start: '09:00',
    shift_end: '18:00',
    status: 'scheduled'
  });

  // Custom initials stored in localStorage
  const [customInitials, setCustomInitials] = useState(() => {
    const saved = localStorage.getItem('teamScheduleInitials');
    return saved ? JSON.parse(saved) : {};
  });
  const [editingInitials, setEditingInitials] = useState(null);
  const [initialsInput, setInitialsInput] = useState('');

  const isMimix = isMimixCompany(employeeInfo);
  const isIndoorSalesManager = !isMimix &&
    (employeeInfo?.position === 'Manager' || employeeInfo?.employee_role === 'manager');
  const canManageSchedules = isSupervisorOrManager(employeeInfo) || isIndoorSalesManager;

  // Generate consistent colors for employees
  const getEmployeeColor = (employeeId) => {
    const colors = [
      { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
      { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
      { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
      { bg: '#fce7f3', text: '#be185d', border: '#f9a8d4' },
      { bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc' },
      { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
      { bg: '#f3e8ff', text: '#7c3aed', border: '#c4b5fd' },
      { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },
    ];
    return colors[employeeId % colors.length];
  };

  // Get initials - check custom first, then auto-generate
  const getInitials = (name, employeeId) => {
    if (employeeId && customInitials[employeeId]) {
      return customInitials[employeeId];
    }
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Save custom initials
  const saveInitials = () => {
    if (!editingInitials || !initialsInput.trim()) return;
    const newInitials = { ...customInitials, [editingInitials.id]: initialsInput.toUpperCase().substring(0, 3) };
    setCustomInitials(newInitials);
    localStorage.setItem('teamScheduleInitials', JSON.stringify(newInitials));
    setEditingInitials(null);
    setInitialsInput('');
    toast.success('Initials updated!');
  };

  const openInitialsEdit = (emp) => {
    setEditingInitials(emp);
    setInitialsInput(customInitials[emp.id] || getInitials(emp.name, null));
  };

  // Get short name (first name only, max 8 chars)
  const getShortName = (name) => {
    if (!name) return '?';
    const firstName = name.split(' ')[0];
    return firstName.length > 8 ? firstName.substring(0, 7) + '.' : firstName;
  };

  useEffect(() => {
    fetchTeamEmployees();
  }, []);

  useEffect(() => {
    fetchTeamSchedules();
  }, [currentMonth, selectedOutlet, selectedDepartment]);

  const fetchTeamEmployees = async () => {
    try {
      const response = await essApi.getTeamEmployees();
      setEmployees(response.data.employees || []);
      setOutlets(response.data.outlets || []);
      setDepartments(response.data.departments || []);

      if (response.data.outlets?.length > 0) {
        setSelectedOutlet(response.data.outlets[0].id.toString());
      }
      if (response.data.departments?.length > 0) {
        setSelectedDepartment(response.data.departments[0].id.toString());
      }
    } catch (error) {
      console.error('Error fetching team employees:', error);
      toast.error('Failed to load team data');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !form.employee_id) {
      toast.warning('Please select an employee');
      return;
    }

    try {
      const data = {
        employee_id: parseInt(form.employee_id),
        schedule_date: selectedDate,
        shift_start: form.shift_start,
        shift_end: form.shift_end,
        status: form.status,
        outlet_id: isMimix ? parseInt(selectedOutlet) : null
      };

      if (editingSchedule) {
        await essApi.updateTeamSchedule(editingSchedule.id, data);
        toast.success('Updated!');
      } else {
        await essApi.createTeamSchedule(data);
        toast.success('Added!');
      }
      closeModal();
      fetchTeamSchedules();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (scheduleId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this schedule?')) return;

    try {
      await essApi.deleteTeamSchedule(scheduleId);
      toast.success('Deleted!');
      fetchTeamSchedules();
      if (showDayDetail) {
        setSelectedDaySchedules(prev => prev.filter(s => s.id !== scheduleId));
      }
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const openAddModal = (date) => {
    setEditingSchedule(null);
    setForm({ employee_id: '', shift_start: '09:00', shift_end: '18:00', status: 'scheduled' });
    setSelectedDate(formatDateKey(date));
    setShowModal(true);
  };

  const openEditModal = (schedule, e) => {
    e?.stopPropagation();
    setEditingSchedule(schedule);
    setSelectedDate(schedule.schedule_date);
    setForm({
      employee_id: schedule.employee_id.toString(),
      shift_start: schedule.shift_start || '09:00',
      shift_end: schedule.shift_end || '18:00',
      status: schedule.status || 'scheduled'
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSchedule(null);
    setForm({ employee_id: '', shift_start: '09:00', shift_end: '18:00', status: 'scheduled' });
  };

  const openDayDetail = (date, daySchedules) => {
    setSelectedDate(formatDateKey(date));
    setSelectedDaySchedules(daySchedules);
    setShowDayDetail(true);
  };

  const formatDateKey = (date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours] = time.split(':');
    const hour = parseInt(hours);
    return hour >= 12 ? `${hour === 12 ? 12 : hour - 12}pm` : `${hour || 12}am`;
  };

  const formatTimeRange = (start, end) => {
    return `${formatTime(start)}-${formatTime(end)}`;
  };

  const formatDisplayDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
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

  if (!canManageSchedules) {
    return (
      <ESSLayout>
        <div className="ts-access-denied">
          <div className="ts-denied-icon">🔒</div>
          <h2>Access Denied</h2>
          <p>This page is only for Supervisors and Managers.</p>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div className="ts-container">
        {/* Header */}
        <div className="ts-header">
          <div className="ts-header-left">
            <h1>Team Schedule</h1>
            <span className="ts-team-count">{filteredEmployees.length} members</span>
          </div>
          <div className="ts-header-right">
            <button
              className={`ts-view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              📅
            </button>
            <button
              className={`ts-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋
            </button>
          </div>
        </div>

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
              {currentMonth.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}
            </span>
            <span className="ts-today-hint">Tap for today</span>
          </div>
          <button className="ts-nav-btn" onClick={nextMonth}>›</button>
        </div>

        {loading ? (
          <div className="ts-loading">
            <div className="ts-spinner"></div>
            <span>Loading schedules...</span>
          </div>
        ) : viewMode === 'calendar' ? (
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

                return (
                  <div
                    key={idx}
                    className={`ts-day-cell ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${isWeekend ? 'weekend' : ''}`}
                    onClick={() => daySchedules.length > 0 ? openDayDetail(date, daySchedules) : (!isPast && openAddModal(date))}
                  >
                    <div className="ts-day-number">{date.getDate()}</div>

                    {daySchedules.filter(s => s.status !== 'off').length > 0 && (
                      <div className="ts-day-schedules">
                        {daySchedules.filter(s => s.status !== 'off').slice(0, 3).map((s, i) => {
                          const color = getEmployeeColor(s.employee_id);
                          return (
                            <div
                              key={i}
                              className="ts-schedule-dot"
                              style={{
                                backgroundColor: color.bg,
                                borderColor: color.border
                              }}
                              title={`${s.employee_name} ${formatTimeRange(s.shift_start, s.shift_end)}`}
                            >
                              {getInitials(s.employee_name, s.employee_id)}
                            </div>
                          );
                        })}
                        {daySchedules.filter(s => s.status !== 'off').length > 3 && (
                          <div className="ts-more-badge">+{daySchedules.filter(s => s.status !== 'off').length - 3}</div>
                        )}
                      </div>
                    )}

                    {!isPast && daySchedules.length === 0 && (
                      <div className="ts-add-hint">+</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="ts-list-view">
            {Object.entries(schedules)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dateKey, daySchedules]) => (
                <div key={dateKey} className="ts-list-day">
                  <div className="ts-list-date">{formatDisplayDate(dateKey)}</div>
                  <div className="ts-list-schedules">
                    {daySchedules.map((s, i) => {
                      const color = getEmployeeColor(s.employee_id);
                      const isPast = new Date(dateKey) < new Date().setHours(0, 0, 0, 0);
                      return (
                        <div
                          key={i}
                          className={`ts-list-item ${s.status === 'off' ? 'off' : ''}`}
                          style={{ borderLeftColor: s.status === 'off' ? '#f87171' : color.border }}
                        >
                          <div
                            className="ts-list-avatar"
                            style={{ backgroundColor: s.status === 'off' ? '#fecaca' : color.bg }}
                          >
                            {getInitials(s.employee_name, s.employee_id)}
                          </div>
                          <div className="ts-list-info">
                            <div className="ts-list-name">{getShortName(s.employee_name)}</div>
                            <div className="ts-list-time">
                              {s.status === 'off' ? 'Day Off' : formatTimeRange(s.shift_start, s.shift_end)}
                            </div>
                          </div>
                          {!isPast && (
                            <div className="ts-list-actions">
                              <button className="ts-action-btn edit" onClick={(e) => openEditModal(s, e)}>✏️</button>
                              <button className="ts-action-btn delete" onClick={(e) => handleDelete(s.id, e)}>🗑️</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            {Object.keys(schedules).length === 0 && (
              <div className="ts-empty">
                <div className="ts-empty-icon">📭</div>
                <p>No schedules this month</p>
              </div>
            )}
          </div>
        )}

        {/* Team Legend */}
        <div className="ts-legend">
          <div className="ts-legend-header">
            <div className="ts-legend-title">Team</div>
            <span className="ts-legend-hint">Tap to edit initials</span>
          </div>
          <div className="ts-legend-items">
            {filteredEmployees.map(emp => {
              const color = getEmployeeColor(emp.id);
              return (
                <div
                  key={emp.id}
                  className="ts-legend-item"
                  style={{ backgroundColor: color.bg, borderColor: color.border }}
                  onClick={() => openInitialsEdit(emp)}
                >
                  <span className="ts-legend-initials">{getInitials(emp.name, emp.id)}</span>
                  <span className="ts-legend-name">{getShortName(emp.name)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Edit Initials Modal */}
        {editingInitials && (
          <div className="ts-modal-overlay" onClick={() => setEditingInitials(null)}>
            <div className="ts-modal ts-initials-modal" onClick={e => e.stopPropagation()}>
              <div className="ts-modal-header">
                <h3>Edit Initials</h3>
                <button className="ts-close-btn" onClick={() => setEditingInitials(null)}>×</button>
              </div>
              <div className="ts-initials-content">
                <p className="ts-initials-name">{editingInitials.name}</p>
                <input
                  type="text"
                  className="ts-initials-input"
                  value={initialsInput}
                  onChange={(e) => setInitialsInput(e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="AB"
                  autoFocus
                />
                <p className="ts-initials-hint">Max 3 characters</p>
                <div className="ts-form-actions">
                  <button type="button" className="ts-btn-cancel" onClick={() => setEditingInitials(null)}>Cancel</button>
                  <button type="button" className="ts-btn-save" onClick={saveInitials}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Day Detail Modal */}
        {showDayDetail && (
          <div className="ts-modal-overlay" onClick={() => setShowDayDetail(false)}>
            <div className="ts-modal ts-day-modal" onClick={e => e.stopPropagation()}>
              <div className="ts-modal-header">
                <h3>{formatDisplayDate(selectedDate)}</h3>
                <button className="ts-close-btn" onClick={() => setShowDayDetail(false)}>×</button>
              </div>
              <div className="ts-day-list">
                {selectedDaySchedules.map((s, i) => {
                  const color = getEmployeeColor(s.employee_id);
                  const isPast = new Date(selectedDate) < new Date().setHours(0, 0, 0, 0);
                  return (
                    <div key={i} className={`ts-day-item ${s.status === 'off' ? 'off' : ''}`}>
                      <div
                        className="ts-day-avatar"
                        style={{ backgroundColor: s.status === 'off' ? '#fecaca' : color.bg }}
                      >
                        {getInitials(s.employee_name, s.employee_id)}
                      </div>
                      <div className="ts-day-info">
                        <div className="ts-day-name">{s.employee_name}</div>
                        <div className="ts-day-time">
                          {s.status === 'off' ? '🏖️ Day Off' : `🕐 ${formatTimeRange(s.shift_start, s.shift_end)}`}
                        </div>
                      </div>
                      {!isPast && (
                        <div className="ts-day-actions">
                          <button className="ts-icon-btn" onClick={(e) => { setShowDayDetail(false); openEditModal(s, e); }}>✏️</button>
                          <button className="ts-icon-btn danger" onClick={(e) => handleDelete(s.id, e)}>🗑️</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {new Date(selectedDate) >= new Date().setHours(0, 0, 0, 0) && (
                <button
                  className="ts-add-more-btn"
                  onClick={() => { setShowDayDetail(false); openAddModal(new Date(selectedDate)); }}
                >
                  + Add More
                </button>
              )}
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="ts-modal-overlay" onClick={closeModal}>
            <div className="ts-modal" onClick={e => e.stopPropagation()}>
              <div className="ts-modal-header">
                <h3>{editingSchedule ? '✏️ Edit' : '➕ New'} Schedule</h3>
                <button className="ts-close-btn" onClick={closeModal}>×</button>
              </div>
              <div className="ts-modal-date">{formatDisplayDate(selectedDate)}</div>

              <form onSubmit={handleSubmit} className="ts-form">
                <div className="ts-form-group">
                  <label>Employee</label>
                  <div className="ts-employee-select">
                    {filteredEmployees.map(emp => {
                      const color = getEmployeeColor(emp.id);
                      const isSelected = form.employee_id === emp.id.toString();
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          className={`ts-emp-option ${isSelected ? 'selected' : ''}`}
                          style={{
                            backgroundColor: isSelected ? color.bg : '#f8fafc',
                            borderColor: isSelected ? color.border : '#e2e8f0'
                          }}
                          onClick={() => setForm({ ...form, employee_id: emp.id.toString() })}
                        >
                          <span className="ts-emp-initials" style={{ backgroundColor: color.bg }}>{getInitials(emp.name, emp.id)}</span>
                          <span className="ts-emp-name">{getShortName(emp.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ts-form-row">
                  <div className="ts-form-group">
                    <label>Start</label>
                    <input
                      type="time"
                      value={form.shift_start}
                      onChange={(e) => setForm({ ...form, shift_start: e.target.value })}
                      required
                      disabled={form.status === 'off'}
                    />
                  </div>
                  <div className="ts-form-group">
                    <label>End</label>
                    <input
                      type="time"
                      value={form.shift_end}
                      onChange={(e) => setForm({ ...form, shift_end: e.target.value })}
                      required
                      disabled={form.status === 'off'}
                    />
                  </div>
                </div>

                <div className="ts-status-toggle">
                  <button
                    type="button"
                    className={`ts-status-btn ${form.status === 'scheduled' ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, status: 'scheduled' })}
                  >
                    🕐 Working
                  </button>
                  <button
                    type="button"
                    className={`ts-status-btn off ${form.status === 'off' ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, status: 'off' })}
                  >
                    🏖️ Day Off
                  </button>
                </div>

                <div className="ts-form-actions">
                  <button type="button" className="ts-btn-cancel" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="ts-btn-save" disabled={!form.employee_id}>
                    {editingSchedule ? 'Update' : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Floating Add Button */}
        <button
          className="ts-fab"
          onClick={() => openAddModal(new Date())}
          title="Add schedule for today"
        >
          +
        </button>
      </div>
    </ESSLayout>
  );
}

export default ESSTeamSchedule;
