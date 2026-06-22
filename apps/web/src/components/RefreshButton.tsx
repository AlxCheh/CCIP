import { useRefreshDashboard } from '../hooks/useRefreshDashboard';

type Props = { className?: string };

export function RefreshButton({ className }: Props) {
  const { mutate, isPending } = useRefreshDashboard();
  return (
    <button className={className} onClick={() => mutate()} disabled={isPending}>
      {isPending ? 'Обновление...' : 'Обновить данные'}
    </button>
  );
}
