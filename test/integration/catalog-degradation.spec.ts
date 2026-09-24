import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/**
 * T067 — o núcleo continua funcionando com o provedor externo fora (FR-018, SC-007).
 *
 * É a diferença entre "o catálogo é uma dependência" e "o catálogo é uma dependência
 * obrigatória do produto": só a busca e a carga inicial de uma série nova podem falhar.
 */
describe('Degradação com o catálogo indisponível', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  let seriesId: string;
  let episodeId: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();

    const email = `degrade-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' });
    created.push(registered.body.id);
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'segredo123' });
    token = login.body.accessToken;

    const added = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .send({ externalId: 1396 });
    seriesId = added.body.id;

    const detail = await request(app.getHttpServer())
      .get(`/v1/series/${seriesId}`)
      .set('authorization', `Bearer ${token}`);
    episodeId = detail.body.seasons[0].episodes[0].episodeId;

    // A partir daqui, o provedor está fora.
    http.failWith();
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await admin.$executeRawUnsafe(`delete from public.series where external_id = 1396`);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('listar o perfil continua funcionando', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('abrir a série em cache continua funcionando', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/series/${seriesId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.seasons).toHaveLength(2);
  });

  it('marcar e desmarcar episódio continuam funcionando', async () => {
    await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/series/${seriesId}/episodes/${episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('apenas a busca por título novo falha, e falha de forma explícita', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/series/search')
      .query({ query: 'breaking' })
      .set('authorization', `Bearer ${token}`)
      .expect(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });
});
