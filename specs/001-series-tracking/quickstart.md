# Quickstart — validação do backend de acompanhamento de séries

**Feature**: `001-series-tracking` | **Date**: 2026-09-23

Guia de execução e validação ponta a ponta. Não contém implementação: os detalhes de código e as
unidades de trabalho ficam em `tasks.md`. Contrato: [contracts/openapi.yaml](./contracts/openapi.yaml);
modelo de dados: [data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 22+ (ambiente de referência: v26.9.0) e npm 11+
- Instância PostgreSQL 15+ acessível — Supabase do projeto ou Postgres local
- Credencial de API do catálogo externo (TMDB) — apenas para os cenários que consultam o catálogo
- Rede liberada para `npm install`, migrações contra o Supabase e chamadas ao TMDB (a sandbox atual
  bloqueia rede; fora dos testes isso exige aprovação)

Variáveis de ambiente (`.env`, nunca versionado; `.env.example` versionado):

```text
DATABASE_URL=postgresql://<usuario>:<senha>@<host>:5432/postgres?schema=public
DATABASE_URL_TEST=postgresql://<usuario>:<senha>@<host>:5432/series_tracker_test
JWT_ACCESS_SECRET=<segredo-forte>
TMDB_API_KEY=<chave>
PORT=3000
```

## Setup

```bash
npm ci
npx prisma migrate deploy       # aplica migrações, RLS e funções de autenticação
npm run start:dev               # API em http://localhost:3000, OpenAPI em /docs
```

Verificação de que a RLS está ativa (não apenas configurada):

```bash
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('users','refresh_tokens','user_series','user_episode_progress');"
psql "$DATABASE_URL" -c "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user;"
```

Esperado: `relrowsecurity = t` nas quatro tabelas e `rolbypassrls = f` para a role da aplicação.

## Testes

```bash
npm run test              # unidade: progresso, datas, mapeamento do catálogo — sem rede
npm run test:integration  # RLS/isolamento, idempotência, fluxos (requer DATABASE_URL_TEST)
npm run test:contract     # endpoints conforme openapi.yaml
npm run test:e2e          # suíte completa
```

Se `DATABASE_URL_TEST` não estiver definida, a suíte de integração **falha com mensagem explícita**
— ela não é pulada em silêncio, porque o isolamento entre usuários é verificação obrigatória.

## Cenários de validação ponta a ponta

Cada cenário corresponde a uma jornada da spec e deve ser executado contra a API em execução.

### C1 — US1: cadastro, login e saída (FR-001…FR-004)

```bash
curl -s -X POST localhost:3000/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"ana@example.com","password":"segredo123"}'
curl -s -X POST localhost:3000/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"ana@example.com","password":"segredo123"}'
```

Esperado: `201` com o perfil (sem senha em nenhum campo) e `200` com `accessToken` e `refreshToken`.
Repetir o cadastro com o mesmo e-mail responde `409 EMAIL_ALREADY_REGISTERED`; senha errada responde
`401 INVALID_CREDENTIALS` com mensagem idêntica à de e-mail inexistente. Após
`POST /v1/auth/logout`, o `refreshToken` usado não renova mais (`401 INVALID_REFRESH_TOKEN`).

### C2 — US2: buscar e adicionar séries (FR-006…FR-009)

```bash
curl -s "localhost:3000/v1/catalog/series/search?query=breaking" -H "authorization: Bearer $TOKEN"
curl -s -X POST localhost:3000/v1/series -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"externalId":1396}'
curl -s localhost:3000/v1/series -H "authorization: Bearer $TOKEN"
```

Esperado: busca retorna correspondências com `title` e `firstAirDate`; a primeira adição responde
`201`; **repetir a adição responde `200` com `alreadyInProfile: true` e não cria duplicata**; a
listagem traz a série e o total.

### C3 — US3: marcar episódios e ver progresso (FR-010…FR-015)

```bash
curl -s localhost:3000/v1/series/$SERIES_ID -H "authorization: Bearer $TOKEN"      # episódios + progresso
curl -s -X PUT localhost:3000/v1/series/$SERIES_ID/episodes/$EPISODE_ID/watched -H "authorization: Bearer $TOKEN"
```

Esperado: a marcação responde `200` com `watched: true` e `watchedAt` preenchido e o
`seasonProgress` retornado já conta o episódio. Repetir a marcação mantém o `watchedAt` original
(idempotência). Desmarcar (`DELETE`) responde `204` e o progresso volta ao valor anterior.
**Invariante**: em toda leitura, `watchedEpisodes + remainingAired = airedEpisodes` (SC-004).

### C4 — Episódio não liberado (FR-013)

Escolha um episódio com `airDate` futura (a resposta de `GET /v1/series/{id}` o identifica) e tente
marcá-lo.

Esperado: `422 EPISODE_NOT_AIRED` com `details.airDate` preenchido. Episódio com `airDate: null`
recebe a mesma recusa, com `airDate: null`.

### C5 — Isolamento entre usuários (FR-016, SC-006)

Crie duas contas (Ana e Bruno), adicione uma série para Ana e execute, com o token de **Bruno**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/v1/series/$ANA_SERIES_ID -H "authorization: Bearer $BRUNO_TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3000/v1/series/$ANA_SERIES_ID -H "authorization: Bearer $BRUNO_TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' -X PUT localhost:3000/v1/series/$ANA_SERIES_ID/episodes/$EPISODE_ID/watched -H "authorization: Bearer $BRUNO_TOKEN"
curl -s localhost:3000/v1/series -H "authorization: Bearer $BRUNO_TOKEN"
```

Esperado: `404 SERIES_NOT_IN_PROFILE` nas três primeiras (nunca `403`) e lista vazia na última;
nenhuma escrita de Bruno altera o perfil ou o progresso de Ana.

Defesa em profundidade: a mesma tentativa deve ser recusada **no banco**, fora da aplicação. Com a
role da aplicação e sem `app.current_user_id` definido, um `select count(*) from user_episode_progress`
retorna 0 linhas — confirmando que a RLS, e não apenas o código, sustenta o isolamento.

### C6 — Operação com o catálogo externo indisponível (FR-018, SC-007)

Com as séries já adicionadas, invalide a credencial do catálogo (ou bloqueie a saída de rede para o
provedor) e repita: listar perfil, abrir uma série em cache, marcar e desmarcar episódio.

Esperado: todas concluem com sucesso. Apenas `GET /v1/catalog/series/search` responde
`503 CATALOG_UNAVAILABLE`, e adicionar uma série nova (não cacheada) também responde `503`.

### C7 — Encerramento de conta (FR-020)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3000/v1/me -H "authorization: Bearer $ANA_TOKEN"
```

Esperado: `204`; login com as mesmas credenciais passa a responder `401`; não restam linhas de Ana
em `user_series`, `user_episode_progress` nem `refresh_tokens`.

## Critérios de aceite da validação

- C1–C7 executados com o resultado esperado registrado
- `npm run test:e2e` verde, incluindo os testes de isolamento entre dois usuários
- Nenhum segredo, token ou senha presente na saída de log da aplicação durante os cenários
- Log de cada requisição com `requestId`, rota, status e `userId` (quando autenticado)
