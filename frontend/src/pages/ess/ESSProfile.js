import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import { isMimixCompany } from '../../utils/permissions';
import { useLanguage } from '../../contexts/LanguageContext';
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

// Field labels keys for display - will be translated
const FIELD_LABEL_KEYS = {
  name: 'profile.fields.fullName',
  ic_number: 'profile.fields.icNumber',
  date_of_birth: 'profile.fields.dateOfBirth',
  phone: 'profile.fields.phone',
  address: 'profile.fields.address',
  email: 'profile.fields.email',
  bank_name: 'profile.fields.bankName',
  bank_account_no: 'profile.fields.accountNumber',
  bank_account_holder: 'profile.fields.accountHolder',
  epf_number: 'profile.fields.epfNumber',
  socso_number: 'profile.fields.socsoNumber',
  tax_number: 'profile.fields.taxNumber',
  marital_status: 'profile.fields.maritalStatus',
  spouse_working: 'profile.fields.spouseWorking',
  children_count: 'profile.fields.childrenCount'
};

function ESSProfile() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
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
    return new Date(date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
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

  // Get translated field label
  const getFieldLabel = (field) => {
    const key = FIELD_LABEL_KEYS[field];
    return key ? t(key) : field;
  };

  if (loading) {
    return (
      <ESSLayout>
        <div className="ess-loading">
          <div className="spinner"></div>
          <p>{t('profile.loading')}</p>
        </div>
      </ESSLayout>
    );
  }

  if (error) {
    return (
      <ESSLayout>
        <div className="ess-error">
          <p>{error}</p>
          <button onClick={fetchProfile}>{t('common.tryAgain')}</button>
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
              {profile.profile_picture ? t('profile.changePhoto') : t('profile.addPhoto')}
            </button>
            {profile.profile_picture && (
              <button
                className="remove-photo-btn"
                onClick={handleDeletePicture}
                disabled={uploadingPicture}
              >
                {t('profile.removePhoto')}
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
                <h3>{t('profile.avatar.chooseTitle')}</h3>
                <button className="close-btn" onClick={() => setShowAvatarPicker(false)}>&times;</button>
              </div>

              <div className="avatar-picker-section">
                <h4>{t('profile.avatar.mixueAvatars')}</h4>
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
                <span>{t('common.or')}</span>
              </div>

              <div className="avatar-picker-section">
                <h4>{t('profile.avatar.uploadOwn')}</h4>
                <button
                  className="upload-photo-btn"
                  onClick={() => {
                    setShowAvatarPicker(false);
                    fileInputRef.current?.click();
                  }}
                >
                  {t('profile.avatar.chooseFromGallery')}
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
            <span>{t('profile.quickLinks.viewPayslips')}</span>
          </button>
          <button
            className="quick-link-btn"
            onClick={() => navigate('/ess/change-password')}
          >
            <span className="quick-link-icon">🔐</span>
            <span>{t('profile.quickLinks.changePassword')}</span>
          </button>
        </div>

        {/* Login Settings Section */}
        <section className="profile-section" style={{ marginTop: '16px' }}>
          <div className="section-header">
            <h2>{t('profile.loginSettings.title')}</h2>
          </div>
          <p className="section-note" style={{ marginBottom: '12px' }}>
            {t('profile.loginSettings.hint')}
          </p>
          {isEditing ? (
            <div className="edit-form">
              <div className="form-group">
                <label>{t('profile.loginSettings.username')}</label>
                <input
                  type="text"
                  name="username"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  placeholder={t('profile.loginSettings.usernamePlaceholder')}
                  maxLength={30}
                  style={{ textTransform: 'lowercase' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px' }}>
                  {t('profile.loginSettings.usernameHint')}
                </small>
              </div>
            </div>
          ) : (
            <div className="info-grid">
              <div className="info-item">
                <label>{t('profile.loginSettings.username')}</label>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                  {profile.username || <em className="empty">{t('profile.notSet')}</em>}
                </span>
              </div>
              <div className="info-item">
                <label>{t('profile.fields.employeeId')}</label>
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
                <h3>{t('profile.completion.title')}</h3>
                <p>{t('profile.completion.message')}</p>
                {profileStatus?.deadline && (
                  <p className="deadline">
                    {t('profile.completion.deadline')}: {formatDate(profileStatus.deadline)}
                  </p>
                )}
              </div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }}></div>
            </div>
            <div className="progress-text">
              {t('profile.completion.progress', { filled: progress.filled, total: progress.total, percent: progress.percent })}
            </div>
            {profileStatus?.missing_fields?.length > 0 && (
              <div className="missing-fields">
                <strong>{t('profile.completion.missing')}:</strong> {profileStatus.missing_fields.map(f => getFieldLabel(f)).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Profile Verified Badge */}
        {isProfileComplete && (
          <div className="profile-verified-banner">
            <span className="verified-icon">&#10003;</span>
            <span>{t('profile.verified')}</span>
            {profile.profile_completed_at && (
              <span className="verified-date">
                {t('profile.completedOn')} {formatDate(profile.profile_completed_at)}
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
            <h2>{t('profile.personalInfo.title')}</h2>
            {!isEditing ? (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>
                {isProfileComplete ? t('common.edit') : t('profile.completeProfile')}
              </button>
            ) : (
              <div className="edit-actions">
                <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
                  {t('common.cancel')}
                </button>
                <button className="save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            )}
          </div>

          {isProfileComplete && !isEditing && (
            <p className="section-note">{t('profile.personalInfo.editNote')}</p>
          )}

          {isEditing ? (
            <div className="edit-form">
              {/* Name */}
              <div className={`form-group ${isFieldMissing('name') ? 'missing' : ''}`}>
                <label>{t('profile.fields.fullName')} *</label>
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
                <label>{t('profile.fields.dateOfBirthFromIC')}</label>
                <div className="locked-field">
                  <span>{extractDOBFromIC(profile.ic_number) ? formatDate(extractDOBFromIC(profile.ic_number)) : '-'}</span>
                  <span className="lock-icon">&#128274;</span>
                </div>
              </div>

              {/* Phone */}
              <div className={`form-group ${isFieldMissing('phone') ? 'missing' : ''}`}>
                <label>{t('profile.fields.phone')} *</label>
                <input
                  type="tel"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                />
              </div>

              {/* Email */}
              <div className="form-group">
                <label>{t('profile.fields.email')}</label>
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
                <label>{t('profile.fields.address')} *</label>
                <textarea
                  name="address"
                  value={editForm.address}
                  onChange={handleEditChange}
                  rows={3}
                />
              </div>

              {/* Marital Status */}
              <div className="form-group">
                <label>{t('profile.fields.maritalStatus')}</label>
                {isFieldEditable('marital_status') ? (
                  <select
                    name="marital_status"
                    value={editForm.marital_status}
                    onChange={handleEditChange}
                  >
                    <option value="single">{t('profile.maritalOptions.single')}</option>
                    <option value="married">{t('profile.maritalOptions.married')}</option>
                    <option value="divorced">{t('profile.maritalOptions.divorced')}</option>
                    <option value="widowed">{t('profile.maritalOptions.widowed')}</option>
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
                    <label>{t('profile.fields.spouseWorking')}</label>
                    {isFieldEditable('spouse_working') ? (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="spouse_working"
                          checked={editForm.spouse_working}
                          onChange={handleEditChange}
                        />
                        {t('profile.spouseWorkingYes')}
                      </label>
                    ) : (
                      <div className="locked-field">
                        <span>{profile.spouse_working ? t('common.yes') : t('common.no')}</span>
                        <span className="lock-icon">&#128274;</span>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>{t('profile.fields.childrenCount')}</label>
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
                <label>{t('profile.fields.fullName')}</label>
                <span>{profile.name || <em className="empty">{t('profile.notProvided')}</em>}</span>
              </div>
              <div className="info-item">
                <label>{t('profile.fields.icNumber')}</label>
                <span>{profile.ic_number || '-'}</span>
              </div>
              <div className="info-item">
                <label>{t('profile.fields.dateOfBirthFromIC')}</label>
                <span>{extractDOBFromIC(profile.ic_number) ? formatDate(extractDOBFromIC(profile.ic_number)) : '-'}</span>
              </div>
              <div className="info-item">
                <label>{t('profile.fields.email')}</label>
                <span>{profile.email || '-'}</span>
              </div>
              <div className={`info-item ${isFieldMissing('phone') ? 'missing' : ''}`}>
                <label>{t('profile.fields.phone')}</label>
                <span>{profile.phone || <em className="empty">{t('profile.notProvided')}</em>}</span>
              </div>
              <div className="info-item">
                <label>{t('profile.fields.maritalStatus')}</label>
                <span className="capitalize">{profile.marital_status || '-'}</span>
              </div>
              {profile.marital_status === 'married' && (
                <>
                  <div className="info-item">
                    <label>{t('profile.fields.spouseWorking')}</label>
                    <span>{profile.spouse_working ? t('common.yes') : t('common.no')}</span>
                  </div>
                  <div className="info-item">
                    <label>{t('profile.fields.children')}</label>
                    <span>{profile.children_count ?? '-'}</span>
                  </div>
                </>
              )}
              <div className={`info-item full-width ${isFieldMissing('address') ? 'missing' : ''}`}>
                <label>{t('profile.fields.address')}</label>
                <span>{profile.address || <em className="empty">{t('profile.notProvided')}</em>}</span>
              </div>
            </div>
          )}
        </section>

        {/* Bank & Payment Information */}
        <section className="profile-section">
          <div className="section-header">
            <h2>{t('profile.bankInfo.title')}</h2>
            {!isProfileComplete && !isEditing && (
              <button className="edit-btn small" onClick={() => setIsEditing(true)}>
                {t('common.edit')}
              </button>
            )}
          </div>
          {isProfileComplete && (
            <p className="section-note">{t('profile.bankInfo.contactHR')}</p>
          )}

          {isEditing && !isProfileComplete ? (
            <div className="edit-form">
              <div className={`form-group ${isFieldMissing('bank_name') ? 'missing' : ''}`}>
                <label>{t('profile.fields.bankName')} *</label>
                <select
                  name="bank_name"
                  value={editForm.bank_name}
                  onChange={handleEditChange}
                >
                  <option value="">{t('profile.bankInfo.selectBank')}</option>
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
                  <option value="Other">{t('common.other')}</option>
                </select>
              </div>
              <div className={`form-group ${isFieldMissing('bank_account_no') ? 'missing' : ''}`}>
                <label>{t('profile.fields.accountNumber')} *</label>
                <input
                  type="text"
                  name="bank_account_no"
                  value={editForm.bank_account_no}
                  onChange={handleEditChange}
                  placeholder={t('profile.bankInfo.enterAccountNumber')}
                />
              </div>
              <div className="form-group">
                <label>{t('profile.fields.accountHolder')}</label>
                <input
                  type="text"
                  name="bank_account_holder"
                  value={editForm.bank_account_holder}
                  onChange={handleEditChange}
                  placeholder={t('profile.bankInfo.nameAsPerAccount')}
                />
              </div>
            </div>
          ) : (
            <div className="info-grid">
              <div className={`info-item ${isFieldMissing('bank_name') ? 'missing' : ''}`}>
                <label>{t('profile.fields.bankName')}</label>
                <span>{profile.bank_name || <em className="empty">{t('profile.notProvided')}</em>}</span>
                {isProfileComplete && <span className="lock-icon small">&#128274;</span>}
              </div>
              <div className={`info-item ${isFieldMissing('bank_account_no') ? 'missing' : ''}`}>
                <label>{t('profile.fields.accountNumber')}</label>
                <span className="mono">{profile.bank_account_no || <em className="empty">{t('profile.notProvided')}</em>}</span>
                {isProfileComplete && <span className="lock-icon small">&#128274;</span>}
              </div>
              <div className="info-item">
                <label>{t('profile.fields.accountHolder')}</label>
                <span>{profile.bank_account_holder || '-'}</span>
                {isProfileComplete && <span className="lock-icon small">&#128274;</span>}
              </div>
            </div>
          )}
        </section>

        {/* Employment Details - Always Read Only */}
        <section className="profile-section">
          <h2>{t('profile.employment.title')}</h2>
          <p className="section-note">{t('profile.employment.contactHR')}</p>
          <div className="info-grid">
            <div className="info-item">
              <label>{t('profile.fields.employeeId')}</label>
              <span>{profile.employee_id || '-'}</span>
            </div>
            <div className="info-item">
              <label>{isMimixCompany(profile) ? t('profile.fields.outlet') : t('profile.fields.department')}</label>
              <span>{isMimixCompany(profile) ? profile.outlet_name : profile.department_name || '-'}</span>
            </div>
            <div className="info-item">
              <label>{t('profile.fields.position')}</label>
              <span>{profile.position || '-'}</span>
            </div>
            <div className="info-item">
              <label>{t('profile.fields.employmentType')}</label>
              <span className="capitalize">{profile.employment_type || '-'}</span>
            </div>
            <div className="info-item">
              <label>{t('profile.fields.joinDate')}</label>
              <span>{formatDate(profile.join_date)}</span>
            </div>
            <div className="info-item">
              <label>{t('profile.fields.status')}</label>
              {getStatusBadge(profile.status)}
            </div>
            <div className="info-item">
              <label>{t('profile.fields.probationStatus')}</label>
              {getProbationBadge(profile.probation_status)}
            </div>
            {profile.probation_end_date && (
              <div className="info-item">
                <label>{t('profile.fields.probationEndDate')}</label>
                <span>{formatDate(profile.probation_end_date)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Last Login */}
        <div className="profile-footer">
          <p>{t('profile.lastLogin')}: {profile.last_login ? formatDate(profile.last_login) : t('common.never')}</p>
        </div>
      </div>
    </ESSLayout>
  );
}

export default ESSProfile;
