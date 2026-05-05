import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = {
      getOrThrow: () => 'test-secret',
    } as unknown as ConfigService;
    strategy = new JwtStrategy(config);
  });

  it('returns user with organizationId', () => {
    const payload = {
      sub: '42',
      email: 'test@example.com',
      role: 'admin',
      organizationId: 'org-uuid-123',
    };
    const result = strategy.validate(payload);
    expect(result).toEqual({
      id: '42',
      email: 'test@example.com',
      role: 'admin',
      organizationId: 'org-uuid-123',
    });
  });
});
