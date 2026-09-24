import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

/** Carrega o `.env` da raiz do repositório usando a API nativa do Node (sem dependência). */
export function loadRootEnv(): void {
  const envPath = resolve(__dirname, '../../.env');
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
}

/**
 * A suíte de integração exige um PostgreSQL real.
 *
 * Ausência da variável **falha com mensagem explícita** em vez de pular em silêncio:
 * a RLS não é emulável em dublê, então "sem banco" significa "sem verificação", e uma
 * suíte verde sem verificação é pior do que uma suíte vermelha.
 */
export function requireTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST não definida. Os testes de integração exigem um PostgreSQL real ' +
        '(a Row Level Security não pode ser verificada contra dublê). Veja o README.',
    );
  }
  return url;
}

export function testPrismaClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: requireTestDatabaseUrl() } } });
}

/**
 * Conexão administrativa, **sem RLS**, usada exclusivamente para inspecionar o banco nos
 * testes. Nunca use isto para exercitar comportamento da aplicação: uma verificação feita
 * sem escopo em tabela de usuário retornaria zero linhas e o teste passaria sem provar nada.
 */
export function adminPrismaClient(): PrismaClient {
  const url = process.env.TEST_MIGRATE_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_MIGRATE_DATABASE_URL não definida. Alguns testes precisam inspecionar o banco ' +
        'fora da RLS (por exemplo, para confirmar que uma exclusão em cascata aconteceu).',
    );
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Cria uma conta de teste pela função SECURITY DEFINER que a aplicação usa no registro. */
export async function registerTestUser(
  prisma: PrismaClient,
  id: string,
  email: string,
  passwordHash = 'hash-de-teste',
): Promise<string> {
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    select app_register_user(${id}::uuid, ${email}, ${passwordHash}) as user_id
  `;
  return rows[0]!.user_id;
}

/** Executa `fn` dentro de uma transação que carrega o escopo do usuário informado. */
export async function withUserScope<T>(
  prisma: PrismaClient,
  userId: string,
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/** Remove as contas de teste e o que pende delas, respeitando a RLS (escopo por usuário). */
export async function cleanupUsers(prisma: PrismaClient, userIds: string[]): Promise<void> {
  for (const id of userIds) {
    try {
      await withUserScope(prisma, id, async (tx) => {
        await tx.$executeRawUnsafe(`delete from public.users where id = $1::uuid`, id);
      });
    } catch {
      // conta já removida
    }
  }
}
