import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantStorage } from './tenant.storage';

function decodeOrgId(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(auth.slice(7).split('.')[1], 'base64url').toString('utf8'),
    ) as { organizationId?: string };
    return typeof payload.organizationId === 'string' ? payload.organizationId : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const organizationId = decodeOrgId(req);
    if (organizationId) {
      tenantStorage.run({ organizationId }, next);
    } else {
      next();
    }
  }
}
