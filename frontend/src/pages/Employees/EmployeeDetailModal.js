import React, { useState, useEffect } from 'react';
import api from '../../api';

const EmployeeDetailModal = ({ employee, onClose, onEdit }) => {
  const [fullData, setFullData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if company uses outlets (Mimix = company_id 3)
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const usesOutlets = adminInfo.company_id === 3;

  useEffect(() => {
    if (employee?.id) {
      fetchEmployeeDetails();
    }
  }, [employee]);

  const fetchEmployeeDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/employees/${employee.id}`);
      setFullData(res.data);
    } catch (err) {
      console.error('Error fetching employee details:', err);
      setFullData(employee); // Fallback to passed data
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const data = fullData || employee;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal employee-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Employee Details</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px' }}>
            Loading...
          </div>
        ) : (
          <div className="modal-body employee-detail-content">
            {/* Header */}
            <div className="detail-header">
              <div className="detail-avatar">
                {data.name?.charAt(0).toUpperCase()}
              </div>
              <div className="detail-title">
                <h3>{data.name}</h3>
                <p>{data.employee_id} | {data.position || 'Employee'}</p>
                <span className={`status-badge ${data.status}`}>{data.status}</span>
              </div>
            </div>

            {/* Personal Information */}
            <div className="detail-section">
              <h4>Personal Information</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Full Name</label>
                  <span>{data.name || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>IC Number</label>
                  <span>{data.ic_number || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Date of Birth</label>
                  <span>{formatDate(data.date_of_birth)}</span>
                </div>
                <div className="detail-item">
                  <label>Email</label>
                  <span>{data.email || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Phone</label>
                  <span>{data.phone || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Marital Status</label>
                  <span style={{ textTransform: 'capitalize' }}>{data.marital_status || '-'}</span>
                </div>
                {data.marital_status === 'married' && (
                  <>
                    <div className="detail-item">
                      <label>Spouse Working</label>
                      <span>{data.spouse_working ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="detail-item">
                      <label>Children</label>
                      <span>{data.children_count ?? '-'}</span>
                    </div>
                  </>
                )}
                <div className="detail-item full-width">
                  <label>Address</label>
                  <span>{data.address || '-'}</span>
                </div>
              </div>
            </div>

            {/* Employment Details */}
            <div className="detail-section">
              <h4>Employment Details</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Employee ID</label>
                  <span>{data.employee_id || '-'}</span>
                </div>
                {usesOutlets ? (
                  <div className="detail-item">
                    <label>Outlet</label>
                    <span>{data.outlet_name || '-'}</span>
                  </div>
                ) : (
                  <div className="detail-item">
                    <label>Department</label>
                    <span>{data.department_name || '-'}</span>
                  </div>
                )}
                <div className="detail-item">
                  <label>Position</label>
                  <span>{data.position || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Employment Type</label>
                  <span style={{ textTransform: 'capitalize' }}>{data.employment_type || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Join Date</label>
                  <span>{formatDate(data.join_date)}</span>
                </div>
                <div className="detail-item">
                  <label>Status</label>
                  <span className={`status-badge ${data.status}`}>{data.status}</span>
                </div>
                <div className="detail-item">
                  <label>Probation Status</label>
                  <span style={{ textTransform: 'capitalize' }}>{data.probation_status || '-'}</span>
                </div>
                {data.probation_end_date && (
                  <div className="detail-item">
                    <label>Probation End</label>
                    <span>{formatDate(data.probation_end_date)}</span>
                  </div>
                )}
                {data.confirmation_date && (
                  <div className="detail-item">
                    <label>Confirmation Date</label>
                    <span>{formatDate(data.confirmation_date)}</span>
                  </div>
                )}
                {data.resign_date && (
                  <div className="detail-item">
                    <label>Resign Date</label>
                    <span>{formatDate(data.resign_date)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bank Information */}
            <div className="detail-section">
              <h4>Bank & Payment</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Bank Name</label>
                  <span>{data.bank_name || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Account Number</label>
                  <span style={{ fontFamily: 'monospace' }}>{data.bank_account_no || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Account Holder</label>
                  <span>{data.bank_account_holder || '-'}</span>
                </div>
              </div>
            </div>

            {/* Tax & Contributions */}
            <div className="detail-section">
              <h4>Tax & Contributions</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>EPF Number</label>
                  <span style={{ fontFamily: 'monospace' }}>{data.epf_number || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>EPF Type</label>
                  <span style={{ textTransform: 'capitalize' }}>{data.epf_contribution_type || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>SOCSO Number</label>
                  <span style={{ fontFamily: 'monospace' }}>{data.socso_number || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Tax Number</label>
                  <span style={{ fontFamily: 'monospace' }}>{data.tax_number || '-'}</span>
                </div>
              </div>
            </div>

            {/* Salary Information */}
            <div className="detail-section">
              <h4>Salary & Earnings</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Basic Salary</label>
                  <span style={{ color: '#059669', fontWeight: '600' }}>
                    {formatCurrency(data.default_basic_salary)}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Allowance</label>
                  <span style={{ color: '#059669', fontWeight: '600' }}>
                    {formatCurrency(data.default_allowance)}
                  </span>
                </div>
                {data.default_bonus > 0 && (
                  <div className="detail-item">
                    <label>Bonus</label>
                    <span>{formatCurrency(data.default_bonus)}</span>
                  </div>
                )}
                {data.default_incentive > 0 && (
                  <div className="detail-item">
                    <label>Incentive</label>
                    <span>{formatCurrency(data.default_incentive)}</span>
                  </div>
                )}
                {data.commission_rate > 0 && (
                  <div className="detail-item">
                    <label>Commission Rate</label>
                    <span>{data.commission_rate}%</span>
                  </div>
                )}
                {data.ot_rate > 0 && (
                  <div className="detail-item">
                    <label>OT Rate</label>
                    <span>{formatCurrency(data.ot_rate)}/hr</span>
                  </div>
                )}
                {data.per_trip_rate > 0 && (
                  <div className="detail-item">
                    <label>Per Trip Rate</label>
                    <span>{formatCurrency(data.per_trip_rate)}</span>
                  </div>
                )}
                {data.outstation_rate > 0 && (
                  <div className="detail-item">
                    <label>Outstation Rate</label>
                    <span>{formatCurrency(data.outstation_rate)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* System Info */}
            <div className="detail-section">
              <h4>System Info</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>ESS Enabled</label>
                  <span>{data.ess_enabled ? 'Yes' : 'No'}</span>
                </div>
                <div className="detail-item">
                  <label>Last Login</label>
                  <span>{data.last_login ? formatDate(data.last_login) : 'Never'}</span>
                </div>
                <div className="detail-item">
                  <label>Created</label>
                  <span>{formatDate(data.created_at)}</span>
                </div>
                <div className="detail-item">
                  <label>Updated</label>
                  <span>{formatDate(data.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {onEdit && (
            <button
              className="btn-primary"
              onClick={() => {
                onClose();
                onEdit(data);
              }}
              style={{ marginLeft: '10px' }}
            >
              ✏️ Edit Employee
            </button>
          )}
        </div>
      </div>

      <style>{`
        .employee-detail-modal {
          max-width: 700px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .employee-detail-content {
          padding: 0 !important;
        }

        .detail-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: linear-gradient(135deg, #1976d2, #1565c0);
          color: white;
        }

        .detail-avatar {
          width: 60px;
          height: 60px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 600;
        }

        .detail-title h3 {
          margin: 0;
          font-size: 20px;
        }

        .detail-title p {
          margin: 4px 0 8px;
          opacity: 0.9;
          font-size: 14px;
        }

        .detail-title .status-badge {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .detail-section {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .detail-section:last-child {
          border-bottom: none;
        }

        .detail-section h4 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .detail-item label {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-item span {
          font-size: 14px;
          color: #1e293b;
        }

        @media (max-width: 600px) {
          .detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default EmployeeDetailModal;
