import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATALOG_HTTP_CLIENT } from '../../src/catalog/catalog.tokens';
import { CatalogSyncJob } from '../../src/catalog/catalog.sync.job';
import { createTestApp } from '../helpers/app';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import { adminPrismaClient, cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/**
 * Dublê controlável: permite derrubar ou esvaziar o provedor no meio do teste.
 *
 * O `failWith()` do dublê comum é permanente — este precisa ir e voltar para que o mesmo
 * arquivo cubra o caminho com provedor disponível e indisponível.
 */
const LIST_PATHS = new Set(['/tv/popular', '/tv/on_the_air', '/tv/top_rated']);

class ControllableHttpClient extends FixtureHttpClient {
  failing = false;
  empty = false;

  override getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    if (this.failing) return Promise.reject(new Error('provedor indisponível (dublê)'));
    if (this.empty && LIST_PATHS.has(path)) {
      return Promise.resolve({ page: 1, results: [], total_results: 0 } as T);
    }
    return super.getJson<T>(path, params);
  }
}

/**
 * T011 — integração da descoberta (FR-001, FR-002, FR-008, SC-001, SC-004).
 *
 * O segundo teste é o que importa: adicionar uma série vinda da home precisa resultar em
 * **episódios disponíveis**. É o cenário que o desenho das listas autocontidas existe para
 * garantir — e que uma modelagem com chave estrangeira quebraria em silêncio.
 */
describe('Descoberta na home (integração)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  let userId: string;
  const created: string[] = [];
  const http = new FixtureHttpClient();

  const resetCatalog = async () => {
    await admin.$executeRawUnsafe(`delete from catalog_list_items`);
    await admin.$executeRawUnsafe(`update catalog_lists set synced_at = null`);
    await admin.$executeRawUnsafe(`delete from series where external_id = 1396`);
  };

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();
    await resetCatalog();

    const email = `home-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' });
    userId = registered.body.id;
    created.push(userId);
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'segredo123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await resetCatalog();
    await admin.$disconnect();
    await prisma.$disconnect();
    await app.close();
  });

  it('conta recém-criada, sem nenhuma série, encontra conteúdo na home', async () => {
    const perfil = await request(app.getHttpServer())
      .get('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(perfil.body.total).toBe(0);

    const response = await request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const totalDeItens = response.body.lists.reduce(
      (soma: number, lista: { items: unknown[] }) => soma + lista.items.length,
      0,
    );
    expect(totalDeItens).toBeGreaterThan(0);
  });

  it('adicionar um item da lista resulta em episódios disponíveis (FR-008)', async () => {
    const listas = await request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const popular = listas.body.lists.find((l: { key: string }) => l.key === 'popular');
    const externalId = popular.items[0].externalId as number;
    expect(externalId).toBe(1396);

    // A série não estava no catálogo local: é a primeira vez que alguém a adiciona.
    const antes = await admin.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from series where external_id = ${externalId}
    `;
    expect(Number(antes[0]?.count)).toBe(0);

    const adicionada = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .send({ externalId })
      .expect(201);

    const detalhe = await request(app.getHttpServer())
      .get(`/v1/series/${adicionada.body.id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    // O ponto do cenário: temporadas COM episódios, não uma lista vazia.
    expect(detalhe.body.seasons.length).toBeGreaterThan(0);
    expect(detalhe.body.seasons[0].episodes.length).toBeGreaterThan(0);
  });

  it('adicionar o mesmo item de novo não duplica nem apaga progresso', async () => {
    const listas = await request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const externalId = listas.body.lists.find((l: { key: string }) => l.key === 'popular')
      .items[0].externalId as number;

    const repetida = await request(app.getHttpServer())
      .post('/v1/series')
      .set('authorization', `Bearer ${token}`)
      .send({ externalId })
      .expect(200);

    expect(repetida.body.alreadyInProfile).toBe(true);

    const vinculos = await admin.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from user_series
      where user_id = ${userId}::uuid
    `;
    expect(Number(vinculos[0]?.count)).toBe(1);
  });
});

/**
 * T017 e T018 — degradação e atualização periódica (FR-005, FR-006, FR-007, FR-009,
 * SC-003, SC-006).
 *
 * O que estes testes fazem é **provar** o que a US1 afirma por construção: que o cache é
 * servido antes de qualquer consulta ao provedor, e que indisponibilidade é diferente de
 * ausência de destaques.
 */
describe('Degradação com o provedor de catálogo fora (US2)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: PrismaClient;
  let token: string;
  const created: string[] = [];
  const http = new ControllableHttpClient();

  const resetLists = async () => {
    await admin.$executeRawUnsafe(`delete from catalog_list_items`);
    await admin.$executeRawUnsafe(`update catalog_lists set synced_at = null`);
  };

  const abrirHome = () =>
    request(app.getHttpServer())
      .get('/v1/catalog/lists')
      .set('authorization', `Bearer ${token}`);

  const totalDeItens = (body: { lists: { items: unknown[] }[] }) =>
    body.lists.reduce((soma, lista) => soma + lista.items.length, 0);

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CATALOG_HTTP_CLIENT).useValue(http),
    );
    prisma = testPrismaClient();
    admin = adminPrismaClient();
    await resetLists();

    const email = `degrade-${randomUUID()}@example.com`;
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

  it('com o cache preenchido, o provedor fora não afeta a home', async () => {
    const primeira = await abrirHome().expect(200);
    const itensAntes = totalDeItens(primeira.body);
    expect(itensAntes).toBeGreaterThan(0);

    http.failing = true;
    try {
      const segunda = await abrirHome().expect(200);
      expect(totalDeItens(segunda.body)).toBe(itensAntes);
    } finally {
      http.failing = false;
    }
  });

  it('sem cache e com o provedor fora, a resposta é indisponibilidade — nunca lista vazia', async () => {
    await resetLists();
    http.failing = true;

    try {
      const response = await abrirHome().expect(503);
      expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
    } finally {
      http.failing = false;
    }
  });

  it('lista genuinamente vazia é sucesso, não indisponibilidade', async () => {
    await resetLists();
    http.empty = true;

    try {
      const response = await abrirHome().expect(200);
      expect(response.body.lists).toHaveLength(3);
      expect(totalDeItens(response.body)).toBe(0);
      // A sincronização aconteceu: o provedor respondeu, ainda que sem destaques.
      for (const lista of response.body.lists) {
        expect(lista.updatedAt).toBeTruthy();
      }
    } finally {
      http.empty = false;
    }
  });

  it('a atualização periódica substitui o conteúdo e marca o momento', async () => {
    await resetLists();
    await abrirHome().expect(200);

    // Conteúdo adulterado: o que não está no provedor precisa desaparecer na próxima passada.
    await admin.$executeRawUnsafe(`
      insert into catalog_list_items (list_id, external_id, title, position)
      select id, 999999, 'Item que não existe no provedor', 0
      from catalog_lists where key = 'popular'
    `);
    const antes = await admin.$queryRaw<{ synced_at: Date }[]>`
      select synced_at from catalog_lists where key = 'popular'
    `;

    await app.get(CatalogSyncJob).syncLists();

    const itens = await admin.$queryRaw<{ external_id: number }[]>`
      select i.external_id from catalog_list_items i
      join catalog_lists l on l.id = i.list_id
      where l.key = 'popular' order by i.position
    `;
    expect(itens.map((i) => i.external_id)).not.toContain(999999);
    expect(itens.length).toBeGreaterThan(0);

    const depois = await admin.$queryRaw<{ synced_at: Date }[]>`
      select synced_at from catalog_lists where key = 'popular'
    `;
    expect(depois[0]!.synced_at.getTime()).toBeGreaterThanOrEqual(
      antes[0]!.synced_at.getTime(),
    );
  });
});
