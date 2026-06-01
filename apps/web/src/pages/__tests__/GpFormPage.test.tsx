import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpFormPage } from '../GpFormPage';
import { useGpFormData, useGpSubmit, getGpError } from '../../hooks/useGpForm';
import type { GpFormResponse } from '../../services/api';

vi.mock('../../hooks/useGpForm', () => ({
  useGpFormData: vi.fn(),
  useGpSubmit:   vi.fn(),
  getGpError:    vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ token: 'test-token-uuid' }) };
});

type QueryReturn = ReturnType<typeof useGpFormData>;
type MutReturn   = ReturnType<typeof useGpSubmit>;

const mutateFn = vi.fn();

function mockQuery(over: Partial<QueryReturn>) {
  vi.mocked(useGpFormData).mockReturnValue(
    { data: undefined, isLoading: false, error: null, ...over } as unknown as QueryReturn,
  );
}

function mockMutation(over: Partial<MutReturn> = {}) {
  vi.mocked(useGpSubmit).mockReturnValue(
    { mutate: mutateFn, isPending: false, isError: false, ...over } as unknown as MutReturn,
  );
}

function makeFormData(over: Partial<GpFormResponse> = {}): GpFormResponse {
  return {
    periodNumber: 4,
    objectName: 'Северный',
    gpTokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { boqItemId: 1, name: 'Земляные работы',  unit: 'м³', planVolume: 1200 },
      { boqItemId: 2, name: 'Бетонирование',     unit: 'м³', planVolume: 840  },
    ],
    ...over,
  };
}

describe('GpFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutation();
  });

  // T-01
  it('рендерит состояние загрузки', () => {
    mockQuery({ isLoading: true });
    render(<GpFormPage />);
    expect(screen.getByTestId('gp-loading')).toBeDefined();
  });

  // T-02
  it('рендерит форму с позициями из GET', () => {
    mockQuery({ data: makeFormData() });
    render(<GpFormPage />);
    expect(screen.getByText('Земляные работы')).toBeDefined();
    expect(screen.getByText('Бетонирование')).toBeDefined();
    expect(screen.getByText(/Период № 4/)).toBeDefined();
    expect(screen.getByText(/Северный/)).toBeDefined();
  });

  // T-03
  it('кнопка disabled когда поля пустые', () => {
    mockQuery({ data: makeFormData() });
    render(<GpFormPage />);
    const btn = screen.getByTestId('gp-submit-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // T-04
  it('кнопка активна когда все поля и имя заполнены', () => {
    mockQuery({ data: makeFormData() });
    render(<GpFormPage />);

    const inputs = screen.getAllByTestId('gp-volume-input') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '1150' } });
    fireEvent.change(inputs[1], { target: { value: '800'  } });

    const nameInput = screen.getByTestId('gp-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иванов И.И.' } });

    const btn = screen.getByTestId('gp-submit-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  // T-05
  it('значение 0 считается валидным', () => {
    mockQuery({ data: makeFormData() });
    render(<GpFormPage />);

    const inputs = screen.getAllByTestId('gp-volume-input') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '0'   } });
    fireEvent.change(inputs[1], { target: { value: '800' } });

    const nameInput = screen.getByTestId('gp-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иванов' } });

    const btn = screen.getByTestId('gp-submit-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  // T-06
  it('подсвечивает пустые строки после попытки submit', () => {
    mockQuery({ data: makeFormData() });
    render(<GpFormPage />);

    // Заполнить только первое поле
    const inputs = screen.getAllByTestId('gp-volume-input') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '1150' } });

    const nameInput = screen.getByTestId('gp-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иванов' } });

    // Триггер touched без submit (кнопка disabled — имитируем через форму)
    const form = screen.getByTestId('gp-form');
    fireEvent.submit(form);

    expect(screen.getByTestId('gp-row-error-2')).toBeDefined();
  });

  // T-07
  it('вызывает POST с корректными данными', () => {
    mockQuery({ data: makeFormData() });
    render(<GpFormPage />);

    const inputs = screen.getAllByTestId('gp-volume-input') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '1150' } });
    fireEvent.change(inputs[1], { target: { value: '800'  } });

    const nameInput = screen.getByTestId('gp-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иванов И.И.' } });

    const btn = screen.getByTestId('gp-submit-btn');
    fireEvent.click(btn);

    expect(mutateFn).toHaveBeenCalledWith(
      {
        gpSubmittedByName: 'Иванов И.И.',
        items: [
          { boqItemId: 1, gpVolume: 1150 },
          { boqItemId: 2, gpVolume: 800  },
        ],
      },
      expect.any(Object),
    );
  });

  // T-08
  it('показывает SuccessState после успешной отправки', () => {
    mockQuery({ data: makeFormData() });
    // Мутация сразу вызывает onSuccess
    vi.mocked(useGpSubmit).mockReturnValue({
      mutate: (_payload: unknown, opts: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
      isPending: false,
      isError: false,
    } as unknown as MutReturn);

    render(<GpFormPage />);

    const inputs = screen.getAllByTestId('gp-volume-input') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '1150' } });
    fireEvent.change(inputs[1], { target: { value: '800'  } });
    fireEvent.change(screen.getByTestId('gp-name-input'), { target: { value: 'Иванов' } });
    fireEvent.click(screen.getByTestId('gp-submit-btn'));

    expect(screen.getByTestId('gp-success')).toBeDefined();
  });

  // T-09
  it('показывает ExpiredState при ошибке токена', () => {
    const err = new Error('401');
    mockQuery({ error: err });
    vi.mocked(getGpError).mockReturnValue('expired');
    render(<GpFormPage />);
    expect(screen.getByTestId('gp-expired')).toBeDefined();
  });

  // T-10
  it('показывает AlreadySubmittedState при GP_ALREADY_SUBMITTED', () => {
    const err = new Error('403');
    mockQuery({ error: err });
    vi.mocked(getGpError).mockReturnValue('already_submitted');
    render(<GpFormPage />);
    expect(screen.getByTestId('gp-already-submitted')).toBeDefined();
  });
});
