import React, { useState, useEffect } from 'react';
import { adminUsersApi } from '../api';
import Layout from '../components/Layout';
import './RoleManagement.css';

function RoleManagement() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    display_name: '',
    description: '',
    permissions: {}
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rolesRes, permsRes] = await Promise.all([
        adminUsersApi.getRoles(),
        adminUsersApi.getPermissionsList()
      ]);
      setRoles(rolesRes.data);
      setPermissions(permsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error.response?.status === 403) {
        alert('You do not have permission to access Role Management');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.display_name) {
      alert('Display name is required');
      return;
    }

    if (!editingRole && !form.name) {
      alert('Role name is required');
      return;
    }

    setSubmitting(true);
    try {
      if (editingRole) {
        await adminUsersApi.updateRole(editingRole.id, {
          display_name: form.display_name,
          description: form.description,
          permissions: form.permissions
        });
        alert('Role updated successfully');
      } else {
        await adminUsersApi.createRole(form);
        alert('Role created successfully');
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

  const handleEdit = (role) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      display_name: role.display_name,
      description: role.description || '',
      permissions: role.permissions || {}
    });
    setShowModal(true);
  };

  const handleDelete = async (role) => {
    if (role.is_system) {
      alert('System roles cannot be deleted');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete role "${role.display_name}"?`)) {
      return;
    }

    try {
      await adminUsersApi.deleteRole(role.id);
      fetchData();
      alert('Role deleted successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete role');
    }
  };

  const resetForm = () => {
    setEditingRole(null);
    setForm({
      name: '',
      display_name: '',
      description: '',
      permissions: {}
    });
  };

  const togglePermission = (key) => {
    setForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const toggleAllPermissions = () => {
    const allEnabled = permissions.every(p => form.permissions[p.key]);
    const newPerms = {};
    permissions.forEach(p => {
      newPerms[p.key] = !allEnabled;
    });
    setForm(prev => ({ ...prev, permissions: newPerms }));
  };

  const getEnabledPermissions = (rolePermissions) => {
    if (!rolePermissions) return [];
    if (rolePermissions.all) return ['Full Access'];
    return Object.entries(rolePermissions)
      .filter(([_, value]) => value === true)
      .map(([key]) => {
        const perm = permissions.find(p => p.key === key);
        return perm ? perm.label : key;
      });
  };

  const getRoleColor = (roleName) => {
    const colors = {
      super_admin: '#8B4513',
      boss: '#c0392b',
      director: '#2980b9',
      hr: '#27ae60',
      manager: '#e67e22',
      viewer: '#7a8a9a'
    };
    return colors[roleName] || '#6c757d';
  };

  return (
    <Layout>
      <div className="role-management-page">
        <div className="page-header">
          <div>
            <h1>Role Management</h1>
            <p>Manage roles and their permissions (Super Admin only)</p>
          </div>
          <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
            + Create Role
          </button>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-value">{roles.length}</span>
            <span className="stat-label">Total Roles</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{roles.filter(r => r.is_system).length}</span>
            <span className="stat-label">System Roles</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{roles.filter(r => !r.is_system).length}</span>
            <span className="stat-label">Custom Roles</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{permissions.length}</span>
            <span className="stat-label">Permissions</span>
          </div>
        </div>

        {/* Roles Grid */}
        {loading ? (
          <div className="loading">Loading roles...</div>
        ) : (
          <div className="roles-grid">
            {roles.map(role => (
              <div key={role.id} className={`role-card ${role.is_system ? 'system' : 'custom'}`}>
                <div className="role-card-header" style={{ backgroundColor: getRoleColor(role.name) }}>
                  <h3>{role.display_name}</h3>
                  {role.is_system && <span className="system-badge">System</span>}
                </div>
                <div className="role-card-body">
                  <p className="role-description">{role.description || 'No description'}</p>

                  <div className="permissions-preview">
                    <strong>Permissions:</strong>
                    <div className="permission-tags">
                      {getEnabledPermissions(role.permissions).slice(0, 5).map((perm, idx) => (
                        <span key={idx} className="permission-tag">{perm}</span>
                      ))}
                      {getEnabledPermissions(role.permissions).length > 5 && (
                        <span className="permission-tag more">
                          +{getEnabledPermissions(role.permissions).length - 5} more
                        </span>
                      )}
                      {getEnabledPermissions(role.permissions).length === 0 && (
                        <span className="no-permissions">No permissions assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="role-meta">
                    <span>ID: {role.name}</span>
                  </div>
                </div>
                <div className="role-card-actions">
                  <button className="btn-edit" onClick={() => handleEdit(role)}>
                    Edit Permissions
                  </button>
                  {!role.is_system && (
                    <button className="btn-delete" onClick={() => handleDelete(role)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Permissions Reference */}
        <div className="permissions-section">
          <h3>Available Permissions</h3>
          <div className="permissions-grid">
            {permissions.map(perm => (
              <div key={perm.key} className="permission-item">
                <span className="perm-key">{perm.key}</span>
                <span className="perm-label">{perm.label}</span>
                <span className="perm-desc">{perm.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Create/Edit Role Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal role-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingRole ? `Edit Role: ${editingRole.display_name}` : 'Create New Role'}</h2>
                <button className="close-btn" onClick={() => setShowModal(false)}>x</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {!editingRole && (
                    <div className="form-group">
                      <label>Role Name (ID) *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                        placeholder="e.g., team_lead"
                        required
                      />
                      <small>Lowercase letters, numbers, and underscores only</small>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Display Name *</label>
                    <input
                      type="text"
                      value={form.display_name}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      placeholder="e.g., Team Lead"
                      disabled={editingRole?.is_system}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe what this role can do..."
                      rows={2}
                      disabled={editingRole?.is_system}
                    />
                  </div>

                  <div className="form-group permissions-group">
                    <div className="permissions-header">
                      <label>Permissions</label>
                      <button
                        type="button"
                        className="btn-toggle-all"
                        onClick={toggleAllPermissions}
                      >
                        Toggle All
                      </button>
                    </div>
                    <div className="permissions-checkboxes">
                      {permissions.map(perm => (
                        <label key={perm.key} className="permission-checkbox">
                          <input
                            type="checkbox"
                            checked={form.permissions[perm.key] || false}
                            onChange={() => togglePermission(perm.key)}
                          />
                          <span className="checkbox-label">
                            <strong>{perm.label}</strong>
                            <small>{perm.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit" disabled={submitting}>
                    {submitting ? 'Saving...' : (editingRole ? 'Update Role' : 'Create Role')}
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

export default RoleManagement;
