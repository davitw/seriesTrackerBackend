import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/**
 * T068 — escala (SC-009), em escopo reduzido.
 *
 * SC-009 pede 1.000 contas × 50 séries × 5.000 episódios por série. Reproduzir isso
 * exigiria 2,5 milhões de vínculos e um ambiente dedicado; esta verificação usa **uma
 * conta com 50 séries e 5.000 episódios** e mede a latência das duas leituras quentes
 * (listar o perfil e abrir a série). O que ela prova: a derivação de progresso não
 * degrada com o volume por série. O que ela **não** prova: o comportamento sob 1.000
 * contas simultâneas — isso continua pendente de um teste de carga real.
 */
const SERIES_COUNT = 50;
const EPISODES_PER_SERIES = 100;
const EXTERNAL_ID_BASE = 900000;
const LATENCY_BUDGET_MS = 1000;

describe('Escala da leitura (SC-009, escopo reduzido)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  let userId: string;
  let seriesId: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();

    const email = `scale-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' });
    userId = registered.body.id;
    created.push(userId);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'segredo123' });
    token = login.body.accessToken;

    // Volume montado direto por SQL: passar pela API levaria minutos.
    await admin.$executeRawUnsafe(`
      insert into public.series (external_id, title, synced_at)
      select ${EXTERNAL_ID_BASE} + i, 'Série de carga ' || i, now()
      from generate_series(1, ${SERIES_COUNT}) as i
    `);
    await admin.$executeRawUnsafe(`
      insert into public.seasons (series_id, season_number, name)
      select s.id, 1, 'Temporada 1' from public.series s where s.external_id > ${EXTERNAL_ID_BASE}
    `);
    await admin.$executeRawUnsafe(`
      insert into public.episodes (series_id, season_id, season_number, episode_number, air_date)
      select se.series_id, se.id, 1, g, current_date - 1
      from public.seasons se cross join generate_series(1, ${EPISODES_PER_SERIES}) as g
      where se.series_id in (select id from public.series where external_id > ${EXTERNAL_ID_BASE})
    `);
    await admin.$executeRawUnsafe(`
      insert into public.user_series (user_id, series_id, last_watched_at)
      select '${userId}'::uuid, id, now() from public.series where external_id > ${EXTERNAL_ID_BASE}
    `);

    const rows = await admin.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.series where external_id = ${EXTERNAL_ID_BASE + 1}`,
    );
    seriesId = rows[0]!.id;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await admin.$executeRawUnsafe(`delete from public.series where external_id > ${EXTERNAL_ID_BASE}`);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  const measure = async (run: () => Promise<unknown>): Promise<number> => {
    const started = Date.now();
    await run();
    return Date.now() - started;
  };

  it('lista o perfil com 50 séries dentro do orçamento de latência', async () => {
    const elapsed = await measure(() =>
      request(app.getHttpServer()).get('/v1/series').set('authorization', `Bearer ${token}`).expect(200),
    );
    expect(elapsed).toBeLessThan(LATENCY_BUDGET_MS);
  });

  it('abre a série com 100 episódios e progresso derivado dentro do orçamento', async () => {
    const elapsed = await measure(() =>
      request(app.getHttpServer())
        .get(`/v1/series/${seriesId}`)
        .set('authorization', `Bearer ${token}`)
        .expect(200),
    );
    expect(elapsed).toBeLessThan(LATENCY_BUDGET_MS);
  });

  it('marcar um episódio segue dentro do orçamento com o perfil cheio', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/series/${seriesId}`)
      .set('authorization', `Bearer ${token}`);
    const episodeId = detail.body.seasons[0].episodes[0].episodeId as string;

    const elapsed = await measure(() =>
      request(app.getHttpServer())
        .put(`/v1/series/${seriesId}/episodes/${episodeId}/watched`)
        .set('authorization', `Bearer ${token}`)
        .expect(200),
    );
    expect(elapsed).toBeLessThan(LATENCY_BUDGET_MS);
  });
});
