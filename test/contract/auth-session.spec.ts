import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/** T021 — contrato de entrada, renovação e saída (FR-002, FR-003, FR-004). */
describe('POST /v1/auth/login, /refresh e /logout', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const created: string[] = [];
  const email = `session-${randomUUID()}@example.com`;
  const password = 'segredo123';

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
    prisma = testPrismaClient();
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password });
    created.push(registered.body.id);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await prisma.$disconnect();
    await app.close();
  });

  it('autentica com credenciais válidas e devolve os dois tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.expiresIn).toBe(900);
  });

  it('recusa senha errada e e-mail inexistente com a MESMA resposta', async () => {
    const senhaErrada = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'senha-errada' })
      .expect(401);

    const emailInexistente = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: `nao-existe-${randomUUID()}@example.com`, password })
      .expect(401);

    // FR-003: a resposta não pode revelar se o e-mail existe.
    expect(senhaErrada.body).toEqual(emailInexistente.body);
    expect(senhaErrada.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('renova a sessão e invalida o token de renovação anterior', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    const reuso = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    expect(reuso.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('encerra a sessão e o token deixa de renovar', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    const response = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('exige sessão válida para consultar o próprio perfil', async () => {
    const semToken = await request(app.getHttpServer()).get('/v1/me').expect(401);
    expect(semToken.body.error.code).toBe('UNAUTHENTICATED');

    const tokenInvalido = await request(app.getHttpServer())
      .get('/v1/me')
      .set('authorization', 'Bearer nao-e-um-token')
      .expect(401);
    expect(tokenInvalido.body.error.code).toBe('UNAUTHENTICATED');
  });
});
