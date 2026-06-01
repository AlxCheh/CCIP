import { useQuery, useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { gpApi, GpSubmitPayload } from '../services/api';

export function useGpFormData(token: string) {
  return useQuery({
    queryKey: ['gp-form', token],
    queryFn: () => gpApi.getForm(token),
    retry: false,
    staleTime: Infinity,
    enabled: token.length > 0,
  });
}

export function useGpSubmit(token: string) {
  return useMutation({
    mutationFn: (payload: GpSubmitPayload) => gpApi.submit(token, payload),
  });
}

export type GpErrorKind = 'expired' | 'already_submitted' | 'network';

export function getGpError(error: unknown): GpErrorKind {
  if (error instanceof AxiosError) {
    const msg = (error.response?.data as { message?: string })?.message ?? '';
    if (
      error.response?.status === 403 &&
      msg === 'GP_ALREADY_SUBMITTED'
    ) {
      return 'already_submitted';
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return 'expired';
    }
  }
  return 'network';
}
