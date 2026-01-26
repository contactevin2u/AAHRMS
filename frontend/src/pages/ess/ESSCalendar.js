import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { useLanguage } from '../../contexts/LanguageContext';

function ESSCalendar() {
  const { t, language } = useLanguage();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [schedules, setSchedules] = useState({});
  const [shiftLegend, setShiftLegend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchedules();
  }, [currentMonth]);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;
      const response = await essApi.getMySchedule(year, month);

      // Convert API response to our format
      const scheduleMap = {};
      const legendMap = {}; // Track unique shift types for legend

      if (response.data && response.data.schedules) {
        Object.entries(response.data.schedules).forEach(([dateKey, schedule]) => {
          const shiftStart = schedule.shift_start || '09:00';
          const shiftEnd = schedule.shift_end || '18:00';
          const isOff = schedule.is_off || schedule.status === 'off' || (shiftStart === '00:00' && shiftEnd === '00:00');

          // Use shift code if available (e.g., "AM", "PM")
          let shiftCode = null;
          let shiftName = null;
          let shiftColor = schedule.shift_color || null;

          if (isOff) {
            shiftCode = 'Off';
            shiftName = 'Day Off';
            shiftColor = '#fee2e2';
          } else if (schedule.shift_code) {
            // Use the shift template code directly (matches admin view)
            shiftCode = schedule.shift_code;
            shiftName = schedule.shift_name || schedule.shift_code;
            // Add to legend if not already there
            if (!legendMap[shiftCode]) {
              legendMap[shiftCode] = {
                code: shiftCode,
                name: shiftName,
                color: shiftColor
              };
            }
          }

          scheduleMap[dateKey] = {
            shift: shiftCode || 'Work',
            shiftLabel: shiftCode,
            shiftName: shiftName,
            shiftColor: shiftColor,
            time: isOff ? 'Day Off' : `${formatTime(shiftStart)} - ${formatTime(shiftEnd)}`,
            outlet: schedule.outlet_name || '',
            attended: schedule.attended || false,
            status: schedule.status,
            isPublicHoliday: schedule.is_public_holiday
          };
        });
      }

      setSchedules(scheduleMap);
      // Convert legend map to array for rendering
      setShiftLegend(Object.values(legendMap));
    } catch (error) {
      console.error('Error fetching schedules:', error);
      setSchedules({});
      setShiftLegend([]);
    } finally {
      setLoading(false);
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
    // Use local date components to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getShiftColor = (schedule, forBackground = true) => {
    // Use custom shift color from template if available
    if (schedule?.shiftColor) {
      if (forBackground) {
        // Make the color lighter for background
        return schedule.shiftColor + '33'; // Add alpha for lighter shade
      }
      return schedule.shiftColor;
    }

    // Fallback colors for Off and no-template cases
    if (schedule?.shift === 'Off') return '#fee2e2';
    return forBackground ? '#f1f5f9' : '#64748b';
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const days = getDaysInMonth(currentMonth);
  const dayNames = language === 'ms'
    ? [t('days.sun'), t('days.mon'), t('days.tue'), t('days.wed'), t('days.thu'), t('days.fri'), t('days.sat')]
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>{t('calendar.title')}</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>{t('calendar.subtitle')}</p>
        </div>

        {/* Month Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button onClick={prevMonth} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
            &lt;
          </button>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            {currentMonth.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={nextMonth} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>
            &gt;
          </button>
        </div>

        {/* Calendar Grid */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
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
                        background: schedule ? getShiftColor(schedule) : (isToday ? '#f0f9ff' : 'transparent'),
                        border: isToday ? '2px solid #1976d2' : 'none'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: isToday ? '700' : '500', color: '#1e293b' }}>
                        {date.getDate()}
                      </div>
                      {schedule && (
                        <div style={{
                          fontSize: '10px',
                          color: schedule.shiftColor || '#64748b',
                          fontWeight: schedule.shiftColor ? '600' : '400',
                          marginTop: '2px'
                        }}>
                          {schedule.shiftLabel || (schedule.shift === 'Off' ? 'Off' : schedule.shift.charAt(0))}
                        </div>
                      )}
                      {schedule?.isPublicHoliday && (
                        <div style={{ fontSize: '8px', color: '#dc2626' }}>PH</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Dynamic Legend based on actual shift templates */}
        {shiftLegend.length > 0 && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            {shiftLegend.map(shift => (
              <div key={shift.code} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  background: shift.color ? shift.color + '33' : '#f1f5f9',
                  border: shift.color ? `2px solid ${shift.color}` : '1px solid #e5e7eb',
                  borderRadius: '4px'
                }}></div>
                <span style={{ color: shift.color || '#64748b', fontWeight: '500' }}>{shift.code}</span>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>({shift.name})</span>
              </div>
            ))}
          </div>
        )}

        {/* No schedule message */}
        {!loading && Object.keys(schedules).length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', marginTop: '16px', background: '#f8fafc', borderRadius: '12px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📅</div>
            <div style={{ color: '#64748b' }}>{t('schedule.noScheduleMonth')}</div>
          </div>
        )}

        {/* Selected Date Modal */}
        {selectedDate && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedDate(null)}>
            <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '24px' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                {selectedDate.date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              {selectedDate.schedule ? (
                <div style={{ background: getShiftColor(selectedDate.schedule), padding: '16px', borderRadius: '12px' }}>
                  <div style={{
                    fontWeight: '600',
                    fontSize: '16px',
                    marginBottom: '8px',
                    color: getShiftColor(selectedDate.schedule, false)
                  }}>
                    {selectedDate.schedule.shiftLabel || t('schedule.work')} - {selectedDate.schedule.shiftName || t('schedule.shift')}
                  </div>
                  <div style={{ color: '#64748b' }}>{selectedDate.schedule.time}</div>
                  {selectedDate.schedule.outlet && <div style={{ color: '#64748b', marginTop: '4px' }}>{selectedDate.schedule.outlet}</div>}
                  {selectedDate.schedule.isPublicHoliday && (
                    <div style={{ marginTop: '8px', color: '#dc2626', fontWeight: '500' }}>{t('schedule.publicHoliday')}</div>
                  )}
                  {selectedDate.schedule.attended && (
                    <div style={{ marginTop: '8px', color: '#059669', fontWeight: '500' }}>{t('schedule.attended')}</div>
                  )}
                </div>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>{t('schedule.noScheduleDay')}</div>
              )}
              <button onClick={() => setSelectedDate(null)} style={{ width: '100%', marginTop: '16px', padding: '14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' }}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSCalendar;
