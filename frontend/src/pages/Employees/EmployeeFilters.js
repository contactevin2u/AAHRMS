import React from 'react';

const EmployeeFilters = ({ filter, setFilter, departments, hideDepartment = false }) => {
  return (
    <div className="filters-row">
      <input
        type="text"
        placeholder="Search name or ID..."
        value={filter.search}
        onChange={(e) => setFilter({ ...filter, search: e.target.value })}
      />
      {!hideDepartment && (
        <select
          value={filter.department_id}
          onChange={(e) => setFilter({ ...filter, department_id: e.target.value })}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
      <select
        value={filter.status}
        onChange={(e) => setFilter({ ...filter, status: e.target.value })}
      >
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <select
        value={filter.employment_type}
        onChange={(e) => setFilter({ ...filter, employment_type: e.target.value })}
      >
        <option value="">All Employment Types</option>
        <option value="probation">On Probation</option>
        <option value="confirmed">Confirmed</option>
        <option value="contract">Contract</option>
        <option value="part_time">Part Time</option>
      </select>
    </div>
  );
};

export default EmployeeFilters;
