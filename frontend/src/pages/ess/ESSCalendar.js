import React, { useState } from 'react';
import ESSLayout from '../../components/ESSLayout';

function ESSCalendar() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Sample schedule data
  const schedules = {
    '2026-01-02': { shift: 'Morning', time: '8:00 AM - 4:00 PM', outlet: 'TEST OUTLET' },
    '2026-01-03': { shift: 'Morning', time: '8:00 AM - 4:00 PM', outlet: 'TEST OUTLET' },
    '2026-01-04': { shift: 'Afternoon', time: '2:00 PM - 10:00 PM', outlet: 'TEST OUTLET' },
    '2026-01-05': { shift: 'Off', time: 'Day Off', outlet: '' },
    '2026-01-06': { shift: 'Morning', time: '8:00 AM - 4:00 PM', outlet: 'TEST OUTLET' },
    '2026-01-07': { shift: 'Morning', time: '8:00 AM - 4:00 PM', outlet: 'TEST OUTLET' }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Add empty slots for days before first day of month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const formatDateKey = (date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  const getShiftColor = (shift) => {
    const colors = {
      'Morning': '#dbeafe',
      'Afternoon': '#fef3c7',
      'Night': '#e0e7ff',
      'Off': '#fee2e2'
    };
    return colors[shift] || '#f1f5f9';
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const days = getDaysInMonth(currentMonth);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>Calendar</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>View your work schedule</p>
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
              const schedule = schedules[dateKey];
              const isToday = formatDateKey(new Date()) === dateKey;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate({ date, schedule })}
                  style={{
                    padding: '8px',
                    textAlign: 'center',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: schedule ? getShiftColor(schedule.shift) : (isToday ? '#f0f9ff' : 'transparent'),
                    border: isToday ? '2px solid #1976d2' : 'none'
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: isToday ? '700' : '500', color: '#1e293b' }}>
                    {date.getDate()}
                  </div>
                  {schedule && (
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      {schedule.shift === 'Off' ? 'Off' : schedule.shift.charAt(0)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <div style={{ width: '16px', height: '16px', background: '#dbeafe', borderRadius: '4px' }}></div>
            <span>Morning</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <div style={{ width: '16px', height: '16px', background: '#fef3c7', borderRadius: '4px' }}></div>
            <span>Afternoon</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <div style={{ width: '16px', height: '16px', background: '#e0e7ff', borderRadius: '4px' }}></div>
            <span>Night</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <div style={{ width: '16px', height: '16px', background: '#fee2e2', borderRadius: '4px' }}></div>
            <span>Off</span>
          </div>
        </div>

        {/* Selected Date Modal */}
        {selectedDate && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedDate(null)}>
            <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '24px' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                {selectedDate.date.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              {selectedDate.schedule ? (
                <div style={{ background: getShiftColor(selectedDate.schedule.shift), padding: '16px', borderRadius: '12px' }}>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>{selectedDate.schedule.shift} Shift</div>
                  <div style={{ color: '#64748b' }}>{selectedDate.schedule.time}</div>
                  {selectedDate.schedule.outlet && <div style={{ color: '#64748b', marginTop: '4px' }}>{selectedDate.schedule.outlet}</div>}
                </div>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No schedule for this day</div>
              )}
              <button onClick={() => setSelectedDate(null)} style={{ width: '100%', marginTop: '16px', padding: '14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSCalendar;
