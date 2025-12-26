import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { departmentApi, earningsApi } from '../api';

const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  // Shared data that multiple components need
  const [departments, setDepartments] = useState([]);
  const [commissionTypes, setCommissionTypes] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [loading, setLoading] = useState({
    departments: false,
    commissionTypes: false,
    allowanceTypes: false
  });

  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Fetch departments
  const fetchDepartments = useCallback(async (force = false) => {
    if (departments.length > 0 && !force) return departments;

    setLoading(prev => ({ ...prev, departments: true }));
    try {
      const res = await departmentApi.getAll();
      setDepartments(res.data);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch departments:', err);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, departments: false }));
    }
  }, [departments]);

  // Fetch commission types
  const fetchCommissionTypes = useCallback(async (force = false) => {
    if (commissionTypes.length > 0 && !force) return commissionTypes;

    setLoading(prev => ({ ...prev, commissionTypes: true }));
    try {
      const res = await earningsApi.getCommissionTypes();
      setCommissionTypes(res.data);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch commission types:', err);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, commissionTypes: false }));
    }
  }, [commissionTypes]);

  // Fetch allowance types
  const fetchAllowanceTypes = useCallback(async (force = false) => {
    if (allowanceTypes.length > 0 && !force) return allowanceTypes;

    setLoading(prev => ({ ...prev, allowanceTypes: true }));
    try {
      const res = await earningsApi.getAllowanceTypes();
      setAllowanceTypes(res.data);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch allowance types:', err);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, allowanceTypes: false }));
    }
  }, [allowanceTypes]);

  // Notification helpers
  const addNotification = useCallback((notification) => {
    const id = Date.now();
    const newNotification = {
      id,
      type: 'info',
      duration: 5000,
      ...notification
    };
    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration
    if (newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showSuccess = useCallback((message) => {
    return addNotification({ type: 'success', message });
  }, [addNotification]);

  const showError = useCallback((message) => {
    return addNotification({ type: 'error', message, duration: 8000 });
  }, [addNotification]);

  const showWarning = useCallback((message) => {
    return addNotification({ type: 'warning', message });
  }, [addNotification]);

  const showInfo = useCallback((message) => {
    return addNotification({ type: 'info', message });
  }, [addNotification]);

  // Clear all cached data (useful on logout or company change)
  const clearCache = useCallback(() => {
    setDepartments([]);
    setCommissionTypes([]);
    setAllowanceTypes([]);
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const value = {
    // Data
    departments,
    commissionTypes,
    allowanceTypes,
    loading,

    // Data fetchers
    fetchDepartments,
    fetchCommissionTypes,
    fetchAllowanceTypes,
    clearCache,

    // UI State
    sidebarCollapsed,
    toggleSidebar,

    // Notifications
    notifications,
    addNotification,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;
