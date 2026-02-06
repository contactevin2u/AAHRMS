import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { schedulesApi, commissionApi } from '../api';
import './IndoorSalesSchedule.css';

function IndoorSalesSchedule({ departmentId: propDeptId, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [roster, setRoster] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);

  // View mode: 'overview' shows staff per day, 'employee' edits one employee's schedule
  const [viewMode, setViewMode] = useState('overview');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  // Public holiday marking mode
  const [phMarkingMode, setPhMarkingMode] = useState(false);

  // Get all days in month
  const getDaysInMonth = (yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days = [];

    const startDayOfWeek = firstDay.getDay();
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, dayNum: null, isCurrentMonth: false });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month - 1, d);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum: d,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        isCurrentMonth: true,
        isWeekend: date.getDay() === 0 || date.getDay() === 6
      });
    }

    return days;
  };

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await commissionApi.getIndoorSalesDepartments();
        setDepartments(res.data || []);
        if (propDeptId) {
          setSelectedDepartment(propDeptId.toString());
        } else if (res.data?.length > 0) {
          setSelectedDepartment(res.data[0].id.toString());
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };
    fetchDepartments();
  }, [propDeptId]);

  // Fetch monthly roster
  const fetchRoster = useCallback(async () => {
    if (!selectedDepartment) return;

    try {
      setLoading(true);
      const res = await schedulesApi.getDepartmentMonthRoster(selectedDepartment, currentMonth);
      setRoster(res.data.roster || []);
      setTemplates(res.data.templates || []);
    } catch (error) {
      console.error('Error fetching roster:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDepartment, currentMonth]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Navigation
  const goToPrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    setCurrentMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const goToNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    setCurrentMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const goToThisMonth = () => {
    const now = new Date();
    setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  // Get employees working on a specific date
  const getEmployeesOnDate = (date) => {
    if (!date) return [];
    return roster.filter(emp => {
      const shift = emp.shifts.find(s => s.date === date);
      return shift?.shift_code && !shift?.is_off;
    }).map(emp => {
      const shift = emp.shifts.find(s => s.date === date);
      return {
        ...emp,
        shift
      };
    });
  };

  // Handle shift click for employee view
  const handleShiftClick = async (employeeId, date) => {
    if (saving || !date) return;

    const employee = roster.find(e => e.employee_id === employeeId);
    if (!employee) return;

    const currentShift = employee.shifts.find(s => s.date === date) || {};

    // If PH marking mode is on, toggle PH status instead of shift
    if (phMarkingMode) {
      if (!currentShift.shift_template_id) {
        alert('Cannot mark PH on a day without shift. Assign a shift first.');
        return;
      }
      await togglePH(employeeId, date);
      return;
    }

    const workTemplates = templates.filter(t => !t.is_off);

    let nextTemplateIndex = -1;
    if (!currentShift.shift_template_id) {
      nextTemplateIndex = 0;
    } else {
      const currentIndex = workTemplates.findIndex(t => t.id === currentShift.shift_template_id);
      nextTemplateIndex = currentIndex + 1;
      if (nextTemplateIndex >= workTemplates.length) {
        nextTemplateIndex = -1;
      }
    }

    try {
      setSaving(true);
      if (nextTemplateIndex === -1) {
        await schedulesApi.clearSchedule(employeeId, date);
      } else {
        await schedulesApi.assignDepartmentShift({
          employee_id: employeeId,
          schedule_date: date,
          shift_template_id: workTemplates[nextTemplateIndex].id,
          department_id: parseInt(selectedDepartment)
        });
      }

      setRoster(prev => prev.map(emp => {
        if (emp.employee_id !== employeeId) return emp;

        const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
        let newShifts = [...emp.shifts];

        if (nextTemplateIndex === -1) {
          if (existingShiftIndex >= 0) {
            newShifts[existingShiftIndex] = { date, shift_template_id: null, shift_code: null, shift_color: null };
          }
        } else {
          const t = workTemplates[nextTemplateIndex];
          const newShift = {
            date,
            shift_template_id: t.id,
            shift_code: t.code,
            shift_color: t.color,
            is_off: false
          };
          if (existingShiftIndex >= 0) {
            newShifts[existingShiftIndex] = newShift;
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

  // Toggle public holiday status
  const togglePH = async (employeeId, date) => {
    if (saving || !date) return;

    const employee = roster.find(emp => emp.employee_id === employeeId);
    if (!employee) return;

    const currentShift = employee.shifts.find(s => s.date === date);
    if (!currentShift?.shift_template_id) return;

    try {
      setSaving(true);
      await schedulesApi.assignDepartmentShift({
        employee_id: employeeId,
        schedule_date: date,
        shift_template_id: currentShift.shift_template_id,
        department_id: parseInt(selectedDepartment),
        is_public_holiday: !currentShift.is_public_holiday
      });

      setRoster(prev => prev.map(emp => {
        if (emp.employee_id !== employeeId) return emp;
        return {
          ...emp,
          shifts: emp.shifts.map(s => {
            if (s.date !== date) return s;
            return { ...s, is_public_holiday: !currentShift.is_public_holiday };
          })
        };
      }));
    } catch (error) {
      console.error('Error toggling PH:', error);
      alert('Failed to toggle public holiday status');
    } finally {
      setSaving(false);
    }
  };

  // Handle right-click for public holiday (alternative method)
  const handleRightClick = async (e, employeeId, date) => {
    e.preventDefault();
    await togglePH(employeeId, date);
  };

  // Copy previous month
  const copyPreviousMonth = async () => {
    if (!window.confirm('Copy last month\'s schedule to this month? This will overwrite any existing assignments.')) return;

    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    try {
      setSaving(true);
      await schedulesApi.copyMonthSchedule(selectedDepartment, prevMonth, currentMonth);
      fetchRoster();
      alert('Schedule copied successfully!');
    } catch (error) {
      console.error('Error copying month:', error);
      alert(error.response?.data?.error || 'Failed to copy schedule');
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals for an employee
  const calculateTotals = (shifts) => {
    let normal = 0;
    let ph = 0;
    shifts.forEach(s => {
      if (s.shift_code && !s.is_off) {
        if (s.is_public_holiday) {
          ph++;
        } else {
          normal++;
        }
      }
    });
    return { normal, ph, total: normal + ph, effective: normal + (ph * 2) };
  };

  const formatMonthYear = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
  };

  const isToday = (dateStr) => {
    return dateStr === new Date().toISOString().split('T')[0];
  };

  const formatDateFull = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const days = getDaysInMonth(currentMonth);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get shift for a specific employee and date
  const getShift = (employeeId, date) => {
    const employee = roster.find(e => e.employee_id === employeeId);
    if (!employee) return null;
    return employee.shifts.find(s => s.date === date) || null;
  };

  const selectedEmployeeData = roster.find(e => e.employee_id === selectedEmployee);
  const selectedEmployeeTotals = selectedEmployeeData ? calculateTotals(selectedEmployeeData.shifts) : null;
  const employeesOnSelectedDate = selectedDate ? getEmployeesOnDate(selectedDate) : [];

  const content = (
      <div className="indoor-sales-schedule calendar-view">
        <header className="page-header">
          <div>
            <h1>Indoor Sales Schedule</h1>
            <p>Monthly calendar view - Click on a day to see who's working</p>
          </div>
        </header>

        {/* Controls */}
        <div className="schedule-controls">
          <div className="outlet-select">
            <label>Department:</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
            >
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} ({dept.employee_count} staff)
                </option>
              ))}
            </select>
          </div>

          <div className="month-nav">
            <button onClick={goToPrevMonth} className="nav-btn">&lt;</button>
            <span className="month-label">{formatMonthYear()}</span>
            <button onClick={goToNextMonth} className="nav-btn">&gt;</button>
            <button onClick={goToThisMonth} className="today-btn">This Month</button>
          </div>

          <div className="actions">
            <button onClick={copyPreviousMonth} className="copy-btn" disabled={saving}>
              Copy Last Month
            </button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'overview' ? 'active' : ''}`}
            onClick={() => { setViewMode('overview'); setSelectedEmployee(null); setPhMarkingMode(false); }}
          >
            View Schedule
          </button>
          <button
            className={`toggle-btn ${viewMode === 'employee' ? 'active' : ''}`}
            onClick={() => setViewMode('employee')}
          >
            Edit Schedule
          </button>
        </div>

        {/* Mode Description */}
        <div className="mode-description">
          {viewMode === 'overview' ? (
            <p>Click any date to see who is working that day. Staff count shown on each date.</p>
          ) : (
            <p>
              Select an employee from the right panel, then click calendar dates to assign shifts.
              {phMarkingMode && <span className="ph-mode-active"> PH Mode ON - clicking toggles Public Holiday</span>}
            </p>
          )}
        </div>

        {/* Legend */}
        <div className="shift-legend">
          <span className="legend-label">Shifts:</span>
          {templates.filter(t => !t.is_off).map(t => (
            <div
              key={t.id}
              className="legend-item"
              style={{ backgroundColor: t.color }}
            >
              {t.code}
            </div>
          ))}
          <div className="legend-item empty-legend">Empty = OFF</div>
          <div className="legend-item ph-badge">PH = 2x</div>
        </div>

        {loading ? (
          <div className="loading">Loading schedule...</div>
        ) : (
          <div className="schedule-content">
            {/* Calendar Grid */}
            <div className="calendar-container">
              <div className="calendar-grid">
                {weekDays.map(day => (
                  <div key={day} className={`calendar-header ${day === 'Sun' || day === 'Sat' ? 'weekend' : ''}`}>
                    {day}
                  </div>
                ))}

                {days.map((day, idx) => {
                  if (!day.isCurrentMonth) {
                    return <div key={idx} className="calendar-cell empty"></div>;
                  }

                  const employeesWorking = getEmployeesOnDate(day.date);
                  const workCount = employeesWorking.length;

                  if (viewMode === 'overview') {
                    return (
                      <div
                        key={idx}
                        className={`calendar-cell overview-cell ${isToday(day.date) ? 'today' : ''} ${day.isWeekend ? 'weekend' : ''} ${selectedDate === day.date ? 'selected' : ''}`}
                        onClick={() => setSelectedDate(day.date)}
                      >
                        <div className="cell-date">{day.dayNum}</div>
                        <div className={`work-count ${workCount === 0 ? 'none' : workCount >= 3 ? 'good' : 'low'}`}>
                          {workCount > 0 ? `${workCount} staff` : 'OFF'}
                        </div>
                        {workCount > 0 && workCount <= 3 && (
                          <div className="staff-preview">
                            {employeesWorking.slice(0, 3).map(emp => (
                              <span
                                key={emp.employee_id}
                                className="staff-badge"
                                style={{ backgroundColor: emp.shift?.shift_color || '#94a3b8' }}
                                title={emp.name}
                              >
                                {emp.name.split(' ')[0].slice(0, 3)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    // Employee view
                    const shift = selectedEmployee ? getShift(selectedEmployee, day.date) : null;
                    const hasShift = shift?.shift_code && !shift?.is_off;

                    return (
                      <div
                        key={idx}
                        className={`calendar-cell ${isToday(day.date) ? 'today' : ''} ${day.isWeekend ? 'weekend' : ''} ${hasShift ? 'has-shift' : 'off-day'}`}
                        onClick={() => selectedEmployee && handleShiftClick(selectedEmployee, day.date)}
                        onContextMenu={(e) => selectedEmployee && handleRightClick(e, selectedEmployee, day.date)}
                      >
                        <div className="cell-date">{day.dayNum}</div>
                        {selectedEmployee ? (
                          hasShift ? (
                            <div
                              className={`cell-shift ${shift.is_public_holiday ? 'ph' : ''}`}
                              style={{ backgroundColor: shift.shift_color }}
                            >
                              {shift.shift_code}
                              {shift.is_public_holiday && <span className="ph-tag">PH</span>}
                            </div>
                          ) : (
                            <div className="cell-off">OFF</div>
                          )
                        ) : (
                          <div className="cell-off">-</div>
                        )}
                      </div>
                    );
                  }
                })}
              </div>
            </div>

            {/* Side Panel */}
            <div className="side-panel">
              {viewMode === 'overview' ? (
                // Day Detail Panel
                <div className="day-detail">
                  <h3>{selectedDate ? formatDateFull(selectedDate) : 'Select a day'}</h3>
                  {selectedDate && (
                    <>
                      <div className="staff-count">
                        <span className="count-num">{employeesOnSelectedDate.length}</span>
                        <span className="count-label">Staff Working</span>
                      </div>
                      {employeesOnSelectedDate.length > 0 ? (
                        <ul className="staff-list">
                          {employeesOnSelectedDate.map(emp => (
                            <li key={emp.employee_id} className="staff-item">
                              <span
                                className="staff-shift-badge"
                                style={{ backgroundColor: emp.shift?.shift_color || '#94a3b8' }}
                              >
                                {emp.shift?.shift_code}
                              </span>
                              <span className="staff-name">{emp.name}</span>
                              {emp.shift?.is_public_holiday && (
                                <span className="ph-indicator">PH</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="no-staff">No staff scheduled - All OFF</p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                // Employee Selector Panel
                <div className="employee-panel">
                  <h3>Select Employee</h3>
                  <div className="employee-list">
                    {roster.map(emp => {
                      const totals = calculateTotals(emp.shifts);
                      return (
                        <button
                          key={emp.employee_id}
                          className={`employee-item ${selectedEmployee === emp.employee_id ? 'active' : ''}`}
                          onClick={() => setSelectedEmployee(emp.employee_id)}
                        >
                          <span className="emp-name">{emp.name}</span>
                          <span className="emp-days">{totals.total} days</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedEmployeeTotals && (
                    <div className="employee-stats">
                      <div className="stat-row">
                        <span>Working:</span>
                        <strong>{selectedEmployeeTotals.normal}</strong>
                      </div>
                      {selectedEmployeeTotals.ph > 0 && (
                        <div className="stat-row ph">
                          <span>PH:</span>
                          <strong>{selectedEmployeeTotals.ph}</strong>
                        </div>
                      )}
                      <div className="stat-row total">
                        <span>Effective:</span>
                        <strong>{selectedEmployeeTotals.effective}</strong>
                      </div>
                    </div>
                  )}

                  {/* PH Toggle Button */}
                  <button
                    className={`ph-toggle-btn ${phMarkingMode ? 'active' : ''}`}
                    onClick={() => setPhMarkingMode(!phMarkingMode)}
                  >
                    {phMarkingMode ? 'Exit PH Mode' : 'Mark Public Holiday'}
                  </button>

                  <div className="edit-instructions">
                    {!phMarkingMode ? (
                      <>
                        <p><strong>Click</strong> date to cycle through shifts (A1 → A2 → OFF)</p>
                        <p>Or click <strong>"Mark Public Holiday"</strong> above to mark PH days</p>
                      </>
                    ) : (
                      <>
                        <p className="ph-mode-info">PH MODE: Click any shift to toggle Public Holiday status</p>
                        <p>PH days count as 2x for commission calculation</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
}

export default IndoorSalesSchedule;
