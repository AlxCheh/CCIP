import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';

export function useRefreshDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dashboardApi.refreshDashboard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['objectDetail'] });
    },
  });
}
