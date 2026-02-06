import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { departmentApi } from '../api';
import { DEPARTMENT_CONFIG, TAB_CONFIG, getSlugForDepartmentName } from '../config/departmentConfig';
import Layout from '../components/Layout';

// Import page components
import Employees from './Employees/index';
import Leave from './Leave';
import Claims from './Claims';
import Letters from './Letters';
import BenefitsInKind from './BenefitsInKind';
import Attendance from './Attendance';
import IndoorSalesSchedule from './IndoorSalesSchedule';
import IndoorSalesCommission from './IndoorSalesCommission';
import OutstationAllowance from './OutstationAllowance';

import './DepartmentHub.css';

const TAB_COMPONENTS = {
  'employees': Employees,
  'leave': Leave,
  'claims': Claims,
  'letters': Letters,
  'benefits': BenefitsInKind,
  'attendance': Attendance,
  'schedule': IndoorSalesSchedule,
  'commission': IndoorSalesCommission,
  'trip-allowance': OutstationAllowance,
  'upsell-commission': null // placeholder
};

function DepartmentHub() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(null);
  const [departmentId, setDepartmentId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const config = DEPARTMENT_CONFIG[slug];

  // Fetch departments from API to resolve slug → id
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await departmentApi.getAll();
        setDepartments(res.data || []);
      } catch (error) {
        console.error('Error fetching departments:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDepartments();
  }, []);

  // Resolve slug → department_id (skip for "all")
  useEffect(() => {
    if (slug === 'all') {
      setDepartmentId(null);
      return;
    }
    if (departments.length === 0) return;

    const match = departments.find(d => getSlugForDepartmentName(d.name) === slug);
    if (match) {
      setDepartmentId(match.id);
    }
  }, [departments, slug]);

  // Set default active tab when config or slug changes
  useEffect(() => {
    if (config && config.tabs.length > 0) {
      setActiveTab(config.tabs[0]);
    }
  }, [slug, config]);

  // Redirect if invalid slug
  if (!config) {
    return (
      <Layout>
        <div className="dept-hub">
          <div className="dept-hub-error">
            <h2>Department not found</h2>
            <p>The department "{slug}" does not exist.</p>
            <button onClick={() => navigate('/admin/dashboard')}>Go to Dashboard</button>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading && slug !== 'all') {
    return (
      <Layout>
        <div className="dept-hub">
          <div className="dept-hub-loading">Loading department...</div>
        </div>
      </Layout>
    );
  }

  const isAll = slug === 'all';
  const ActiveComponent = activeTab ? TAB_COMPONENTS[activeTab] : null;

  return (
    <Layout>
      <div className="dept-hub">
        {/* Header */}
        <div className="dept-hub-header">
          <div className="dept-hub-title">
            <span className="dept-hub-icon">{config.icon}</span>
            <div>
              <h1>{isAll ? 'All Departments' : config.name}</h1>
              <p>{isAll ? 'View all employees and data across departments' : `Manage ${config.name.toLowerCase()} department`}</p>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="dept-hub-tabs">
          {config.tabs.map(tabKey => {
            const tabInfo = TAB_CONFIG[tabKey];
            return (
              <button
                key={tabKey}
                className={`dept-tab ${activeTab === tabKey ? 'active' : ''}`}
                onClick={() => setActiveTab(tabKey)}
              >
                <span className="dept-tab-icon">{tabInfo.icon}</span>
                <span className="dept-tab-label">{tabInfo.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="dept-hub-content">
          {activeTab === 'upsell-commission' ? (
            <div className="dept-hub-placeholder">
              <h3>Upsell Commission</h3>
              <p>Driver upsell commission tracking coming soon.</p>
            </div>
          ) : ActiveComponent ? (
            <ActiveComponent
              departmentId={isAll ? undefined : departmentId}
              embedded={true}
            />
          ) : null}
        </div>
      </div>
    </Layout>
  );
}

export default DepartmentHub;
