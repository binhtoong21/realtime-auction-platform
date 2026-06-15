import { useFetch } from '../../../core/hooks/useFetch';

export function useCategories() {
  const { data, error, isLoading, refetch } = useFetch('/categories', {}, true);

  const categories = data?.data || [];

  return { categories, isLoading, error, refetch };
}
