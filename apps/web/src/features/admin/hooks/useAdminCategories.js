import { useState, useCallback } from 'react';
import { useFetch } from '../../../core/hooks/useFetch';
import { axiosClient } from '../../../core/api/axiosClient';

/**
 * Hook to manage categories and statistics
 */
export function useAdminCategories() {
  const { data, error, isLoading, refetch } = useFetch('/admin/categories');
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  const createCategory = useCallback(
    async ({ name, slug, description }) => {
      setIsMutating(true);
      setMutationError(null);
      try {
        const res = await axiosClient.post('/admin/categories', { name, slug, description });
        await refetch();
        return res.data?.data;
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || 'Failed to create category';
        setMutationError(msg);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [refetch]
  );

  const updateCategory = useCallback(
    async (id, { name, slug, description }) => {
      setIsMutating(true);
      setMutationError(null);
      try {
        const res = await axiosClient.patch(`/admin/categories/${id}`, { name, slug, description });
        await refetch();
        return res.data?.data;
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || 'Failed to update category';
        setMutationError(msg);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [refetch]
  );

  const deleteCategory = useCallback(
    async (id) => {
      setIsMutating(true);
      setMutationError(null);
      try {
        const res = await axiosClient.delete(`/admin/categories/${id}`);
        await refetch();
        return res.data?.data;
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || 'Failed to delete category';
        setMutationError(msg);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [refetch]
  );

  const mergeCategories = useCallback(
    async (sourceCategoryId, targetCategoryId) => {
      setIsMutating(true);
      setMutationError(null);
      try {
        const res = await axiosClient.post('/admin/categories/merge', {
          sourceCategoryId,
          targetCategoryId,
        });
        await refetch();
        return res.data?.data;
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || 'Failed to merge categories';
        setMutationError(msg);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [refetch]
  );

  return {
    categories: data?.data || [],
    isLoading,
    error,
    refetch,
    createCategory,
    updateCategory,
    deleteCategory,
    mergeCategories,
    isMutating,
    mutationError,
  };
}
