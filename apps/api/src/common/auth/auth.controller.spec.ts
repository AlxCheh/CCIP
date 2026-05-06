import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const makeMockRes = () =>
  ({ cookie: jest.fn(), clearCookie: jest.fn() }) as unknown as Response;

const makeMockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: { 'user-agent': 'jest-agent' },
    ip: '127.0.0.1',
    cookies: {},
    ...overrides,
  }) as unknown as Request;

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    authService = {
      login: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at.jwt', refreshToken: 'raw-uuid' }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new.at.jwt',
        refreshToken: 'new-uuid',
      }),
      logout: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthService>;

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  // ─── login ────────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('calls authService.login with email, password, user-agent and ip', async () => {
      const req = makeMockReq();
      const res = makeMockRes();

      await controller.login(
        { email: 'user@example.com', password: 'pass123' },
        req,
        res,
      );

      expect(authService.login).toHaveBeenCalledWith(
        'user@example.com',
        'pass123',
        'jest-agent',
        '127.0.0.1',
      );
    });

    it('returns only accessToken in response body', async () => {
      const result = await controller.login(
        { email: 'u@e.com', password: 'p' },
        makeMockReq(),
        makeMockRes(),
      );

      expect(result).toEqual({ accessToken: 'at.jwt' });
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('sets httpOnly strict-samesite refresh_token cookie', async () => {
      const res = makeMockRes();

      await controller.login(
        { email: 'u@e.com', password: 'p' },
        makeMockReq(),
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'raw-uuid',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
    });

    it('uses empty string when user-agent header is absent', async () => {
      const req = makeMockReq({ headers: {} });

      await controller.login(
        { email: 'u@e.com', password: 'p' },
        req,
        makeMockRes(),
      );

      expect(authService.login).toHaveBeenCalledWith(
        'u@e.com',
        'p',
        '',
        '127.0.0.1',
      );
    });

    it('uses empty string when ip is absent', async () => {
      const req = makeMockReq({ ip: undefined });

      await controller.login(
        { email: 'u@e.com', password: 'p' },
        req,
        makeMockRes(),
      );

      expect(authService.login).toHaveBeenCalledWith(
        'u@e.com',
        'p',
        'jest-agent',
        '',
      );
    });
  });

  // ─── refresh ──────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('throws UnauthorizedException when refresh_token cookie is absent', async () => {
      const req = makeMockReq({ cookies: {} });

      await expect(controller.refresh(req, makeMockRes())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws with NO_REFRESH_TOKEN message when cookie is absent', async () => {
      const req = makeMockReq({ cookies: {} });

      await expect(controller.refresh(req, makeMockRes())).rejects.toThrow(
        'NO_REFRESH_TOKEN',
      );
    });

    it('calls authService.refresh with raw token, user-agent and ip', async () => {
      const req = makeMockReq({
        cookies: { refresh_token: 'raw-uuid' },
      });

      await controller.refresh(req, makeMockRes());

      expect(authService.refresh).toHaveBeenCalledWith(
        'raw-uuid',
        'jest-agent',
        '127.0.0.1',
      );
    });

    it('returns new accessToken in response body', async () => {
      const req = makeMockReq({
        cookies: { refresh_token: 'raw-uuid' },
      });

      const result = await controller.refresh(req, makeMockRes());

      expect(result).toEqual({ accessToken: 'new.at.jwt' });
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('rotates the cookie with new refresh token', async () => {
      const req = makeMockReq({
        cookies: { refresh_token: 'raw-uuid' },
      });
      const res = makeMockRes();

      await controller.refresh(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new-uuid',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('calls authService.logout with token from cookie', async () => {
      const req = makeMockReq({
        cookies: { refresh_token: 'raw-uuid' },
      });

      await controller.logout(req, makeMockRes());

      expect(authService.logout).toHaveBeenCalledWith('raw-uuid');
    });

    it('does not call authService.logout when cookie is absent', async () => {
      const req = makeMockReq({ cookies: {} });

      await controller.logout(req, makeMockRes());

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('always clears the cookie regardless of presence', async () => {
      const req = makeMockReq({ cookies: {} });
      const res = makeMockRes();

      await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
    });
  });
});
