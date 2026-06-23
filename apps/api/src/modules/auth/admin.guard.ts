import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard';

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

    // Lire à chaque requête pour refléter les changements d'env sans redémarrage.
    const raw = process.env.ADMIN_EMAILS ?? '';
    const adminEmails = new Set(
      raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );

    if (!adminEmails.has(req.user.email.toLowerCase())) {
      throw new ForbiddenException('Accès réservé aux administrateurs.');
    }
    return true;
  }
}
