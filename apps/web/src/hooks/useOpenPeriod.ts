import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function useOpenPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objectId: number) => periodApi.open(objectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['objectDetail'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
