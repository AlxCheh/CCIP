import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function useUpsertFact(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boqItemId, scVolume }: { boqItemId: number; scVolume: number }) =>
      periodApi.upsertFact(periodId, boqItemId, scVolume),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['period', periodId] });
    },
  });
}
