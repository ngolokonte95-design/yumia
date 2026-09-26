import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';
import type { JwtPayload } from './types';

/**
 * Identifie l'utilisateur quand il envoie un jeton valide, sans jamais
 * refuser la requête.
 *
 * Pour les routes publiques qui doivent quand même savoir QUI appelle — par
 * exemple pour compter une dépense par compte plutôt que par adresse IP.
 * Jeton absent, invalide ou expiré : la requête passe en anonyme
 * (`req.user` reste indéfini), exactement comme avant ce guard.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) return true;

    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    try {
      req.user = await this.jwt.verifyAsync<JwtPayload>(token, { secret: jwtCfg.accessSecret });
    } catch {
      // Jeton expiré ou invalide : on traite l'appel en anonyme.
    }
    return true;
  }
}
