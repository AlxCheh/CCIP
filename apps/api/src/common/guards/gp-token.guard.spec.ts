import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { GpTokenGuard } from './gp-token.guard';
import { PrismaService } from '../prisma/prisma.service';

const makeCtx = (token: string | undefined) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ params: token !== undefined ? { token } : {} }),
    }),
  }) as unknown as ExecutionContext;

describe('GpTokenGuard', () => {
  let guard: GpTokenGuard;
  let prisma: jest.Mocked<PrismaService>;

  const futureDate = new Date(Date.now() + 3_600_000);
  const pastDate = new Date(Date.now() - 3_600_000);

  beforeEach(() => {
    prisma = {
      period: { findFirst: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    guard = new GpTokenGuard(prisma);
  });

  it('throws UnauthorizedException when token not found', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(guard.canActivate(makeCtx('bad-token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token expired', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: pastDate,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('expired-token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when gpTokenExpiresAt is null', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: null,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('any-token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when already submitted', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: new Date(),
    });
    await expect(guard.canActivate(makeCtx('used-token'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns true for valid unused token', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('valid-token'))).resolves.toBe(true);
  });

  it('uses GP_TOKEN_INVALID message for all invalid/expired cases', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(guard.canActivate(makeCtx('bad'))).rejects.toThrow(
      'GP_TOKEN_INVALID',
    );
  });

  it('uses GP_ALREADY_SUBMITTED message for already-used token', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: new Date(),
    });
    await expect(guard.canActivate(makeCtx('used'))).rejects.toThrow(
      'GP_ALREADY_SUBMITTED',
    );
  });

  // guard uses strict < so a token expiring exactly at "now" is still valid
  it('allows token expiring exactly at the current moment (strict < check)', async () => {
    const fixedNow = new Date('2026-05-06T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(fixedNow);

    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: fixedNow,
      gpSubmittedAt: null,
    });

    await expect(guard.canActivate(makeCtx('boundary-token'))).resolves.toBe(
      true,
    );

    jest.useRealTimers();
  });

  it('throws UnauthorizedException when token is absent from request params', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(guard.canActivate(makeCtx(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
