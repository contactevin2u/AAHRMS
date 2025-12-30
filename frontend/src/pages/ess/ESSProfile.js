import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import './ESSProfile.css';

function ESSProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await essApi.getProfile();
      setProfile(res.data);
      setEditForm({
        name: res.data.name || '',
        email: res.data.email || '',
        phone: res.data.phone || '',
        ic_number: res.data.ic_number || '',
        date_of_birth: res.data.date_of_birth ? res.data.date_of_birth.split('T')[0] : '',
        address: res.data.address || ''
      });
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      await essApi.updateProfile(editForm);
      setSaveSuccess('Profile updated successfully!');
      setIsEditing(false);
      fetchProfile();
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setSaveError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditForm({
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      ic_number: profile.ic_number || '',
      date_of_birth: profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
      address: profile.address || ''
    });
    setSaveError('');
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

  const getStatusBadge = (status) => {
    const statusMap = {
      active: { label: 'Active', class: 'status-active' },
      inactive: { label: 'Inactive', class: 'status-inactive' },
      resigned: { label: 'Resigned', class: 'status-resigned' },
      terminated: { label: 'Terminated', class: 'status-terminated' }
    };
    const s = statusMap[status] || { label: status, class: '' };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  };

  const getProbationBadge = (status) => {
    const statusMap = {
      probation: { label: 'On Probation', class: 'probation-active' },
      confirmed: { label: 'Confirmed', class: 'probation-confirmed' },
      extended: { label: 'Extended', class: 'probation-extended' }
    };
    const s = statusMap[status] || { label: status || 'N/A', class: '' };
    return <span className={`probation-badge ${s.class}`}>{s.label}</span>;
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </ESSLayout>
    );
  }

  if (error) {
    return (
      <ESSLayout>
        <div className="ess-error">
          <p>{error}</p>
          <button onClick={fetchProfile}>Try Again</button>
        </div>
      </ESSLayout>
    );
  }

  return (
    <ESSLayout>
      <div className="ess-profile">
        {/* Header */}
        <div className="profile-header">
          <div className="profile-avatar">
            {profile.name?.charAt(0).toUpperCase()}
          </div>
          <div className="profile-title">
            <h1>{profile.name}</h1>
            <p className="employee-id">{profile.employee_id}</p>
            <p className="position">{profile.position || 'Employee'}</p>
            {getStatusBadge(profile.status)}
          </div>
        </div>

        {/* Success/Error Messages */}
        {saveSuccess && <div className="save-success">{saveSuccess}</div>}
        {saveError && <div className="save-error">{saveError}</div>}

        {/* Personal Information - Editable by Employee */}
        <section className="profile-section">
          <div className="section-header">
            <h2>Personal Information</h2>
            {!isEditing ? (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            ) : (
              <div className="edit-actions">
                <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="edit-form">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                />
              </div>
              <div className="form-group">
                <label>IC Number</label>
                <input
                  type="text"
                  name="ic_number"
                  value={editForm.ic_number}
                  onChange={handleEditChange}
                  placeholder="e.g., 900101-01-1234"
                />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={editForm.date_of_birth}
                  onChange={handleEditChange}
                />
              </div>
              <div className="form-group full-width">
                <label>Address</label>
                <textarea
                  name="address"
                  value={editForm.address}
                  onChange={handleEditChange}
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="info-grid">
              <div className="info-item">
                <label>Full Name</label>
                <span>{profile.name || '-'}</span>
              </div>
              <div className="info-item">
                <label>IC Number</label>
                <span>{profile.ic_number || '-'}</span>
              </div>
              <div className="info-item">
                <label>Date of Birth</label>
                <span>{formatDate(profile.date_of_birth)}</span>
              </div>
              <div className="info-item">
                <label>Email</label>
                <span>{profile.email || '-'}</span>
              </div>
              <div className="info-item">
                <label>Phone</label>
                <span>{profile.phone || '-'}</span>
              </div>
              <div className="info-item">
                <label>Marital Status</label>
                <span className="capitalize">{profile.marital_status || '-'}</span>
              </div>
              {profile.marital_status === 'married' && (
                <>
                  <div className="info-item">
                    <label>Spouse Working</label>
                    <span>{profile.spouse_working ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="info-item">
                    <label>Children</label>
                    <span>{profile.children_count ?? '-'}</span>
                  </div>
                </>
              )}
              <div className="info-item full-width">
                <label>Address</label>
                <span>{profile.address || '-'}</span>
              </div>
            </div>
          )}
        </section>

        {/* Employment Details - Read Only for Employee */}
        <section className="profile-section">
          <h2>Employment Details</h2>
          <p className="section-note">Contact HR to update employment details</p>
          <div className="info-grid">
            <div className="info-item">
              <label>Employee ID</label>
              <span>{profile.employee_id || '-'}</span>
            </div>
            <div className="info-item">
              <label>Department</label>
              <span>{profile.department_name || '-'}</span>
            </div>
            <div className="info-item">
              <label>Position</label>
              <span>{profile.position || '-'}</span>
            </div>
            <div className="info-item">
              <label>Employment Type</label>
              <span className="capitalize">{profile.employment_type || '-'}</span>
            </div>
            <div className="info-item">
              <label>Join Date</label>
              <span>{formatDate(profile.join_date)}</span>
            </div>
            <div className="info-item">
              <label>Status</label>
              {getStatusBadge(profile.status)}
            </div>
            <div className="info-item">
              <label>Probation Status</label>
              {getProbationBadge(profile.probation_status)}
            </div>
            {profile.probation_end_date && (
              <div className="info-item">
                <label>Probation End Date</label>
                <span>{formatDate(profile.probation_end_date)}</span>
              </div>
            )}
            {profile.confirmation_date && (
              <div className="info-item">
                <label>Confirmation Date</label>
                <span>{formatDate(profile.confirmation_date)}</span>
              </div>
            )}
            {profile.resign_date && (
              <div className="info-item">
                <label>Resign Date</label>
                <span>{formatDate(profile.resign_date)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Bank & Payment Information - Read Only */}
        <section className="profile-section">
          <h2>Bank & Payment Information</h2>
          <p className="section-note">Contact HR to update bank details</p>
          <div className="info-grid">
            <div className="info-item">
              <label>Bank Name</label>
              <span>{profile.bank_name || '-'}</span>
            </div>
            <div className="info-item">
              <label>Account Number</label>
              <span className="mono">{profile.bank_account_no || '-'}</span>
            </div>
            <div className="info-item">
              <label>Account Holder</label>
              <span>{profile.bank_account_holder || '-'}</span>
            </div>
          </div>
        </section>

        {/* Tax & Contributions - Read Only */}
        <section className="profile-section">
          <h2>Tax & Contributions</h2>
          <p className="section-note">Contact HR to update statutory details</p>
          <div className="info-grid">
            <div className="info-item">
              <label>EPF Number</label>
              <span className="mono">{profile.epf_number || '-'}</span>
            </div>
            <div className="info-item">
              <label>EPF Contribution Type</label>
              <span className="capitalize">{profile.epf_contribution_type || '-'}</span>
            </div>
            <div className="info-item">
              <label>SOCSO Number</label>
              <span className="mono">{profile.socso_number || '-'}</span>
            </div>
            <div className="info-item">
              <label>Tax Number (LHDN)</label>
              <span className="mono">{profile.tax_number || '-'}</span>
            </div>
          </div>
        </section>

        {/* Salary & Earnings - Read Only */}
        <section className="profile-section">
          <h2>Salary & Earnings</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Basic Salary</label>
              <span className="amount">{formatCurrency(profile.default_basic_salary)}</span>
            </div>
            <div className="info-item">
              <label>Allowance</label>
              <span className="amount">{formatCurrency(profile.default_allowance)}</span>
            </div>
            {profile.default_bonus > 0 && (
              <div className="info-item">
                <label>Bonus</label>
                <span className="amount">{formatCurrency(profile.default_bonus)}</span>
              </div>
            )}
            {profile.default_incentive > 0 && (
              <div className="info-item">
                <label>Incentive</label>
                <span className="amount">{formatCurrency(profile.default_incentive)}</span>
              </div>
            )}
            {profile.commission_rate > 0 && (
              <div className="info-item">
                <label>Commission Rate</label>
                <span>{profile.commission_rate}%</span>
              </div>
            )}
            {profile.ot_rate > 0 && (
              <div className="info-item">
                <label>OT Rate</label>
                <span>{formatCurrency(profile.ot_rate)}/hr</span>
              </div>
            )}
            {profile.per_trip_rate > 0 && (
              <div className="info-item">
                <label>Per Trip Rate</label>
                <span>{formatCurrency(profile.per_trip_rate)}</span>
              </div>
            )}
            {profile.outstation_rate > 0 && (
              <div className="info-item">
                <label>Outstation Rate</label>
                <span>{formatCurrency(profile.outstation_rate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Last Login */}
        <div className="profile-footer">
          <p>Last login: {profile.last_login ? formatDate(profile.last_login) : 'Never'}</p>
        </div>
      </div>
    </ESSLayout>
  );
}

export default ESSProfile;
