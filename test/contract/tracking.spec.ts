import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

interface EpisodeView {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  airDate: string | null;
  watched: boolean;
  watchedAt: string | null;
}

/** T054 — contrato de marcação de episódios (FR-010 a FR-013). */
describe('PUT/DELETE /v1/series/:seriesId/episodes/:episodeId/watched', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  let seriesId: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  const detail = async () =>
    (
      await request(app.getHttpServer())
        .get(`/v1/series/${seriesId}`)
        .set('authorization', `Bearer ${token}`)
    ).body as { seasons: { seasonNumber: number; episodes: EpisodeView[] }[] };

  const episodeOf = (
    body: { seasons: { seasonNumber: number; episodes: EpisodeView[] }[] },
    seasonNumber: number,
    episodeNumber: number,
  ): EpisodeView =>
    body.seasons
      .find((season) => season.seasonNumber === seasonNumber)!
      .episodes.find((episode) => episode.episodeNumber === episodeNumber)!;

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();

    const email = `track-${randomUUID()}@example.com`;
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
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await admin.$executeRawUnsafe(`delete from public.series where external_id = 1396`);
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('lista os episódios por temporada com o estado de assistido', async () => {
    const body = await detail();

    expect(body.seasons).toHaveLength(2);
    expect(body.seasons[0]?.episodes).toHaveLength(3);
    expect(body.seasons[0]?.episodes[0]?.watched).toBe(false);
  });

  it('marca um episódio liberado e atualiza o progresso da temporada', async () => {
    const episode = episodeOf(await detail(), 1, 1);

    const response = await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.watched).toBe(true);
    expect(response.body.watchedAt).toBeTruthy();
    expect(response.body.seasonProgress.watchedEpisodes).toBe(1);
    expect(response.body.seasonProgress.remainingAired).toBe(2);
  });

  it('repetir a marcação preserva o instante original', async () => {
    const episode = episodeOf(await detail(), 1, 1);
    const first = await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const second = await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(second.body.watchedAt).toBe(first.body.watchedAt);
  });

  it('recusa episódio com data de estreia futura, informando a data', async () => {
    const episode = episodeOf(await detail(), 2, 4);
    expect(episode.airDate).toBe('2099-01-01');

    const response = await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(422);

    expect(response.body.error.code).toBe('EPISODE_NOT_AIRED');
    expect(response.body.error.details.airDate).toBe('2099-01-01');
  });

  it('recusa episódio sem data conhecida, informando a ausência', async () => {
    const episode = episodeOf(await detail(), 2, 3);
    expect(episode.airDate).toBeNull();

    const response = await request(app.getHttpServer())
      .put(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(422);

    expect(response.body.error.code).toBe('EPISODE_NOT_AIRED');
    expect(response.body.error.details.airDate).toBeNull();
  });

  it('desmarca o episódio e devolve o progresso anterior', async () => {
    const episode = episodeOf(await detail(), 1, 1);

    await request(app.getHttpServer())
      .delete(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);

    const after = await detail();
    expect(episodeOf(after, 1, 1).watched).toBe(false);
  });

  it('desmarcar duas vezes não é erro', async () => {
    const episode = episodeOf(await detail(), 1, 2);
    await request(app.getHttpServer())
      .delete(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/v1/series/${seriesId}/episodes/${episode.episodeId}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('recusa episódio de série fora do perfil', async () => {
    const response = await request(app.getHttpServer())
      .put(`/v1/series/${randomUUID()}/episodes/${randomUUID()}/watched`)
      .set('authorization', `Bearer ${token}`)
      .expect(404);
    expect(response.body.error.code).toBe('SERIES_NOT_IN_PROFILE');
  });
});
