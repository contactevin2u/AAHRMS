import React from 'react';
import { BANK_OPTIONS } from './EmployeeForm';

const BulkEditModal = ({
  selectedCount,
  bulkEditForm,
  setBulkEditForm,
  departments,
  bulkUpdating,
  onSubmit,
  onClose
}) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-edit-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Bulk Edit ({selectedCount} employees)</h2>
        <p className="bulk-edit-note">
          Only fill in the fields you want to update. Empty fields will be left unchanged.
        </p>

        <form onSubmit={onSubmit}>
          <div className="form-section-title">Basic Info</div>
          <div className="form-row">
            <div className="form-group">
              <label>Department</label>
              <select
                value={bulkEditForm.department_id}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, department_id: e.target.value })}
              >
                <option value="">-- No Change --</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Position</label>
              <input
                type="text"
                value={bulkEditForm.position}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, position: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Status</label>
              <select
                value={bulkEditForm.status}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, status: e.target.value })}
              >
                <option value="">-- No Change --</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="form-group">
              <label>Bank Name</label>
              <select
                value={bulkEditForm.bank_name}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, bank_name: e.target.value })}
              >
                <option value="">-- No Change --</option>
                {BANK_OPTIONS.filter(b => b !== 'Other').map(bank => (
                  <option key={bank} value={bank}>{bank}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-section-title">Salary Settings</div>
          <div className="form-row">
            <div className="form-group">
              <label>Basic Salary (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkEditForm.default_basic_salary}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, default_basic_salary: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
            <div className="form-group">
              <label>Allowance (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkEditForm.default_allowance}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, default_allowance: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Commission Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={bulkEditForm.commission_rate}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, commission_rate: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
            <div className="form-group">
              <label>Per Trip Rate (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkEditForm.per_trip_rate}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, per_trip_rate: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>OT Rate (RM/hour)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkEditForm.ot_rate}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, ot_rate: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
            <div className="form-group">
              <label>Outstation Rate (RM/day)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkEditForm.outstation_rate}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, outstation_rate: e.target.value })}
                placeholder="Leave empty for no change"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={bulkUpdating}>
              {bulkUpdating ? 'Updating...' : `Update ${selectedCount} Employees`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkEditModal;
