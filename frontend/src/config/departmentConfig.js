// Department configuration for AA Alive department-based navigation
// Maps slug → display name, icon, and available tabs

export const DEPARTMENT_CONFIG = {
  'office': {
    name: 'Office',
    icon: '🏢',
    tabs: ['employees', 'letters', 'benefits', 'leave', 'claims']
  },
  'packing-room': {
    name: 'Packing Room',
    icon: '📦',
    tabs: ['employees', 'leave', 'claims']
  },
  'indoor-sales': {
    name: 'Indoor Sales',
    icon: '🛒',
    tabs: ['employees', 'letters', 'benefits', 'leave', 'claims', 'schedule', 'attendance']
  },
  'outdoor-sales': {
    name: 'Outdoor Sales',
    icon: '🚗',
    tabs: ['employees', 'claims', 'leave', 'benefits', 'letters', 'commission']
  },
  'driver': {
    name: 'Driver',
    icon: '🚛',
    tabs: ['employees', 'claims', 'leave', 'trip-allowance', 'upsell-commission', 'attendance']
  },
  'security': {
    name: 'Security',
    icon: '🛡️',
    tabs: ['employees', 'leave', 'claims', 'attendance']
  }
};

export const DEPARTMENT_ORDER = [
  'office',
  'packing-room',
  'indoor-sales',
  'outdoor-sales',
  'driver',
  'security'
];

// Tab display config
export const TAB_CONFIG = {
  'employees': { label: 'Employee List', icon: '👥' },
  'leave': { label: 'Leave', icon: '📅' },
  'claims': { label: 'Claims', icon: '💰' },
  'letters': { label: 'HR Letters', icon: '📋' },
  'benefits': { label: 'Benefits in Kind', icon: '🎁' },
  'attendance': { label: 'Attendance', icon: '⏰' },
  'schedule': { label: 'Schedule', icon: '📆' },
  'commission': { label: 'Commission', icon: '💵' },
  'trip-allowance': { label: 'Trip Allowance', icon: '🗺️' },
  'upsell-commission': { label: 'Upsell Commission', icon: '📈' }
};

// Resolve department name from API → slug
const NAME_TO_SLUG = {
  'office': 'office',
  'packing room': 'packing-room',
  'packing': 'packing-room',
  'indoor sales': 'indoor-sales',
  'indoor': 'indoor-sales',
  'outdoor sales': 'outdoor-sales',
  'outdoor': 'outdoor-sales',
  'driver': 'driver',
  'drivers': 'driver',
  'security': 'security',
  'guard': 'security'
};

export function getSlugForDepartmentName(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return NAME_TO_SLUG[lower] || null;
}
