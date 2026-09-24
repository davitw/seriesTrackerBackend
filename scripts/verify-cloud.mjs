/**
 * Verificador do banco em nuvem.
 *
 * Confirma, contra um banco real (Supabase ou outro), as garantias que a suíte local
 * prova apenas contra o PostgreSQL de desenvolvimento:
 *
 *   1. a role da aplicação NÃO bypassa a RLS;
 *   2. sem escopo de sessão, nenhuma linha de dado de usuário é visível;
 *   3. com `SET LOCAL app.current_user_id`, o escopo passa a valer — e isso sobrevive a
 *      um pooler de conexões, que é o ponto mais frágil de qualquer deploy gerenciado;
 *   4. a função SECURITY DEFINER de registro funciona para a role sem privilégios.
 *
 * Uso: `node scripts/verify-cloud.mjs`
 *
 * Não altera dados além da própria conta de teste, que é removida no fim.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const env = (key) => {
  const match = readFileSync('.env', 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) throw new Error(`Variável ${key} ausente no .env`);
  return match[1].trim();
};

const prisma = new PrismaClient({ datasources: { db: { url: env('DATABASE_URL') } } });

const checks = [];
const report = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const [role] = await prisma.$queryRawUnsafe(
    `select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  report(
    'a role da aplicação não é superusuária nem bypassa RLS',
    role.rolsuper === false && role.rolbypassrls === false,
    `role=${role.rolname} super=${role.rolsuper} bypassrls=${role.rolbypassrls}`,
  );

  const tabelas = ['users', 'refresh_tokens', 'user_series', 'user_episode_progress'];
  const rls = await prisma.$queryRawUnsafe(
    `select relname, relrowsecurity, relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and relname = any($1)`,
    tabelas,
  );
  const todasForcadas =
    rls.length === tabelas.length && rls.every((r) => r.relrowsecurity && r.relforcerowsecurity);
  report('RLS habilitada e forçada nas quatro tabelas', todasForcadas, `${rls.length}/4`);

  const id = randomUUID();
  const email = `verify-${id.slice(0, 8)}@example.com`;

  await prisma.$queryRawUnsafe(
    `select app_register_user($1::uuid, $2, $3)`,
    id,
    email,
    'hash-de-verificacao',
  );
  report('registro funciona pela função SECURITY DEFINER', true, email);

  const semEscopo = await prisma.$queryRawUnsafe(
    `select count(*)::int as total from public.users`,
  );
  report('sem escopo de sessão, nenhuma linha é visível', semEscopo[0].total === 0,
    `total=${semEscopo[0].total}`);

  const comEscopo = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`select set_config('app.current_user_id', $1, true)`, id);
    return tx.$queryRawUnsafe(`select count(*)::int as total from public.users`);
  });
  report(
    'SET LOCAL sobrevive ao pooler e o escopo passa a valer',
    comEscopo[0].total === 1,
    `total=${comEscopo[0].total}`,
  );

  const outra = randomUUID();
  const crossUser = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`select set_config('app.current_user_id', $1, true)`, outra);
    return tx.$queryRawUnsafe(`select count(*)::int as total from public.users`);
  });
  report('um escopo diferente não enxerga a conta criada', crossUser[0].total === 0,
    `total=${crossUser[0].total}`);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`select set_config('app.current_user_id', $1, true)`, id);
    await tx.$executeRawUnsafe(`delete from public.users where id = $1::uuid`, id);
  });
  console.log('limpeza: conta de verificação removida');

  const falhas = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - falhas}/${checks.length} verificações passaram`);
  return falhas;
}

main()
  .then(async (falhas) => {
    await prisma.$disconnect();
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(`FALHOU: ${error.message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
