import React from 'react';
import ComingSoon from '../../components/ComingSoon';
import { isTestUser } from '../../utils/permissions';

// Redirect to ESSCalendar for test users, otherwise show Coming Soon
function ESSSchedule() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');

  if (!isTestUser(employeeInfo)) {
    return <ComingSoon title="Schedule" />;
  }

  // For test users, redirect to calendar which has the schedule
  window.location.href = '/ess/calendar';
  return null;
}

export default ESSSchedule;
