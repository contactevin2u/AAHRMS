import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { outletsApi } from '../api';
import Layout from '../components/Layout';

// Import page components
import Employees from './Employees/index';
import Schedules from './Schedules';
import Attendance from './Attendance';
import Leave from './Leave';
import Claims from './Claims';
import Letters from './Letters';

import './DepartmentHub.css'; // Reuse same CSS

const OUTLET_TABS = [
  { key: 'employees', label: 'Employees', icon: '👥' },
  { key: 'schedules', label: 'Schedules', icon: '📆' },
  { key: 'attendance', label: 'Attendance', icon: '⏰' },
  { key: 'leave', label: 'Leave', icon: '📅' },
  { key: 'claims', label: 'Claims', icon: '💰' },
  { key: 'letters', label: 'HR Letters', icon: '📋' },
];

const TAB_COMPONENTS = {
  'employees': Employees,
  'schedules': Schedules,
  'attendance': Attendance,
  'leave': Leave,
  'claims': Claims,
  'letters': Letters,
};

function OutletHub() {
  const { id } = useParams(); // "all" or outlet ID
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('employees');
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAll = id === 'all';

  // Fetch outlets from API
  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const res = await outletsApi.getAll();
        setOutlets(res.data || []);
      } catch (error) {
        console.error('Error fetching outlets:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOutlets();
  }, []);

  // Resolve id → outlet object
  useEffect(() => {
    if (isAll) {
      setSelectedOutlet(null);
      return;
    }
    if (outlets.length === 0) return;

    const match = outlets.find(o => o.id === parseInt(id));
    if (match) {
      setSelectedOutlet(match);
    }
  }, [outlets, id, isAll]);

  // Reset tab when switching outlets
  useEffect(() => {
    setActiveTab('employees');
  }, [id]);

  if (!isAll && !id) {
    return (
      <Layout>
        <div className="dept-hub">
          <div className="dept-hub-error">
            <h2>Outlet not found</h2>
            <button onClick={() => navigate('/admin/dashboard')}>Go to Dashboard</button>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading && !isAll) {
    return (
      <Layout>
        <div className="dept-hub">
          <div className="dept-hub-loading">Loading outlet...</div>
        </div>
      </Layout>
    );
  }

  const outletId = isAll ? undefined : selectedOutlet?.id?.toString();
  const outletName = isAll ? 'All Outlets' : (selectedOutlet?.name || 'Outlet');
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <Layout>
      <div className="dept-hub">
        {/* Header */}
        <div className="dept-hub-header">
          <div className="dept-hub-title">
            <span className="dept-hub-icon">{isAll ? '📋' : '🏪'}</span>
            <div>
              <h1>{outletName}</h1>
              <p>{isAll ? 'View all employees and data across outlets' : `Manage ${outletName}`}</p>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="dept-hub-tabs">
          {OUTLET_TABS.map(tab => (
            <button
              key={tab.key}
              className={`dept-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="dept-tab-icon">{tab.icon}</span>
              <span className="dept-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="dept-hub-content">
          {ActiveComponent ? (
            <ActiveComponent
              outletId={outletId}
              embedded={true}
            />
          ) : null}
        </div>
      </div>
    </Layout>
  );
}

export default OutletHub;
