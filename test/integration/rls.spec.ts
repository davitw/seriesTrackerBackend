import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  cleanupUsers,
  loadRootEnv,
  registerTestUser,
  testPrismaClient,
  withUserScope,
} from '../helpers/db';

/**
 * T019 — teste fundacional de RLS.
 *
 * Este é o portão do Princípio I: prova que o isolamento entre usuários é garantido
 * **pelo banco**, não apenas pelo código da aplicação. Se este teste falhar, todo o
 * resto do isolamento é intenção, não garantia.
 */
describe('RLS: o banco garante o isolamento entre usuários (FR-016, SC-006)', () => {
  let prisma: PrismaClient;
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    loadRootEnv();
    prisma = testPrismaClient();
    await registerTestUser(prisma, userA, `rls-${userA}@example.com`);
    await registerTestUser(prisma, userB, `rls-${userB}@example.com`);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, [userA, userB]);
    await prisma.$disconnect();
  });

  it('a role da aplicação não é superusuária nem ignora a RLS', async () => {
    const [role] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = current_user
    `;
    expect(role?.rolsuper).toBe(false);
    expect(role?.rolbypassrls).toBe(false);
  });

  it('a RLS está habilitada e forçada nas quatro tabelas de usuário', async () => {
    const rows = await prisma.$queryRaw<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in ('users', 'refresh_tokens', 'user_series', 'user_episode_progress')
    `;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('sem escopo de usuário, nenhuma linha das quatro tabelas é visível', async () => {
    for (const table of [
      'users',
      'refresh_tokens',
      'user_series',
      'user_episode_progress',
    ]) {
      const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `select count(*)::bigint as count from ${table}`,
      );
      expect(Number(row?.count)).toBe(0);
    }
  });

  it('com escopo, a pessoa enxerga apenas a própria conta', async () => {
    const rows = await withUserScope(prisma, userA, (tx) =>
      tx.$queryRaw<{ id: string }[]>`select id from users`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(userA);
  });

  it('a pessoa B não enxerga a conta da pessoa A', async () => {
    const rows = await withUserScope(prisma, userB, (tx) =>
      tx.$queryRaw<{ id: string }[]>`select id from users`,
    );
    expect(rows.map((row) => row.id)).not.toContain(userA);
  });

  it('a pessoa B não consegue apagar a conta da pessoa A', async () => {
    const affected = await withUserScope(prisma, userB, (tx) =>
      tx.$executeRawUnsafe(`delete from users where id = $1::uuid`, userA),
    );
    expect(affected).toBe(0);

    const [stillThere] = await withUserScope(prisma, userA, (tx) =>
      tx.$queryRaw<{ count: bigint }[]>`select count(*)::bigint as count from users`,
    );
    expect(Number(stillThere?.count)).toBe(1);
  });

  it('o escopo não vaza entre transações', async () => {
    await withUserScope(prisma, userA, async (tx) => {
      await tx.$queryRaw`select 1`;
    });

    const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from users
    `;
    expect(Number(row?.count)).toBe(0);
  });
});
