import React, { useState, useEffect } from 'react';
import { resignationsApi, employeeApi } from '../api';
import Layout from '../components/Layout';
import './Resignations.css';

function Resignations() {
  const [resignations, setResignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '' });

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [selectedResignation, setSelectedResignation] = useState(null);
  const [settlementCalc, setSettlementCalc] = useState(null);
  const [leaveCheckData, setLeaveCheckData] = useState(null);
  const [checkingLeaves, setCheckingLeaves] = useState(false);

  // Form
  const [form, setForm] = useState({
    employee_id: '',
    notice_date: new Date().toISOString().split('T')[0],
    last_working_day: '',
    reason: '',
    remarks: ''
  });

  // Process form
  const [processForm, setProcessForm] = useState({
    final_salary_amount: 0,
    settlement_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resRes, empRes] = await Promise.all([
        resignationsApi.getAll(filter),
        employeeApi.getAll({ status: 'active' })
      ]);
      setResignations(resRes.data);
      setEmployees(empRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await resignationsApi.create(form);
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create resignation');
    }
  };

  const handleViewDetails = async (id) => {
    try {
      const res = await resignationsApi.getOne(id);
      setSelectedResignation(res.data);
      setShowDetailsModal(true);
    } catch (error) {
      alert('Failed to fetch resignation details');
    }
  };

  const handleCalculateSettlement = async () => {
    if (!selectedResignation) return;
    try {
      const res = await resignationsApi.calculateSettlement({
        employee_id: selectedResignation.employee_id,
        last_working_day: selectedResignation.last_working_day
      });
      setSettlementCalc(res.data);
      setProcessForm({
        ...processForm,
        final_salary_amount: res.data.total_final_settlement
      });
    } catch (error) {
      alert('Failed to calculate settlement');
    }
  };

  // Check for leaves before showing process modal
  const handleProcessClick = async (resignation) => {
    setSelectedResignation(resignation);
    setCheckingLeaves(true);
    setLeaveCheckData(null);

    try {
      const res = await resignationsApi.checkLeaves(resignation.id);
      setLeaveCheckData(res.data);

      if (res.data.has_leaves_to_cancel) {
        // Show leave confirmation modal first
        setShowLeaveConfirmModal(true);
      } else {
        // No leaves to cancel, go directly to process modal
        setSettlementCalc(null);
        setShowProcessModal(true);
      }
    } catch (error) {
      console.error('Error checking leaves:', error);
      // If check fails, still allow processing
      setSettlementCalc(null);
      setShowProcessModal(true);
    } finally {
      setCheckingLeaves(false);
    }
  };

  // Confirm leave cancellation and proceed to process modal
  const handleConfirmLeaveCancellation = () => {
    setShowLeaveConfirmModal(false);
    setSettlementCalc(null);
    setShowProcessModal(true);
  };

  const handleProcess = async (e) => {
    e.preventDefault();
    try {
      await resignationsApi.process(selectedResignation.id, processForm);
      setShowProcessModal(false);
      setSelectedResignation(null);
      setSettlementCalc(null);
      setLeaveCheckData(null);
      fetchData();
      alert('Resignation processed successfully. Employee status updated to resigned.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to process resignation');
    }
  };

  const handleCancel = async (id) => {
    if (window.confirm('Cancel this resignation? The employee will remain active.')) {
      try {
        await resignationsApi.cancel(id);
        fetchData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to cancel resignation');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this resignation record?')) {
      try {
        await resignationsApi.delete(id);
        fetchData();
      } catch (error) {
        alert(error.response?.data?.error || 'Failed to delete resignation');
      }
    }
  };

  // Cleanup leaves for already-completed resignations
  const handleCleanupLeaves = async (resignation) => {
    try {
      // First check if there are leaves to cleanup
      const checkRes = await resignationsApi.checkLeaves(resignation.id);

      if (!checkRes.data.has_leaves_to_cancel) {
        alert('No leaves found after last working day. Nothing to cleanup.');
        return;
      }

      const totalDays = checkRes.data.total_approved_days + checkRes.data.total_pending_days;
      const leaveDetails = [
        ...checkRes.data.approved_leaves.map(l => `${l.leave_type_name}: ${formatDate(l.start_date)} (${l.total_days} days)`),
        ...checkRes.data.pending_leaves.map(l => `${l.leave_type_name}: ${formatDate(l.start_date)} (${l.total_days} days)`)
      ].join('\n');

      if (window.confirm(`Found ${totalDays} days of leave after last working day:\n\n${leaveDetails}\n\nCancel these leaves and restore balance?`)) {
        await resignationsApi.cleanupLeaves(resignation.id);
        alert('Leaves cancelled and balance restored successfully.');
        fetchData();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to cleanup leaves');
    }
  };

  const resetForm = () => {
    setForm({
      employee_id: '',
      notice_date: new Date().toISOString().split('T')[0],
      last_working_day: '',
      reason: '',
      remarks: ''
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    const classes = {
      pending: 'status-badge pending',
      completed: 'status-badge completed',
      cancelled: 'status-badge cancelled'
    };
    return <span className={classes[status] || 'status-badge'}>{status}</span>;
  };

  const getDaysUntilExit = (lastDay) => {
    const today = new Date();
    const exitDate = new Date(lastDay);
    const diffTime = exitDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <Layout>
      <div className="resignations-page">
        <header className="page-header">
          <div>
            <h1>Resignations</h1>
            <p>Manage employee resignations and exit process</p>
          </div>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="add-btn">
            + New Resignation
          </button>
        </header>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-box">
            <span className="stat-num">{resignations.filter(r => r.status === 'pending').length}</span>
            <span className="stat-text">Pending</span>
          </div>
          <div className="stat-box highlight">
            <span className="stat-num">{resignations.filter(r => r.status === 'completed').length}</span>
            <span className="stat-text">Completed</span>
          </div>
          <div className="stat-box">
            <span className="stat-num">{resignations.filter(r => r.status === 'cancelled').length}</span>
            <span className="stat-text">Cancelled</span>
          </div>
        </div>

        {/* Filter */}
        <div className="filters-row">
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Resignations List */}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="resignation-cards">
            {resignations.length === 0 ? (
              <div className="no-data">No resignations found</div>
            ) : (
              resignations.map(r => {
                const daysLeft = getDaysUntilExit(r.last_working_day);
                return (
                  <div key={r.id} className="resignation-card">
                    <div className="card-header">
                      <div>
                        <h3>{r.employee_name}</h3>
                        <p className="emp-info">{r.emp_code} - {r.department_name || 'No Dept'}</p>
                      </div>
                      {getStatusBadge(r.status)}
                    </div>

                    <div className="card-details">
                      <div className="detail-row">
                        <span>Notice Date:</span>
                        <strong>{formatDate(r.notice_date)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Last Working Day:</span>
                        <strong>{formatDate(r.last_working_day)}</strong>
                      </div>
                      {r.status === 'pending' && (
                        <div className="detail-row">
                          <span>Days Until Exit:</span>
                          <strong className={daysLeft <= 7 ? 'urgent' : ''}>
                            {daysLeft > 0 ? `${daysLeft} days` : 'Overdue'}
                          </strong>
                        </div>
                      )}
                      {r.leave_encashment_days > 0 && (
                        <div className="detail-row">
                          <span>Leave Encashment:</span>
                          <strong>{r.leave_encashment_days} days ({formatAmount(r.leave_encashment_amount)})</strong>
                        </div>
                      )}
                      {r.reason && (
                        <div className="detail-row reason">
                          <span>Reason:</span>
                          <p>{r.reason}</p>
                        </div>
                      )}
                    </div>

                    <div className="card-actions">
                      <button onClick={() => handleViewDetails(r.id)} className="action-btn view">
                        View Details
                      </button>
                      {r.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleProcessClick(r)}
                            className="action-btn process"
                            disabled={checkingLeaves}
                          >
                            {checkingLeaves && selectedResignation?.id === r.id ? 'Checking...' : 'Process Exit'}
                          </button>
                          <button onClick={() => handleCancel(r.id)} className="action-btn cancel">
                            Cancel
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="action-btn delete">
                            Delete
                          </button>
                        </>
                      )}
                      {r.status === 'completed' && (
                        <button
                          onClick={() => handleCleanupLeaves(r)}
                          className="action-btn cleanup"
                        >
                          Cleanup Leaves
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Create Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>New Resignation</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Employee *</label>
                  <select
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Notice Date *</label>
                    <input
                      type="date"
                      value={form.notice_date}
                      onChange={(e) => setForm({ ...form, notice_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Working Day *</label>
                    <input
                      type="date"
                      value={form.last_working_day}
                      onChange={(e) => setForm({ ...form, last_working_day: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason</label>
                  <select
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  >
                    <option value="">Select reason</option>
                    <option value="Personal reasons">Personal reasons</option>
                    <option value="Career advancement">Career advancement</option>
                    <option value="Better opportunity">Better opportunity</option>
                    <option value="Relocation">Relocation</option>
                    <option value="Health reasons">Health reasons</option>
                    <option value="Family reasons">Family reasons</option>
                    <option value="Retirement">Retirement</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    rows="3"
                    placeholder="Additional notes"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Create Resignation</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {showDetailsModal && selectedResignation && (
          <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()}>
              <h2>Resignation Details</h2>
              <div className="details-content">
                <div className="detail-section">
                  <h4>Employee Information</h4>
                  <div className="info-grid">
                    <div><span>Name:</span><strong>{selectedResignation.employee_name}</strong></div>
                    <div><span>ID:</span><strong>{selectedResignation.emp_code}</strong></div>
                    <div><span>Department:</span><strong>{selectedResignation.department_name || '-'}</strong></div>
                    <div><span>Basic Salary:</span><strong>{formatAmount(selectedResignation.default_basic_salary)}</strong></div>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Resignation Details</h4>
                  <div className="info-grid">
                    <div><span>Notice Date:</span><strong>{formatDate(selectedResignation.notice_date)}</strong></div>
                    <div><span>Last Working Day:</span><strong>{formatDate(selectedResignation.last_working_day)}</strong></div>
                    <div><span>Status:</span>{getStatusBadge(selectedResignation.status)}</div>
                    <div><span>Reason:</span><strong>{selectedResignation.reason || '-'}</strong></div>
                  </div>
                  {selectedResignation.remarks && (
                    <div className="remarks-box">
                      <span>Remarks:</span>
                      <p>{selectedResignation.remarks}</p>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h4>Leave Encashment</h4>
                  <div className="info-grid">
                    <div><span>Days:</span><strong>{selectedResignation.leave_encashment_days || 0}</strong></div>
                    <div><span>Amount:</span><strong>{formatAmount(selectedResignation.leave_encashment_amount)}</strong></div>
                  </div>
                  {selectedResignation.leave_balances?.length > 0 && (
                    <div className="leave-balances">
                      <p>Current Leave Balances:</p>
                      <div className="balance-chips">
                        {selectedResignation.leave_balances.map(lb => (
                          <span key={lb.code} className="balance-chip">
                            {lb.code}: {lb.entitled_days - lb.used_days} days
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedResignation.status === 'completed' && (
                  <div className="detail-section">
                    <h4>Settlement</h4>
                    <div className="info-grid">
                      <div><span>Final Amount:</span><strong>{formatAmount(selectedResignation.final_salary_amount)}</strong></div>
                      <div><span>Settlement Date:</span><strong>{formatDate(selectedResignation.settlement_date)}</strong></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button onClick={() => setShowDetailsModal(false)} className="save-btn">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Process Modal */}
        {showProcessModal && selectedResignation && (
          <div className="modal-overlay" onClick={() => setShowProcessModal(false)}>
            <div className="modal large" onClick={(e) => e.stopPropagation()}>
              <h2>Process Exit - {selectedResignation.employee_name}</h2>

              <div className="process-info">
                <p><strong>Last Working Day:</strong> {formatDate(selectedResignation.last_working_day)}</p>
                <p><strong>Leave Encashment:</strong> {selectedResignation.leave_encashment_days || 0} days = {formatAmount(selectedResignation.leave_encashment_amount)}</p>
              </div>

              <button onClick={handleCalculateSettlement} className="calc-btn">
                Calculate Final Settlement
              </button>

              {settlementCalc && (
                <div className="settlement-calc">
                  <h4>Final Settlement Breakdown</h4>
                  <div className="calc-table">
                    <div className="calc-row">
                      <span>Pro-rated Salary ({settlementCalc.days_worked}/{settlementCalc.days_in_month} days)</span>
                      <strong>{formatAmount(settlementCalc.pro_rated_salary)}</strong>
                    </div>
                    <div className="calc-row">
                      <span>Leave Encashment ({settlementCalc.leave_encashment_days} days)</span>
                      <strong>{formatAmount(settlementCalc.leave_encashment_amount)}</strong>
                    </div>
                    <div className="calc-row">
                      <span>Pending Claims</span>
                      <strong>{formatAmount(settlementCalc.pending_claims)}</strong>
                    </div>
                    <div className="calc-row total">
                      <span>Total Final Settlement</span>
                      <strong>{formatAmount(settlementCalc.total_final_settlement)}</strong>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleProcess}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Final Settlement Amount (RM) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={processForm.final_salary_amount}
                      onChange={(e) => setProcessForm({ ...processForm, final_salary_amount: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Settlement Date *</label>
                    <input
                      type="date"
                      value={processForm.settlement_date}
                      onChange={(e) => setProcessForm({ ...processForm, settlement_date: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="warning-box">
                  This will mark the resignation as completed and change the employee status to "resigned".
                  This action cannot be undone.
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={() => setShowProcessModal(false)} className="cancel-btn">
                    Cancel
                  </button>
                  <button type="submit" className="save-btn process">Complete Exit Process</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Leave Confirmation Modal */}
        {showLeaveConfirmModal && selectedResignation && leaveCheckData && (
          <div className="modal-overlay" onClick={() => setShowLeaveConfirmModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Leave Cancellation Required</h2>

              <div className="leave-warning-box">
                <p>
                  <strong>{selectedResignation.employee_name}</strong> has leaves scheduled after their last working day
                  ({formatDate(leaveCheckData.last_working_day)}):
                </p>

                {leaveCheckData.approved_leaves.length > 0 && (
                  <div className="leave-list-section">
                    <h4>Approved Leaves ({leaveCheckData.total_approved_days} days)</h4>
                    <ul className="leave-cancel-list">
                      {leaveCheckData.approved_leaves.map(leave => (
                        <li key={leave.id}>
                          <span className="leave-type">{leave.leave_type_name}</span>
                          <span className="leave-dates">
                            {formatDate(leave.start_date)} - {formatDate(leave.end_date)}
                          </span>
                          <span className="leave-days">{leave.total_days} day(s)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {leaveCheckData.pending_leaves.length > 0 && (
                  <div className="leave-list-section">
                    <h4>Pending Leaves ({leaveCheckData.total_pending_days} days)</h4>
                    <ul className="leave-cancel-list">
                      {leaveCheckData.pending_leaves.map(leave => (
                        <li key={leave.id}>
                          <span className="leave-type">{leave.leave_type_name}</span>
                          <span className="leave-dates">
                            {formatDate(leave.start_date)} - {formatDate(leave.end_date)}
                          </span>
                          <span className="leave-days">{leave.total_days} day(s)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="leave-confirm-note">
                  These leaves will be <strong>automatically cancelled</strong> and the leave balance will be <strong>restored</strong> when you proceed.
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowLeaveConfirmModal(false);
                    setSelectedResignation(null);
                    setLeaveCheckData(null);
                  }}
                  className="cancel-btn"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLeaveCancellation}
                  className="save-btn process"
                >
                  Confirm & Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Resignations;
