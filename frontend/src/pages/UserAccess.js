import React, { useState, useEffect, useCallback } from 'react';
import { adminUsersApi, employeeApi } from '../api';
import Layout from '../components/Layout';
import './UserAccess.css';

function UserAccess() {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  // Users state
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '', password: '', name: '', email: '', role: 'hr', status: 'active'
  });
  const [passwordForm, setPasswordForm] = useState({
    userId: null, userName: '', newPassword: '', confirmPassword: ''
  });

  // Roles state
  const [permissions, setPermissions] = useState([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    name: '', display_name: '', description: '', permissions: {}
  });

  // Password Status state
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const adminInfo = localStorage.getItem('adminInfo');
    if (adminInfo) setCurrentUser(JSON.parse(adminInfo));
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes, permsRes] = await Promise.all([
        adminUsersApi.getAll(),
        adminUsersApi.getRoles(),
        adminUsersApi.getPermissionsList().catch(() => ({ data: [] }))
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setPermissions(permsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ========== USER FUNCTIONS ==========
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    if (!userForm.username) { alert('Username is required'); return; }
    if (!editingUser && (!userForm.password || userForm.password.length < 6)) {
      alert('Password must be at least 6 characters'); return;
    }
    setSubmitting(true);
    try {
      if (editingUser) {
        await adminUsersApi.update(editingUser.id, {
          name: userForm.name, email: userForm.email, role: userForm.role, status: userForm.status
        });
        alert('User updated successfully');
      } else {
        await adminUsersApi.create(userForm);
        alert('User created successfully');
      }
      setShowUserModal(false);
      resetUserForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      username: user.username, password: '', name: user.name || '',
      email: user.email || '', role: user.role || 'hr', status: user.status || 'active'
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = async (user) => {
    if (user.role === 'super_admin') { alert('Super Admin accounts cannot be deleted'); return; }
    if (!window.confirm(`Delete user "${user.username}"?`)) return;
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
      alert('Passwords do not match'); return;
    }
    if (passwordForm.newPassword.length < 6) {
      alert('Password must be at least 6 characters'); return;
    }
    setSubmitting(true);
    try {
      await adminUsersApi.resetPassword(passwordForm.userId, passwordForm.newPassword);
      setShowPasswordModal(false);
      setPasswordForm({ userId: null, userName: '', newPassword: '', confirmPassword: '' });
      alert('Password reset successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const openPasswordModal = (user) => {
    setPasswordForm({ userId: user.id, userName: user.username, newPassword: '', confirmPassword: '' });
    setShowPasswordModal(true);
  };

  const toggleUserStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await adminUsersApi.update(user.id, { status: newStatus });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update status');
    }
  };

  const resetUserForm = () => {
    setEditingUser(null);
    setUserForm({ username: '', password: '', name: '', email: '', role: 'hr', status: 'active' });
  };

  // ========== ROLE FUNCTIONS ==========
  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    if (!roleForm.display_name) { alert('Display name is required'); return; }
    if (!editingRole && !roleForm.name) { alert('Role name is required'); return; }
    setSubmitting(true);
    try {
      if (editingRole) {
        await adminUsersApi.updateRole(editingRole.id, {
          display_name: roleForm.display_name, description: roleForm.description, permissions: roleForm.permissions
        });
        alert('Role updated successfully');
      } else {
        await adminUsersApi.createRole(roleForm);
        alert('Role created successfully');
      }
      setShowRoleModal(false);
      resetRoleForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name, display_name: role.display_name,
      description: role.description || '', permissions: role.permissions || {}
    });
    setShowRoleModal(true);
  };

  const handleDeleteRole = async (role) => {
    if (role.is_system) { alert('System roles cannot be deleted'); return; }
    if (!window.confirm(`Delete role "${role.display_name}"?`)) return;
    try {
      await adminUsersApi.deleteRole(role.id);
      fetchData();
      alert('Role deleted successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete role');
    }
  };

  const togglePermission = (key) => {
    setRoleForm(prev => ({
      ...prev, permissions: { ...prev.permissions, [key]: !prev.permissions[key] }
    }));
  };

  const toggleAllPermissions = () => {
    const allEnabled = permissions.every(p => roleForm.permissions[p.key]);
    const newPerms = {};
    permissions.forEach(p => { newPerms[p.key] = !allEnabled; });
    setRoleForm(prev => ({ ...prev, permissions: newPerms }));
  };

  const resetRoleForm = () => {
    setEditingRole(null);
    setRoleForm({ name: '', display_name: '', description: '', permissions: {} });
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

  // ========== PASSWORD STATUS FUNCTIONS ==========
  const fetchPasswordStatus = useCallback(async () => {
    if (!search.trim()) { setEmployees([]); return; }
    setSearchLoading(true);
    setSearchError('');
    try {
      const response = await employeeApi.getPasswordStatus({ search: search.trim() });
      setEmployees(response.data.employees || []);
      if (response.data.employees?.length === 0) {
        setSearchError('No employees found matching your search.');
      }
    } catch (err) {
      setSearchError(err.response?.data?.error || 'Failed to fetch password status');
      setEmployees([]);
    } finally {
      setSearchLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (search) fetchPasswordStatus();
  }, [search, fetchPasswordStatus]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleClearMustChange = async (employeeId, employeeName) => {
    if (!window.confirm(`Clear "must change password" flag for ${employeeName}?`)) return;
    try {
      await employeeApi.resetPassword(employeeId);
      alert(`Password flag cleared for ${employeeName}.`);
      fetchPasswordStatus();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
  };

  // ========== HELPERS ==========
  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-MY', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getRoleColor = (role) => {
    const colors = {
      super_admin: '#1e293b', boss: '#c0392b', director: '#2980b9',
      hr: '#27ae60', manager: '#e67e22', viewer: '#7a8a9a'
    };
    return colors[role] || '#7a8a9a';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Set': return <span className="badge badge-success">Password Set</span>;
      case 'Must Change': return <span className="badge badge-warning">Must Change</span>;
      case 'Not Set': return <span className="badge badge-danger">Not Set</span>;
      default: return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const isSuperAdmin = () => currentUser?.role === 'super_admin';

  return (
    <Layout>
      <div className="user-access-page">
        <div className="page-header">
          <div>
            <h1>Users & Access</h1>
            <p>Manage admin users, roles, and employee passwords</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            Users
          </button>
          {isSuperAdmin() && (
            <button className={`tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>
              Roles
            </button>
          )}
          <button className={`tab ${activeTab === 'passwords' ? 'active' : ''}`} onClick={() => setActiveTab('passwords')}>
            Password Status
          </button>
        </div>

        {/* ========== USERS TAB ========== */}
        {activeTab === 'users' && (
          <div className="tab-content">
            <div className="tab-header">
              <div className="stats-row">
                <div className="stat-card">
                  <span className="stat-value">{users.length}</span>
                  <span className="stat-label">Total Users</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{users.filter(u => u.status === 'active').length}</span>
                  <span className="stat-label">Active Users</span>
                </div>
              </div>
              <button className="btn-primary" onClick={() => { resetUserForm(); setShowUserModal(true); }}>
                + Create User
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading users...</div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
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
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="role-badge" style={{ backgroundColor: getRoleColor(user.role) }}>
                            {user.role_display_name || user.role}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${user.status}`}>{user.status}</span>
                        </td>
                        <td>{formatDate(user.last_login)}</td>
                        <td className="actions-cell">
                          <button className="btn-sm" onClick={() => handleEditUser(user)}>Edit</button>
                          <button className="btn-sm" onClick={() => openPasswordModal(user)}>Reset PW</button>
                          {user.role !== 'super_admin' && (
                            <>
                              <button className={`btn-sm ${user.status === 'active' ? 'warn' : 'success'}`}
                                onClick={() => toggleUserStatus(user)}>
                                {user.status === 'active' ? 'Deactivate' : 'Activate'}
                              </button>
                              <button className="btn-sm danger" onClick={() => handleDeleteUser(user)}>Delete</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========== ROLES TAB ========== */}
        {activeTab === 'roles' && isSuperAdmin() && (
          <div className="tab-content">
            <div className="tab-header">
              <div className="stats-row">
                <div className="stat-card">
                  <span className="stat-value">{roles.length}</span>
                  <span className="stat-label">Total Roles</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{roles.filter(r => r.is_system).length}</span>
                  <span className="stat-label">System Roles</span>
                </div>
              </div>
              <button className="btn-primary" onClick={() => { resetRoleForm(); setShowRoleModal(true); }}>
                + Create Role
              </button>
            </div>

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
                      <p>{role.description || 'No description'}</p>
                      <div className="permission-tags">
                        {getEnabledPermissions(role.permissions).slice(0, 4).map((perm, idx) => (
                          <span key={idx} className="permission-tag">{perm}</span>
                        ))}
                        {getEnabledPermissions(role.permissions).length > 4 && (
                          <span className="permission-tag more">+{getEnabledPermissions(role.permissions).length - 4}</span>
                        )}
                      </div>
                    </div>
                    <div className="role-card-actions">
                      <button className="btn-sm" onClick={() => handleEditRole(role)}>Edit</button>
                      {!role.is_system && (
                        <button className="btn-sm danger" onClick={() => handleDeleteRole(role)}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========== PASSWORD STATUS TAB ========== */}
        {activeTab === 'passwords' && (
          <div className="tab-content">
            <div className="search-section">
              <form onSubmit={handleSearchSubmit} className="search-form">
                <input
                  type="text"
                  placeholder="Search by name, employee ID, or email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="search-input"
                />
                <button type="submit" className="btn-primary" disabled={searchLoading}>
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </form>
            </div>

            {searchError && <div className="error-message">{searchError}</div>}

            {employees.length > 0 && (
              <div className="table-container">
                <div className="results-count">Found {employees.length} employee(s)</div>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Username</th>
                      <th>Company</th>
                      <th>Password Status</th>
                      <th>Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id}>
                        <td>
                          <div className="user-info">
                            <div className="user-details">
                              <span className="user-name">{emp.name}</span>
                              <span className="user-username">{emp.employee_id}</span>
                            </div>
                          </div>
                        </td>
                        <td><code>{emp.email || 'Not set'}</code></td>
                        <td>{emp.company_name || '-'}</td>
                        <td>
                          {getStatusBadge(emp.password_status)}
                          {emp.password_status === 'Must Change' && (
                            <button className="btn-link" onClick={() => handleClearMustChange(emp.id, emp.name)}>
                              Reset
                            </button>
                          )}
                        </td>
                        <td>{formatDate(emp.last_login)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!searchLoading && !search && (
              <div className="empty-state">
                <div className="empty-icon">🔐</div>
                <h3>Search for Employees</h3>
                <p>Enter an employee name, ID, or email to check their password status.</p>
              </div>
            )}
          </div>
        )}

        {/* ========== USER MODAL ========== */}
        {showUserModal && (
          <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
                <button className="close-btn" onClick={() => setShowUserModal(false)}>×</button>
              </div>
              <form onSubmit={handleUserSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Username *</label>
                    <input type="text" value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      disabled={editingUser} required />
                  </div>
                  {!editingUser && (
                    <div className="form-group">
                      <label>Password *</label>
                      <input type="password" value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder="Minimum 6 characters" required />
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input type="text" value={userForm.name}
                        onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Role *</label>
                      <select value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} required>
                        {roles.map(role => (
                          <option key={role.id} value={role.name}>{role.display_name}</option>
                        ))}
                      </select>
                    </div>
                    {editingUser && (
                      <div className="form-group">
                        <label>Status</label>
                        <select value={userForm.status}
                          onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowUserModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit" disabled={submitting}>
                    {submitting ? 'Saving...' : (editingUser ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========== PASSWORD RESET MODAL ========== */}
        {showPasswordModal && (
          <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Reset Password</h2>
                <button className="close-btn" onClick={() => setShowPasswordModal(false)}>×</button>
              </div>
              <form onSubmit={handleResetPassword}>
                <div className="modal-body">
                  <p>Resetting password for: <strong>{passwordForm.userName}</strong></p>
                  <div className="form-group">
                    <label>New Password *</label>
                    <input type="password" value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      placeholder="Minimum 6 characters" required />
                  </div>
                  <div className="form-group">
                    <label>Confirm Password *</label>
                    <input type="password" value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      required />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowPasswordModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit" disabled={submitting}>
                    {submitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========== ROLE MODAL ========== */}
        {showRoleModal && (
          <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
            <div className="modal role-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingRole ? `Edit: ${editingRole.display_name}` : 'Create New Role'}</h2>
                <button className="close-btn" onClick={() => setShowRoleModal(false)}>×</button>
              </div>
              <form onSubmit={handleRoleSubmit}>
                <div className="modal-body">
                  {!editingRole && (
                    <div className="form-group">
                      <label>Role Name (ID) *</label>
                      <input type="text" value={roleForm.name}
                        onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                        placeholder="e.g., team_lead" required />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Display Name *</label>
                    <input type="text" value={roleForm.display_name}
                      onChange={(e) => setRoleForm({ ...roleForm, display_name: e.target.value })}
                      disabled={editingRole?.is_system} required />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      disabled={editingRole?.is_system} rows={2} />
                  </div>
                  <div className="form-group">
                    <div className="permissions-header">
                      <label>Permissions</label>
                      <button type="button" className="btn-link" onClick={toggleAllPermissions}>Toggle All</button>
                    </div>
                    <div className="permissions-checkboxes">
                      {permissions.map(perm => (
                        <label key={perm.key} className="permission-checkbox">
                          <input type="checkbox" checked={roleForm.permissions[perm.key] || false}
                            onChange={() => togglePermission(perm.key)} />
                          <span>{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowRoleModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit" disabled={submitting}>
                    {submitting ? 'Saving...' : (editingRole ? 'Update' : 'Create')}
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

export default UserAccess;
