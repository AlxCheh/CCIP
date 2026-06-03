import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from '../DashboardPage';
import { useDashboard } from '../../hooks/useDashboard';
import type { DashboardResponse } from '../../services/api';

vi.mock('../../hooks/useDashboard', () => ({ useDashboard: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function dataWithRows(): DashboardResponse {
  return {
    items: [
      {
        objectId: 1,
        name: 'Объект А',
        objectClass: null,
        status: 'active',
        hasAnalytics: true,
        objReadinessPct: 50,
        weightedForecastDate: '2026-07-01',
        criticalPathForecastDate: '2026-08-01',
        gapFlag: false,
      },
    ],
    pagination: { page: 1, pageSize: 50, total: 1 },
    meta: { isStale: false, refreshedAt: new Date().toISOString(), staleReason: null },
  };
}

type UseDashboardReturn = ReturnType<typeof useDashboard>;
function mockReturn(over: Partial<UseDashboardReturn>) {
  return { data: undefined, isLoading: false, isError: false, ...over } as unknown as UseDashboardReturn;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders a row from the data', () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: dataWithRows() }));
    render(<DashboardPage />);
    expect(screen.getByText('Объект А')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders the empty-state when there are no items', () => {
    const empty = dataWithRows();
    empty.items = [];
    empty.pagination.total = 0;
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: empty }));
    render(<DashboardPage />);
    expect(screen.getByText('Нет объектов в организации')).toBeInTheDocument();
  });

  it('renders the stale banner when meta.isStale', () => {
    const stale = dataWithRows();
    stale.meta = { isStale: true, refreshedAt: new Date().toISOString(), staleReason: 'mv_refresh_failed' };
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: stale }));
    render(<DashboardPage />);
    expect(screen.getByText(/обратитесь к администратору/)).toBeInTheDocument();
  });

  it('passes the updated sort to useDashboard when the sort select changes', async () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: dataWithRows() }));
    render(<DashboardPage />);
    await userEvent.selectOptions(screen.getByDisplayValue('Сначала с разрывом'), 'nameAsc');
    const lastCall = vi.mocked(useDashboard).mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ sort: 'nameAsc' });
  });

  it('navigates to the object detail page on row click', async () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: dataWithRows() }));
    render(<DashboardPage />);
    await userEvent.click(screen.getByText('Объект А'));
    expect(navigateMock).toHaveBeenCalledWith('/objects/1');
  });

  it('renders the loading state', () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ isLoading: true }));
    render(<DashboardPage />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  it('renders the error state', () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ isError: true }));
    render(<DashboardPage />);
    expect(screen.getByText('Ошибка загрузки данных.')).toBeInTheDocument();
  });

  it('renders dashes for analytics columns when hasAnalytics is false', () => {
    const data = dataWithRows();
    data.items[0] = { ...data.items[0], hasAnalytics: false };
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data }));
    render(<DashboardPage />);
    expect(screen.getByText('Объект А')).toBeInTheDocument();
    // readiness + weighted + critical + gap columns all render an em-dash placeholder
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });
});
