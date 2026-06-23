import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/types';

/**
 * Rate-limiter par utilisateur authentifié (sub JWT) avec repli sur l'IP.
 *
 * Derrière un reverse-proxy (nginx, Cloudflare), tous les utilisateurs
 * partagent la même IP sortante — le ThrottlerGuard par défaut throttlerait
 * toute l'appli d'un coup. Ce guard utilise l'identifiant de l'utilisateur
 * si le JWT est déjà attaché à la requête par JwtAuthGuard, sinon l'IP.
 *
 * THROTTLE_SKIP=true désactive le rate-limiting (test e2e uniquement).
 */
@Injectable()
export class YumiaThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.THROTTLE_SKIP === 'true') return true;
    return super.canActivate(context);
  }

  protected override async getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (user?.sub) return `user:${user.sub}`;

    // Repli : IP réelle (respecte trust proxy de NestExpressApplication)
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
