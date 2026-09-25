import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { captureException } from '../../infra/sentry/sentry.init';
import { stripQuery } from '../strip-query';

/** Filtre global : réponse d'erreur uniforme + journalisation. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const requestId = req.headers['x-request-id'] as string | undefined;
    // Chemin seul : la query (lat/lng, recherches) ne part ni dans les logs ni dans Sentry.
    const path = stripQuery(req.url);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${path} [requestId=${requestId ?? '-'}]`,
        (exception as Error)?.stack,
      );
      captureException(exception, { method: req.method, url: path, requestId });
    }

    res.status(status).json({
      statusCode: status,
      path,
      timestamp: new Date().toISOString(),
      requestId,
      error: message,
    });
  }
}
