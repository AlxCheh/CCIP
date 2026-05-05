import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { GpTokenGuard } from './gp-token.guard';
import { PrismaService } from '../prisma/prisma.service';

const makeCtx = (token: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ params: { token } }),
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
    await expect(guard.canActivate(makeCtx('bad-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when token expired', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: pastDate,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('expired-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when already submitted', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: new Date(),
    });
    await expect(guard.canActivate(makeCtx('used-token'))).rejects.toThrow(ForbiddenException);
  });

  it('returns true for valid unused token', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('valid-token'))).resolves.toBe(true);
  });
});
