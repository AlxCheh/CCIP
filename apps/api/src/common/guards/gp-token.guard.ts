import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GpTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ params: { token: string } }>();
    const token = req.params.token;

    const period = await this.prisma.period.findFirst({
      where: { gpSubmissionToken: token },
      select: { gpTokenExpiresAt: true, gpSubmittedAt: true },
    });

    if (
      !period ||
      !period.gpTokenExpiresAt ||
      period.gpTokenExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('GP_TOKEN_INVALID');
    }

    if (period.gpSubmittedAt !== null) {
      throw new ForbiddenException('GP_ALREADY_SUBMITTED');
    }

    return true;
  }
}
