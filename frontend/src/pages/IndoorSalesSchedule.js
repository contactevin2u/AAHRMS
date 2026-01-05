import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { schedulesApi, commissionApi } from '../api';
import './IndoorSalesSchedule.css';

function IndoorSalesSchedule() {
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
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Get all days in month
  const getDaysInMonth = (yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days = [];

    // Add empty cells for days before first day of month
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, dayNum: null, isCurrentMonth: false });
    }

    // Add all days of the month
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

  // Fetch Indoor Sales department
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await commissionApi.getIndoorSalesDepartments();
        setDepartments(res.data || []);
        if (res.data?.length > 0) {
          setSelectedDepartment(res.data[0].id.toString());
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };
    fetchDepartments();
  }, []);

  // Fetch monthly roster
  const fetchRoster = useCallback(async () => {
    if (!selectedDepartment) return;

    try {
      setLoading(true);
      const res = await schedulesApi.getDepartmentMonthRoster(selectedDepartment, currentMonth);
      setRoster(res.data.roster || []);
      setTemplates(res.data.templates || []);

      // Auto-select first employee
      if (res.data.roster?.length > 0 && !selectedEmployee) {
        setSelectedEmployee(res.data.roster[0].employee_id);
      }
    } catch (error) {
      console.error('Error fetching roster:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDepartment, currentMonth, selectedEmployee]);

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

  // Handle shift click - cycle through work shifts only (no OFF)
  const handleShiftClick = async (employeeId, date) => {
    if (saving || !date) return;

    const employee = roster.find(e => e.employee_id === employeeId);
    if (!employee) return;

    const currentShift = employee.shifts.find(s => s.date === date) || {};

    // Filter out OFF templates - only cycle through work shifts
    const workTemplates = templates.filter(t => !t.is_off);

    // Cycle: empty -> first work template -> second -> ... -> empty
    let nextTemplateIndex = -1;
    if (!currentShift.shift_template_id) {
      nextTemplateIndex = 0;
    } else {
      const currentIndex = workTemplates.findIndex(t => t.id === currentShift.shift_template_id);
      nextTemplateIndex = currentIndex + 1;
      if (nextTemplateIndex >= workTemplates.length) {
        nextTemplateIndex = -1; // Clear = OFF
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

      // Update local state
      setRoster(prev => prev.map(emp => {
        if (emp.employee_id !== employeeId) return emp;

        const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
        let newShifts = [...emp.shifts];

        if (nextTemplateIndex === -1) {
          // Remove shift
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

  // Handle right-click for public holiday toggle
  const handleRightClick = async (e, employeeId, date) => {
    e.preventDefault();
    if (!date) return;

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
    } finally {
      setSaving(false);
    }
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

  return (
    <Layout>
      <div className="indoor-sales-schedule calendar-view">
        <header className="page-header">
          <div>
            <h1>Indoor Sales Schedule</h1>
            <p>Monthly calendar view - Empty = OFF day</p>
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

        {/* Employee Selector */}
        <div className="employee-selector">
          <label>Select Employee:</label>
          <div className="employee-chips">
            {roster.map(emp => {
              const totals = calculateTotals(emp.shifts);
              return (
                <button
                  key={emp.employee_id}
                  className={`employee-chip ${selectedEmployee === emp.employee_id ? 'active' : ''}`}
                  onClick={() => setSelectedEmployee(emp.employee_id)}
                >
                  <span className="chip-name">{emp.name}</span>
                  <span className="chip-count">{totals.total} days</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="shift-legend">
          <span className="legend-label">Click to assign:</span>
          {templates.filter(t => !t.is_off).map(t => (
            <div
              key={t.id}
              className="legend-item"
              style={{ backgroundColor: t.color }}
            >
              {t.code} - {t.name}
              {t.start_time && ` (${t.start_time.slice(0,5)}-${t.end_time.slice(0,5)})`}
            </div>
          ))}
          <div className="legend-item empty-legend">
            Empty = OFF
          </div>
          <div className="legend-item ph-badge">
            Right-click = PH (2x)
          </div>
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="loading">Loading schedule...</div>
        ) : !selectedEmployee ? (
          <div className="no-data">Select an employee to view their schedule.</div>
        ) : (
          <>
            {/* Employee Stats */}
            {selectedEmployeeTotals && (
              <div className="employee-stats">
                <div className="stat-item">
                  <span className="stat-label">Working Days:</span>
                  <span className="stat-value">{selectedEmployeeTotals.normal}</span>
                </div>
                {selectedEmployeeTotals.ph > 0 && (
                  <div className="stat-item ph">
                    <span className="stat-label">PH Days:</span>
                    <span className="stat-value">{selectedEmployeeTotals.ph}</span>
                  </div>
                )}
                <div className="stat-item total">
                  <span className="stat-label">Effective Days:</span>
                  <span className="stat-value">{selectedEmployeeTotals.effective}</span>
                </div>
              </div>
            )}

            {/* Calendar */}
            <div className="calendar-container">
              <div className="calendar-grid">
                {/* Week day headers */}
                {weekDays.map(day => (
                  <div key={day} className={`calendar-header ${day === 'Sun' || day === 'Sat' ? 'weekend' : ''}`}>
                    {day}
                  </div>
                ))}

                {/* Calendar days */}
                {days.map((day, idx) => {
                  if (!day.isCurrentMonth) {
                    return <div key={idx} className="calendar-cell empty"></div>;
                  }

                  const shift = getShift(selectedEmployee, day.date);
                  const hasShift = shift?.shift_code && !shift?.is_off;

                  return (
                    <div
                      key={idx}
                      className={`calendar-cell ${isToday(day.date) ? 'today' : ''} ${day.isWeekend ? 'weekend' : ''} ${hasShift ? 'has-shift' : 'off-day'}`}
                      onClick={() => handleShiftClick(selectedEmployee, day.date)}
                      onContextMenu={(e) => handleRightClick(e, selectedEmployee, day.date)}
                    >
                      <div className="cell-date">{day.dayNum}</div>
                      {hasShift ? (
                        <div
                          className={`cell-shift ${shift.is_public_holiday ? 'ph' : ''}`}
                          style={{ backgroundColor: shift.shift_color }}
                        >
                          {shift.shift_code}
                          {shift.is_public_holiday && <span className="ph-tag">PH</span>}
                        </div>
                      ) : (
                        <div className="cell-off">OFF</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Instructions */}
        <div className="instructions">
          <p><strong>Click</strong> on a day to cycle through shifts: OFF &rarr; {templates.filter(t => !t.is_off).map(t => t.code).join(' → ')} &rarr; OFF</p>
          <p><strong>Right-click</strong> on a working day to mark as Public Holiday (PH = 2x commission)</p>
        </div>
      </div>
    </Layout>
  );
}

export default IndoorSalesSchedule;
