import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;

    const body: Record<string, unknown> =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : { message: raw ?? 'Internal server error' };

    const rawMessage = body.message;
    const isValidationError = Array.isArray(rawMessage);
    const message = isValidationError
      ? 'Validation failed'
      : (rawMessage as string) ?? 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      message,
      code: body.code ?? status,
      ...(isValidationError && { errors: rawMessage }),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
