import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';
import type { JwtPayload } from './types';

/** Requête enrichie de l'utilisateur authentifié par le guard. */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Garde l'access JWT : extrait le `Authorization: Bearer <token>`, le vérifie
 * avec le secret d'accès, et attache la charge utile à `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Jeton d’accès manquant.');
    }

    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;
    try {
      req.user = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: jwtCfg.accessSecret,
      });
      return true;
    } catch {
      throw new UnauthorizedException('Jeton d’accès invalide ou expiré.');
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : null;
}
