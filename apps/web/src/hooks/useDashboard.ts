import { useQuery } from '@tanstack/react-query';
import { dashboardApi, type DashboardQuery } from '../services/api';

export function useDashboard(params: DashboardQuery) {
  return useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => dashboardApi.list(params),
    staleTime: 30_000,
  });
}
