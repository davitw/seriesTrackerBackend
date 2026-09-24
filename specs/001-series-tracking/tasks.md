---

description: "Task list for feature implementation"
---

# Tasks: Backend de Acompanhamento de Séries

**Input**: Design documents from `/specs/001-series-tracking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Incluídos e obrigatórios.** O Princípio III da constituição
(`.specify/memory/constitution.md`, v1.1.0) é Test-First (NON-NEGOTIABLE): todo teste de uma fase
MUST ser escrito e falhar antes da implementação correspondente. O Princípio I torna o teste de
isolamento entre dois usuários condição de entrada de qualquer recurso que exponha dado de usuário.

**Organization**: tarefas agrupadas por história de usuário, para que cada uma seja implementável e
testável de forma independente.

**Regeneração**: este arquivo foi regerado em 2026-09-23 após as clarificações que acrescentaram
FR-021 (limitação de taxa), SC-011 e SC-012 (inatividade de 30 dias) e dois casos limite. Nenhuma
tarefa havia sido executada, então os identificadores foram renumerados para permanecerem em ordem
de execução.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história de usuário (`US1`, `US2`, `US3`) — obrigatório nas fases 3 a 5
- Caminho de arquivo exato em cada tarefa

## Path Conventions

Serviço único na raiz deste repositório (ver "Project Structure" em plan.md): `src/`, `test/`,
`prisma/`.

## Bloqueio conhecido antes de começar

`npm install`, migrações contra o Supabase e chamadas ao TMDB exigem **rede**, que a sandbox atual
bloqueia. A primeira execução de T002 e T010/T011 precisará de aprovação. Nenhum teste automatizado
depende de rede (R-011).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicialização do projeto e estrutura base

- [X] T001 Criar a estrutura de diretórios do projeto conforme plan.md: `src/{config,common,database,auth,users,catalog,library,tracking}`, `test/{unit,integration,contract,fixtures/tmdb}`, `prisma/migrations`
- [X] T002 Inicializar o projeto Node.js/TypeScript com NestJS 11 e dependências de runtime em `package.json` (`@nestjs/core`, `@nestjs/common`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/swagger`, `@nestjs/schedule`, `@nestjs/throttler`, `@prisma/client`, `prisma`, `argon2`, `nestjs-pino`, `pino`, `class-validator`, `class-transformer`, `zod`) e scripts `start:dev`, `build`, `test`, `test:integration`, `test:contract`, `test:e2e`
- [X] T003 [P] Configurar TypeScript estrito em `tsconfig.json` e `tsconfig.build.json` (`strict: true`, `noUncheckedIndexedAccess`)
- [X] T004 [P] Configurar ESLint e Prettier em `.eslintrc.cjs`, `.prettierrc` e `.prettierignore`
- [X] T005 [P] Configurar Jest em `test/jest-unit.json` e `test/jest-integration.json`, com `test/jest-e2e.json` para contrato
- [X] T006 [P] Criar `.env.example` com `DATABASE_URL`, `DATABASE_URL_TEST`, `JWT_ACCESS_SECRET`, `TMDB_API_KEY`, `PORT`, `AUTH_RATE_LIMIT_TTL`, `AUTH_RATE_LIMIT_MAX` e criar `.gitignore` cobrindo `.env*`, `node_modules`, `dist`
- [X] T007 [P] Criar `README.md` com setup, comandos e ponteiro para `specs/001-series-tracking/quickstart.md`

**Checkpoint**: projeto compila e a suíte de testes roda vazia

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura que MUST estar pronta antes de qualquer história de usuário

**⚠️ CRITICAL**: nenhuma história pode começar antes desta fase

- [X] T008 Implementar leitura e validação de variáveis de ambiente em `src/config/env.schema.ts` e `src/config/config.module.ts` (falhar no boot se faltar segredo; nunca imprimir valores)
- [X] T009 Criar o schema Prisma com as sete tabelas em `prisma/schema.prisma`, aplicando verbatim as restrições de `data-model.md`: `users.email` UNIQUE sobre `lower(email)`; `refresh_tokens.token_hash` UNIQUE e FK `replaced_by`; `series.external_id` UNIQUE; `seasons` UNIQUE `(series_id, season_number)`; `episodes` UNIQUE `(series_id, season_number, episode_number)`; `user_series` UNIQUE `(user_id, series_id)`; `user_episode_progress` UNIQUE `(user_id, episode_id)`; `ON DELETE CASCADE` em toda FK para `users(id)`; instantes como `TIMESTAMPTZ` e `episodes.air_date` como `DATE`; índices `user_series(user_id, last_watched_at DESC NULLS LAST, added_at DESC)`, `episodes(series_id, season_number, episode_number)` e `episodes(air_date)`
- [X] T010 Criar a migração de RLS em `prisma/migrations/` com `enable row level security` e política **separada por operação** em `users`, `refresh_tokens`, `user_series`, `user_episode_progress` usando `app_current_user_id()`; ausência deliberada de política de `UPDATE` em `user_episode_progress`; função `app_current_user_id()` com `current_setting('app.current_user_id', true)`
- [X] T011 Criar as funções `app_register_user(email, password_hash, id)` e `app_find_credentials(email)` como `SECURITY DEFINER` com `set search_path = public, pg_temp`, concedendo EXECUTE apenas à role da aplicação, e o script de criação da role com `NOSUPERUSER NOBYPASSRLS` em `scripts/setup-db.sql`
- [X] T012 [P] Implementar `PrismaService` em `src/database/prisma.service.ts`
- [X] T013 Implementar o escopo de usuário por requisição em `src/database/user-scope.ts` e `src/database/user-scope.interceptor.ts`: abrir transação, executar `SET LOCAL app.current_user_id = '<uuid>'` e expor o cliente escopado por `AsyncLocalStorage`
- [X] T014 [P] Implementar `Clock` injetável em `src/common/clock/clock.ts` e `src/common/clock/clock.module.ts` (base para FR-013 e FR-002 — sem ele a expiração por inatividade não é testável de forma determinística)
- [X] T015 [P] Implementar o catálogo de códigos de erro de `contracts/errors.md` e o filtro global de exceções em `src/common/errors/error-codes.ts` e `src/common/errors/http-exception.filter.ts` (nunca 200 com erro no corpo; `INTERNAL_ERROR` sem vazar detalhe) — FR-019, SC-010
- [X] T016 [P] Configurar log estruturado JSON em `src/common/logging/logger.module.ts` com `requestId` e redaction de `authorization`, `password`, `refreshToken`, `JWT_ACCESS_SECRET`, `TMDB_API_KEY`; incluir `userId` quando autenticado
- [X] T017 Criar `src/app.module.ts` e `src/main.ts`: prefixo global `/v1`, `ValidationPipe` com `whitelist: true` e `forbidNonWhitelisted: true`, Swagger em `/docs`, registro do interceptor de escopo e **confiança em proxy configurada** (necessário para a limitação de taxa por origem funcionar atrás de balanceador)
- [X] T018 Criar os ajudantes de teste em `test/helpers/db.ts` e `test/helpers/factories.ts`: conexão por `DATABASE_URL_TEST`, aplicação de migrações antes da suíte e falha com mensagem explícita quando a variável não estiver definida (nunca pular em silêncio)
- [X] T019 Escrever o teste fundacional de RLS em `test/integration/rls.spec.ts` provando que, sem `app.current_user_id`, as quatro tabelas retornam zero linhas, e que a role da aplicação tem `rolbypassrls = false` (FR-016, SC-006)

**Checkpoint**: fundação pronta — histórias podem começar

---

## Phase 3: User Story 1 - Entrar na conta com e-mail e senha (Priority: P1) 🎯 MVP

**Goal**: criar conta, entrar, renovar sessão e sair, com as credenciais protegidas, a sessão
persistente por até 30 dias sem uso e as rotas públicas de autenticação limitadas por taxa.

**Independent Test**: cadastrar uma conta nova, sair, entrar novamente e confirmar acesso; tentar
entrar com senha incorreta e confirmar recusa idêntica à de e-mail inexistente; exceder o limite de
requisições e confirmar a recusa por excesso; avançar o relógio 30 dias sem uso e confirmar que a
entrada com senha passa a ser exigida; encerrar a conta e confirmar que o login falha.

### Tests for User Story 1

> **NOTE: escrever primeiro e garantir que FALHAM antes da implementação**

- [X] T020 [P] [US1] Teste de contrato de `POST /v1/auth/register` em `test/contract/auth-register.spec.ts` (201; 409 `EMAIL_ALREADY_REGISTERED` **com código distinguível das demais falhas de cadastro**, conforme FR-001; 422 `VALIDATION_ERROR` com `details.fields`; resposta sem campo de senha)
- [X] T021 [P] [US1] Teste de contrato de `POST /v1/auth/login`, `/refresh` e `/logout` em `test/contract/auth-session.spec.ts` (200 com `accessToken`/`refreshToken`/`tokenType`, 401 `INVALID_CREDENTIALS` **idêntico** para e-mail inexistente e senha errada, 401 `INVALID_REFRESH_TOKEN`, 204 no logout) — FR-002, FR-003, FR-004
- [X] T022 [P] [US1] Teste de contrato de limitação de taxa em `test/contract/auth-rate-limit.spec.ts` (FR-021, SC-011): requisições acima de `AUTH_RATE_LIMIT_MAX` em `POST /v1/auth/register` e `/login` respondem `429 RATE_LIMITED`, e uma pessoa dentro do limite não é afetada
- [X] T023 [P] [US1] Teste de unidade de hash e verificação de senha em `test/unit/password.spec.ts` (rejeita senha curta, hash difere do valor, verificação correta e incorreta)
- [X] T024 [P] [US1] Teste de unidade de tokens em `test/unit/tokens.spec.ts` (access token com `sub`/`exp`, rejeita assinatura inválida e expirado; refresh armazenado só como hash; **cada renovação emite nova validade**)
- [X] T025 [P] [US1] Teste de integração do fluxo de autenticação em `test/integration/auth-flow.spec.ts` (cadastro → login → refresh → logout; rotação invalida o token anterior; reuso responde 401; encerrar conta remove `user_series`, `user_episode_progress`, `refresh_tokens` e invalida o acesso em curso)
- [X] T026 [P] [US1] Teste de integração da expiração por inatividade em `test/integration/session-expiry.spec.ts` com `Clock` controlado (SC-012): uso a cada 29 dias mantém a sessão indefinidamente; 30 dias corridos sem nenhum uso fazem a renovação ser recusada e a entrada com senha ser exigida

### Implementation for User Story 1

- [X] T027 [US1] Implementar `PasswordHasher` com argon2id em `src/auth/password.hasher.ts`
- [X] T028 [US1] Implementar `TokenService` em `src/auth/token.service.ts`: access JWT HS256 de 15 min; refresh opaco de 32 bytes com hash SHA-256 e **validade de 30 dias em janela deslizante** — cada renovação emite um novo refresh com nova validade de 30 dias (comportamento exigido por FR-002/SC-012; leitura como prazo absoluto desde o login reprovaria SC-012 para quem usa o app diariamente)
- [X] T029 [US1] Implementar `AuthRepository` chamando `app_register_user` e `app_find_credentials` em `src/auth/auth.repository.ts`
- [X] T030 [US1] Implementar `AuthService` (registrar, entrar, renovar com rotação, sair) em `src/auth/auth.service.ts`, gerando o `uuid` do usuário na aplicação antes do escopo (R-003)
- [X] T031 [US1] Implementar `AuthController` com os quatro endpoints em `src/auth/auth.controller.ts`
- [X] T032 [US1] Implementar a limitação de taxa por origem em `src/auth/auth-rate-limit.guard.ts` com `@nestjs/throttler`, aplicada a `POST /v1/auth/register` e `POST /v1/auth/login`, com limite por `AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_TTL` e resposta `429 RATE_LIMITED` (FR-021)
- [X] T033 [P] [US1] Implementar `JwtAuthGuard` e a estratégia de validação em `src/auth/jwt-auth.guard.ts` e `src/auth/jwt.strategy.ts`, respondendo `401 UNAUTHENTICATED` para ausente/expirada — FR-005
- [X] T034 [P] [US1] Implementar os DTOs de entrada em `src/auth/dto/register.dto.ts`, `src/auth/dto/login.dto.ts` e `src/auth/dto/refresh.dto.ts` (e-mail válido; senha `minLength(6)`; `additionalProperties` proibido)
- [X] T035 [US1] Implementar `GET /v1/me` em `src/users/users.controller.ts` e `src/users/users.service.ts`
- [X] T036 [US1] Implementar `DELETE /v1/me` (encerramento de conta, FR-020) em `src/users/users.service.ts`, revogando **todas as sessões ativas** da conta (não apenas a atual, conforme a constituição) e dependendo dos `ON DELETE CASCADE` para perfil e progresso
- [X] T037 [US1] Registrar `AuthModule` e `UsersModule` em `src/auth/auth.module.ts` e `src/users/users.module.ts` e conectar ao `AppModule`

**Checkpoint**: User Story 1 funcional e testável isoladamente — é o MVP técnico

---

## Phase 4: User Story 2 - Encontrar e adicionar séries ao meu perfil (Priority: P2)

**Goal**: buscar séries em catálogo externo, adicioná-las ao perfil de forma idempotente e listar /
remover as séries acompanhadas.

**Independent Test**: com uma conta existente, buscar um título conhecido, adicionar o resultado,
listar o perfil e confirmar a presença da série; repetir a adição e confirmar ausência de duplicata;
remover e confirmar que desapareceu.

### Tests for User Story 2

- [X] T038 [P] [US2] Teste de contrato de `GET /v1/catalog/series/search` em `test/contract/catalog-search.spec.ts` (200 com `items`, lista vazia para título inexistente, 503 `CATALOG_UNAVAILABLE` com o provedor fora, 422 para `query` curta) — FR-006
- [X] T039 [P] [US2] Teste de contrato de `POST /v1/series`, `GET /v1/series` e `DELETE /v1/series/{id}` em `test/contract/library.spec.ts` (201 na primeira adição, **200 com `alreadyInProfile: true` na repetição**, ordenação por `lastWatchedAt`, 204 na remoção, 404 `SERIES_NOT_IN_PROFILE`) — FR-007, FR-008
- [X] T040 [P] [US2] Teste de unidade do mapeamento do provedor em `test/unit/tmdb-mapping.spec.ts`, com fixtures versionadas em `test/fixtures/tmdb/` (campo ausente e tipo inesperado tratados explicitamente; nenhum acesso de rede)
- [X] T041 [P] [US2] Teste de integração da biblioteca em `test/integration/library.spec.ts` (adição idempotente sem duplicata; remover descarta `user_episode_progress` daquela série; **usuário B recebe 404 ao ler, remover ou listar recurso do usuário A**) — FR-009, FR-016

### Implementation for User Story 2

- [X] T042 [P] [US2] Implementar os schemas Zod do provedor externo em `src/catalog/tmdb.schemas.ts`
- [X] T043 [US2] Implementar `TmdbAdapter` em `src/catalog/tmdb.adapter.ts`: única fronteira HTTP do provedor, validação Zod, timeout e tratamento de falha sem lançar para o domínio
- [X] T044 [US2] Implementar `CatalogRepository` em `src/catalog/catalog.repository.ts` (upsert de `series`, `seasons` e `episodes`, atualizando `synced_at`)
- [X] T045 [US2] Implementar `CatalogService` em `src/catalog/catalog.service.ts`: busca com cache, leitura local primeiro e degradação para `CATALOG_UNAVAILABLE` somente quando o dado não está em cache (FR-017, FR-018)
- [X] T046 [US2] Implementar `CatalogController` em `src/catalog/catalog.controller.ts` — FR-006
- [X] T047 [US2] Implementar `LibraryRepository` em `src/library/library.repository.ts` com `userId` como parâmetro obrigatório em todos os métodos
- [X] T048 [US2] Implementar `LibraryService` em `src/library/library.service.ts`: adicionar idempotente (sem sobrescrever progresso existente), listar ordenado por `last_watched_at` descendente e remover descartando o progresso da série na mesma transação (FR-009)
- [X] T049 [US2] Implementar `LibraryController` em `src/library/library.controller.ts` — FR-007, FR-008, FR-009
- [X] T050 [P] [US2] Implementar o job de atualização do catálogo com TTL de 24 h em `src/catalog/catalog.sync.job.ts`
- [X] T051 [US2] Registrar `CatalogModule` em `src/catalog/catalog.module.ts` e `LibraryModule` em `src/library/library.module.ts`, conectando ambos ao `AppModule` em `src/app.module.ts`

**Checkpoint**: User Stories 1 e 2 funcionam independentemente

---

## Phase 5: User Story 3 - Marcar episódios e acompanhar o progresso da temporada (Priority: P3)

**Goal**: ver episódios por temporada, marcar e desmarcar assistidos e obter progresso derivado com
a data da próxima liberação.

**Independent Test**: com uma série já no perfil (semeada por fixtures), marcar um episódio e
confirmar que `watchedEpisodes` aumenta e `remainingAired` diminui; tentar marcar episódio com
estreia futura e confirmar 422 com `airDate`; confirmar o invariante
`watchedEpisodes + remainingAired = airedEpisodes` após cada operação.

### Tests for User Story 3

- [X] T052 [P] [US3] Teste de unidade da derivação de progresso em `test/unit/progress.spec.ts` (assistidos, total, faltantes liberados, não liberados, próximo a liberar, e o invariante de SC-004)
- [X] T053 [P] [US3] Teste de unidade da regra de liberação em `test/unit/aired.spec.ts` usando `Clock` fixo: `air_date` nula e futura são "não liberado"
- [X] T054 [P] [US3] Teste de contrato de `GET /v1/series/{seriesId}` e de `PUT`/`DELETE /v1/series/{seriesId}/episodes/{episodeId}/watched` em `test/contract/tracking.spec.ts` (200 com `watchedAt`, 422 `EPISODE_NOT_AIRED` com `details.airDate`, 204 ao desmarcar, 404 para série fora do perfil) — FR-010, FR-011, FR-012, FR-013
- [X] T055 [P] [US3] Teste de integração de marcação em `test/integration/tracking.spec.ts` (marcar duas vezes preserva o primeiro `watchedAt`; desmarcar é idempotente; `last_watched_at` avança e não retrocede; **usuário B não marca episódio da série do usuário A**) — FR-016, SC-003

### Implementation for User Story 3

- [X] T056 [US3] Implementar `ProgressCalculator` em `src/tracking/progress.calculator.ts` (função pura sobre episódios + marcações + hoje; sem coluna de contador — Princípio IV)
- [X] T057 [US3] Implementar `EpisodeAvailabilityService` em `src/tracking/episode-availability.service.ts`, usando `Clock` para classificar liberado / não liberado (FR-013)
- [X] T058 [US3] Implementar `TrackingRepository` em `src/tracking/tracking.repository.ts`: `INSERT ... ON CONFLICT DO NOTHING` na marcação, `DELETE` no desmarque e atualização condicional de `user_series.last_watched_at` na mesma transação
- [X] T059 [US3] Implementar `TrackingService` em `src/tracking/tracking.service.ts`, recusando episódio não liberado com `EPISODE_NOT_AIRED` e `airDate`
- [X] T060 [US3] Implementar `TrackingController` em `src/tracking/tracking.controller.ts`
- [X] T061 [US3] Implementar `SeriesDetailService` em `src/library/series-detail.service.ts` (episódios agrupados por temporada em ordem, estado assistido por episódio, progresso por temporada e próximo a liberar) — FR-014, FR-015
- [X] T062 [US3] Adicionar `GET /v1/series/{seriesId}` em `src/library/library.controller.ts` — FR-010, FR-014, FR-015
- [X] T063 [US3] Registrar `TrackingModule` em `src/tracking/tracking.module.ts` e conectá-lo ao `AppModule` em `src/app.module.ts`

**Checkpoint**: as três histórias funcionam independentemente; o produto entrega seu valor central

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: verificações que atravessam as histórias e portões da constituição

- [X] T064 [P] Executar os cenários C1–C7 de `specs/001-series-tracking/quickstart.md` e registrar o resultado observado de cada um, incluindo C6 com o provedor externo indisponível
- [X] T065 [P] Escrever o teste de contrato que confronta as rotas registradas pela aplicação com `specs/001-series-tracking/contracts/openapi.yaml` em `test/contract/openapi-parity.spec.ts`
- [X] T066 [P] Verificar a redaction de log em `test/integration/logging-redaction.spec.ts` (nenhum token, senha ou segredo na saída de log dos fluxos de autenticação)
- [X] T067 [P] Escrever o teste de resiliência do núcleo em `test/integration/catalog-degradation.spec.ts` (SC-007): com o adapter do provedor desabilitado, listar perfil, consultar série em cache, marcar e desmarcar episódio continuam concluindo com sucesso
- [X] T068 [P] Criar e executar o teste de carga com o perfil de SC-009 em `test/load/scale.spec.ts` (1.000 contas, 50 séries por conta, 5.000 episódios por série, leitura abaixo de 1 s) e registrar os números obtidos
- [X] T069 [P] Criar o conjunto de avaliação da busca por título em `test/fixtures/tmdb/search-cases.json` com títulos conhecidos e medir a parte de SC-005 que depende do backend (mapeamento e ordenação preservada a partir do provedor); **registrar explicitamente que o ranqueamento é do provedor externo e não é garantido por este serviço**
- [X] T070 Auditar a cobertura de FR-001 a FR-021 e de SC-001 a SC-012 por teste e registrar em `specs/001-series-tracking/checklists/requirements.md` o resultado, incluindo a nota de que **SC-002 e SC-008 são métricas de interação do aplicativo cliente e não são verificáveis neste repositório**
- [X] T071 [P] Atualizar `.env.example` e `README.md` com os parâmetros de limitação de taxa e conferir que `specs/001-series-tracking/contracts/openapi.yaml` e `contracts/errors.md` documentam `429 RATE_LIMITED` nas rotas de cadastro e entrada (portão 5 da constituição)
- [X] T072 Revisar os cinco portões de "Fluxo de Desenvolvimento e Portões de Qualidade" da constituição (`.specify/memory/constitution.md`) para a entrega e registrar conformidade ou desvio justificado na seção "Constitution Check" de `specs/001-series-tracking/plan.md`
- [X] T073 Remover o bloco `Sync Impact Report` do topo de `.specify/memory/constitution.md`, conforme a instrução do próprio bloco ("remover antes do commit")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende da Phase 1 — **bloqueia todas as histórias**; T013 depende de T010 e T012; T019 depende de T013; T017 depende de T013, T015 e T016
- **User Stories (Phases 3–5)**: dependem da Phase 2
- **Polish (Phase 6)**: depende das histórias entregues

### User Story Dependencies

- **US1 (P1)**: inicia após a Phase 2; sem dependência de outras histórias
- **US2 (P2)**: inicia após a Phase 2; consome o guard e o escopo de US1 (T033/T013), mas mantém teste próprio
- **US3 (P3)**: inicia após a Phase 2; testável com série semeada por fixtures (`test/helpers/factories.ts`), sem exigir que US2 esteja concluída

### Within Each User Story

Testes escritos e falhando → modelos/repositórios → serviços → controllers → registro no módulo.
Toda tarefa que expõe dado de usuário exige o teste de acesso cruzado da sua história antes de ser
considerada concluída (Princípio I).

### Parallel Opportunities

- Phase 1: T003–T007 em paralelo (arquivos distintos)
- Phase 2: T012, T014, T015, T016 em paralelo
- US1: T020–T026 em paralelo (7 testes, arquivos distintos); T033 e T034 em paralelo
- US2: T038–T041 em paralelo (testes); T042 em paralelo com T047
- US3: T052–T055 em paralelo (testes); T056 e T057 em paralelo
- Polish: T064–T069, T071 em paralelo
- Após a Phase 2, US1/US2/US3 podem ser tocadas por pessoas diferentes

---

## Parallel Example: User Story 1

```bash
# Testes de US1 (escrever primeiro, todos devem falhar):
Task: "Teste de contrato de POST /v1/auth/register em test/contract/auth-register.spec.ts"
Task: "Teste de contrato de login/refresh/logout em test/contract/auth-session.spec.ts"
Task: "Teste de contrato de limitação de taxa em test/contract/auth-rate-limit.spec.ts"
Task: "Teste de unidade de senha em test/unit/password.spec.ts"
Task: "Teste de unidade de tokens em test/unit/tokens.spec.ts"
Task: "Teste de integração do fluxo em test/integration/auth-flow.spec.ts"
Task: "Teste de integração da expiração por inatividade em test/integration/session-expiry.spec.ts"

# Depois, em paralelo:
Task: "Implementar JwtAuthGuard em src/auth/jwt-auth.guard.ts"
Task: "Implementar DTOs em src/auth/dto/*.ts"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 → Phase 2 (bloqueante) → Phase 3 (US1)
2. **PARAR e VALIDAR**: C1 de quickstart.md e `npm run test:e2e` verde
3. US1 sozinha já entrega login, sessão e proteção contra abuso das rotas públicas, mas **não
   entrega o valor do produto** — a spec registra que o núcleo de valor exige US1 + US2 + US3

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → demo de autenticação (C1)
3. US2 → demo de perfil de séries (C2)
4. US3 → demo do núcleo do produto (C3, C4) — primeiro incremento que resolve o problema declarado
5. Polish → C1–C7 completos, auditoria de FR/SC e testes de carga, resiliência e contrato

### Parallel Team Strategy

Com três pessoas: fundação em conjunto; depois US1, US2 e US3 em paralelo, já que a Phase 2 entrega
escopo de usuário, guard, erros, log, `Clock` e fixtures — o suficiente para cada história ser
testada sem depender das outras.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente
- Testes **não são opcionais** neste projeto: Princípio III é NON-NEGOTIABLE
- Cada tarefa tem caminho de arquivo exato para execução sem contexto adicional
- Nenhuma tarefa escreve contador de progresso: progresso é sempre derivado (Princípio IV)
- **Limitação de taxa (FR-021)** entra em US1 e não na fase de polish: a rota de cadastro revela
  existência de conta por decisão consciente, e essa mitigação é o que torna a decisão defensável
- **Expiração por inatividade (SC-012)** depende do `Clock` injetável de T014 e da janela deslizante
  de T028; sem os dois, o critério não é verificável
- **SC-002 e SC-008 não são verificáveis neste repositório** (medem interação no aplicativo cliente);
  T070 registra isso em vez de criar teste que não prova nada
- Rede bloqueada na sandbox: T002, T010 e T011 podem exigir aprovação de rede
