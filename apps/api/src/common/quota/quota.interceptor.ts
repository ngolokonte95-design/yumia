import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, type Observable, switchMap, tap } from 'rxjs';
import { QuotaService, type QuotaRule } from './quota.service';

const QUOTA_RULE = 'yumia:quota';

/**
 * Pose un quota quotidien sur une route.
 *
 * À placer APRÈS le guard JWT de la route : les intercepteurs s'exécutent
 * après les guards, l'utilisateur est donc déjà connu.
 */
export function Quota(rule: QuotaRule): MethodDecorator {
  return applyDecorators(SetMetadata(QUOTA_RULE, rule), UseInterceptors(QuotaInterceptor));
}

@Injectable()
export class QuotaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly quota: QuotaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rule = this.reflector.get<QuotaRule | undefined>(QUOTA_RULE, context.getHandler());
    if (!rule) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    return from(this.quota.assertAvailable(rule, req)).pipe(
      switchMap((key) =>
        next.handle().pipe(
          tap(() => {
            if (key) void this.quota.consume(key);
          }),
        ),
      ),
    );
  }
}
