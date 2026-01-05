import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { schedulesApi, commissionApi } from '../api';
import './IndoorSalesSchedule.css';

function IndoorSalesSchedule() {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()));
  const [roster, setRoster] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [dates, setDates] = useState([]);
  const [saving, setSaving] = useState(false);

  // Get Monday of the week
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

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

  // Fetch weekly roster
  const fetchRoster = useCallback(async () => {
    if (!selectedDepartment) return;

    try {
      setLoading(true);
      const res = await schedulesApi.getDepartmentRoster(selectedDepartment, currentWeekStart);
      setRoster(res.data.roster || []);
      setTemplates(res.data.templates || []);
      setDates(res.data.dates || []);
    } catch (error) {
      console.error('Error fetching roster:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDepartment, currentWeekStart]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Navigation
  const goToPrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d.toISOString().split('T')[0]);
  };

  const goToNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d.toISOString().split('T')[0]);
  };

  const goToThisWeek = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  // Handle shift click
  const handleShiftClick = async (employeeId, date, currentShift) => {
    if (saving) return;

    // Cycle through templates: null -> first template -> second -> ... -> null
    let nextTemplateIndex = -1;
    if (!currentShift.shift_template_id) {
      nextTemplateIndex = 0;
    } else {
      const currentIndex = templates.findIndex(t => t.id === currentShift.shift_template_id);
      nextTemplateIndex = currentIndex + 1;
      if (nextTemplateIndex >= templates.length) {
        nextTemplateIndex = -1; // Clear
      }
    }

    try {
      setSaving(true);
      if (nextTemplateIndex === -1) {
        // Clear the schedule
        await schedulesApi.clearSchedule(employeeId, date);
      } else {
        // Assign shift template
        await schedulesApi.assignDepartmentShift({
          employee_id: employeeId,
          schedule_date: date,
          shift_template_id: templates[nextTemplateIndex].id,
          department_id: parseInt(selectedDepartment)
        });
      }

      // Update local state
      setRoster(prev => prev.map(emp => {
        if (emp.employee_id !== employeeId) return emp;
        return {
          ...emp,
          shifts: emp.shifts.map(s => {
            if (s.date !== date) return s;
            if (nextTemplateIndex === -1) {
              return { date, id: null, shift_code: null, shift_color: null };
            }
            const t = templates[nextTemplateIndex];
            return {
              ...s,
              shift_template_id: t.id,
              shift_code: t.code,
              shift_color: t.color,
              is_off: t.is_off
            };
          })
        };
      }));
    } catch (error) {
      console.error('Error updating shift:', error);
      alert(error.response?.data?.error || 'Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  // Handle right-click for public holiday toggle
  const handleRightClick = async (e, employeeId, date, currentShift) => {
    e.preventDefault();
    if (!currentShift.shift_template_id) return;

    try {
      setSaving(true);
      await schedulesApi.assignDepartmentShift({
        employee_id: employeeId,
        schedule_date: date,
        shift_template_id: currentShift.shift_template_id,
        department_id: parseInt(selectedDepartment),
        is_public_holiday: !currentShift.is_public_holiday
      });

      // Update local state
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

  // Copy previous week
  const copyPreviousWeek = async () => {
    if (!window.confirm('Copy last week\'s schedule to this week? This will overwrite any existing assignments.')) return;

    const prevWeekStart = new Date(currentWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

    try {
      setSaving(true);
      const prevRes = await schedulesApi.getDepartmentRoster(selectedDepartment, prevWeekStartStr);
      const prevRoster = prevRes.data.roster || [];

      const assignments = [];
      prevRoster.forEach(emp => {
        emp.shifts.forEach((shift, index) => {
          if (shift.shift_template_id) {
            const newDate = dates[index]?.date;
            if (newDate) {
              assignments.push({
                employee_id: emp.employee_id,
                schedule_date: newDate,
                shift_template_id: shift.shift_template_id,
                is_public_holiday: false // Reset PH status for new week
              });
            }
          }
        });
      });

      if (assignments.length > 0) {
        await schedulesApi.bulkAssignDepartmentShifts(selectedDepartment, assignments);
        fetchRoster();
      } else {
        alert('No schedules found in previous week to copy.');
      }
    } catch (error) {
      console.error('Error copying week:', error);
      alert(error.response?.data?.error || 'Failed to copy schedule');
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals
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
    return { normal, ph, effective: normal + (ph * 2) };
  };

  const formatWeekRange = () => {
    const start = new Date(currentWeekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const options = { day: 'numeric', month: 'short' };
    return `${start.toLocaleDateString('en-MY', options)} - ${end.toLocaleDateString('en-MY', options)}, ${start.getFullYear()}`;
  };

  const isToday = (dateStr) => {
    return dateStr === new Date().toISOString().split('T')[0];
  };

  return (
    <Layout>
      <div className="indoor-sales-schedule">
        <header className="page-header">
          <div>
            <h1>Indoor Sales Schedule</h1>
            <p>Weekly shift roster for Indoor Sales team</p>
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

          <div className="week-nav">
            <button onClick={goToPrevWeek} className="nav-btn">&lt;</button>
            <span className="week-label">{formatWeekRange()}</span>
            <button onClick={goToNextWeek} className="nav-btn">&gt;</button>
            <button onClick={goToThisWeek} className="today-btn">This Week</button>
          </div>

          <div className="actions">
            <button onClick={copyPreviousWeek} className="copy-btn" disabled={saving}>
              Copy Last Week
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="shift-legend">
          <span className="legend-label">Shift Templates:</span>
          {templates.map(t => (
            <div
              key={t.id}
              className="legend-item"
              style={{ backgroundColor: t.color }}
            >
              {t.code} - {t.name}
              {t.start_time && ` (${t.start_time}-${t.end_time})`}
            </div>
          ))}
          <div className="legend-item ph-badge">
            PH = Public Holiday (2x)
          </div>
        </div>

        {/* Roster Grid */}
        {loading ? (
          <div className="loading">Loading roster...</div>
        ) : roster.length === 0 ? (
          <div className="no-data">
            No employees in Indoor Sales department.
            <p>Assign employees to the Indoor Sales department in the Employees page.</p>
          </div>
        ) : (
          <div className="roster-table-container">
            <table className="roster-table">
              <thead>
                <tr>
                  <th className="employee-col">Employee</th>
                  {dates.map(d => (
                    <th key={d.date} className={`day-col ${isToday(d.date) ? 'today' : ''}`}>
                      <div className="day-header">
                        <span className="day-name">{d.day}</span>
                        <span className="day-num">{d.dayNum}</span>
                      </div>
                    </th>
                  ))}
                  <th className="total-col">Shifts</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(emp => {
                  const totals = calculateTotals(emp.shifts);
                  return (
                    <tr key={emp.employee_id}>
                      <td className="employee-cell">
                        <div className="employee-info">
                          <span className="emp-name">{emp.name}</span>
                          <span className="emp-code">{emp.employee_code}</span>
                        </div>
                      </td>
                      {emp.shifts.map((shift, idx) => (
                        <td
                          key={idx}
                          className={`shift-cell ${isToday(shift.date) ? 'today' : ''}`}
                          onClick={() => handleShiftClick(emp.employee_id, shift.date, shift)}
                          onContextMenu={(e) => handleRightClick(e, emp.employee_id, shift.date, shift)}
                        >
                          {shift.shift_code ? (
                            <div
                              className={`shift-badge ${shift.is_off ? 'off' : ''} ${shift.is_public_holiday ? 'ph' : ''}`}
                              style={{ backgroundColor: shift.shift_color }}
                            >
                              {shift.shift_code}
                              {shift.is_public_holiday && <span className="ph-indicator">PH</span>}
                            </div>
                          ) : (
                            <div className="empty-cell">-</div>
                          )}
                        </td>
                      ))}
                      <td className="total-cell">
                        <div className="totals">
                          <span title="Normal shifts">{totals.normal}</span>
                          {totals.ph > 0 && (
                            <span className="ph-total" title="PH shifts (2x)">+{totals.ph}PH</span>
                          )}
                          <span className="effective" title="Effective shifts">= {totals.effective}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Instructions */}
        <div className="instructions">
          <p><strong>Click</strong> on a cell to cycle through shifts: Empty &rarr; {templates.map(t => t.code).join(' → ')} &rarr; Empty</p>
          <p><strong>Right-click</strong> on an assigned shift to toggle Public Holiday (PH) status</p>
          <p>PH shifts count as <strong>2x</strong> for commission calculation</p>
        </div>
      </div>
    </Layout>
  );
}

export default IndoorSalesSchedule;
