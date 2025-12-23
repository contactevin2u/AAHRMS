import React from 'react';

const ProbationModal = ({
  employee,
  probationAction,
  setProbationAction,
  extensionMonths,
  setExtensionMonths,
  probationNotes,
  setProbationNotes,
  processingProbation,
  onConfirm,
  onExtend,
  onClose
}) => {
  if (!employee) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal probation-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Probation Review</h2>

        <div className="probation-info">
          <div className="info-row">
            <span className="label">Employee:</span>
            <span className="value">{employee.name} ({employee.employee_id})</span>
          </div>
          <div className="info-row">
            <span className="label">Department:</span>
            <span className="value">{employee.department_name}</span>
          </div>
          <div className="info-row">
            <span className="label">Position:</span>
            <span className="value">{employee.position}</span>
          </div>
          <div className="info-row">
            <span className="label">Join Date:</span>
            <span className="value">
              {employee.join_date ? new Date(employee.join_date).toLocaleDateString() : '-'}
            </span>
          </div>
          <div className="info-row">
            <span className="label">Probation End:</span>
            <span className="value highlight">
              {employee.probation_end_date ? new Date(employee.probation_end_date).toLocaleDateString() : '-'}
            </span>
          </div>
          <div className="info-row">
            <span className="label">Current Salary:</span>
            <span className="value">
              RM {parseFloat(employee.default_basic_salary || 0).toFixed(2)}
            </span>
          </div>
          {employee.salary_after_confirmation && (
            <div className="info-row">
              <span className="label">New Salary (After Confirm):</span>
              <span className="value highlight">
                RM {parseFloat(employee.salary_after_confirmation).toFixed(2)}
              </span>
            </div>
          )}
          {employee.increment_amount && (
            <div className="info-row">
              <span className="label">Increment:</span>
              <span className="value">
                + RM {parseFloat(employee.increment_amount).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="action-tabs">
          <button
            className={`tab ${probationAction === 'confirm' ? 'active' : ''}`}
            onClick={() => setProbationAction('confirm')}
          >
            Confirm Employee
          </button>
          <button
            className={`tab ${probationAction === 'extend' ? 'active' : ''}`}
            onClick={() => setProbationAction('extend')}
          >
            Extend Probation
          </button>
        </div>

        {probationAction === 'confirm' && (
          <div className="action-content">
            <p>
              Confirm this employee's employment. Their salary will be updated to the
              post-probation amount and a confirmation letter will be generated.
            </p>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={probationNotes}
                onChange={(e) => setProbationNotes(e.target.value)}
                placeholder="Any notes for this confirmation..."
                rows={3}
              />
            </div>
          </div>
        )}

        {probationAction === 'extend' && (
          <div className="action-content">
            <p>Extend the probation period for this employee.</p>
            <div className="form-group">
              <label>Extension Period</label>
              <select
                value={extensionMonths}
                onChange={(e) => setExtensionMonths(parseInt(e.target.value))}
              >
                <option value={1}>1 month</option>
                <option value={2}>2 months</option>
                <option value={3}>3 months</option>
              </select>
            </div>
            <div className="form-group">
              <label>Reason for Extension</label>
              <textarea
                value={probationNotes}
                onChange={(e) => setProbationNotes(e.target.value)}
                placeholder="Reason for extending probation..."
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="cancel-btn">
            Cancel
          </button>
          {probationAction === 'confirm' ? (
            <button
              onClick={onConfirm}
              className="save-btn confirm-btn"
              disabled={processingProbation}
            >
              {processingProbation ? 'Processing...' : 'Confirm Employment'}
            </button>
          ) : (
            <button
              onClick={onExtend}
              className="save-btn extend-btn"
              disabled={processingProbation}
            >
              {processingProbation ? 'Processing...' : `Extend by ${extensionMonths} month(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProbationModal;
