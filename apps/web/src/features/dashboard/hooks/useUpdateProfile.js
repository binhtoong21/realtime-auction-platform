import { useState, useCallback } from 'react';
import { axiosClient } from '../../../core/api/axiosClient';

/**
 * Hook to update user profile (displayName and/or avatar file via multipart/form-data)
 */
export function useUpdateProfile() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const updateProfile = useCallback(async ({ displayName, avatarFile }) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      if (displayName !== undefined && displayName !== null) {
        formData.append('displayName', displayName);
      }
      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const res = await axiosClient.patch('/users/me', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setData(res.data);
      return res.data?.data?.user;
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to update profile';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    updateProfile,
    isLoading,
    error,
    data,
    reset: () => {
      setData(null);
      setError(null);
    },
  };
}
