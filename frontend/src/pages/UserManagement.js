import React, { useState, useEffect } from 'react';
import { adminUsersApi } from '../api';
import Layout from '../components/Layout';
import './UserManagement.css';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'hr'
  });

  const [passwordForm, setPasswordForm] = useState({
    userId: null,
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchData();
    // Get current user info from localStorage
    const adminInfo = localStorage.getItem('adminInfo');
    if (adminInfo) {
      setCurrentUser(JSON.parse(adminInfo));
    }
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes] = await Promise.all([
        adminUsersApi.getAll(),
        adminUsersApi.getRoles()
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.username) {
      alert('Username is required');
      return;
    }

    if (!editingUser && (!form.password || form.password.length < 6)) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        await adminUsersApi.update(editingUser.id, {
          name: form.name,
          email: form.email,
          role: form.role,
          status: form.status
        });
        alert('User updated successfully');
      } else {
        await adminUsersApi.create(form);
        alert('User created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: '',
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'hr',
      status: user.status || 'active'
    });
    setShowModal(true);
  };

  const handleDelete = async (user) => {
    if (user.role === 'super_admin') {
      alert('Super Admin accounts cannot be deleted');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return;
    }

    try {
      await adminUsersApi.delete(user.id);
      fetchData();
      alert('User deleted successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    try {
      await adminUsersApi.resetPassword(passwordForm.userId, passwordForm.newPassword);
      setShowPasswordModal(false);
      setPasswordForm({ userId: null, newPassword: '', confirmPassword: '' });
      alert('Password reset successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const openPasswordModal = (user) => {
    setPasswordForm({
      userId: user.id,
      userName: user.username,
      newPassword: '',
      confirmPassword: ''
    });
    setShowPasswordModal(true);
  };

  const toggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await adminUsersApi.update(user.id, { status: newStatus });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update status');
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setForm({
      username: '',
      password: '',
      name: '',
      email: '',
      role: 'hr'
    });
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
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
    return colors[role] || '#7a8a9a';
  };

  return (
    <Layout>
    <div className="user-management-page">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Manage admin users and their roles</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + Create User
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{users.length}</span>
          <span className="stat-label">Total Users</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{users.filter(u => u.status === 'active').length}</span>
          <span className="stat-label">Active Users</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{roles.length}</span>
          <span className="stat-label">Roles</span>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={user.status !== 'active' ? 'inactive-row' : ''}>
                  <td>
                    <div className="user-info">
                      <div className="user-avatar" style={{ backgroundColor: getRoleColor(user.role) }}>
                        {(user.name || user.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="user-details">
                        <span className="user-name">{user.name || user.username}</span>
                        <span className="user-username">@{user.username}</span>
                        {user.email && <span className="user-email">{user.email}</span>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="role-badge" style={{ backgroundColor: getRoleColor(user.role) }}>
                      {user.role_display_name || user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${user.status}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="date-cell">{formatDate(user.last_login)}</td>
                  <td className="date-cell">{formatDate(user.created_at)}</td>
                  <td className="actions-cell">
                    <button className="btn-edit" onClick={() => handleEdit(user)}>
                      Edit
                    </button>
                    <button className="btn-password" onClick={() => openPasswordModal(user)}>
                      Reset Password
                    </button>
                    {user.role !== 'super_admin' && (
                      <>
                        <button
                          className={`btn-toggle ${user.status === 'active' ? 'deactivate' : 'activate'}`}
                          onClick={() => toggleStatus(user)}
                        >
                          {user.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn-delete" onClick={() => handleDelete(user)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roles Reference */}
      <div className="roles-section">
        <h3>Role Permissions Reference</h3>
        <div className="roles-grid">
          {roles.map(role => (
            <div key={role.id} className="role-card">
              <div className="role-header" style={{ backgroundColor: getRoleColor(role.name) }}>
                {role.display_name}
              </div>
              <div className="role-body">
                <p>{role.description}</p>
                {role.is_system && <span className="system-badge">System Role</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="Enter username"
                    disabled={editingUser}
                    required
                  />
                </div>

                {!editingUser && (
                  <div className="form-group">
                    <label>Password *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Minimum 6 characters"
                      required
                    />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      required
                    >
                      {roles.map(role => (
                        <option key={role.id} value={role.name}>
                          {role.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editingUser && (
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : (editingUser ? 'Update User' : 'Create User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal password-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reset Password</h2>
              <button className="close-btn" onClick={() => setShowPasswordModal(false)}>×</button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <p className="password-info">
                  Resetting password for: <strong>{passwordForm.userName}</strong>
                </p>

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
                  <label>Confirm Password *</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Resetting...' : 'Reset Password'}
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

export default UserManagement;
