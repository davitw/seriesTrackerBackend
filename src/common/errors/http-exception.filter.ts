import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError, ErrorCode } from './error-codes';

interface ValidationIssue {
  property?: string;
  constraints?: Record<string, string>;
}

/**
 * Traduz toda falha para o formato único `{ error: { code, message, details? } }`.
 *
 * Nenhuma resposta 2xx carrega erro, e falha inesperada vira `INTERNAL_ERROR` sem
 * expor detalhe interno nem segredo (FR-019, SC-010).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as
        | string
        | { message?: string | string[] | ValidationIssue[] };

      // O ValidationPipe do Nest devolve 400; o contrato deste serviço usa 422
      // para dado de entrada inválido.
      if (status === HttpStatus.BAD_REQUEST) {
        response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Dados inválidos.',
            details: { fields: this.extractFields(body) },
          },
        });
        return;
      }

      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? ((body as { message: string[] }).message.join('; ') as string)
            : ((body as { message?: string }).message ?? exception.message);

      response.status(status).json({
        error: { code: this.codeForStatus(status), message },
      });
      return;
    }

    this.logger.error(
      `Falha inesperada: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Erro interno.' },
    });
  }

  private extractFields(body: unknown): Record<string, string> {
    const fields: Record<string, string> = {};
    const message = (body as { message?: unknown })?.message;
    if (!Array.isArray(message)) return fields;

    for (const item of message) {
      if (typeof item === 'string') {
        fields[item.split(' ')[0] ?? 'campo'] = item;
        continue;
      }
      const issue = item as ValidationIssue;
      if (issue.property) {
        fields[issue.property] = Object.values(issue.constraints ?? {}).join('; ');
      }
    }
    return fields;
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.SERIES_NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.CATALOG_UNAVAILABLE;
      default:
        return ErrorCode.INVALID_CREDENTIALS;
    }
  }
}
