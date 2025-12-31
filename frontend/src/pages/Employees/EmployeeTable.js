import React from 'react';
import { getGenderFromIC } from './EmployeeForm';

const EmployeeTable = ({
  employees,
  selectedEmployees,
  onSelectAll,
  onSelectEmployee,
  onViewEmployee,
  onEditEmployee,
  goToDepartments,
  loading,
  usesOutlets = false
}) => {
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="employees-table">
      <table>
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={employees.length > 0 && selectedEmployees.length === employees.length}
                onChange={onSelectAll}
              />
            </th>
            <th>ID</th>
            <th>Name</th>
            <th>Gender</th>
            {usesOutlets ? <th>Outlet</th> : <th>Department</th>}
            <th>Position</th>
            <th>Employment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr>
              <td colSpan="9" className="no-data">No employees found</td>
            </tr>
          ) : (
            employees.map(emp => {
              return (
                <tr
                  key={emp.id}
                  className={selectedEmployees.includes(emp.id) ? 'selected' : ''}
                >
                  <td className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(emp.id)}
                      onChange={() => onSelectEmployee(emp.id)}
                    />
                  </td>
                  <td><strong>{emp.employee_id}</strong></td>
                  <td>
                    <span
                      className="employee-name-link"
                      onClick={() => onViewEmployee && onViewEmployee(emp)}
                      style={{ cursor: 'pointer', color: '#1976d2', fontWeight: '500' }}
                    >
                      {emp.name}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const gender = getGenderFromIC(emp.ic_number);
                      if (!gender) return <span style={{ color: '#999' }}>-</span>;
                      return (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: gender === 'male' ? '#e3f2fd' : '#fce4ec',
                            color: gender === 'male' ? '#1565c0' : '#c2185b'
                          }}
                        >
                          {gender === 'male' ? 'M' : 'F'}
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    {usesOutlets ? (
                      emp.outlet_name || <span style={{ color: '#999' }}>-</span>
                    ) : (
                      emp.department_name ? (
                        <span
                          className="department-link"
                          onClick={goToDepartments}
                          title="Go to Departments"
                        >
                          {emp.department_name}
                        </span>
                      ) : '-'
                    )}
                  </td>
                  <td>{emp.position || '-'}</td>
                  <td>
                    <span className={`employment-badge ${emp.employment_type || 'probation'}`}>
                      {emp.employment_type === 'confirmed' ? 'Confirmed' :
                       emp.employment_type === 'contract' ? 'Contract' : 'Probation'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${emp.status}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="edit-btn"
                      onClick={() => onEditEmployee && onEditEmployee(emp)}
                      title="Edit Employee"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default EmployeeTable;
