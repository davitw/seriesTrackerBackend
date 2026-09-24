import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/** T055 — integração da marcação (FR-011 a FR-014, SC-004). */
describe('Marcação de episódios (integração)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let userA: { id: string; token: string };
  let userB: { token: string };
  let seriesId: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  const detail = async (token: string) =>
    (
      await request(app.getHttpServer())
        .get(`/v1/series/${seriesId}`)
        .set('authorization', `Bearer ${token}`)
    ).body;

  const episodeId = (body: { seasons: { seasonNumber: number; episodes: { episodeId: string; episodeNumber: number }[] }[] }, season: number, episode: number): string =>
    body.seasons
      .find((s: { seasonNumber: number }) => s.seasonNumber === season)!
      .episodes.find((e: { episodeNumber: number }) => e.episodeNumber === episode)!.episodeId;

  const createUser = async (prefix: string) => {
    const email = `${prefix}-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' });
    created.push(registered.body.id);
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'segredo123' });
    return { id: registered.body.id as string, token: login.body.accessToken as string };
  };

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();

    userA = await createUser('track-a');
    userB = await createUser('track-b');

    const added = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${userA.token}`)
      .send({ externalId: 1396 });
    seriesId = added.body.id;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await admin.$executeRawUnsafe(`delete from series where external_id = 1396`);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('marcar duas vezes grava uma única linha', async () => {
    const body = await detail(userA.token);
    const id = episodeId(body, 1, 1);

    await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${id}/watched`)
      .set('authorization', `Bearer ${userA.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${id}/watched`)
      .set('authorization', `Bearer ${userA.token}`)
      .expect(200);

    const rows = await admin.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from user_episode_progress
      where user_id = ${userA.id}::uuid and episode_id = ${id}::uuid
    `;
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('mantém o invariante assistidos + faltantes = liberados', async () => {
    const body = await detail(userA.token);

    for (const season of body.seasons as { progress: Record<string, number> }[]) {
      expect(season.progress.watchedEpisodes! + season.progress.remainingAired!).toBe(
        season.progress.airedEpisodes,
      );
    }
  });

  it('o recente avança com a marcação e nunca retrocede', async () => {
    const before = await admin.$queryRaw<{ last_watched_at: Date | null }[]>`
      select last_watched_at from user_series
      where user_id = ${userA.id}::uuid and series_id = ${seriesId}::uuid
    `;

    // Um instante à frente força o caso de retrocesso se a implementação sobrescrever.
    const future = new Date(Date.now() + 3_600_000);
    await admin.$executeRaw`
      update user_series set last_watched_at = ${future}
      where user_id = ${userA.id}::uuid and series_id = ${seriesId}::uuid
    `;

    const body = await detail(userA.token);
    const id = episodeId(body, 1, 2);
    await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${id}/watched`)
      .set('authorization', `Bearer ${userA.token}`)
      .expect(200);

    const after = await admin.$queryRaw<{ last_watched_at: Date }[]>`
      select last_watched_at from user_series
      where user_id = ${userA.id}::uuid and series_id = ${seriesId}::uuid
    `;

    expect(after[0]!.last_watched_at.getTime()).toBeGreaterThanOrEqual(future.getTime());
    expect(
      after[0]!.last_watched_at.getTime() >= (before[0]?.last_watched_at?.getTime() ?? 0),
    ).toBe(true);
  });

  it('a pessoa B não marca episódio da série da pessoa A', async () => {
    const body = await detail(userA.token);
    const id = episodeId(body, 1, 3);

    const response = await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${id}/watched`)
      .set('authorization', `Bearer ${userB.token}`)
      .expect(404);
    expect(response.body.error.code).toBe('SERIES_NOT_IN_PROFILE');

    const rows = await admin.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from user_episode_progress
      where episode_id = ${id}::uuid
    `;
    expect(Number(rows[0]?.count)).toBe(0);
  });
});
