import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('AuthService', () => {
  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    let service: AuthService;
    let prisma: jest.Mocked<PrismaService>;
    let jwtSignAsync: jest.Mock;

    const BASE_USER = {
      id: 1,
      email: 'user@example.com',
      role: 'admin',
      organizationId: 'org-uuid',
      isActive: true,
      passwordHash: '',
    };

    beforeEach(async () => {
      BASE_USER.passwordHash = await bcrypt.hash('password123', 12);
      jwtSignAsync = jest.fn().mockResolvedValue('access.token.here');

      prisma = {
        user: { findUnique: jest.fn().mockResolvedValue({ ...BASE_USER }) },
        refreshToken: { create: jest.fn().mockResolvedValue({}) },
      } as unknown as jest.Mocked<PrismaService>;

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: JwtService, useValue: { signAsync: jwtSignAsync } },
        ],
      }).compile();

      service = module.get(AuthService);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      await expect(
        service.login('user@example.com', 'wrongpassword', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login('noone@example.com', 'password123', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user.isActive is false', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...BASE_USER,
        isActive: false,
      });

      await expect(
        service.login('user@example.com', 'password123', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns accessToken on valid credentials', async () => {
      const result = await service.login(
        'user@example.com',
        'password123',
        'agent',
        '127.0.0.1',
      );

      expect(result.accessToken).toBe('access.token.here');
    });

    it('refreshToken is a valid UUID v4', async () => {
      const result = await service.login(
        'user@example.com',
        'password123',
        'agent',
        '127.0.0.1',
      );

      expect(result.refreshToken).toMatch(UUID_V4_RE);
    });

    it('calls signAsync with correct JWT payload', async () => {
      await service.login('user@example.com', 'password123', 'agent', '127.0.0.1');

      expect(jwtSignAsync).toHaveBeenCalledWith({
        sub: '1',
        email: 'user@example.com',
        role: 'admin',
        organizationId: 'org-uuid',
      });
    });

    it('stores sha256 hash of refresh token — not the plain UUID', async () => {
      const result = await service.login(
        'user@example.com',
        'password123',
        'agent',
        '127.0.0.1',
      );

      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: sha256(result.refreshToken),
            userId: 1,
            userAgent: 'agent',
            ipAddress: '127.0.0.1',
          }),
        }),
      );
    });
  });

  // ─── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    let service: AuthService;
    let prisma: jest.Mocked<PrismaService>;
    let jwtSignAsync: jest.Mock;

    const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const PAST = new Date(Date.now() - 1_000);

    const STORED_TOKEN = {
      id: 99,
      tokenHash: 'any-hash',
      revokedAt: null,
      expiresAt: FUTURE,
      user: {
        id: 1,
        email: 'user@example.com',
        role: 'admin',
        organizationId: 'org-uuid',
        isActive: true,
      },
    };

    beforeEach(async () => {
      jwtSignAsync = jest.fn().mockResolvedValue('new.access.token');

      prisma = {
        refreshToken: {
          findUnique: jest.fn().mockResolvedValue({ ...STORED_TOKEN }),
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({}),
        },
      } as unknown as jest.Mocked<PrismaService>;

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: JwtService, useValue: { signAsync: jwtSignAsync } },
        ],
      }).compile();

      service = module.get(AuthService);
    });

    it('returns new accessToken and UUID v4 refreshToken on valid token', async () => {
      const result = await service.refresh('valid-raw', 'agent', '127.0.0.1');

      expect(result.accessToken).toBe('new.access.token');
      expect(result.refreshToken).toMatch(UUID_V4_RE);
    });

    it('throws UnauthorizedException when token is not found', async () => {
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.refresh('unknown', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is already revoked', async () => {
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        ...STORED_TOKEN,
        revokedAt: PAST,
      });

      await expect(
        service.refresh('revoked', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is expired', async () => {
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        ...STORED_TOKEN,
        expiresAt: PAST,
      });

      await expect(
        service.refresh('expired', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user.isActive is false', async () => {
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        ...STORED_TOKEN,
        user: { ...STORED_TOKEN.user, isActive: false },
      });

      await expect(
        service.refresh('inactive-user-token', 'agent', '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('all rejection paths use INVALID_REFRESH_TOKEN message', async () => {
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.refresh('any', 'agent', '127.0.0.1'),
      ).rejects.toThrow('INVALID_REFRESH_TOKEN');
    });

    it('revokes the old token before issuing a new one', async () => {
      await service.refresh('valid-raw', 'agent', '127.0.0.1');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('stores sha256 hash of the new refresh token in DB', async () => {
      const result = await service.refresh('valid-raw', 'agent', '127.0.0.1');

      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: sha256(result.refreshToken),
            userId: 1,
            userAgent: 'agent',
            ipAddress: '127.0.0.1',
          }),
        }),
      );
    });

    it('signs new JWT with user data from the stored token', async () => {
      await service.refresh('valid-raw', 'agent', '127.0.0.1');

      expect(jwtSignAsync).toHaveBeenCalledWith({
        sub: '1',
        email: 'user@example.com',
        role: 'admin',
        organizationId: 'org-uuid',
      });
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    let service: AuthService;
    let prisma: jest.Mocked<PrismaService>;

    beforeEach(async () => {
      prisma = {
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as jest.Mocked<PrismaService>;

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: JwtService, useValue: { signAsync: jest.fn() } },
        ],
      }).compile();

      service = module.get(AuthService);
    });

    it('calls updateMany with sha256 hash of the raw token', async () => {
      const rawToken = 'some-raw-uuid';

      await service.logout(rawToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256(rawToken), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is idempotent — does not throw when token is not found', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
    });

    it('returns void on success', async () => {
      const result = await service.logout('any-token');

      expect(result).toBeUndefined();
    });
  });
});
