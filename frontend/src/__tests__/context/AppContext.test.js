import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '../../context/AppContext';
import { departmentApi, earningsApi } from '../../api';

// Mock the API
jest.mock('../../api', () => ({
  departmentApi: {
    getAll: jest.fn()
  },
  earningsApi: {
    getCommissionTypes: jest.fn(),
    getAllowanceTypes: jest.fn()
  }
}));

const wrapper = ({ children }) => (
  <AppProvider>{children}</AppProvider>
);

describe('AppContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useApp hook', () => {
    it('should throw error when used outside provider', () => {
      const { result } = renderHook(() => {
        try {
          return useApp();
        } catch (error) {
          return { error: error.message };
        }
      });

      expect(result.current.error).toBe('useApp must be used within an AppProvider');
    });

    it('should provide initial state', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      expect(result.current.departments).toEqual([]);
      expect(result.current.commissionTypes).toEqual([]);
      expect(result.current.allowanceTypes).toEqual([]);
      expect(result.current.sidebarCollapsed).toBe(false);
      expect(result.current.notifications).toEqual([]);
    });

    it('should fetch departments', async () => {
      const mockDepartments = [
        { id: 1, name: 'Office' },
        { id: 2, name: 'Sales' }
      ];
      departmentApi.getAll.mockResolvedValue({ data: mockDepartments });

      const { result } = renderHook(() => useApp(), { wrapper });

      await act(async () => {
        await result.current.fetchDepartments();
      });

      expect(result.current.departments).toEqual(mockDepartments);
      expect(departmentApi.getAll).toHaveBeenCalledTimes(1);
    });

    it('should cache departments and not refetch', async () => {
      const mockDepartments = [{ id: 1, name: 'Office' }];
      departmentApi.getAll.mockResolvedValue({ data: mockDepartments });

      const { result } = renderHook(() => useApp(), { wrapper });

      await act(async () => {
        await result.current.fetchDepartments();
      });

      await act(async () => {
        await result.current.fetchDepartments(); // Second call
      });

      expect(departmentApi.getAll).toHaveBeenCalledTimes(1);
    });

    it('should force refetch departments', async () => {
      const mockDepartments = [{ id: 1, name: 'Office' }];
      departmentApi.getAll.mockResolvedValue({ data: mockDepartments });

      const { result } = renderHook(() => useApp(), { wrapper });

      await act(async () => {
        await result.current.fetchDepartments();
      });

      await act(async () => {
        await result.current.fetchDepartments(true); // Force refetch
      });

      expect(departmentApi.getAll).toHaveBeenCalledTimes(2);
    });

    it('should toggle sidebar', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      expect(result.current.sidebarCollapsed).toBe(false);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarCollapsed).toBe(true);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarCollapsed).toBe(false);
    });

    it('should add and remove notifications', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useApp(), { wrapper });

      let notificationId;
      act(() => {
        notificationId = result.current.addNotification({
          type: 'success',
          message: 'Test notification',
          duration: 0 // Don't auto-remove
        });
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].message).toBe('Test notification');

      act(() => {
        result.current.removeNotification(notificationId);
      });

      expect(result.current.notifications).toHaveLength(0);
      jest.useRealTimers();
    });

    it('should auto-remove notifications after duration', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.addNotification({
          type: 'info',
          message: 'Auto-remove test',
          duration: 3000
        });
      });

      expect(result.current.notifications).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.notifications).toHaveLength(0);
      jest.useRealTimers();
    });

    it('should show success notification', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.showSuccess('Success message');
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe('success');
      expect(result.current.notifications[0].message).toBe('Success message');
      jest.useRealTimers();
    });

    it('should show error notification with longer duration', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.showError('Error message');
      });

      expect(result.current.notifications[0].type).toBe('error');
      expect(result.current.notifications[0].duration).toBe(8000);
      jest.useRealTimers();
    });

    it('should clear cache', async () => {
      const mockDepartments = [{ id: 1, name: 'Office' }];
      departmentApi.getAll.mockResolvedValue({ data: mockDepartments });

      const { result } = renderHook(() => useApp(), { wrapper });

      await act(async () => {
        await result.current.fetchDepartments();
      });

      expect(result.current.departments).toHaveLength(1);

      act(() => {
        result.current.clearCache();
      });

      expect(result.current.departments).toEqual([]);
    });
  });
});
