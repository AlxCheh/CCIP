import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodPage } from '../PeriodPage';
import { usePeriodDetail } from '../../hooks/usePeriodDetail';
import { useUpsertFact } from '../../hooks/useUpsertFact';
import { useClosePeriod } from '../../hooks/useClosePeriod';
import type { PeriodDetailResponse } from '../../services/api';

vi.mock('../../hooks/usePeriodDetail', () => ({ usePeriodDetail: vi.fn() }));
vi.mock('../../hooks/useUpsertFact',   () => ({ useUpsertFact:   vi.fn() }));
vi.mock('../../hooks/useClosePeriod',  () => ({ useClosePeriod:  vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: '1' }) };
});

type UsePeriodReturn = ReturnType<typeof usePeriodDetail>;
type UpsertReturn   = ReturnType<typeof useUpsertFact>;
type CloseReturn    = ReturnType<typeof useClosePeriod>;

const mutateFact  = vi.fn();
const mutateClose = vi.fn();

function setupMutations() {
  vi.mocked(useUpsertFact).mockReturnValue(
    { mutate: mutateFact,  isPending: false, isError: false } as unknown as UpsertReturn,
  );
  vi.mocked(useClosePeriod).mockReturnValue(
    { mutate: mutateClose, isPending: false, isError: false } as unknown as CloseReturn,
  );
}

function mockPeriodReturn(over: Partial<UsePeriodReturn>) {
  return { data: undefined, isLoading: false, isError: false, ...over } as unknown as UsePeriodReturn;
}

function makeDetail(over: Partial<PeriodDetailResponse> = {}): PeriodDetailResponse {
  return {
    id: 1, periodNumber: 2, status: 'verification',
    openedAt: '2026-05-01T00:00:00Z', closedAt: null,
    objectId: 10, boqVersionId: 5,
    positions: [
      {
        boqItemId: 7, workCode: 'C-01', name: 'Earthworks', unit: 'm3',
        planVolume: 200, gpVolume: 150, scVolume: 140,
        discrepancyType: 1, discrepancyStatus: 'open', acceptedVolume: null,
      },
    ],
    openDiscrepancyCount: 1,
    ...over,
  };
}

describe('PeriodPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupMutations();
  });

  it('renders loading state', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ isLoading: true }));
    render(<PeriodPage />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  it('renders error state when not found', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ isError: true }));
    render(<PeriodPage />);
    expect(screen.getByText(/Период не найден/)).toBeInTheDocument();
  });

  it('shows current status in stepper', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'gp_submitted' }) }),
    );
    render(<PeriodPage />);
    expect(screen.getByText('ГП подал данные')).toBeInTheDocument();
  });

  it('renders position row with name and volumes', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ data: makeDetail() }));
    render(<PeriodPage />);
    expect(screen.getByText('Earthworks')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('140')).toBeInTheDocument();
  });

  it('shows SC input for stroycontrol in verification status', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }));
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ data: makeDetail() }));
    render(<PeriodPage />);
    expect(screen.getByRole('spinbutton', { name: 'scVolume-7' })).toBeInTheDocument();
  });

  it('hides SC input for director', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'director' }));
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ data: makeDetail() }));
    render(<PeriodPage />);
    expect(screen.queryByRole('spinbutton', { name: /scVolume/ })).not.toBeInTheDocument();
  });

  it('close button disabled when openDiscrepancyCount > 0', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }));
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ openDiscrepancyCount: 1 }) }),
    );
    render(<PeriodPage />);
    expect(screen.getByRole('button', { name: 'Закрыть период' })).toBeDisabled();
  });

  it('close button enabled when verification and no open discrepancies', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }));
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'verification', openDiscrepancyCount: 0 }) }),
    );
    render(<PeriodPage />);
    expect(screen.getByRole('button', { name: 'Закрыть период' })).not.toBeDisabled();
  });

  it('close button disabled when status is not verification', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }));
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'gp_submitted', openDiscrepancyCount: 0 }) }),
    );
    render(<PeriodPage />);
    expect(screen.getByRole('button', { name: 'Закрыть период' })).toBeDisabled();
  });

  it('close button not visible for director', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'director' }));
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'verification', openDiscrepancyCount: 0 }) }),
    );
    render(<PeriodPage />);
    expect(screen.queryByRole('button', { name: 'Закрыть период' })).not.toBeInTheDocument();
  });
});
