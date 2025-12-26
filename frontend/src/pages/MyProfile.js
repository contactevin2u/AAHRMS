import React, { useState, useEffect } from 'react';
import { adminUsersApi } from '../api';
import Layout from '../components/Layout';
import './MyProfile.css';

function MyProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    designation: '',
    phone: '',
    signature_text: ''
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await adminUsersApi.getMyProfile();
      setProfile(response.data);
      setForm({
        name: response.data.name || '',
        email: response.data.email || '',
        designation: response.data.designation || '',
        phone: response.data.phone || '',
        signature_text: response.data.signature_text || ''
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      alert('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      alert('Display name is required');
      return;
    }

    setSaving(true);
    try {
      const response = await adminUsersApi.updateMyProfile(form);
      setProfile({ ...profile, ...response.data });

      // Update localStorage adminInfo
      const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
      adminInfo.name = response.data.name;
      adminInfo.email = response.data.email;
      adminInfo.designation = response.data.designation;
      localStorage.setItem('adminInfo', JSON.stringify(adminInfo));

      alert('Profile updated successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      await adminUsersApi.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      setShowPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      alert('Password changed successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleColor = (role) => {
    const colors = {
      super_admin: '#1e293b',
      boss: '#c0392b',
      director: '#2980b9',
      hr: '#27ae60',
      manager: '#e67e22',
      viewer: '#7a8a9a'
    };
    return colors[role] || '#6c757d';
  };

  if (loading) {
    return (
      <Layout>
        <div className="my-profile-page">
          <div className="loading">Loading profile...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="my-profile-page">
        <div className="page-header">
          <div>
            <h1>My Profile</h1>
            <p>Manage your personal information and account settings</p>
          </div>
        </div>

        <div className="profile-content">
          {/* Profile Card */}
          <div className="profile-card">
            <div className="profile-header" style={{ backgroundColor: getRoleColor(profile?.role) }}>
              <div className="profile-avatar">
                {(profile?.name || profile?.username)?.charAt(0).toUpperCase()}
              </div>
              <div className="profile-basic">
                <h2>{profile?.name || profile?.username}</h2>
                <span className="role-badge">{profile?.role_display_name || profile?.role}</span>
              </div>
            </div>
            <div className="profile-meta">
              <div className="meta-item">
                <span className="meta-label">Username</span>
                <span className="meta-value">@{profile?.username}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Last Login</span>
                <span className="meta-value">{formatDate(profile?.last_login)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Member Since</span>
                <span className="meta-value">{formatDate(profile?.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <div className="profile-form-card">
            <h3>Edit Profile</h3>
            <p className="form-description">
              Your name and designation will appear on letters and approvals you issue.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Display Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter your full name"
                  required
                />
                <small>This name will appear on letters and documents you issue</small>
              </div>

              <div className="form-group">
                <label>Designation / Position *</label>
                <input
                  type="text"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g., HR Manager, Director, Managing Director"
                />
                <small>Your job title that appears on official documents</small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </div>

                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Signature Text</label>
                <textarea
                  value={form.signature_text}
                  onChange={(e) => setForm({ ...form, signature_text: e.target.value })}
                  placeholder="Optional text to appear in your signature block"
                  rows={2}
                />
                <small>Additional text for your signature (optional)</small>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-save" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn-password"
                  onClick={() => setShowPasswordModal(true)}
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>

          {/* Preview Card */}
          <div className="preview-card">
            <h3>Letter Signature Preview</h3>
            <p className="preview-description">
              This is how your signature will appear on letters and documents:
            </p>
            <div className="signature-preview">
              <div className="signature-line"></div>
              <div className="signature-name">{form.name || 'Your Name'}</div>
              <div className="signature-designation">{form.designation || 'Your Designation'}</div>
              {form.signature_text && (
                <div className="signature-text">{form.signature_text}</div>
              )}
              <div className="signature-date">Date: {new Date().toLocaleDateString('en-MY')}</div>
            </div>
          </div>
        </div>

        {/* Password Change Modal */}
        {showPasswordModal && (
          <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
            <div className="modal password-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Change Password</h2>
                <button className="close-btn" onClick={() => setShowPasswordModal(false)}>x</button>
              </div>
              <form onSubmit={handlePasswordChange}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Current Password *</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      placeholder="Enter current password"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>New Password *</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      placeholder="Minimum 6 characters"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Confirm New Password *</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      placeholder="Re-enter new password"
                      required
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowPasswordModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit" disabled={saving}>
                    {saving ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default MyProfile;
