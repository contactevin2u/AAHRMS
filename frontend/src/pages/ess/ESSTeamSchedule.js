import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { toast } from 'react-toastify';
import { isMimixCompany, isSupervisorOrManager } from '../../utils/permissions';

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    employee_id: '',
    shift_start: '09:00',
    shift_end: '18:00',
    status: 'scheduled'
  });

  const isMimix = isMimixCompany(employeeInfo);

  // Check access: Mimix (supervisors/managers) or AA Alive Indoor Sales Manager
  const isIndoorSalesManager = !isMimix &&
    (employeeInfo?.position === 'Manager' || employeeInfo?.employee_role === 'manager');
  const canManageSchedules = isSupervisorOrManager(employeeInfo) || isIndoorSalesManager;

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

      // Auto-select first outlet/department
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

      if (isMimix && selectedOutlet) {
        params.outlet_id = selectedOutlet;
      }
      if (!isMimix && selectedDepartment) {
        params.department_id = selectedDepartment;
      }

      const response = await essApi.getTeamSchedules(params);
      setSchedules(response.data.schedules || {});
    } catch (error) {
      console.error('Error fetching schedules:', error);
      setSchedules({});
    } finally {
      setLoading(false);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!selectedDate || !scheduleForm.employee_id) {
      toast.warning('Please select an employee');
      return;
    }

    try {
      const data = {
        employee_id: parseInt(scheduleForm.employee_id),
        schedule_date: selectedDate,
        shift_start: scheduleForm.shift_start,
        shift_end: scheduleForm.shift_end,
        status: scheduleForm.status,
        outlet_id: isMimix ? parseInt(selectedOutlet) : null
      };

      if (editingSchedule) {
        await essApi.updateTeamSchedule(editingSchedule.id, data);
        toast.success('Schedule updated');
      } else {
        await essApi.createTeamSchedule(data);
        toast.success('Schedule created');
      }
      setShowAddModal(false);
      setEditingSchedule(null);
      setScheduleForm({ employee_id: '', shift_start: '09:00', shift_end: '18:00', status: 'scheduled' });
      fetchTeamSchedules();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save schedule');
    }
  };

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setSelectedDate(schedule.schedule_date);
    setScheduleForm({
      employee_id: schedule.employee_id.toString(),
      shift_start: schedule.shift_start || '09:00',
      shift_end: schedule.shift_end || '18:00',
      status: schedule.status || 'scheduled'
    });
    setShowAddModal(true);
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Delete this schedule?')) return;

    try {
      await essApi.deleteTeamSchedule(scheduleId);
      toast.success('Schedule deleted');
      fetchTeamSchedules();
    } catch (error) {
      toast.error('Failed to delete schedule');
    }
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const formatDateKey = (date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const openAddModal = (date) => {
    setEditingSchedule(null);
    setScheduleForm({ employee_id: '', shift_start: '09:00', shift_end: '18:00', status: 'scheduled' });
    setSelectedDate(formatDateKey(date));
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingSchedule(null);
    setScheduleForm({ employee_id: '', shift_start: '09:00', shift_end: '18:00', status: 'scheduled' });
  };

  const days = getDaysInMonth(currentMonth);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Filter employees based on selected outlet/department
  const filteredEmployees = employees.filter(emp => {
    if (isMimix && selectedOutlet) {
      return emp.outlet_id?.toString() === selectedOutlet;
    }
    if (!isMimix && selectedDepartment) {
      return emp.department_id?.toString() === selectedDepartment;
    }
    return true;
  });

  if (!canManageSchedules) {
    return (
      <ESSLayout>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>This page is only available for Supervisors and Managers.</p>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>Team Schedule</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Manage your team's work schedule</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {isMimix && outlets.length > 0 && (
            <select
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
            >
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}

          {!isMimix && departments.length > 0 && (
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Month Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button onClick={prevMonth} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
            &lt;
          </button>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            {currentMonth.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={nextMonth} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
            &gt;
          </button>
        </div>

        {/* Calendar Grid */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
          ) : (
            <>
              {/* Day Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                {dayNames.map(day => (
                  <div key={day} style={{ textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#64748b', padding: '8px' }}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Days */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {days.map((date, idx) => {
                  if (!date) {
                    return <div key={idx} style={{ padding: '8px' }}></div>;
                  }

                  const dateKey = formatDateKey(date);
                  const daySchedules = schedules[dateKey] || [];
                  const isToday = formatDateKey(new Date()) === dateKey;
                  const isPast = date < new Date().setHours(0, 0, 0, 0);

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '8px',
                        minHeight: '80px',
                        borderRadius: '8px',
                        background: isToday ? '#e3f2fd' : '#f8fafc',
                        border: isToday ? '2px solid #1976d2' : '1px solid #e5e7eb',
                        cursor: isPast ? 'default' : 'pointer'
                      }}
                      onClick={() => !isPast && openAddModal(date)}
                    >
                      <div style={{ fontSize: '12px', fontWeight: isToday ? '700' : '500', color: '#1e293b', marginBottom: '4px' }}>
                        {date.getDate()}
                      </div>
                      {daySchedules.slice(0, 2).map((s, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: '10px',
                            padding: '2px 4px',
                            background: s.status === 'off' ? '#fee2e2' : '#dbeafe',
                            borderRadius: '4px',
                            marginBottom: '2px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: isPast ? 'default' : 'pointer' }}
                            onClick={() => !isPast && handleEditSchedule(s)}
                            title={isPast ? '' : 'Click to edit'}
                          >
                            {s.employee_name?.split(' ')[0]}
                          </span>
                          {!isPast && (
                            <button
                              onClick={() => handleDeleteSchedule(s.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '10px', color: '#dc2626' }}
                            >
                              x
                            </button>
                          )}
                        </div>
                      ))}
                      {daySchedules.length > 2 && (
                        <div style={{ fontSize: '10px', color: '#64748b' }}>+{daySchedules.length - 2} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Employee Legend */}
        <div style={{ marginTop: '16px', background: 'white', borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Team Members ({filteredEmployees.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {filteredEmployees.map(emp => (
              <div key={emp.id} style={{ fontSize: '12px', padding: '4px 8px', background: '#f1f5f9', borderRadius: '4px' }}>
                {emp.name}
              </div>
            ))}
          </div>
        </div>

        {/* Add/Edit Schedule Modal */}
        {showAddModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeModal}>
            <div style={{ background: 'white', width: '90%', maxWidth: '400px', borderRadius: '16px', padding: '24px' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                {editingSchedule ? 'Edit' : 'Add'} Schedule - {selectedDate}
              </h3>

              <form onSubmit={handleAddSchedule}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Employee</label>
                  <select
                    value={scheduleForm.employee_id}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, employee_id: e.target.value })}
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
                  >
                    <option value="">Select Employee</option>
                    {filteredEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Start Time</label>
                    <input
                      type="time"
                      value={scheduleForm.shift_start}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, shift_start: e.target.value })}
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>End Time</label>
                    <input
                      type="time"
                      value={scheduleForm.shift_end}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, shift_end: e.target.value })}
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Status</label>
                  <select
                    value={scheduleForm.status}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, status: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px' }}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="off">Day Off</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={closeModal}
                    style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '14px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', background: '#1976d2', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}
                  >
                    {editingSchedule ? 'Update' : 'Add'} Schedule
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

export default ESSTeamSchedule;
