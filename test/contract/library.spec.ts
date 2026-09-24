import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/** T039 — contrato do perfil de séries (FR-007, FR-008, FR-009). */
describe('POST/GET/DELETE /v1/series', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  let otherToken: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  const loginAs = async (email: string): Promise<string> => {
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' });
    created.push(registered.body.id);
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'segredo123' });
    return login.body.accessToken as string;
  };

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();
    token = await loginAs(`lib-a-${randomUUID()}@example.com`);
    otherToken = await loginAs(`lib-b-${randomUUID()}@example.com`);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    // O catálogo é global; limpar evita que uma execução interfira na seguinte.
    await admin.$executeRawUnsafe(`delete from series where external_id in (1396, 60059)`);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('adiciona a série ao perfil com 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .send({ externalId: 1396 })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.title).toBe('Breaking Bad');
    expect(response.body.externalId).toBe(1396);
  });

  it('repetir a adição é idempotente: 200 e alreadyInProfile', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .send({ externalId: 1396 })
      .expect(200);

    expect(response.body.alreadyInProfile).toBe(true);

    const rows = await admin.$queryRawUnsafe<{ count: bigint }[]>(
      `select count(*)::bigint as count from user_series us
         join series s on s.id = us.series_id
        where s.external_id = 1396
          and us.user_id = (select id from users where email = (
            select email from users order by created_at limit 1))`,
    );
    expect(Number(rows[0]?.count ?? 0n)).toBeLessThanOrEqual(1);
  });

  it('lista o perfil com o progresso derivado', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.total).toBeGreaterThanOrEqual(1);
    const item = response.body.items.find(
      (entry: { externalId: number }) => entry.externalId === 1396,
    );
    expect(item.title).toBe('Breaking Bad');
    expect(item.overall.watchedEpisodes).toBe(0);
    expect(item.overall.airedEpisodes).toBeGreaterThan(0);
    expect(item.seasons.length).toBeGreaterThanOrEqual(2);
  });

  it('a série de outra pessoa responde 404, nunca 403', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const seriesId = list.body.items[0].id as string;

    const response = await request(app.getHttpServer())
      .get(`/v1/series/${seriesId}`)
      .set('authorization', `Bearer ${otherToken}`)
      .expect(404);
    expect(response.body.error.code).toBe('SERIES_NOT_IN_PROFILE');
  });

  it('recusa série inexistente no catálogo', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .send({ externalId: 999999 })
      .expect(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });

  it('remove a série do perfil com 204 e depois responde 404', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const seriesId = list.body.items[0].id as string;

    await request(app.getHttpServer())
      .delete(`/v1/series/${seriesId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);

    const response = await request(app.getHttpServer())
      .delete(`/v1/series/${seriesId}`)
      .set('authorization', `Bearer ${token}`)
      .expect(404);
    expect(response.body.error.code).toBe('SERIES_NOT_IN_PROFILE');
  });
});
