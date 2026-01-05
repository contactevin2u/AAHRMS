import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { schedulesApi, outletsApi, employeeApi, leaveApi } from '../api';
import './Schedules.css';

function Schedules() {
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
        const [outletsRes, templatesRes] = await Promise.all([
          outletsApi.getAll(),
          schedulesApi.getTemplates()
        ]);

        const allOutlets = outletsRes.data || [];
        setOutlets(allOutlets);
        setTemplates(templatesRes.data || []);

        // For non-admin (supervisor), filter to their outlet only
        if (adminInfo && !isAdmin && adminInfo.outlet_id) {
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

    const employee = roster.find(e => e.employee_id === employeeId);
    if (!employee) return;

    const currentShift = employee.shifts.find(s => s.date === date);
    const workTemplates = templates.filter(t => !t.is_off);

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
        await schedulesApi.assignShift({
          employee_id: employeeId,
          schedule_date: date,
          shift_template_id: workTemplates[nextTemplateIndex].id,
          outlet_id: selectedOutlet.id
        });
      }

      // Update local state
      setRoster(prev => prev.map(emp => {
        if (emp.employee_id !== employeeId) return emp;

        const shiftIndex = emp.shifts.findIndex(s => s.date === date);
        let newShifts = [...emp.shifts];

        if (nextTemplateIndex === -1) {
          // OFF - clear the shift
          if (shiftIndex >= 0) {
            newShifts[shiftIndex] = { date, shift_code: null, shift_color: null, shift_template_id: null };
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

  const weekDates = getWeekDates();
  const weekLabel = `${weekDates[0].dayNum} - ${weekDates[6].dayNum} ${new Date(weekDates[0].date).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}`;

  return (
    <Layout>
      <div className="schedules-page-v2">
        <header className="page-header">
          <div>
            <h1>Staff Schedules</h1>
            <p>{isAdmin ? 'Manage all outlet schedules' : `${selectedOutlet?.name || 'Your Outlet'} Schedule`}</p>
          </div>
        </header>

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
            {/* Left Panel - Outlet List (Admin only) */}
            {isAdmin && (
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

                                return (
                                  <td
                                    key={d.date}
                                    className={`shift-cell ${d.isWeekend ? 'weekend' : ''} ${display ? 'has-shift' : 'off'}`}
                                    onClick={() => handleShiftClick(emp.employee_id, d.date)}
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
      </div>
    </Layout>
  );
}

export default Schedules;
