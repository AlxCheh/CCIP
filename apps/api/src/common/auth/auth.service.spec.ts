import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService.login', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const hash = await bcrypt.hash('password123', 12);
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          email: 'user@example.com',
          role: 'admin',
          organizationId: 'org-uuid',
          passwordHash: hash,
          isActive: true,
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('access.token.here'),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('throws UnauthorizedException for wrong password', async () => {
    await expect(
      service.login('user@example.com', 'wrongpassword', 'agent', '127.0.0.1'),
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
    expect(result.refreshToken).toHaveLength(36); // UUID v4
  });
});
