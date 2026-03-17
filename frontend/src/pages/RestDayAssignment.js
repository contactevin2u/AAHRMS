import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { restDaysApi, outletsApi } from '../api';

function RestDayAssignment() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Data
  const [weeks, setWeeks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState({}); // { employeeId: { weekStart: dateStr } }
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load outlets
  useEffect(() => {
    const loadOutlets = async () => {
      try {
        const res = await outletsApi.getAll();
        setOutlets(res.data || []);
        if (res.data?.length > 0) {
          setSelectedOutlet(res.data[0].id);
        }
      } catch (err) {
        console.error('Failed to load outlets:', err);
      }
    };
    loadOutlets();
  }, []);

  // Load data when month/year/outlet changes
  const loadData = useCallback(async () => {
    if (!selectedOutlet) return;
    setLoading(true);
    try {
      const [weeksRes, empRes, assignRes] = await Promise.all([
        restDaysApi.getWeeks(selectedMonth, selectedYear),
        restDaysApi.getEmployees({ outlet_id: selectedOutlet }),
        restDaysApi.getAll({ month: selectedMonth, year: selectedYear, outlet_id: selectedOutlet })
      ]);

      setWeeks(weeksRes.data || []);
      setEmployees(empRes.data || []);

      // Build assignments map from existing data
      const assignMap = {};
      for (const emp of (assignRes.data || [])) {
        assignMap[emp.employee_id] = {};
        for (const rd of emp.rest_days) {
          assignMap[emp.employee_id][rd.week_start] = rd.rest_date;
        }
      }
      setAssignments(assignMap);
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet, selectedMonth, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle rest day for an employee on a specific date
  const toggleRestDay = (employeeId, dateStr, weekStart) => {
    setAssignments(prev => {
      const empAssign = { ...(prev[employeeId] || {}) };
      if (empAssign[weekStart] === dateStr) {
        // Unset
        delete empAssign[weekStart];
      } else {
        // Set (replaces any existing rest day in this week)
        empAssign[weekStart] = dateStr;
      }
      return { ...prev, [employeeId]: empAssign };
    });
    setHasChanges(true);
  };

  // Save all assignments
  const handleSave = async () => {
    setSaving(true);
    try {
      const bulkData = [];
      for (const emp of employees) {
        const empAssign = assignments[emp.id] || {};
        const restDates = Object.values(empAssign);
        bulkData.push({ employee_id: emp.id, rest_dates: restDates });
      }

      await restDaysApi.bulkAssign({
        outlet_id: parseInt(selectedOutlet),
        month: selectedMonth,
        year: selectedYear,
        assignments: bulkData
      });

      setHasChanges(false);
      alert('Rest days saved successfully!');
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Load summary
  const handleShowSummary = async () => {
    try {
      const res = await restDaysApi.getSummary({
        month: selectedMonth,
        year: selectedYear,
        outlet_id: selectedOutlet
      });
      setSummary(res.data);
      setShowSummary(true);
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  };

  // Check if date is a rest day for an employee
  const isRestDay = (employeeId, dateStr, weekStart) => {
    return assignments[employeeId]?.[weekStart] === dateStr;
  };

  // Count rest days for an employee
  const countRestDays = (employeeId) => {
    const empAssign = assignments[employeeId] || {};
    return Object.keys(empAssign).length;
  };

  // Get day name
  const getDayName = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  };

  const getDateNum = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').getDate();
  };

  const calendarDays = new Date(selectedYear, selectedMonth, 0).getDate();

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  return (
    <Layout>
      <div style={{ padding: '20px', maxWidth: '100%', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0 }}>Rest Day Assignment</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedOutlet}
              onChange={e => setSelectedOutlet(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              <option value="">Select Outlet</option>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value))}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={handleShowSummary}
              style={{
                padding: '8px 16px', borderRadius: '6px', border: '1px solid #4a90d9',
                background: 'white', color: '#4a90d9', cursor: 'pointer', fontWeight: '500'
              }}
            >
              Monthly Summary
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              style={{
                padding: '8px 16px', borderRadius: '6px', border: 'none',
                background: hasChanges ? '#4CAF50' : '#ccc', color: 'white',
                cursor: hasChanges ? 'pointer' : 'not-allowed', fontWeight: '500'
              }}
            >
              {saving ? 'Saving...' : 'Save Rest Days'}
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div style={{
          background: '#f0f7ff', border: '1px solid #c2dcf5', borderRadius: '8px',
          padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#333'
        }}>
          <strong>Calendar-based salary:</strong> Working Days = {calendarDays} calendar days - Rest Days.
          Click a cell to assign one rest day per week per employee. Daily Rate = Salary / Working Days.
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Loading...</div>
        ) : employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            No full-time employees found for this outlet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{
                    position: 'sticky', left: 0, background: '#f5f5f5', zIndex: 2,
                    padding: '8px', border: '1px solid #ddd', minWidth: '150px', textAlign: 'left'
                  }}>
                    Employee
                  </th>
                  {weeks.map(week => (
                    week.days.map(day => (
                      <th key={day} style={{
                        padding: '4px 6px', border: '1px solid #ddd', textAlign: 'center',
                        background: getDayName(day) === 'Sun' ? '#fff3e0' : '#f5f5f5',
                        minWidth: '45px', fontSize: '11px'
                      }}>
                        <div>{getDayName(day)}</div>
                        <div style={{ fontWeight: 'bold' }}>{getDateNum(day)}</div>
                      </th>
                    ))
                  ))}
                  <th style={{
                    padding: '8px', border: '1px solid #ddd', textAlign: 'center',
                    background: '#f5f5f5', minWidth: '60px'
                  }}>
                    Rest
                  </th>
                  <th style={{
                    padding: '8px', border: '1px solid #ddd', textAlign: 'center',
                    background: '#f5f5f5', minWidth: '60px'
                  }}>
                    Work
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const restCount = countRestDays(emp.id);
                  const workCount = calendarDays - restCount;
                  return (
                    <tr key={emp.id}>
                      <td style={{
                        position: 'sticky', left: 0, background: 'white', zIndex: 1,
                        padding: '6px 8px', border: '1px solid #ddd', fontWeight: '500',
                        whiteSpace: 'nowrap'
                      }}>
                        <div>{emp.name}</div>
                        <div style={{ fontSize: '10px', color: '#888' }}>
                          RM {parseFloat(emp.default_basic_salary || 0).toFixed(0)}
                          {workCount > 0 && ` | DR: RM ${(parseFloat(emp.default_basic_salary || 0) / workCount).toFixed(2)}`}
                        </div>
                      </td>
                      {weeks.map(week => {
                        return week.days.map(day => {
                          const isRest = isRestDay(emp.id, day, week.week_start);
                          const isSunday = getDayName(day) === 'Sun';
                          return (
                            <td
                              key={day}
                              onClick={() => toggleRestDay(emp.id, day, week.week_start)}
                              style={{
                                padding: '4px', border: '1px solid #ddd', textAlign: 'center',
                                cursor: 'pointer',
                                background: isRest ? '#ef5350' : (isSunday ? '#fff8e1' : 'white'),
                                color: isRest ? 'white' : '#333',
                                fontWeight: isRest ? 'bold' : 'normal',
                                transition: 'background 0.15s'
                              }}
                              title={isRest ? 'REST DAY - Click to remove' : 'Click to set as rest day'}
                            >
                              {isRest ? 'OFF' : ''}
                            </td>
                          );
                        });
                      })}
                      <td style={{
                        padding: '6px', border: '1px solid #ddd', textAlign: 'center',
                        fontWeight: 'bold', color: '#ef5350'
                      }}>
                        {restCount}
                      </td>
                      <td style={{
                        padding: '6px', border: '1px solid #ddd', textAlign: 'center',
                        fontWeight: 'bold', color: '#4CAF50'
                      }}>
                        {workCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Monthly Summary Modal */}
        {showSummary && summary && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000
          }}
            onClick={() => setShowSummary(false)}
          >
            <div
              style={{
                background: 'white', borderRadius: '12px', padding: '24px',
                maxWidth: '900px', width: '90%', maxHeight: '80vh', overflowY: 'auto'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>
                  Monthly Summary - {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </h3>
                <button
                  onClick={() => setShowSummary(false)}
                  style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}
                >
                  x
                </button>
              </div>
              <div style={{
                background: '#f0f7ff', padding: '12px', borderRadius: '6px',
                marginBottom: '16px', fontSize: '13px'
              }}>
                Calendar Days: <strong>{summary.calendar_days}</strong>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Employee</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Basic</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Rest</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Working</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Worked</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Paid Leave</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Unpaid</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Absent</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Daily Rate</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>Est. Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.employees?.map(emp => (
                    <tr key={emp.employee_id}>
                      <td style={{ padding: '6px 8px', border: '1px solid #ddd' }}>
                        <div>{emp.name}</div>
                        <div style={{ fontSize: '10px', color: '#888' }}>{emp.emp_no}</div>
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>
                        {emp.basic_salary.toFixed(2)}
                      </td>
                      <td style={{
                        padding: '6px', border: '1px solid #ddd', textAlign: 'center',
                        color: emp.rest_days > 0 ? '#ef5350' : '#ccc'
                      }}>
                        {emp.rest_days}
                        {!emp.rest_days_assigned && (
                          <div style={{ fontSize: '9px', color: '#ff9800' }}>Not set</div>
                        )}
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                        {emp.working_days}
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center' }}>
                        {emp.days_worked}
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', color: '#4CAF50' }}>
                        {emp.paid_leave_days}
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', color: '#ff9800' }}>
                        {emp.unpaid_leave_days}
                      </td>
                      <td style={{
                        padding: '6px', border: '1px solid #ddd', textAlign: 'center',
                        color: emp.absent_days > 0 ? '#ef5350' : '#ccc'
                      }}>
                        {emp.absent_days}
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>
                        {emp.daily_rate.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                        {emp.estimated_pay.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default RestDayAssignment;
