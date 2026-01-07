import React, { useState } from 'react';
import { getGenderFromIC } from './EmployeeForm';

// Position enum values for AA Alive
const AA_ALIVE_POSITION_OPTIONS = [
  { value: 'Indoor Sales', label: 'Indoor Sales' },
  { value: 'Outdoor Sales', label: 'Outdoor Sales' },
  { value: 'Driver', label: 'Driver' },
  { value: 'Office', label: 'Office' },
  { value: 'Manager', label: 'Manager' }
];

// Position enum values for Mimix
const MIMIX_POSITION_OPTIONS = [
  { value: 'Full Time', label: 'Full Time' },
  { value: 'Part Time', label: 'Part Time' },
  { value: 'Supervisor', label: 'Supervisor' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Cashier', label: 'Cashier' }
];

// Employment type enum values
const EMPLOYMENT_OPTIONS = [
  { value: 'probation', label: 'Probation' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'contract', label: 'Contract' }
];

// Status enum values
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

const EmployeeTable = ({
  employees,
  selectedEmployees,
  onSelectAll,
  onSelectEmployee,
  onViewEmployee,
  onEditEmployee,
  goToDepartments,
  loading,
  usesOutlets = false,
  departments = [],
  outlets = [],
  onInlineUpdate
}) => {
  // Editing state
  const [editingCell, setEditingCell] = useState(null); // { empId, field }
  const [editValue, setEditValue] = useState('');

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Handle starting inline edit
  const startEdit = (empId, field, currentValue) => {
    setEditingCell({ empId, field });
    setEditValue(currentValue || '');
  };

  // Handle saving inline edit
  const saveEdit = async (empId) => {
    if (!editingCell || !onInlineUpdate) return;

    try {
      await onInlineUpdate(empId, editingCell.field, editValue);
    } catch (error) {
      console.error('Error updating:', error);
    }
    setEditingCell(null);
    setEditValue('');
  };

  // Handle cancel edit
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle key press
  const handleKeyPress = (e, empId) => {
    if (e.key === 'Enter') {
      saveEdit(empId);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Check if cell is being edited
  const isEditing = (empId, field) => {
    return editingCell?.empId === empId && editingCell?.field === field;
  };

  // Render editable cell
  const renderEditableCell = (emp, field, displayValue, options = null) => {
    if (isEditing(emp.id, field)) {
      if (options) {
        // Dropdown
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveEdit(emp.id)}
            onKeyDown={(e) => handleKeyPress(e, emp.id)}
            autoFocus
            className="inline-edit-select"
          >
            <option value="">-</option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      }
      // Text input
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveEdit(emp.id)}
          onKeyDown={(e) => handleKeyPress(e, emp.id)}
          autoFocus
          className="inline-edit-input"
        />
      );
    }

    // Display mode - clickable to edit
    return (
      <span
        className="editable-cell"
        onClick={() => onInlineUpdate && startEdit(emp.id, field, displayValue)}
        title={onInlineUpdate ? "Click to edit" : ""}
      >
        {displayValue || <span style={{ color: '#999' }}>-</span>}
      </span>
    );
  };

  // Render toggle for clock_in_required
  const renderClockInToggle = (emp) => {
    const isRequired = emp.clock_in_required;

    return (
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={isRequired || false}
          onChange={(e) => {
            if (onInlineUpdate) {
              onInlineUpdate(emp.id, 'clock_in_required', e.target.checked);
            }
          }}
        />
        <span className="toggle-slider"></span>
      </label>
    );
  };

  // Get department options
  const departmentOptions = departments.map(d => ({ value: d.id.toString(), label: d.name }));

  // Get outlet options
  const outletOptions = outlets.map(o => ({ value: o.id.toString(), label: o.name }));

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
            {!usesOutlets && <th>Clock In</th>}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr>
              <td colSpan={usesOutlets ? "9" : "10"} className="no-data">No employees found</td>
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
                  <td>
                    {isEditing(emp.id, 'employee_id') ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                        onBlur={() => saveEdit(emp.id)}
                        onKeyDown={(e) => handleKeyPress(e, emp.id)}
                        autoFocus
                        className="inline-edit-input"
                        style={{ width: '80px' }}
                      />
                    ) : (
                      <strong
                        className="editable-cell"
                        onClick={() => onInlineUpdate && startEdit(emp.id, 'employee_id', emp.employee_id)}
                        title={onInlineUpdate ? "Click to edit" : ""}
                        style={{ cursor: onInlineUpdate ? 'pointer' : 'default' }}
                      >
                        {emp.employee_id}
                      </strong>
                    )}
                  </td>
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
                      isEditing(emp.id, 'outlet_id') ? (
                        <select
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(emp.id)}
                          onKeyDown={(e) => handleKeyPress(e, emp.id)}
                          autoFocus
                          className="inline-edit-select"
                        >
                          <option value="">-</option>
                          {outletOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="editable-cell"
                          onClick={() => onInlineUpdate && startEdit(emp.id, 'outlet_id', emp.outlet_id?.toString() || '')}
                          title={onInlineUpdate ? "Click to edit" : ""}
                        >
                          {emp.outlet_name || <span style={{ color: '#999' }}>-</span>}
                        </span>
                      )
                    ) : (
                      isEditing(emp.id, 'department_id') ? (
                        <select
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(emp.id)}
                          onKeyDown={(e) => handleKeyPress(e, emp.id)}
                          autoFocus
                          className="inline-edit-select"
                        >
                          <option value="">-</option>
                          {departmentOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="department-link editable-cell"
                          onClick={() => {
                            if (onInlineUpdate) {
                              startEdit(emp.id, 'department_id', emp.department_id?.toString() || '');
                            } else {
                              goToDepartments && goToDepartments();
                            }
                          }}
                          title={onInlineUpdate ? "Click to edit" : "Go to Departments"}
                        >
                          {emp.department_name || '-'}
                        </span>
                      )
                    )}
                  </td>
                  <td>
                    {isEditing(emp.id, 'position') ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(emp.id)}
                        onKeyDown={(e) => handleKeyPress(e, emp.id)}
                        autoFocus
                        className="inline-edit-select"
                      >
                        <option value="">-</option>
                        {(usesOutlets ? MIMIX_POSITION_OPTIONS : AA_ALIVE_POSITION_OPTIONS).map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="editable-cell"
                        onClick={() => onInlineUpdate && startEdit(emp.id, 'position', emp.position || '')}
                        title={onInlineUpdate ? "Click to edit" : ""}
                      >
                        {emp.position || <span style={{ color: '#999' }}>-</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    {isEditing(emp.id, 'employment_type') ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(emp.id)}
                        onKeyDown={(e) => handleKeyPress(e, emp.id)}
                        autoFocus
                        className="inline-edit-select"
                      >
                        {EMPLOYMENT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`employment-badge ${emp.employment_type || 'probation'} editable-cell`}
                        onClick={() => onInlineUpdate && startEdit(emp.id, 'employment_type', emp.employment_type || 'probation')}
                        title={onInlineUpdate ? "Click to edit" : ""}
                      >
                        {emp.employment_type === 'confirmed' ? 'Confirmed' :
                         emp.employment_type === 'contract' ? 'Contract' : 'Probation'}
                      </span>
                    )}
                  </td>
                  <td>
                    {isEditing(emp.id, 'status') ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(emp.id)}
                        onKeyDown={(e) => handleKeyPress(e, emp.id)}
                        autoFocus
                        className="inline-edit-select"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`status-badge ${emp.status} editable-cell`}
                        onClick={() => onInlineUpdate && startEdit(emp.id, 'status', emp.status || 'active')}
                        title={onInlineUpdate ? "Click to edit" : ""}
                      >
                        {emp.status}
                      </span>
                    )}
                  </td>
                  {!usesOutlets && (
                    <td>
                      {renderClockInToggle(emp)}
                    </td>
                  )}
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

      <style>{`
        .inline-edit-input {
          padding: 4px 8px;
          border: 1px solid #1976d2;
          border-radius: 4px;
          font-size: 13px;
          width: 100%;
          max-width: 120px;
        }
        .inline-edit-select {
          padding: 4px 8px;
          border: 1px solid #1976d2;
          border-radius: 4px;
          font-size: 13px;
          min-width: 100px;
        }
        .editable-cell {
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }
        .editable-cell:hover {
          background-color: #f0f4ff;
        }
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 40px;
          height: 22px;
        }
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: 0.3s;
          border-radius: 22px;
        }
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }
        .toggle-switch input:checked + .toggle-slider {
          background-color: #4caf50;
        }
        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(18px);
        }
      `}</style>
    </div>
  );
};

export default EmployeeTable;
