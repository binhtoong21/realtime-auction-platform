import { useFetch } from '../../../core/hooks/useFetch';

/** 
 * Hook for fetching the list of auction categories. 
 * @returns {{ categories: Array, isLoading: boolean, error: any, refetch: Function }} The categories and fetch state.
 */
export function useCategories() {
  const { data, error, isLoading, refetch } = useFetch('/categories', {}, true);

  const categories = data?.data || [];

  return { categories, isLoading, error, refetch };
}
