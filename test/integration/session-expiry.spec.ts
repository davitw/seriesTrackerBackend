import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

const hashOf = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * T026 — expiração por inatividade (FR-002, SC-012).
 *
 * Uso a cada 29 dias mantém a sessão indefinidamente; 30 dias corridos sem uso exigem
 * a senha de novo. A validade é janela deslizante: cada renovação emite um novo prazo,
 * em vez de contar a partir do login.
 */
describe('Expiração da sessão por inatividade', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  const created: string[] = [];
  const email = `expiry-${randomUUID()}@example.com`;
  const password = 'segredo123';

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
    prisma = testPrismaClient();
    admin = adminPrismaClient();
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password });
    created.push(registered.body.id);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  const login = async () =>
    (
      await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password })
    ).body.refreshToken as string;

  const expiryOf = async (refreshToken: string): Promise<Date> => {
    const rows = await admin.$queryRaw<{ expires_at: Date }[]>`
      select expires_at from refresh_tokens where token_hash = ${hashOf(refreshToken)}
    `;
    return rows[0]!.expires_at;
  };

  it('a janela é deslizante: cada renovação emite um novo prazo de 30 dias', async () => {
    const primeiro = await login();
    const validadeInicial = await expiryOf(primeiro);

    const renovado = (
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: primeiro })
        .expect(200)
    ).body.refreshToken as string;

    const validadeRenovada = await expiryOf(renovado);
    const dias = (validadeRenovada.getTime() - validadeInicial.getTime()) / 86_400_000;

    // O novo prazo é posterior ao anterior por alguns milissegundos de uso, não
    // limitado ao prazo original contado do login.
    expect(validadeRenovada.getTime()).toBeGreaterThan(validadeInicial.getTime());
    expect(dias).toBeLessThan(0.01);
  });

  it('recusa a renovação quando a validade venceu', async () => {
    const vencido = await login();
    await admin.$executeRaw`
      update refresh_tokens
      set expires_at = now() - interval '1 day'
      where token_hash = ${hashOf(vencido)}
    `;

    const response = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: vencido })
      .expect(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('recusa credencial de renovação desconhecida', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'a'.repeat(64) })
      .expect(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
