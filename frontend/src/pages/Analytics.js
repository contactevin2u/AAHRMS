import React from 'react';
import Layout from '../components/Layout';
import './Analytics.css';

function Analytics() {
  return (
    <Layout>
      <div className="analytics-page">
        <div className="page-header">
          <h1>Analytics</h1>
          <p className="page-subtitle">Business insights and reports</p>
        </div>

        <div className="analytics-placeholder">
          <div className="placeholder-icon">📊</div>
          <h2>Analytics Dashboard</h2>
          <p>Coming soon - detailed analytics and insights will be displayed here.</p>
        </div>

        {/* Placeholder sections for future implementation */}
        <div className="analytics-grid">
          <div className="analytics-card placeholder">
            <div className="card-header">
              <span className="card-icon">👥</span>
              <h3>Headcount</h3>
            </div>
            <div className="card-body">
              <p className="placeholder-text">Employee statistics</p>
            </div>
          </div>

          <div className="analytics-card placeholder">
            <div className="card-header">
              <span className="card-icon">💰</span>
              <h3>Payroll</h3>
            </div>
            <div className="card-body">
              <p className="placeholder-text">Payroll trends</p>
            </div>
          </div>

          <div className="analytics-card placeholder">
            <div className="card-header">
              <span className="card-icon">📅</span>
              <h3>Attendance</h3>
            </div>
            <div className="card-body">
              <p className="placeholder-text">Attendance metrics</p>
            </div>
          </div>

          <div className="analytics-card placeholder">
            <div className="card-header">
              <span className="card-icon">🏖️</span>
              <h3>Leave</h3>
            </div>
            <div className="card-body">
              <p className="placeholder-text">Leave analytics</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Analytics;
