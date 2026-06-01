import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ObjectDetailPage } from '../ObjectDetailPage';
import { useObjectDetail } from '../../hooks/useObjectDetail';
import { useOpenPeriod } from '../../hooks/useOpenPeriod';
import type { ObjectDetailResponse } from '../../services/api';

vi.mock('../../hooks/useObjectDetail', () => ({ useObjectDetail: vi.fn() }));
vi.mock('../../hooks/useOpenPeriod',   () => ({ useOpenPeriod:   vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams:   () => ({ id: '10' }),
  };
});

const mutateOpen = vi.fn();

function setupMocks() {
  vi.mocked(useOpenPeriod).mockReturnValue({
    mutate: mutateOpen, isPending: false,
  } as unknown as ReturnType<typeof useOpenPeriod>);
}

type UseDetailReturn = ReturnType<typeof useObjectDetail>;

function mockDetail(over: Partial<UseDetailReturn>) {
  return { data: undefined, isLoading: false, isError: false, ...over } as unknown as UseDetailReturn;
}

function makeData(
  currentPeriod: ObjectDetailResponse['currentPeriod'] = null,
): ObjectDetailResponse {
  return {
    object: {
      id: 10, name: 'Объект Б', objectClass: null, address: null,
      permitNumber: null, permitDate: null, connectionDate: null, status: 'active',
    },
    participants: [], activeBoq: null, currentPeriod,
    hasAnalytics: false, current: null, history: [],
    meta: { isStale: false, refreshedAt: null, staleReason: null },
  };
}

describe('ObjectDetailPage — period changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupMocks();
  });

  it('renders a link to /periods/:id when currentPeriod exists', () => {
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetail({
        data: makeData({
          id: 42, periodNumber: 1, status: 'verification',
          openedAt: '2026-05-01T00:00:00Z', closedAt: null,
        }),
      }),
    );
    render(<MemoryRouter><ObjectDetailPage /></MemoryRouter>);
    const link = screen.getByRole('link', { name: /Открыть/ });
    expect(link).toHaveAttribute('href', '/periods/42');
  });

  it('shows canonical label "Верификация" for status verification', () => {
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetail({
        data: makeData({
          id: 42, periodNumber: 1, status: 'verification',
          openedAt: '2026-05-01T00:00:00Z', closedAt: null,
        }),
      }),
    );
    render(<MemoryRouter><ObjectDetailPage /></MemoryRouter>);
    expect(screen.getByText(/Верификация/)).toBeInTheDocument();
  });

  it('shows "Открыть период" button for stroycontrol when no current period', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }));
    vi.mocked(useObjectDetail).mockReturnValue(mockDetail({ data: makeData(null) }));
    render(<MemoryRouter><ObjectDetailPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Открыть период' })).toBeInTheDocument();
  });

  it('does not show "Открыть период" button for director', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'director' }));
    vi.mocked(useObjectDetail).mockReturnValue(mockDetail({ data: makeData(null) }));
    render(<MemoryRouter><ObjectDetailPage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Открыть период' })).not.toBeInTheDocument();
  });

  it('does not show "Открыть период" button when a period is already open', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }));
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetail({
        data: makeData({
          id: 42, periodNumber: 1, status: 'open',
          openedAt: '2026-05-01T00:00:00Z', closedAt: null,
        }),
      }),
    );
    render(<MemoryRouter><ObjectDetailPage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Открыть период' })).not.toBeInTheDocument();
  });
});
