import { useState, useCallback } from 'react';
import { axiosClient } from '../../../core/api/axiosClient';

/**
 * Hook to execute administrative user management actions
 */
export function useAdminUserActions() {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  const banUser = useCallback(async (userId, reason) => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const res = await axiosClient.post(`/admin/users/${userId}/ban`, { reason });
      return res.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to ban user';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const suspendUser = useCallback(async (userId, reason) => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const res = await axiosClient.post(`/admin/users/${userId}/suspend`, { reason });
      return res.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to suspend user';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const reactivateUser = useCallback(async (userId) => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const res = await axiosClient.post(`/admin/users/${userId}/reactivate`);
      return res.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to reactivate user';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const overrideKyc = useCallback(async (userId, note = '') => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const res = await axiosClient.post(`/admin/users/${userId}/kyc-override`, { note });
      return res.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to override KYC';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const fetchUserDetail = useCallback(async (userId) => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const res = await axiosClient.get(`/admin/users/${userId}`);
      return res.data?.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to fetch user details';
      setActionError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  return {
    banUser,
    suspendUser,
    reactivateUser,
    overrideKyc,
    fetchUserDetail,
    isActionLoading,
    actionError,
  };
}
