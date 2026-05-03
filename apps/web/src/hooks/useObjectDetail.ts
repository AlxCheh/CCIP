import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '../services/api';

export function useObjectDetail(id: number) {
  return useQuery({
    queryKey: ['objectDetail', id],
    queryFn: () => objectsApi.detail(id),
    staleTime: 30_000,
  });
}
