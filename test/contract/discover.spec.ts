import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/** T010 — contrato do endpoint de listas (FR-001, FR-002, FR-003). */
describe('GET /v1/catalog/lists', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  /** Estado conhecido: nenhuma lista sincronizada, para o caminho da primeira execução. */
  const resetLists = async () => {
    await admin.$executeRawUnsafe(`delete from catalog_list_items`);
    await admin.$executeRawUnsafe(`update catalog_lists set synced_at = null`);
  };

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();
    await resetLists();

    const email = `discover-${randomUUID()}@example.com`;
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
    await resetLists();
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('devolve as três listas, cada uma identificada', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.lists).toHaveLength(3);
    expect(response.body.lists.map((l: { key: string }) => l.key)).toEqual([
      'on_the_air',
      'popular',
      'top_rated',
    ]);

    for (const list of response.body.lists) {
      expect(typeof list.name).toBe('string');
      expect(list.name.length).toBeGreaterThan(0);
      expect(Array.isArray(list.items)).toBe(true);
    }
  });

  it('cada item traz o necessário para escolher e adicionar', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const popular = response.body.lists.find((l: { key: string }) => l.key === 'popular');
    expect(popular.items).toHaveLength(3);
    expect(popular.items[0]).toEqual({
      externalId: 1396,
      title: 'Breaking Bad',
      firstAirDate: '2008-01-20',
      posterPath: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    });
  });

  it('informa quando o conteúdo foi obtido', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    for (const list of response.body.lists) {
      expect(list.updatedAt).toBeTruthy();
    }
  });

  it('exige sessão válida', async () => {
    const response = await request(app.getHttpServer()).get('/v1/catalog/lists').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
