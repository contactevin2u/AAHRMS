import React from 'react';

const EmployeeStats = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="stats-row">
      <div className="stat-box">
        <span className="stat-num">{stats.overview.total}</span>
        <span className="stat-text">Total</span>
      </div>
      <div className="stat-box highlight">
        <span className="stat-num">{stats.overview.active}</span>
        <span className="stat-text">Active</span>
      </div>
      <div className="stat-box">
        <span className="stat-num">{stats.overview.inactive}</span>
        <span className="stat-text">Inactive</span>
      </div>
      {stats.byDepartment.map(d => (
        <div key={d.name} className="stat-box">
          <span className="stat-num">{d.count}</span>
          <span className="stat-text">{d.name}</span>
        </div>
      ))}
    </div>
  );
};

export default EmployeeStats;
