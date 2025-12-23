import React from 'react';

const BulkActionBar = ({
  selectedCount,
  onBulkEdit,
  onBulkDelete,
  onClearSelection
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bulk-action-bar">
      <span className="selected-count">
        {selectedCount} employee(s) selected
      </span>
      <div className="bulk-actions">
        <button onClick={onBulkEdit} className="bulk-edit-btn">
          Bulk Edit
        </button>
        <button onClick={onBulkDelete} className="bulk-delete-btn">
          Deactivate Selected
        </button>
        <button onClick={onClearSelection} className="bulk-clear-btn">
          Clear Selection
        </button>
      </div>
    </div>
  );
};

export default BulkActionBar;
