import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { isAdminEmail } from './is-admin-email';

/**
 * Guard admin : autorise uniquement les emails listés dans ADMIN_EMAILS
 * (variable d'env, séparés par des virgules).
 *
 * Doit être utilisé conjointement avec JwtAuthGuard (qui attache req.user).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      throw new UnauthorizedException('Authentification requise.');
    }

    if (!isAdminEmail(req.user.email)) {
      throw new ForbiddenException('Accès réservé aux administrateurs.');
    }
    return true;
  }
}
