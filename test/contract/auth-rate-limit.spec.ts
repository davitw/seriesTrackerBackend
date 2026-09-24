import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { loadRootEnv } from '../helpers/db';

/**
 * T022 — limitação de taxa nas rotas públicas de autenticação (FR-021, SC-011).
 *
 * A mitigação existe porque o cadastro revela, por decisão consciente do produto, que um
 * e-mail já tem conta: sem limite, a enumeração em massa seria trivial.
 */
describe('Limitação de taxa em /v1/auth (FR-021, SC-011)', () => {
  let app: INestApplication;
  const max = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('recusa com 429 RATE_LIMITED depois de exceder o limite', async () => {
    const credential = {
      email: `rate-${randomUUID()}@example.com`,
      password: 'senha-errada',
    };

    // Dentro do limite, a resposta é a de credencial inválida — não a de excesso.
    for (let attempt = 0; attempt < max; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(credential);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    const blocked = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(credential);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
