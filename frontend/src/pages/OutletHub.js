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
import Resignations from './Resignations';

import './DepartmentHub.css'; // Reuse same CSS

const OUTLET_TABS = [
  { key: 'employees', label: 'Employees', icon: '👥' },
  { key: 'schedules', label: 'Schedules', icon: '📆' },
  { key: 'attendance', label: 'Attendance', icon: '⏰' },
  { key: 'leave', label: 'Leave', icon: '📅' },
  { key: 'claims', label: 'Claims', icon: '💰' },
  { key: 'letters', label: 'HR Letters', icon: '📋' },
  { key: 'resignations', label: 'Resignation', icon: '📝' },
];

const TAB_COMPONENTS = {
  'employees': Employees,
  'schedules': Schedules,
  'attendance': Attendance,
  'leave': Leave,
  'claims': Claims,
  'letters': Letters,
  'resignations': Resignations,
};

function OutletHub() {
  const { id } = useParams(); // "all" or outlet ID
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('employees');
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingEpfCode, setEditingEpfCode] = useState(false);
  const [epfCodeValue, setEpfCodeValue] = useState('');

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

  const handleSaveEpfCode = async () => {
    if (!selectedOutlet) return;
    try {
      await outletsApi.update(selectedOutlet.id, {
        name: selectedOutlet.name,
        address: selectedOutlet.address,
        latitude: selectedOutlet.latitude,
        longitude: selectedOutlet.longitude,
        min_staff: selectedOutlet.min_staff,
        epf_code: epfCodeValue.trim()
      });
      setSelectedOutlet({ ...selectedOutlet, epf_code: epfCodeValue.trim() });
      setOutlets(prev => prev.map(o => o.id === selectedOutlet.id ? { ...o, epf_code: epfCodeValue.trim() } : o));
      setEditingEpfCode(false);
    } catch (error) {
      console.error('Error saving EPF code:', error);
      alert('Failed to save KWSP code');
    }
  };

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
              {!isAll && selectedOutlet && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  {editingEpfCode ? (
                    <>
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>KWSP:</span>
                      <input
                        type="text"
                        value={epfCodeValue}
                        onChange={e => setEpfCodeValue(e.target.value)}
                        placeholder="Enter KWSP employer code"
                        style={{ fontSize: '0.8rem', padding: '2px 8px', border: '1px solid #ccc', borderRadius: '4px', width: '160px' }}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEpfCode(); if (e.key === 'Escape') setEditingEpfCode(false); }}
                      />
                      <button onClick={handleSaveEpfCode} style={{ fontSize: '0.75rem', padding: '2px 10px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingEpfCode(false)} style={{ fontSize: '0.75rem', padding: '2px 10px', background: '#eee', color: '#666', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>
                        KWSP: {selectedOutlet.epf_code || <span style={{ color: '#ccc' }}>Not set</span>}
                      </span>
                      <button
                        onClick={() => { setEpfCodeValue(selectedOutlet.epf_code || ''); setEditingEpfCode(true); }}
                        style={{ fontSize: '0.7rem', padding: '1px 8px', background: 'transparent', color: '#4a90d9', border: '1px solid #4a90d9', borderRadius: '4px', cursor: 'pointer' }}
                      >Edit</button>
                    </>
                  )}
                </div>
              )}
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
              key={outletId || 'all'}
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
