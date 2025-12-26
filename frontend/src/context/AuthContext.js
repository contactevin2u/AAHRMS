import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, adminUsersApi } from '../api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user from token on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('adminToken');
      if (token) {
        try {
          // Fetch user profile and permissions
          const [profileRes, permissionsRes] = await Promise.all([
            adminUsersApi.getProfile(),
            adminUsersApi.getPermissions()
          ]);
          setUser(profileRes.data);
          setPermissions(permissionsRes.data.permissions || []);
        } catch (err) {
          console.error('Failed to load user:', err);
          localStorage.removeItem('adminToken');
          setUser(null);
          setPermissions([]);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (username, password) => {
    setError(null);
    try {
      const res = await authApi.login({ username, password });
      localStorage.setItem('adminToken', res.data.token);
      setUser(res.data.user);

      // Fetch permissions after login
      const permRes = await adminUsersApi.getPermissions();
      setPermissions(permRes.data.permissions || []);

      return res.data;
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('adminToken');
    setUser(null);
    setPermissions([]);
    setError(null);
  }, []);

  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return permissions.includes(permission);
  }, [user, permissions]);

  const hasRole = useCallback((roles) => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const profileRes = await adminUsersApi.getProfile();
      setUser(profileRes.data);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  }, []);

  const value = {
    user,
    permissions,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    hasPermission,
    hasRole,
    refreshUser,
    setError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
