import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';
import type { JwtPayload } from './types';
import { PrismaService } from '../../infra/prisma/prisma.service';

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
    private readonly prisma: PrismaService,
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
    } catch {
      throw new UnauthorizedException('Jeton d’accès invalide ou expiré.');
    }

    await this.assertNotSuspended(req);
    return true;
  }

  /**
   * Un compte suspendu ne doit plus rien pouvoir publier.
   *
   * Le contrôle ne porte que sur les requêtes qui ÉCRIVENT : un jeton reste
   * valide plusieurs heures après une suspension, et attendre son expiration
   * laisserait la personne publier entre-temps. Les lectures, elles, ne
   * justifient pas une requête de base supplémentaire à chaque appel — et
   * laisser quelqu'un consulter l'app pendant sa suspension est sans
   * conséquence.
   */
  private async assertNotSuspended(req: AuthenticatedRequest): Promise<void> {
    if (req.method === 'GET' || req.method === 'HEAD') return;

    const user = await this.prisma.user
      .findUnique({
        where: { id: req.user.sub },
        select: { suspendedUntil: true, suspendedReason: true },
      })
      .catch(() => null);

    if (!user?.suspendedUntil || user.suspendedUntil <= new Date()) return;

    throw new ForbiddenException({
      code: 'ACCOUNT_SUSPENDED',
      message: user.suspendedReason
        ? `Ton compte est suspendu : ${user.suspendedReason}`
        : 'Ton compte est suspendu.',
      until: user.suspendedUntil.toISOString(),
    });
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : null;
}
