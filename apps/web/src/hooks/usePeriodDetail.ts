import { useQuery } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function usePeriodDetail(id: number) {
  return useQuery({
    queryKey: ['period', id],
    queryFn: () => periodApi.getDetail(id),
    staleTime: 10_000,
  });
}
