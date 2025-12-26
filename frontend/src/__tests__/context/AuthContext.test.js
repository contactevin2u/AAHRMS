import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { authApi, adminUsersApi } from '../../api';

// Mock the API
jest.mock('../../api', () => ({
  authApi: {
    login: jest.fn()
  },
  adminUsersApi: {
    getProfile: jest.fn(),
    getPermissions: jest.fn()
  }
}));

const wrapper = ({ children }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside provider', () => {
      const { result } = renderHook(() => {
        try {
          return useAuth();
        } catch (error) {
          return { error: error.message };
        }
      });

      expect(result.current.error).toBe('useAuth must be used within an AuthProvider');
    });

    it('should provide initial state', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.permissions).toEqual([]);
    });

    it('should login successfully', async () => {
      const mockUser = { id: 1, username: 'admin', role: 'hr' };
      const mockToken = 'test-token';
      const mockPermissions = ['employees', 'payroll'];

      authApi.login.mockResolvedValue({
        data: { token: mockToken, user: mockUser }
      });
      adminUsersApi.getPermissions.mockResolvedValue({
        data: { permissions: mockPermissions }
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.login('admin', 'password');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.permissions).toEqual(mockPermissions);
      expect(localStorage.setItem).toHaveBeenCalledWith('adminToken', mockToken);
    });

    it('should handle login failure', async () => {
      authApi.login.mockRejectedValue({
        response: { data: { error: 'Invalid credentials' } }
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.login('admin', 'wrong-password');
        })
      ).rejects.toThrow('Invalid credentials');

      expect(result.current.error).toBe('Invalid credentials');
    });

    it('should logout correctly', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.permissions).toEqual([]);
      expect(localStorage.removeItem).toHaveBeenCalledWith('adminToken');
    });

    it('should check permissions correctly', async () => {
      const mockUser = { id: 1, username: 'admin', role: 'hr' };
      const mockPermissions = ['employees', 'payroll'];

      authApi.login.mockResolvedValue({
        data: { token: 'token', user: mockUser }
      });
      adminUsersApi.getPermissions.mockResolvedValue({
        data: { permissions: mockPermissions }
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.login('admin', 'password');
      });

      expect(result.current.hasPermission('employees')).toBe(true);
      expect(result.current.hasPermission('settings')).toBe(false);
    });

    it('should grant all permissions to super_admin', async () => {
      const mockUser = { id: 1, username: 'super', role: 'super_admin' };

      authApi.login.mockResolvedValue({
        data: { token: 'token', user: mockUser }
      });
      adminUsersApi.getPermissions.mockResolvedValue({
        data: { permissions: [] }
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.login('super', 'password');
      });

      expect(result.current.hasPermission('anything')).toBe(true);
    });

    it('should check role correctly', async () => {
      const mockUser = { id: 1, username: 'admin', role: 'hr' };

      authApi.login.mockResolvedValue({
        data: { token: 'token', user: mockUser }
      });
      adminUsersApi.getPermissions.mockResolvedValue({
        data: { permissions: [] }
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.login('admin', 'password');
      });

      expect(result.current.hasRole('hr')).toBe(true);
      expect(result.current.hasRole('manager')).toBe(false);
      expect(result.current.hasRole(['hr', 'manager'])).toBe(true);
    });
  });
});
