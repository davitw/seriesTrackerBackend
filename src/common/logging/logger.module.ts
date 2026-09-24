import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

/**
 * Log estruturado em JSON.
 *
 * Redaction obrigatória (Princípio V): token, senha e segredo nunca aparecem na saída,
 * nem quando alguém loga o objeto da requisição inteiro.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) => {
          const header = req.headers['x-request-id'];
          const candidate = Array.isArray(header) ? header[0] : header;
          const id: string = candidate && candidate.length > 0 ? candidate : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.currentPassword',
            'req.body.newPassword',
            'res.headers["set-cookie"]',
            'password',
            'passwordHash',
            'refreshToken',
            'accessToken',
            'tokenHash',
          ],
          censor: '[REDACTED]',
        },
        serializers: {
          req: (req: { id?: string; method?: string; url?: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => {
          const userId = (req as { user?: { id?: string } }).user?.id;
          return userId ? { userId } : {};
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
