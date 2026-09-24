import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { loadRootEnv } from '../helpers/db';

/**
 * T066 — nenhum segredo na saída de log (Princípio V).
 *
 * Captura o que a aplicação escreve em stdout durante um ciclo completo de autenticação
 * e confirma que senha, access token e credencial de renovação não aparecem.
 */
describe('Redaction de log', () => {
  let app: INestApplication;

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('não registra senha nem tokens no fluxo de autenticação', async () => {
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    const email = `redact-${randomUUID()}@example.com`;
    const password = 'segredo-super-secreto-123';

    try {
      await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password });
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password });
      const accessToken = login.body.accessToken as string;
      const refreshToken = login.body.refreshToken as string;

      await request(app.getHttpServer())
        .get('/v1/me')
        .set('authorization', `Bearer ${accessToken}`);
      await request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken });

      const output = chunks.join('');

      expect(output).not.toContain(password);
      expect(output).not.toContain(accessToken);
      expect(output).not.toContain(refreshToken);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('redige o campo sensível quando ele é registrado explicitamente', async () => {
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      // A redaction é a segunda linha de defesa: o fluxo normal não registra o corpo da
      // requisição, mas se alguém registrar o objeto inteiro, o valor não pode vazar.
      const logger = app.get(Logger);
      logger.log({ password: 'valor-secreto', refreshToken: 'valor-secreto-2' }, 'diagnóstico');

      const output = chunks.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('valor-secreto');
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
