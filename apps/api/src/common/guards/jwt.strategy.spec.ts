import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

const makeConfig = (secret: string | null = 'test-secret') =>
  ({
    getOrThrow: (key: string) => {
      if (key === 'JWT_SECRET') {
        if (secret === null) throw new Error('JWT_SECRET is not defined');
        return secret;
      }
      throw new Error(`Unknown config key: ${key}`);
    },
  }) as unknown as ConfigService;

describe('JwtStrategy', () => {
  // ─── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initialises successfully with a valid JWT_SECRET', () => {
      expect(() => new JwtStrategy(makeConfig('my-secret'))).not.toThrow();
    });

    it('throws when JWT_SECRET is not configured', () => {
      expect(() => new JwtStrategy(makeConfig(null))).toThrow();
    });
  });

  // ─── validate ───────────────────────────────────────────────────────────────

  describe('validate', () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      strategy = new JwtStrategy(makeConfig());
    });

    it('returns user object with organizationId', () => {
      const payload: JwtPayload = {
        sub: '42',
        email: 'test@example.com',
        role: 'admin',
        organizationId: 'org-uuid-123',
      };

      expect(strategy.validate(payload)).toEqual({
        id: '42',
        email: 'test@example.com',
        role: 'admin',
        organizationId: 'org-uuid-123',
      });
    });

    it('maps payload.sub to id — does not expose sub directly', () => {
      const result = strategy.validate({
        sub: '99',
        email: 'e@e.com',
        role: 'stroycontrol',
        organizationId: 'org',
      });

      expect(result.id).toBe('99');
      expect(result).not.toHaveProperty('sub');
    });

    it('does not include extra payload fields in result', () => {
      const payload = {
        sub: '1',
        email: 'e@e.com',
        role: 'director',
        organizationId: 'org',
        extra: 'should-not-appear',
        iat: 1234567890,
        exp: 9999999999,
      } as unknown as JwtPayload;

      const result = strategy.validate(payload);

      expect(result).not.toHaveProperty('extra');
      expect(result).not.toHaveProperty('iat');
      expect(result).not.toHaveProperty('exp');
      expect(result).not.toHaveProperty('sub');
    });

    it('preserves all three role values correctly', () => {
      const roles = ['admin', 'director', 'stroycontrol'] as const;

      for (const role of roles) {
        const result = strategy.validate({
          sub: '1',
          email: 'e@e.com',
          role,
          organizationId: 'org',
        });
        expect(result.role).toBe(role);
      }
    });

    it('returns undefined for missing payload fields — no crash', () => {
      const result = strategy.validate({ sub: '42' } as JwtPayload);

      expect(result.id).toBe('42');
      expect(result.email).toBeUndefined();
      expect(result.role).toBeUndefined();
      expect(result.organizationId).toBeUndefined();
    });

    it('passes null payload field values through unchanged', () => {
      const result = strategy.validate({
        sub: '1',
        email: null as unknown as string,
        role: null as unknown as string,
        organizationId: null as unknown as string,
      });

      expect(result.id).toBe('1');
      expect(result.email).toBeNull();
      expect(result.role).toBeNull();
      expect(result.organizationId).toBeNull();
    });
  });
});
