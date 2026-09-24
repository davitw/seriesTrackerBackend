# SeriesTracker — Backend

Serviço HTTP que alimenta o aplicativo SeriesTracker: autenticação por e-mail e senha com JWT,
busca de séries em catálogo externo, perfil de séries do usuário, marcação de episódios assistidos
e progresso por temporada.

Stack: **Node.js + TypeScript + NestJS**, **PostgreSQL** (Supabase), **Prisma**, **JWT** próprio
(access de curta duração + refresh revogável com rotação).

Plano e especificação completos: [`specs/001-series-tracking/`](specs/001-series-tracking/).

## Pré-requisitos

- Node.js 22+ (ambiente de referência: v26.9.0) e npm 11+
- Instância PostgreSQL 15+ acessível
- Credencial da API do TMDB (para busca e carga de metadados)

## Rodar localmente

O serviço precisa de um PostgreSQL 15+ e de **duas roles** — uma privilegiada para as migrações e
uma sem privilégio para a aplicação. Se você já tem o banco no Supabase configurado, use as
variáveis dele e pule o passo 3.

### 1. Dependências

```bash
npm ci
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env`:

| Variável | O que é |
|----------|---------|
| `DATABASE_URL` | conexão da **aplicação** — com o usuário `series_tracker_app` |
| `MIGRATE_DATABASE_URL` | conexão **privilegiada**, usada só pelas migrações |
| `DATABASE_URL_TEST` | banco usado pelos testes de integração |
| `TEST_MIGRATE_DATABASE_URL` | idem, privilegiada |
| `JWT_ACCESS_SECRET` | segredo de assinatura — gere com `openssl rand -base64 48` |
| `TMDB_API_KEY` | Read Access Token **v4** do TMDB (o valor longo que começa com `ey`) |

> **Não inclua `?schema=public` nas URLs.** O Prisma usa `public` por padrão, e o parâmetro faz o
> `psql` recusar a mesma string — o que quebraria o passo 5 e o `scripts/verify-cloud.mjs`.

### 3. Criar a role da aplicação (só na primeira vez)

```bash
psql "$MIGRATE_DATABASE_URL" \
  -c "create role series_tracker_app login password '<senha-forte>' nosuperuser nobypassrls nocreatedb;"
```

`nosuperuser` e `nobypassrls` não são detalhe de estilo: são o que faz a Row Level Security valer
como garantia, e não apenas como intenção.

### 4. Aplicar as migrações

```bash
npx prisma migrate deploy          # lê MIGRATE_DATABASE_URL
```

### 5. Conceder os privilégios à role da aplicação

```bash
psql "$MIGRATE_DATABASE_URL" -f scripts/setup-db.sql
```

**Não pule este passo.** Sem ele a API sobe normalmente, mas toda consulta falha com
`permission denied for table …` — porque a aplicação roda com uma role que só recebe o que este
script concede.

### 6. Subir o servidor

```bash
npm run start:dev
```

- API: <http://localhost:3000>
- Swagger: <http://localhost:3000/docs>
- OpenAPI em JSON: <http://localhost:3000/docs-json>

O `start:dev` recompila a cada alteração. Para uma execução sem watch: `npm start`.

### 7. Conferir que funcionou

```bash
curl -s -X POST localhost:3000/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"teste@example.com","password":"segredo123"}'
```

Espera `201` com o `id` da conta criada. Para conferir o banco — RLS ativa, escopo de sessão e
as funções de autenticação — rode `node scripts/verify-cloud.mjs`, que funciona contra qualquer
banco, local inclusive.

> **Se o login começar a responder `429`:** é a limitação de taxa das rotas de autenticação
> (padrão: 10 requisições por minuto e por origem). Ajuste `AUTH_RATE_LIMIT_MAX` no `.env` enquanto
> estiver testando.

## Usar a API pelo Swagger

1. Abra <http://localhost:3000/docs>
2. `POST /v1/auth/register` — crie uma conta
3. `POST /v1/auth/login` — copie o `accessToken` da resposta
4. Clique em **Authorize** (o cadeado, no topo da página) e cole o token
5. Os endpoints autenticados passam a funcionar direto na página

Cada endpoint documenta o corpo esperado, os parâmetros, o formato da resposta e os códigos de
erro — inclusive os de domínio, como `SERIES_NOT_IN_PROFILE` e `EPISODE_NOT_AIRED`.

## Subir em banco gerenciado (Supabase)

O desenho depende de **duas roles diferentes**, e isso não é opcional:

- as **migrações** usam uma conexão privilegiada — criam tabelas, habilitam RLS e criam as
  funções `SECURITY DEFINER`;
- a **aplicação** usa uma role sem privilégio algum. No Supabase, a role `postgres` tem
  `BYPASSRLS`: usá-la na aplicação faria a Row Level Security ser **integralmente ignorada**
  (mesmo com `FORCE`), e o isolamento entre usuários voltaria a depender só do código.

### 1. Escolher a conexão

Use **Direct connection** ou **Session pooler** — ambas na porta **5432**.
O **Transaction pooler (porta 6543) não serve**: o `SET LOCAL app.current_user_id` que
sustenta a RLS se perderia no meio da requisição, sem erro visível.

### 2. Criar a role da aplicação

```bash
psql "$MIGRATE_DATABASE_URL" \
  -c "create role series_tracker_app login password '<senha-forte>' nosuperuser nobypassrls nocreatedb;"
```

### 3. Apontar as variáveis

- `MIGRATE_DATABASE_URL` — a conexão privilegiada (`postgres.<ref>@…pooler.supabase.com:5432/postgres`)
- `DATABASE_URL` — a mesma conexão, com o usuário `series_tracker_app.<ref>` e a senha da role

### 4. Aplicar e verificar

```bash
npx prisma migrate deploy                    # usa MIGRATE_DATABASE_URL
psql "$MIGRATE_DATABASE_URL" -f scripts/setup-db.sql
node scripts/verify-cloud.mjs                # confirma RLS, escopo e pooler
```

`verify-cloud.mjs` cria uma conta de teste, confirma que a role não bypassa a RLS, que sem
escopo nenhuma linha é visível, que o `SET LOCAL` **sobrevive ao pooler** e que um escopo
diferente não enxerga a conta — e remove a conta no fim.

### 5. Privilégios de `anon` e `authenticated`

O Supabase configura `ALTER DEFAULT PRIVILEGES` no schema `public`: toda tabela criada ali
nasce com privilégios para `anon`, `authenticated` e `service_role`. As duas primeiras são
alcançáveis pelo PostgREST com a **anon key**, que é distribuída a clientes e tratada como
pública.

A migração `20260924150000_revoke_anon_privileges` revoga esses privilégios e altera os padrões
— a segunda parte é o que impede a próxima tabela de nascer exposta. Nada disso toca a role da
aplicação.

`service_role` mantém o acesso, por decisão consciente: ela tem `BYPASSRLS` e revogar dela
também tiraria a visibilidade das tabelas no Table Editor do painel. Se preferir o acesso
mínimo também ali, acrescente `service_role` à lista daquela migração.

## Testes

```bash
npm test                # unidade — sem rede, sem banco
npm run test:integration  # RLS/isolamento, idempotência, fluxos (requer DATABASE_URL_TEST)
npm run test:contract     # endpoints conforme contracts/openapi.yaml
npm run test:e2e          # integração + contrato
npm run test:smoke        # fumaça do catálogo externo — USA REDE, fora do fluxo padrão
```

`npm run test:smoke` valida a credencial e o contrato do provedor externo com chamadas reais. Ele
**não** roda em `npm test`, porque a suíte padrão precisa ser determinística e não depender de
terceiros — mas é a única verificação que pega credencial inválida ou mudança de contrato do
provedor, já que todo o resto usa fixtures.

`DATABASE_URL_TEST` é obrigatória para integração: sem ela a suíte **falha com mensagem explícita**
em vez de pular, porque o isolamento entre usuários é verificação obrigatória (Princípio I da
constituição em `.specify/memory/constitution.md`).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Conexão principal da aplicação (role **sem** privilégios: é o que faz a RLS valer) |
| `DATABASE_URL_TEST` | Conexão usada só pelos testes de integração e carga |
| `MIGRATE_DATABASE_URL` | Conexão privilegiada, usada **apenas** por `prisma migrate deploy` |
| `TEST_MIGRATE_DATABASE_URL` | Conexão privilegiada do banco de teste (usada por inspeções fora da RLS) |
| `JWT_ACCESS_SECRET` | Segredo de assinatura do access token (`openssl rand -base64 48`) |
| `TMDB_API_KEY` | Read Access Token **v4** do TMDB (o valor longo que começa com `ey`), enviado no cabeçalho `Authorization` |
| `PORT` | Porta HTTP (padrão 3000) |
| `AUTH_RATE_LIMIT_TTL` | Janela da limitação de taxa das rotas de autenticação, em segundos |
| `AUTH_RATE_LIMIT_MAX` | Máximo de requisições por janela e por origem |

## Validação ponta a ponta

Os cenários C1–C7 (autenticação, perfil, progresso, episódio não liberado, isolamento entre
usuários, catálogo indisponível e encerramento de conta) estão em
[`specs/001-series-tracking/quickstart.md`](specs/001-series-tracking/quickstart.md).
