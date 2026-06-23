import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import type { JwtPayload } from './types';

/**
 * Injecte la charge utile JWT de l'utilisateur courant dans un handler.
 * À utiliser sur une route protégée par `JwtAuthGuard`.
 *
 * @example
 *   me(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user;
  },
);
