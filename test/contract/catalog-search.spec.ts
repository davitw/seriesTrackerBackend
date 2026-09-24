import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/** T038 — contrato da busca no catálogo (FR-006, FR-018). */
describe('GET /v1/catalog/series/search', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  const http = new FixtureHttpClient();
  const created: string[] = [];

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();

    const email = `catalog-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' });
    created.push(registered.body.id);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'segredo123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await prisma.$disconnect();
    await app.close();
  });

  it('devolve correspondências com título e ano de estreia', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/series/search')
      .query({ query: 'breaking' })
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].externalId).toBe(1396);
    expect(response.body.items[0].title).toBe('Breaking Bad');
    expect(response.body.items[0].firstAirDate).toBe('2008-01-20');
  });

  it('devolve lista vazia quando nada corresponde', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/series/search')
      .query({ query: 'zzzz-nao-existe' })
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.items).toEqual([]);
  });

  it('exige sessão válida', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/series/search')
      .query({ query: 'breaking' })
      .expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('recusa termo de busca curto demais', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/series/search')
      .query({ query: 'b' })
      .set('authorization', `Bearer ${token}`)
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('degrada para CATALOG_UNAVAILABLE quando o provedor está fora', async () => {
    http.failWith();
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/series/search')
      .query({ query: 'breaking' })
      .set('authorization', `Bearer ${token}`)
      .expect(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });
});
