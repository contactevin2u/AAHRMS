import React from 'react';

const ImportModal = ({
  importData,
  importResult,
  importing,
  onImport,
  onClose,
  onDownloadTemplate
}) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import Employees from Excel</h2>

        {!importResult ? (
          <>
            <div className="import-info">
              <p><strong>{importData?.length || 0}</strong> employees found in file</p>
              <button onClick={onDownloadTemplate} className="template-btn">
                Download Template
              </button>
            </div>

            {importData && importData.length > 0 && (
              <div className="import-preview">
                <h4>Preview (first 5 rows):</h4>
                <div className="preview-table-wrapper">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Employee ID</th>
                        <th>Name</th>
                        <th>Department</th>
                        <th>IC Number</th>
                        <th>Basic Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importData.slice(0, 5).map((emp, idx) => (
                        <tr key={idx}>
                          <td>{emp.employee_id || '-'}</td>
                          <td>{emp.name || '-'}</td>
                          <td>{emp.department || '-'}</td>
                          <td>{emp.ic_number || '-'}</td>
                          <td>{emp.default_basic_salary ? `RM ${emp.default_basic_salary}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importData.length > 5 && (
                  <p className="more-rows">...and {importData.length - 5} more rows</p>
                )}
              </div>
            )}

            <div className="import-note">
              <strong>Mandatory Fields:</strong> Employee ID, Name, Department, IC Number, Basic Salary
              <br /><br />
              <strong>Note:</strong> Department names must match exactly (Office, Indoor Sales, Outdoor Sales, Driver).
              If Employee ID already exists, the record will be updated instead of creating a duplicate.
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="cancel-btn">
                Cancel
              </button>
              <button
                onClick={onImport}
                className="save-btn"
                disabled={importing || !importData || importData.length === 0}
              >
                {importing ? 'Importing...' : `Import ${importData?.length || 0} Employees`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`import-result ${importResult.failed > 0 ? 'has-errors' : 'success'}`}>
              <div className="result-summary">
                <div className="result-item success">
                  <span className="result-num">{importResult.success}</span>
                  <span className="result-label">Successful</span>
                </div>
                <div className="result-item failed">
                  <span className="result-num">{importResult.failed}</span>
                  <span className="result-label">Failed</span>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="error-list">
                  <h4>Errors:</h4>
                  <ul>
                    {importResult.errors.slice(0, 10).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>...and {importResult.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button onClick={onClose} className="save-btn">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportModal;
