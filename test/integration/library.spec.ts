import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import {
  adminPrismaClient,
  cleanupUsers,
  loadRootEnv,
  testPrismaClient,
  withUserScope,
} from '../helpers/db';

/** T041 — integração do perfil de séries (FR-007 a FR-009, FR-016). */
describe('Perfil de séries (integração)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let userA: { id: string; token: string };
  let userB: { id: string; token: string };
  const created: string[] = [];
  const http = new FixtureHttpClient();

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

  const addSeries = async (token: string) =>
    (
      await request(app.getHttpServer())
        .post('/v1/series')
        .set('authorization', `Bearer ${token}`)
        .send({ externalId: 1396 })
    ).body as { id: string };

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();
    userA = await createUser('int-a');
    userB = await createUser('int-b');
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await admin.$executeRawUnsafe(`delete from series where external_id = 1396`);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('adicionar duas vezes não cria duplicata e não perde progresso', async () => {
    const first = await addSeries(userA.token);
    await addSeries(userA.token);

    const rows = await withUserScope(prisma, userA.id, (tx) =>
      tx.$queryRaw<{ count: bigint }[]>`
        select count(*)::bigint as count from user_series where user_id = ${userA.id}::uuid
      `,
    );
    expect(Number(rows[0]?.count)).toBe(1);

    const stillThere = await request(app.getHttpServer())
      .get(`/v1/series/${first.id}`)
      .set('authorization', `Bearer ${userA.token}`)
      .expect(200);
    expect(stillThere.body.id).toBe(first.id);
  });

  it('remover a série descarta o progresso dela para aquele usuário', async () => {
    const series = await addSeries(userA.token);

    const episodes = await withUserScope(prisma, userA.id, (tx) =>
      tx.$queryRaw<{ id: string }[]>`
        select id from episodes where series_id = ${series.id}::uuid limit 1
      `,
    );
    const episodeId = episodes[0]!.id;

    await withUserScope(prisma, userA.id, (tx) =>
      tx.$executeRaw`
        insert into user_episode_progress (user_id, episode_id, watched_at)
        values (${userA.id}::uuid, ${episodeId}::uuid, now())
      `,
    );

    await request(app.getHttpServer())
      .delete(`/v1/series/${series.id}`)
      .set('authorization', `Bearer ${userA.token}`)
      .expect(204);

    // A verificação usa a conexão administrativa: sem escopo, a RLS devolveria zero
    // linhas e o teste passaria sem provar que o descarte aconteceu.
    const rows = await admin.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count
      from user_episode_progress
      where user_id = ${userA.id}::uuid and episode_id = ${episodeId}::uuid
    `;
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('a pessoa B não vê nem altera o perfil da pessoa A', async () => {
    const series = await addSeries(userA.token);

    await request(app.getHttpServer())
      .get(`/v1/series/${series.id}`)
      .set('authorization', `Bearer ${userB.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/v1/series/${series.id}`)
      .set('authorization', `Bearer ${userB.token}`)
      .expect(404);

    const lista = await request(app.getHttpServer())
      .get('/v1/series')
      .set('authorization', `Bearer ${userB.token}`)
      .expect(200);
    expect(lista.body.items).toEqual([]);
  });
});
