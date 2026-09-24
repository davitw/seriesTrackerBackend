import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp } from '../helpers/app';
import {
  adminPrismaClient,
  cleanupUsers,
  loadRootEnv,
  testPrismaClient,
  withUserScope,
} from '../helpers/db';

/**
 * T025 — fluxo de autenticação de ponta a ponta (FR-001 a FR-005, FR-020).
 */
describe('Fluxo de autenticação', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const created: string[] = [];
  const email = `flow-${randomUUID()}@example.com`;
  const password = 'segredo123';

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
    prisma = testPrismaClient();
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await prisma.$disconnect();
    await app.close();
  });

  it('cadastro → entrada → renovação → saída', async () => {
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password })
      .expect(201);
    const userId = registered.body.id as string;
    created.push(userId);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email.toLowerCase());

    const refreshed = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('sessões da própria conta ficam visíveis apenas com escopo (cascade ao encerrar)', async () => {
    const own = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const payload = JSON.parse(
      Buffer.from(own.body.accessToken.split('.')[1], 'base64').toString('utf8'),
    ) as { sub: string };
    const userId = payload.sub;

    const rows = await withUserScope(prisma, userId, (tx) =>
      tx.$queryRaw<{ count: bigint }[]>`select count(*)::bigint as count from refresh_tokens`,
    );
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
  });

  it('encerrar a conta remove perfil, progresso, sessões e invalida o acesso', async () => {
    const outroEmail = `flow-del-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: outroEmail, password })
      .expect(201);
    const userId = registered.body.id as string;
    created.push(userId);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: outroEmail, password })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/v1/me')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    // Sem a conta, as credenciais deixam de existir.
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: outroEmail, password })
      .expect(401);

    // E não restou nenhuma sessão pendurada. A verificação usa a conexão administrativa
    // de propósito: sem escopo, a RLS devolveria zero linhas e o teste passaria por
    // acidente, sem provar que a exclusão em cascata aconteceu.
    const admin = adminPrismaClient();
    const rows = await admin.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from refresh_tokens where user_id = ${userId}::uuid
    `;
    await admin.$disconnect();
    expect(Number(rows[0]?.count ?? 0n)).toBe(0);
  });
});
