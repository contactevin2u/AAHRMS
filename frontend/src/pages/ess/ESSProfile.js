import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { isMimixCompany } from '../../utils/permissions';
import './ESSProfile.css';

// Helper to compress image before upload
const compressImage = (file, maxWidth = 800, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if wider than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 with compression
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Mixue preset avatars (for Mimix company only)
const MIXUE_AVATARS = [
  { id: 'love', name: 'Love', url: '/avatars/mixue/love.jpg' },
  { id: 'icecream', name: 'Ice Cream', url: '/avatars/mixue/icecream.jpg' },
  { id: 'search', name: 'Search', url: '/avatars/mixue/search.png' },
  { id: 'king', name: 'Snow King', url: '/avatars/mixue/king.png' },
  { id: 'blackbull', name: 'Black Bull', url: '/avatars/mixue/blackbull.png' },
  { id: 'kiss', name: 'Kiss', url: '/avatars/mixue/kiss.png' },
];

// Field labels for display
const FIELD_LABELS = {
  name: 'Full Name',
  ic_number: 'IC Number',
  date_of_birth: 'Date of Birth',
  phone: 'Phone',
  address: 'Address',
  email: 'Email',
  bank_name: 'Bank Name',
  bank_account_no: 'Account Number',
  bank_account_holder: 'Account Holder',
  epf_number: 'EPF Number',
  socso_number: 'SOCSO Number',
  tax_number: 'Tax Number (LHDN)',
  marital_status: 'Marital Status',
  spouse_working: 'Spouse Working',
  children_count: 'Number of Children'
};

function ESSProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Profile picture upload states
  const fileInputRef = useRef(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [pictureError, setPictureError] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await essApi.getProfile();
      setProfile(res.data);
      initEditForm(res.data);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const initEditForm = (data) => {
    setEditForm({
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      username: data.username || '',
      date_of_birth: data.date_of_birth ? data.date_of_birth.split('T')[0] : '',
      address: data.address || '',
      bank_name: data.bank_name || '',
      bank_account_no: data.bank_account_no || '',
      bank_account_holder: data.bank_account_holder || '',
      epf_number: data.epf_number || '',
      socso_number: data.socso_number || '',
      tax_number: data.tax_number || '',
      marital_status: data.marital_status || 'single',
      spouse_working: data.spouse_working || false,
      children_count: data.children_count || 0
    });
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const res = await essApi.updateProfile(editForm);
      const message = res.data.profile_status?.complete
        ? 'Profile completed and saved!'
        : 'Profile updated successfully!';
      setSaveSuccess(message);
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
    initEditForm(profile);
    setSaveError('');
  };

  // Profile picture handlers
  const handlePictureClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setPictureError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      setPictureError('Image is too large. Please select an image smaller than 5MB.');
      return;
    }

    setPictureError('');
    setUploadingPicture(true);

    try {
      // Compress image before upload
      const compressedImage = await compressImage(file, 800, 0.8);

      // Upload to server
      const res = await essApi.uploadProfilePicture(compressedImage);

      // Update profile with new picture
      setProfile(prev => ({
        ...prev,
        profile_picture: res.data.profile_picture
      }));

      setSaveSuccess('Profile picture updated!');
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      console.error('Error uploading picture:', err);
      setPictureError(err.response?.data?.error || 'Failed to upload picture');
    } finally {
      setUploadingPicture(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeletePicture = async () => {
    if (!window.confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setPictureError('');
    setUploadingPicture(true);

    try {
      await essApi.deleteProfilePicture();

      // Update profile to remove picture
      setProfile(prev => ({
        ...prev,
        profile_picture: null
      }));

      setSaveSuccess('Profile picture removed!');
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      console.error('Error deleting picture:', err);
      setPictureError(err.response?.data?.error || 'Failed to delete picture');
    } finally {
      setUploadingPicture(false);
    }
  };

  // Handle preset avatar selection (Mixue only)
  const handleSelectPresetAvatar = async (avatarUrl) => {
    setPictureError('');
    setUploadingPicture(true);
    setShowAvatarPicker(false);

    try {
      // Use the preset URL directly
      const res = await essApi.setPresetAvatar(avatarUrl);

      // Update profile with new picture
      setProfile(prev => ({
        ...prev,
        profile_picture: res.data.profile_picture
      }));

      setSaveSuccess('Avatar updated!');
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err) {
      console.error('Error setting avatar:', err);
      setPictureError(err.response?.data?.error || 'Failed to set avatar');
    } finally {
      setUploadingPicture(false);
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

  // Extract date of birth from IC number (Malaysian NRIC format: YYMMDD-XX-XXXX)
  const extractDOBFromIC = (icNumber) => {
    if (!icNumber) return null;
    // Remove dashes and get first 6 digits
    const cleanIC = icNumber.replace(/-/g, '');
    if (cleanIC.length < 6) return null;

    const yy = parseInt(cleanIC.substring(0, 2), 10);
    const mm = cleanIC.substring(2, 4);
    const dd = cleanIC.substring(4, 6);

    // Determine century: if YY > current year's last 2 digits, it's 19XX, else 20XX
    const currentYear = new Date().getFullYear();
    const currentYY = currentYear % 100;
    const century = yy > currentYY ? 1900 : 2000;
    const fullYear = century + yy;

    // Validate the date
    const dateStr = `${fullYear}-${mm}-${dd}`;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;

    return date;
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
      // Database values
      ongoing: { label: 'On Probation', class: 'probation-active' },
      pending_review: { label: 'Pending Review', class: 'probation-pending' },
      confirmed: { label: 'Confirmed', class: 'probation-confirmed' },
      extended: { label: 'Extended', class: 'probation-extended' },
      // Legacy/alternative values
      probation: { label: 'On Probation', class: 'probation-active' }
    };
    const s = statusMap[status] || { label: status || 'N/A', class: '' };
    return <span className={`probation-badge ${s.class}`}>{s.label}</span>;
  };

  // Check if a field is editable
  const isFieldEditable = (fieldName) => {
    if (!profile?.profile_status) return false;
    return profile.profile_status.editable_fields?.includes(fieldName);
  };

  // Check if a field is missing (required but not filled)
  const isFieldMissing = (fieldName) => {
    if (!profile?.profile_status) return false;
    return profile.profile_status.missing_fields?.includes(fieldName);
  };

  // Calculate completion progress
  const getCompletionProgress = () => {
    if (!profile?.profile_status) return { percent: 0, filled: 0, total: 10 };
    const missing = profile.profile_status.missing_fields?.length || 0;
    const total = 10; // Total required fields
    const filled = total - missing;
    return {
      percent: Math.round((filled / total) * 100),
      filled,
      total
    };
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

  const profileStatus = profile?.profile_status;
  const isProfileComplete = profileStatus?.complete;
  const progress = getCompletionProgress();

  return (
    <ESSLayout>
      <div className="ess-profile">
        {/* Header */}
        <div className="profile-header">
          <div className="profile-avatar-container">
            <div
              className={`profile-avatar ${uploadingPicture ? 'uploading' : ''}`}
              onClick={() => isMimixCompany(profile) ? setShowAvatarPicker(true) : fileInputRef.current?.click()}
              style={profile.profile_picture ? {
                backgroundImage: `url(${profile.profile_picture})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              } : {}}
            >
              {!profile.profile_picture && (profile.name?.charAt(0)?.toUpperCase() || '?')}
              {uploadingPicture && <div className="upload-spinner"></div>}
            </div>
            <button
              className="change-photo-btn"
              onClick={() => isMimixCompany(profile) ? setShowAvatarPicker(true) : fileInputRef.current?.click()}
              disabled={uploadingPicture}
            >
              {profile.profile_picture ? 'Change' : 'Add Photo'}
            </button>
            {profile.profile_picture && (
              <button
                className="remove-photo-btn"
                onClick={handleDeletePicture}
                disabled={uploadingPicture}
              >
                Remove
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {pictureError && <p className="picture-error">{pictureError}</p>}
          </div>
          <div className="profile-title">
            <h1>{profile.name || 'New Employee'}</h1>
            <p className="employee-id">{profile.employee_id}</p>
            <p className="position">{profile.position || 'Employee'}</p>
            {getStatusBadge(profile.status)}
          </div>
        </div>

        {/* Avatar Picker Modal (Mimix only) */}
        {showAvatarPicker && isMimixCompany(profile) && (
          <div className="avatar-picker-overlay" onClick={() => setShowAvatarPicker(false)}>
            <div className="avatar-picker-modal" onClick={e => e.stopPropagation()}>
              <div className="avatar-picker-header">
                <h3>Choose Profile Picture</h3>
                <button className="close-btn" onClick={() => setShowAvatarPicker(false)}>&times;</button>
              </div>

              <div className="avatar-picker-section">
                <h4>Mixue Avatars</h4>
                <div className="avatar-grid">
                  {MIXUE_AVATARS.map(avatar => (
                    <div
                      key={avatar.id}
                      className={`avatar-option ${profile.profile_picture === avatar.url ? 'selected' : ''}`}
                      onClick={() => handleSelectPresetAvatar(avatar.url)}
                    >
                      <img src={avatar.url} alt={avatar.name} />
                      <span>{avatar.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="avatar-picker-divider">
                <span>or</span>
              </div>

              <div className="avatar-picker-section">
                <h4>Upload Your Own Photo</h4>
                <button
                  className="upload-photo-btn"
                  onClick={() => {
                    setShowAvatarPicker(false);
                    fileInputRef.current?.click();
                  }}
                >
                  Choose from Gallery
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="profile-quick-links">
          <button
            className="quick-link-btn"
            onClick={() => navigate('/ess/payslips')}
          >
            <span className="quick-link-icon">💵</span>
            <span>View Payslips</span>
          </button>
          <button
            className="quick-link-btn"
            onClick={() => navigate('/ess/change-password')}
          >
            <span className="quick-link-icon">🔐</span>
            <span>Change Password</span>
          </button>
        </div>

        {/* Login Settings Section */}
        <section className="profile-section" style={{ marginTop: '16px' }}>
          <div className="section-header">
            <h2>Login Settings</h2>
          </div>
          <p className="section-note" style={{ marginBottom: '12px' }}>
            Use your username to login to ESS
          </p>
          {isEditing ? (
            <div className="edit-form">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  placeholder="Enter username (letters, numbers, underscore)"
                  maxLength={30}
                  style={{ textTransform: 'lowercase' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px' }}>
                  Min 4 characters. Only letters, numbers, and underscore allowed.
                </small>
              </div>
            </div>
          ) : (
            <div className="info-grid">
              <div className="info-item">
                <label>Username</label>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                  {profile.username || <em className="empty">Not set</em>}
                </span>
              </div>
              <div className="info-item">
                <label>Employee ID</label>
                <span style={{ fontFamily: 'monospace' }}>{profile.employee_id}</span>
              </div>
            </div>
          )}
        </section>

        {/* Profile Completion Banner */}
        {!isProfileComplete && (
          <div className="profile-completion-banner">
            <div className="banner-content">
              <div className="banner-icon">!</div>
              <div className="banner-text">
                <h3>Complete Your Profile</h3>
                <p>Please fill in your personal information to complete your profile.</p>
                {profileStatus?.deadline && (
                  <p className="deadline">
                    Deadline: {formatDate(profileStatus.deadline)}
                  </p>
                )}
              </div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
            </div>
            <div className="progress-text">
              {progress.filled} of {progress.total} required fields completed ({progress.percent}%)
            </div>
            {profileStatus?.missing_fields?.length > 0 && (
              <div className="missing-fields">
                <strong>Missing:</strong> {profileStatus.missing_fields.map(f => FIELD_LABELS[f] || f).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Profile Verified Badge */}
        {isProfileComplete && (
          <div className="profile-verified-banner">
            <span className="verified-icon">&#10003;</span>
            <span>Profile Verified</span>
            {profile.profile_completed_at && (
              <span className="verified-date">
                Completed on {formatDate(profile.profile_completed_at)}
              </span>
            )}
          </div>
        )}

        {/* Success/Error Messages */}
        {saveSuccess && <div className="save-success">{saveSuccess}</div>}
        {saveError && <div className="save-error">{saveError}</div>}

        {/* Personal Information Section */}
        <section className="profile-section">
          <div className="section-header">
            <h2>Personal Information</h2>
            {!isEditing ? (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>
                {isProfileComplete ? 'Edit' : 'Complete Profile'}
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

          {isProfileComplete && !isEditing && (
            <p className="section-note">Only phone and address can be edited. Contact HR for other changes.</p>
          )}

          {isEditing ? (
            <div className="edit-form">
              {/* Name */}
              <div className={`form-group ${isFieldMissing('name') ? 'missing' : ''}`}>
                <label>Full Name *</label>
                {isFieldEditable('name') ? (
                  <input
                    type="text"
                    name="name"
                    value={editForm.name}
                    onChange={handleEditChange}
                    required
                  />
                ) : (
                  <div className="locked-field">
                    <span>{profile.name || '-'}</span>
                    <span className="lock-icon">&#128274;</span>
                  </div>
                )}
              </div>

              {/* Date of Birth - Auto extracted from IC */}
              <div className="form-group">
                <label>Date of Birth (from IC)</label>
                <div className="locked-field">
                  <span>{extractDOBFromIC(profile.ic_number) ? formatDate(extractDOBFromIC(profile.ic_number)) : '-'}</span>
                  <span className="lock-icon">&#128274;</span>
                </div>
              </div>

              {/* Phone */}
              <div className={`form-group ${isFieldMissing('phone') ? 'missing' : ''}`}>
                <label>Phone *</label>
                <input
                  type="tel"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                />
              </div>

              {/* Email */}
              <div className="form-group">
                <label>Email</label>
                {isFieldEditable('email') ? (
                  <input
                    type="email"
                    name="email"
                    value={editForm.email}
                    onChange={handleEditChange}
                  />
                ) : (
                  <div className="locked-field">
                    <span>{profile.email || '-'}</span>
                    <span className="lock-icon">&#128274;</span>
                  </div>
                )}
              </div>

              {/* Address */}
              <div className={`form-group full-width ${isFieldMissing('address') ? 'missing' : ''}`}>
                <label>Address *</label>
                <textarea
                  name="address"
                  value={editForm.address}
                  onChange={handleEditChange}
                  rows={3}
                />
              </div>

              {/* Marital Status */}
              <div className="form-group">
                <label>Marital Status</label>
                {isFieldEditable('marital_status') ? (
                  <select
                    name="marital_status"
                    value={editForm.marital_status}
                    onChange={handleEditChange}
                  >
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                ) : (
                  <div className="locked-field">
                    <span className="capitalize">{profile.marital_status || '-'}</span>
                    <span className="lock-icon">&#128274;</span>
                  </div>
                )}
              </div>

              {/* Spouse Working (if married) */}
              {(editForm.marital_status === 'married' || profile.marital_status === 'married') && (
                <>
                  <div className="form-group">
                    <label>Spouse Working</label>
                    {isFieldEditable('spouse_working') ? (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="spouse_working"
                          checked={editForm.spouse_working}
                          onChange={handleEditChange}
                        />
                        Yes, spouse is working
                      </label>
                    ) : (
                      <div className="locked-field">
                        <span>{profile.spouse_working ? 'Yes' : 'No'}</span>
                        <span className="lock-icon">&#128274;</span>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Number of Children</label>
                    {isFieldEditable('children_count') ? (
                      <input
                        type="number"
                        name="children_count"
                        min="0"
                        value={editForm.children_count}
                        onChange={handleEditChange}
                      />
                    ) : (
                      <div className="locked-field">
                        <span>{profile.children_count || 0}</span>
                        <span className="lock-icon">&#128274;</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="info-grid">
              <div className={`info-item ${isFieldMissing('name') ? 'missing' : ''}`}>
                <label>Full Name</label>
                <span>{profile.name || <em className="empty">Not provided</em>}</span>
              </div>
              <div className="info-item">
                <label>IC Number</label>
                <span>{profile.ic_number || '-'}</span>
              </div>
              <div className="info-item">
                <label>Date of Birth (from IC)</label>
                <span>{extractDOBFromIC(profile.ic_number) ? formatDate(extractDOBFromIC(profile.ic_number)) : '-'}</span>
              </div>
              <div className="info-item">
                <label>Email</label>
                <span>{profile.email || '-'}</span>
              </div>
              <div className={`info-item ${isFieldMissing('phone') ? 'missing' : ''}`}>
                <label>Phone</label>
                <span>{profile.phone || <em className="empty">Not provided</em>}</span>
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
              <div className={`info-item full-width ${isFieldMissing('address') ? 'missing' : ''}`}>
                <label>Address</label>
                <span>{profile.address || <em className="empty">Not provided</em>}</span>
              </div>
            </div>
          )}
        </section>

        {/* Bank & Payment Information */}
        <section className="profile-section">
          <div className="section-header">
            <h2>Bank & Payment Information</h2>
            {!isProfileComplete && !isEditing && (
              <button className="edit-btn small" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            )}
          </div>
          {isProfileComplete && (
            <p className="section-note">Contact HR to update bank details</p>
          )}

          {isEditing && !isProfileComplete ? (
            <div className="edit-form">
              <div className={`form-group ${isFieldMissing('bank_name') ? 'missing' : ''}`}>
                <label>Bank Name *</label>
                <select
                  name="bank_name"
                  value={editForm.bank_name}
                  onChange={handleEditChange}
                >
                  <option value="">Select bank</option>
                  <option value="Maybank">Maybank</option>
                  <option value="CIMB Bank">CIMB Bank</option>
                  <option value="Public Bank">Public Bank</option>
                  <option value="RHB Bank">RHB Bank</option>
                  <option value="Hong Leong Bank">Hong Leong Bank</option>
                  <option value="AmBank">AmBank</option>
                  <option value="Bank Islam">Bank Islam</option>
                  <option value="Bank Rakyat">Bank Rakyat</option>
                  <option value="OCBC Bank">OCBC Bank</option>
                  <option value="HSBC Bank">HSBC Bank</option>
                  <option value="UOB Bank">UOB Bank</option>
                  <option value="Standard Chartered">Standard Chartered</option>
                  <option value="Affin Bank">Affin Bank</option>
                  <option value="Alliance Bank">Alliance Bank</option>
                  <option value="BSN">BSN</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={`form-group ${isFieldMissing('bank_account_no') ? 'missing' : ''}`}>
                <label>Account Number *</label>
                <input
                  type="text"
                  name="bank_account_no"
                  value={editForm.bank_account_no}
                  onChange={handleEditChange}
                  placeholder="Enter account number"
                />
              </div>
              <div className="form-group">
                <label>Account Holder Name</label>
                <input
                  type="text"
                  name="bank_account_holder"
                  value={editForm.bank_account_holder}
                  onChange={handleEditChange}
                  placeholder="Name as per bank account"
                />
              </div>
            </div>
          ) : (
            <div className="info-grid">
              <div className={`info-item ${isFieldMissing('bank_name') ? 'missing' : ''}`}>
                <label>Bank Name</label>
                <span>{profile.bank_name || <em className="empty">Not provided</em>}</span>
                {isProfileComplete && <span className="lock-icon small">&#128274;</span>}
              </div>
              <div className={`info-item ${isFieldMissing('bank_account_no') ? 'missing' : ''}`}>
                <label>Account Number</label>
                <span className="mono">{profile.bank_account_no || <em className="empty">Not provided</em>}</span>
                {isProfileComplete && <span className="lock-icon small">&#128274;</span>}
              </div>
              <div className="info-item">
                <label>Account Holder</label>
                <span>{profile.bank_account_holder || '-'}</span>
                {isProfileComplete && <span className="lock-icon small">&#128274;</span>}
              </div>
            </div>
          )}
        </section>

        {/* Employment Details - Always Read Only */}
        <section className="profile-section">
          <h2>Employment Details</h2>
          <p className="section-note">Contact HR to update employment details</p>
          <div className="info-grid">
            <div className="info-item">
              <label>Employee ID</label>
              <span>{profile.employee_id || '-'}</span>
            </div>
            <div className="info-item">
              <label>{isMimixCompany(profile) ? 'Outlet' : 'Department'}</label>
              <span>{isMimixCompany(profile) ? profile.outlet_name : profile.department_name || '-'}</span>
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
