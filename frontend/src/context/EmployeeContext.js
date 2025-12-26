import React, { createContext, useContext, useState, useCallback, useReducer } from 'react';
import { employeeApi, earningsApi } from '../api';

const EmployeeContext = createContext(null);

export const useEmployees = () => {
  const context = useContext(EmployeeContext);
  if (!context) {
    throw new Error('useEmployees must be used within an EmployeeProvider');
  }
  return context;
};

// Action types
const ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_EMPLOYEES: 'SET_EMPLOYEES',
  SET_STATS: 'SET_STATS',
  SET_ERROR: 'SET_ERROR',
  SET_SELECTED: 'SET_SELECTED',
  CLEAR_SELECTED: 'CLEAR_SELECTED',
  TOGGLE_SELECT: 'TOGGLE_SELECT',
  SELECT_ALL: 'SELECT_ALL'
};

// Reducer for employee state
const employeeReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
    case ACTIONS.SET_EMPLOYEES:
      return { ...state, employees: action.payload, loading: false };
    case ACTIONS.SET_STATS:
      return { ...state, stats: action.payload };
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    case ACTIONS.SET_SELECTED:
      return { ...state, selectedIds: action.payload };
    case ACTIONS.CLEAR_SELECTED:
      return { ...state, selectedIds: [] };
    case ACTIONS.TOGGLE_SELECT:
      return {
        ...state,
        selectedIds: state.selectedIds.includes(action.payload)
          ? state.selectedIds.filter(id => id !== action.payload)
          : [...state.selectedIds, action.payload]
      };
    case ACTIONS.SELECT_ALL:
      return {
        ...state,
        selectedIds: action.payload ? state.employees.map(e => e.id) : []
      };
    default:
      return state;
  }
};

const initialState = {
  employees: [],
  stats: null,
  loading: false,
  error: null,
  selectedIds: []
};

export const EmployeeProvider = ({ children }) => {
  const [state, dispatch] = useReducer(employeeReducer, initialState);

  // Filter state
  const [filters, setFilters] = useState({
    department_id: '',
    status: 'active',
    search: '',
    employment_type: ''
  });

  // Fetch employees with filters
  const fetchEmployees = useCallback(async (customFilters = null) => {
    const appliedFilters = customFilters || filters;
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });

    try {
      const [empRes, statsRes] = await Promise.all([
        employeeApi.getAll(appliedFilters),
        employeeApi.getStats()
      ]);

      dispatch({ type: ACTIONS.SET_EMPLOYEES, payload: empRes.data });
      dispatch({ type: ACTIONS.SET_STATS, payload: statsRes.data });
      return empRes.data;
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to fetch employees';
      dispatch({ type: ACTIONS.SET_ERROR, payload: message });
      throw err;
    }
  }, [filters]);

  // Create employee
  const createEmployee = useCallback(async (employeeData, commissions = [], allowances = []) => {
    try {
      const res = await employeeApi.create(employeeData);
      const employeeId = res.data.id;

      // Save commissions and allowances if provided
      if (employeeId && (commissions.length > 0 || allowances.length > 0)) {
        const validCommissions = commissions.filter(c => c.commission_type_id && c.amount > 0);
        const validAllowances = allowances.filter(a => a.allowance_type_id && a.amount > 0);

        await Promise.all([
          validCommissions.length > 0 ? earningsApi.bulkSaveCommissions(employeeId, validCommissions) : Promise.resolve(),
          validAllowances.length > 0 ? earningsApi.bulkSaveAllowances(employeeId, validAllowances) : Promise.resolve()
        ]);
      }

      return res.data;
    } catch (err) {
      throw err;
    }
  }, []);

  // Update employee
  const updateEmployee = useCallback(async (id, employeeData, commissions = [], allowances = []) => {
    try {
      await employeeApi.update(id, employeeData);

      // Save commissions and allowances
      const validCommissions = commissions.filter(c => c.commission_type_id && c.amount > 0);
      const validAllowances = allowances.filter(a => a.allowance_type_id && a.amount > 0);

      await Promise.all([
        earningsApi.bulkSaveCommissions(id, validCommissions),
        earningsApi.bulkSaveAllowances(id, validAllowances)
      ]);

      return true;
    } catch (err) {
      throw err;
    }
  }, []);

  // Delete (deactivate) employee
  const deleteEmployee = useCallback(async (id) => {
    try {
      await employeeApi.delete(id);
      return true;
    } catch (err) {
      throw err;
    }
  }, []);

  // Bulk operations
  const bulkUpdate = useCallback(async (ids, updates) => {
    try {
      const res = await employeeApi.bulkUpdate(ids, updates);
      dispatch({ type: ACTIONS.CLEAR_SELECTED });
      return res.data;
    } catch (err) {
      throw err;
    }
  }, []);

  const bulkDelete = useCallback(async (ids) => {
    try {
      const res = await employeeApi.bulkDelete(ids);
      dispatch({ type: ACTIONS.CLEAR_SELECTED });
      return res.data;
    } catch (err) {
      throw err;
    }
  }, []);

  const bulkImport = useCallback(async (data) => {
    try {
      const res = await employeeApi.bulkImport(data);
      return res.data;
    } catch (err) {
      throw err;
    }
  }, []);

  // Fetch employee earnings (commissions & allowances)
  const fetchEmployeeEarnings = useCallback(async (employeeId) => {
    try {
      const [commRes, allowRes] = await Promise.all([
        earningsApi.getEmployeeCommissions(employeeId),
        earningsApi.getEmployeeAllowances(employeeId)
      ]);

      return {
        commissions: commRes.data.map(c => ({
          commission_type_id: c.commission_type_id,
          amount: c.amount,
          commission_name: c.commission_name
        })),
        allowances: allowRes.data.map(a => ({
          allowance_type_id: a.allowance_type_id,
          amount: a.amount,
          allowance_name: a.allowance_name
        }))
      };
    } catch (err) {
      console.error('Error fetching employee earnings:', err);
      return { commissions: [], allowances: [] };
    }
  }, []);

  // Selection helpers
  const toggleSelect = useCallback((id) => {
    dispatch({ type: ACTIONS.TOGGLE_SELECT, payload: id });
  }, []);

  const selectAll = useCallback((selected) => {
    dispatch({ type: ACTIONS.SELECT_ALL, payload: selected });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_SELECTED });
  }, []);

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const value = {
    // State
    ...state,
    filters,

    // Actions
    fetchEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    bulkUpdate,
    bulkDelete,
    bulkImport,
    fetchEmployeeEarnings,

    // Selection
    toggleSelect,
    selectAll,
    clearSelection,

    // Filters
    updateFilters,
    setFilters
  };

  return (
    <EmployeeContext.Provider value={value}>
      {children}
    </EmployeeContext.Provider>
  );
};

export default EmployeeContext;
