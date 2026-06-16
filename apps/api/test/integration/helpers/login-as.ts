// apps/api/test/integration/helpers/login-as.ts
import { JwtService } from '@nestjs/jwt';
import { TEST_JWT_SECRET } from '../setup/env';
import type { UserFixture } from '../fixtures/factories';

const jwt = new JwtService({ secret: TEST_JWT_SECRET });

export async function loginAs(user: UserFixture): Promise<string> {
  return jwt.signAsync({
    sub: String(user.id),
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  });
}
