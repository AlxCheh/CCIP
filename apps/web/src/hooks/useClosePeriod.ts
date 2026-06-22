import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function useClosePeriod(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => periodApi.close(periodId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['period', periodId] });
      void queryClient.invalidateQueries({ queryKey: ['objectDetail'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
