import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ESSLayout from '../../components/ESSLayout';
import ESSTeamSchedule from './ESSTeamSchedule';
import { essApi } from '../../api';
import { isSupervisorOrManager, isMimixCompany } from '../../utils/permissions';
import { useLanguage } from '../../contexts/LanguageContext';
import './ESSSchedule.css';

function ESSSchedule() {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');

  // Check if user can see team features
  const isMimix = isMimixCompany(employeeInfo);
  const isSupOrMgr = isSupervisorOrManager(employeeInfo);
  const isIndoorSalesManager = !isMimix &&
    (employeeInfo?.position === 'Manager' || employeeInfo?.employee_role === 'manager');
  const showTeamTab = isSupOrMgr || isIndoorSalesManager;

  // Get active tab from URL or default to 'my'
  const activeTab = searchParams.get('tab') || 'my';

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  return (
    <ESSLayout>
      <div className="ess-schedule-page">
        {/* Tab Header */}
        <div className="ess-schedule-tabs">
          <button
            className={activeTab === 'my' ? 'active' : ''}
            onClick={() => setActiveTab('my')}
          >
            {t('schedule.mySchedule')}
          </button>
          {showTeamTab && (
            <button
              className={activeTab === 'team' ? 'active' : ''}
              onClick={() => setActiveTab('team')}
            >
              {t('schedule.teamSchedule')}
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'my' && <MyScheduleContent />}
        {activeTab === 'team' && showTeamTab && <ESSTeamSchedule embedded={true} />}
      </div>
    </ESSLayout>
  );
}

// My Schedule Content
function MyScheduleContent() {
  const { t, language } = useLanguage();
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

      const scheduleMap = {};
      const legendMap = {};

      if (response.data && response.data.schedules) {
        Object.entries(response.data.schedules).forEach(([dateKey, schedule]) => {
          const shiftStart = schedule.shift_start || '09:00';
          const shiftEnd = schedule.shift_end || '18:00';
          const isOff = schedule.is_off || schedule.status === 'off' || (shiftStart === '00:00' && shiftEnd === '00:00');

          let shiftCode = null;
          let shiftName = null;
          let shiftColor = schedule.shift_color || null;

          if (isOff) {
            shiftCode = 'Off';
            shiftName = 'Day Off';
            shiftColor = '#fee2e2';
          } else if (schedule.shift_code) {
            shiftCode = schedule.shift_code;
            shiftName = schedule.shift_name || schedule.shift_code;
            if (!legendMap[shiftCode]) {
              legendMap[shiftCode] = { code: shiftCode, name: shiftName, color: shiftColor };
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
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  };

  const formatDateKey = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getShiftColor = (schedule, forBackground = true) => {
    if (schedule?.shiftColor) {
      if (forBackground) return schedule.shiftColor + '33';
      return schedule.shiftColor;
    }
    if (schedule?.shift === 'Off') return '#fee2e2';
    return forBackground ? '#f1f5f9' : '#64748b';
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const days = getDaysInMonth(currentMonth);
  const dayNames = language === 'ms'
    ? ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <>
      {/* Month Navigation */}
      <div className="calendar-nav-ess">
        <button onClick={prevMonth}>&lt;</button>
        <span className="current-month">
          {currentMonth.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={nextMonth}>&gt;</button>
      </div>

      {/* Calendar Grid */}
      <div className="ess-calendar">
        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : (
          <>
            <div className="calendar-header-row">
              {dayNames.map(day => (
                <div key={day} className="calendar-header-cell">{day}</div>
              ))}
            </div>

            <div className="calendar-body">
              {days.map((date, idx) => {
                if (!date) return <div key={idx} className="calendar-day other"></div>;

                const dateKey = formatDateKey(date);
                const schedule = schedules[dateKey];
                const isToday = formatDateKey(new Date()) === dateKey;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDate({ date, schedule })}
                    className={`calendar-day ${isToday ? 'today' : ''} ${schedule ? 'scheduled' : ''}`}
                    style={{ background: schedule ? getShiftColor(schedule) : undefined }}
                  >
                    <span className="day-num">{date.getDate()}</span>
                    {schedule && (
                      <div className="shift-indicator" style={{ color: schedule.shiftColor || '#1976d2' }}>
                        {schedule.shiftLabel || (schedule.shift === 'Off' ? 'Off' : 'W')}
                      </div>
                    )}
                    {schedule?.isPublicHoliday && <div style={{ fontSize: '8px', color: '#dc2626' }}>PH</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      {shiftLegend.length > 0 && (
        <div className="calendar-legend">
          {shiftLegend.map(shift => (
            <div key={shift.code} className="legend-item">
              <span
                className="dot"
                style={{
                  background: shift.color || '#1976d2',
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px'
                }}
              ></span>
              <span style={{ color: shift.color || '#64748b' }}>{shift.code}</span>
            </div>
          ))}
        </div>
      )}

      {/* No schedule message */}
      {!loading && Object.keys(schedules).length === 0 && (
        <div className="no-requests" style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📅</div>
          <div>{t('schedule.noScheduleMonth')}</div>
        </div>
      )}

      {/* Selected Date Modal */}
      {selectedDate && (
        <div className="day-detail-overlay" onClick={() => setSelectedDate(null)}>
          <div className="day-detail-modal" onClick={e => e.stopPropagation()}>
            <h3>
              {selectedDate.date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {selectedDate.schedule ? (
              <div style={{ background: getShiftColor(selectedDate.schedule), padding: '12px', borderRadius: '8px' }}>
                <div className="detail-row">
                  <span className="label">{t('schedule.shift')}</span>
                  <span className="value" style={{ color: getShiftColor(selectedDate.schedule, false) }}>
                    {selectedDate.schedule.shiftLabel || t('schedule.work')} - {selectedDate.schedule.shiftName || t('schedule.shift')}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">{t('schedule.time')}</span>
                  <span className="value">{selectedDate.schedule.time}</span>
                </div>
                {selectedDate.schedule.outlet && (
                  <div className="detail-row">
                    <span className="label">{t('schedule.outlet')}</span>
                    <span className="value">{selectedDate.schedule.outlet}</span>
                  </div>
                )}
                {selectedDate.schedule.isPublicHoliday && (
                  <div style={{ marginTop: '8px', color: '#dc2626', fontWeight: '500' }}>{t('schedule.publicHoliday')}</div>
                )}
                {selectedDate.schedule.attended && (
                  <div style={{ marginTop: '8px', color: '#059669', fontWeight: '500' }}>{t('schedule.attended')}</div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                {t('schedule.noScheduleDay')}
              </div>
            )}
            <button className="close-detail" onClick={() => setSelectedDate(null)}>{t('common.close')}</button>
          </div>
        </div>
      )}
    </>
  );
}

export default ESSSchedule;
