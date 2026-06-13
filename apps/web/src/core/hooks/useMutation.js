import { useState, useCallback } from 'react';
import { axiosClient } from '../api/axiosClient';

/**
 * Custom hook for data mutation (POST, PUT, PATCH, DELETE)
 * @param {string} url - Base API endpoint
 * @param {string} method - HTTP method ('post', 'put', 'patch', 'delete')
 */
export function useMutation(url, method = 'post') {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const mutate = useCallback(
    async (body = {}, overrideOptions = {}) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await axiosClient({
          method,
          url,
          data: body,
          ...overrideOptions,
        });

        setData(response.data);
        return response.data;
      } catch (err) {
        const errData = err.response?.data;
        const errorMsg = errData?.error?.details?.[0]?.message || errData?.error?.message || errData?.message || err.message || 'An error occurred';
        setError(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [url, method]
  );

  return { mutate, data, error, isLoading, reset: () => { setData(null); setError(null); } };
}
