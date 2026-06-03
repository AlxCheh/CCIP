import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaleBanner } from '../StaleBanner';
import { ProgressBar } from '../ProgressBar';
import { EmptyCell } from '../EmptyCell';
import { RefreshButton } from '../RefreshButton';
import { AppShell } from '../AppShell';
import { useRefreshDashboard } from '../../hooks/useRefreshDashboard';

vi.mock('../../hooks/useRefreshDashboard', () => ({
  useRefreshDashboard: vi.fn(),
}));

function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders sidebar brand and nav links', () => {
    renderWithProviders(<AppShell />, { route: '/dashboard' });
    expect(screen.getByText('CCIP')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Дашборд/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Объекты/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Периоды/i })).toBeInTheDocument();
  });

  it('marks dashboard link active on /dashboard route', () => {
    renderWithProviders(<AppShell />, { route: '/dashboard' });
    const link = screen.getByRole('link', { name: /Дашборд/i });
    // NavLink сам ставит aria-current="page" на активной ссылке — семантика, не имя класса.
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});

describe('StaleBanner', () => {
  it('renders nothing when not stale', () => {
    const { container } = render(
      <StaleBanner meta={{ isStale: false, refreshedAt: null, staleReason: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the warning when stale', () => {
    render(
      <StaleBanner
        meta={{ isStale: true, refreshedAt: new Date().toISOString(), staleReason: 'older_than_30min' }}
      />,
    );
    expect(screen.getByText(/обратитесь к администратору/)).toBeInTheDocument();
  });

  it('shows an hours-ago age when older than an hour', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(
      <StaleBanner meta={{ isStale: true, refreshedAt: twoHoursAgo, staleReason: 'older_than_30min' }} />,
    );
    expect(screen.getByText(/2 ч назад/)).toBeInTheDocument();
  });

  it('shows fallback age text when stale with no refreshedAt', () => {
    render(
      <StaleBanner meta={{ isStale: true, refreshedAt: null, staleReason: 'mv_refresh_failed' }} />,
    );
    expect(screen.getByText(/неизвестно когда/)).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  it('renders a dash when value is null', () => {
    render(<ProgressBar value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the percentage with one decimal', () => {
    render(<ProgressBar value={42.5} />);
    expect(screen.getByText('42.5%')).toBeInTheDocument();
  });

  it('clamps values above 100', () => {
    render(<ProgressBar value={150} />);
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});

describe('EmptyCell', () => {
  it.each([null, undefined, ''])('renders a dash for %p', (value) => {
    render(<EmptyCell value={value} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the value when present', () => {
    render(<EmptyCell value="2026-06-01" />);
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
  });
});

describe('RefreshButton', () => {
  it('renders the idle label and calls mutate on click', async () => {
    const mutate = vi.fn();
    vi.mocked(useRefreshDashboard).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useRefreshDashboard>);
    render(<RefreshButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Обновить данные' }));
    expect(mutate).toHaveBeenCalled();
  });

  it('renders the pending label and is disabled while pending', () => {
    vi.mocked(useRefreshDashboard).mockReturnValue({ mutate: vi.fn(), isPending: true } as unknown as ReturnType<typeof useRefreshDashboard>);
    render(<RefreshButton />);
    expect(screen.getByRole('button', { name: 'Обновление...' })).toBeDisabled();
  });
});
