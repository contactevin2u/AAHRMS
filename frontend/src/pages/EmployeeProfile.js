import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeeProfile.css';

function EmployeeProfile() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // Check if employee is from Mimix (company_id 3)
  const isMimix = profile?.company_id === 3;

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await essApi.getProfile();
      setProfile(res.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <EmployeeLayout>
        <div className="ess-loading">Loading profile...</div>
      </EmployeeLayout>
    );
  }

  return (
    <EmployeeLayout>
      <div className="ess-profile">
        <header className="ess-page-header">
          <h1>My Profile</h1>
          <p>View your personal and employment information</p>
        </header>

        <div className="profile-sections">
          {/* Personal Information */}
          <section className="profile-section">
            <h2>Personal Information</h2>
            <div className="profile-grid">
              <div className="profile-item">
                <label>Full Name</label>
                <span>{profile?.name || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Employee ID</label>
                <span>{profile?.employee_id || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Email</label>
                <span>{profile?.email || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Phone</label>
                <span>{profile?.phone || '-'}</span>
              </div>
              <div className="profile-item">
                <label>IC Number</label>
                <span>{profile?.ic_number || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Date of Birth</label>
                <span>{formatDate(profile?.date_of_birth)}</span>
              </div>
              <div className="profile-item full-width">
                <label>Address</label>
                <span>{profile?.address || '-'}</span>
              </div>
            </div>
          </section>

          {/* Employment Information */}
          <section className="profile-section">
            <h2>Employment Information</h2>
            <div className="profile-grid">
              <div className="profile-item">
                <label>{isMimix ? 'Outlet' : 'Department'}</label>
                <span>{isMimix ? profile?.outlet_name : profile?.department_name || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Position</label>
                <span>{profile?.position || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Join Date</label>
                <span>{formatDate(profile?.join_date)}</span>
              </div>
              <div className="profile-item">
                <label>Status</label>
                <span className={`status-badge ${profile?.status}`}>{profile?.status || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Employment Type</label>
                <span className={`employment-type-badge ${profile?.employment_type || 'probation'}`}>
                  {profile?.employment_type === 'confirmed' ? 'Confirmed' :
                   profile?.employment_type === 'contract' ? 'Contract' : 'Probation'}
                </span>
              </div>
              {profile?.employment_type !== 'confirmed' && profile?.probation_end_date && (
                <div className="profile-item">
                  <label>Probation End Date</label>
                  <span>{formatDate(profile?.probation_end_date)}</span>
                </div>
              )}
              {profile?.employment_type === 'confirmed' && profile?.confirmation_date && (
                <div className="profile-item">
                  <label>Confirmation Date</label>
                  <span>{formatDate(profile?.confirmation_date)}</span>
                </div>
              )}
            </div>
          </section>

          {/* Bank Details */}
          <section className="profile-section">
            <h2>Bank Details</h2>
            <div className="profile-grid">
              <div className="profile-item">
                <label>Bank Name</label>
                <span>{profile?.bank_name || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Account Number</label>
                <span>{profile?.bank_account_no || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Account Holder</label>
                <span>{profile?.bank_account_holder || '-'}</span>
              </div>
            </div>
          </section>

          {/* Statutory Information */}
          <section className="profile-section">
            <h2>Statutory Information</h2>
            <div className="profile-grid">
              <div className="profile-item">
                <label>EPF Number</label>
                <span>{profile?.epf_number || '-'}</span>
              </div>
              <div className="profile-item">
                <label>SOCSO Number</label>
                <span>{profile?.socso_number || '-'}</span>
              </div>
              <div className="profile-item">
                <label>Tax Number</label>
                <span>{profile?.tax_number || '-'}</span>
              </div>
              <div className="profile-item">
                <label>EPF Contribution Type</label>
                <span>{profile?.epf_contribution_type || '-'}</span>
              </div>
            </div>
          </section>

          {/* Salary Structure */}
          <section className="profile-section">
            <h2>Salary Structure</h2>
            <div className="profile-grid">
              <div className="profile-item">
                <label>Basic Salary</label>
                <span>{formatCurrency(profile?.default_basic_salary)}</span>
              </div>
              <div className="profile-item">
                <label>Fixed Allowance</label>
                <span>{formatCurrency(profile?.default_allowance)}</span>
              </div>
              {profile?.commission_rate > 0 && (
                <div className="profile-item">
                  <label>Commission Rate</label>
                  <span>{profile?.commission_rate}%</span>
                </div>
              )}
              {profile?.ot_rate > 0 && (
                <div className="profile-item">
                  <label>OT Rate</label>
                  <span>{formatCurrency(profile?.ot_rate)}/hour</span>
                </div>
              )}
              {profile?.outstation_rate > 0 && (
                <div className="profile-item">
                  <label>Outstation Rate</label>
                  <span>{formatCurrency(profile?.outstation_rate)}/day</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="profile-note">
          <p>If any information is incorrect, please contact HR to update your records.</p>
        </div>
      </div>
    </EmployeeLayout>
  );
}

export default EmployeeProfile;
