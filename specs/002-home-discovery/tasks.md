---

description: "Task list for feature 002 — conteúdo de descoberta na home"
---

# Tasks: Conteúdo de Descoberta na Home

**Input**: Design documents from `/specs/002-home-discovery/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Incluídos e obrigatórios** — o Princípio III da constituição é Test-First
(NON-NEGOTIABLE). Todo teste de uma fase MUST ser escrito e falhar antes da implementação
correspondente.

**Organization**: tarefas agrupadas por história de usuário, para que cada uma seja implementável e
testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história de usuário (`US1`, `US2`) — obrigatório nas fases 3 e 4
- Caminho de arquivo exato em cada tarefa

## Path Conventions

Mesma estrutura da feature 001: `src/`, `test/`, `prisma/`, `scripts/`.

## Conhecimento que evita retrabalho

- **`src/catalog/catalog.service.ts`, `src/library/` e `src/tracking/` não devem ser alterados.**
  O `FR-010` exige que as operações existentes permaneçam idênticas, e o desenho (itens de lista
  autocontidos, R-001) permite isso sem tocar no `ensureCached`.
- `catalogUnavailable()` já existe em `src/common/errors/error-codes.ts` — reusar, não criar.
- O job existente já respeita `DISABLE_CATALOG_SYNC=true`, o que os testes de degradação usam.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a estrutura de dados que as duas histórias usam

- [X] T001 Criar a migração em `prisma/migrations/20260928120000_catalog_lists/migration.sql` com as duas tabelas, conforme `data-model.md`: `catalog_lists(id uuid pk default gen_random_uuid(), key text not null, name text not null, synced_at timestamptz null, created_at timestamptz not null default now())` com `key` UNIQUE; e `catalog_list_items(id uuid pk default gen_random_uuid(), list_id uuid not null references catalog_lists(id) on delete cascade, external_id integer not null, title text not null, first_air_date date null, poster_path text null, position integer not null)`; na mesma migração, `UNIQUE(list_id, external_id)`, índice `(list_id, position)` e a inserção das três listas (`popular`/Populares, `on_the_air`/Em exibição, `top_rated`/Mais bem avaliadas) com `synced_at` nulo
- [X] T002 Adicionar os modelos `CatalogList` e `CatalogListItem` a `prisma/schema.prisma`, refletindo as tabelas do T001 (`synced_at` nullable, `first_air_date` como `DATE`)
- [X] T003 [P] Acrescentar em `scripts/setup-db.sql` o grant das duas tabelas à role da aplicação: `grant select, insert, update, delete on catalog_lists to :"app_role"` e o mesmo para `catalog_list_items` — sem isso a API sobe e a leitura falha com `permission denied`
- [X] T004 Aplicar a migração de `prisma/migrations/20260928120000_catalog_lists/` no banco de desenvolvimento (via `MIGRATE_DATABASE_URL`) e no de teste (via `TEST_MIGRATE_DATABASE_URL`) com `prisma migrate deploy`, e regenerar o client
- [X] T005 Executar `scripts/setup-db.sql` nos dois bancos e confirmar que a role da aplicação lê `catalog_lists` e `catalog_list_items`

**Checkpoint**: as tabelas existem, estão concedidas e as três listas estão registradas sem conteúdo

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a fronteira externa e o acesso a dados, que as duas histórias usam

**⚠️ CRITICAL**: nenhuma história pode começar antes desta fase

- [X] T006 [P] Adicionar o schema de validação da resposta de lista em `src/catalog/tmdb.schemas.ts`: envelope com `page`, `results` e `total_results`, reusando a forma de item já existente na busca (`id`, `name`, `first_air_date`, `overview`, `poster_path`) — campo ausente ou de tipo inesperado deve falhar na validação, como no resto do adapter (R-005)
- [X] T007 Adicionar `getList(key: string, limit: number)` em `src/catalog/tmdb.adapter.ts`: consome a operação de lista do provedor, valida com o schema do T006 e mapeia para o mesmo resumo usado pela busca; resposta inválida lança `CatalogPayloadError`
- [X] T008 Criar `src/catalog/catalog.lists.repository.ts` com: `listAll()` (listas com seus itens, ordenados por `position`), `replaceItems(listId, items)` (remove os existentes e insere os novos **na mesma transação**), `markSynced(listId, at)` e `findKeys()` — todos recebendo a transação como parâmetro, como o repositório de catálogo existente

**Checkpoint**: o adapter produz resumos válidos e o repositório lê e substitui listas

---

## Phase 3: User Story 1 - Encontrar séries quando não acompanho nenhuma (Priority: P1) 🎯 MVP

**Goal**: a pessoa autenticada sem nenhuma série no perfil abre a home e encontra as três listas de
destaques preenchidas, com informação suficiente para escolher e adicionar.

**Independent Test**: criar uma conta, entrar, não adicionar nada e abrir as listas; depois adicionar
um item e conferir que a série entrou no perfil **com episódios**.

### Tests for User Story 1

> **NOTE: escrever primeiro e garantir que FALHAM antes da implementação**

- [X] T009 [P] [US1] Teste de unidade do mapeamento em `test/unit/discover-mapping.spec.ts` com fixtures do provedor: mapeia a resposta para o resumo interno; lista sem itens devolve lista vazia; item com tipo inesperado lança; resposta sem o envelope lança
- [X] T010 [P] [US1] Teste de contrato em `test/contract/discover.spec.ts` conforme `contracts/openapi.yaml`: `200` com três listas identificadas (`popular`, `on_the_air`, `top_rated`), cada item com `externalId`, `title`, `firstAirDate` e `posterPath`; `401 UNAUTHENTICATED` sem sessão
- [X] T011 [P] [US1] Teste de integração em `test/integration/discover.spec.ts` (FR-001, FR-002, FR-008, SC-001, SC-004): conta nova com perfil vazio recebe conteúdo; adicionar um item de lista responde `201` e `GET /v1/series/{id}` devolve temporadas **com episódios**; repetir a adição devolve `200` com `alreadyInProfile: true` sem duplicar

### Implementation for User Story 1

- [X] T012 [US1] Criar as classes de resposta em `src/catalog/dto/discover.response.ts` com `@ApiProperty` (`DiscoverResponseDto`, `CatalogListDto` com `key`/`name`/`updatedAt`/`items`, `CatalogListItemDto`) — sem elas o Swagger mostraria corpos vazios, como aconteceu na feature 001
- [X] T013 [US1] Implementar `src/catalog/catalog.lists.service.ts`: lê do cache local; quando `synced_at` for nulo (lista nunca obtida, R-004), busca no provedor naquele momento, guarda via `replaceItems` e devolve — de modo que um banco recém-migrado não produza home vazia
- [X] T014 [US1] Adicionar `GET /v1/catalog/lists` a `src/catalog/catalog.controller.ts` com `@ApiOperation` e os `@ApiResponse` de `200` e `401`, no mesmo padrão dos endpoints existentes
- [X] T015 [US1] Registrar o repositório e o serviço em `src/catalog/catalog.module.ts`
- [X] T016 [US1] Propagar o endpoint para o contrato vivo em `specs/001-series-tracking/contracts/openapi.yaml` — é ele que `test/contract/openapi-parity.spec.ts` lê, e sem isso o contrato fica desatualizado (portão 5 da constituição)

**Checkpoint**: a home de uma conta nova tem conteúdo, e adicionar a partir dela funciona de ponta a ponta

---

## Phase 4: User Story 2 - Continuar vendo destaques com o provedor fora do ar (Priority: P2)

**Goal**: as listas continuam sendo servidas quando o provedor externo está indisponível, e a
indisponibilidade é distinguível de ausência de destaques.

**Independent Test**: popular o cache, desligar o provedor (`DISABLE_CATALOG_SYNC` ou dublê que
falha) e abrir as listas; depois esvaziar o cache, desligar de novo e conferir a resposta explícita.

### Tests for User Story 2

- [X] T017 [P] [US2] Teste de integração da degradação em `test/integration/discover.spec.ts` (FR-005, FR-006, FR-009, SC-003, SC-006): cache preenchido + provedor falhando devolve `200` com o conteúdo anterior; cache vazio + provedor falhando devolve `503 CATALOG_UNAVAILABLE` (nunca `200` com lista vazia); lista genuinamente vazia devolve `200` com `items: []`
- [X] T018 [P] [US2] Teste de integração da atualização periódica em `test/integration/discover.spec.ts`: com conteúdo novo disponível no provedor, a execução do job substitui os itens e atualiza `synced_at`

### Implementation for User Story 2

- [X] T019 [US2] Estender `src/catalog/catalog.sync.job.ts` para atualizar as três listas junto da sincronização de séries já existente — reusando o mesmo job e o mesmo respeito a `DISABLE_CATALOG_SYNC`, sem criar um segundo agendador (Princípio V)
- [X] T020 [US2] Completar `src/catalog/catalog.lists.service.ts` com a distinção explícita de `FR-006`: provedor falhou **e** cache vazio lança `catalogUnavailable()`; provedor devolveu lista vazia é sucesso com `items: []`

**Checkpoint**: as listas sobrevivem ao provedor indisponível, e a resposta nunca confunde falha com ausência

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: verificações que atravessam as histórias e os portões da constituição

- [X] T021 [P] Executar os cenários C1–C6 de `specs/002-home-discovery/quickstart.md` e registrar o resultado observado de cada um
- [X] T022 [P] Confirmar que os 97 testes da feature 001 continuam passando **sem alteração** em `test/` (unidade, integração e contrato) — é a verificação mais forte de `FR-010` e `SC-005`
- [X] T023 [P] Estender `test/contract/openapi-parity.spec.ts` para cobrir o endpoint novo nas asserções de completude (corpo documentado, erro documentado, segurança declarada)
- [X] T024 Atualizar `README.md` com o endpoint de listas e o cenário de primeira execução (cache frio)
- [X] T025 Conferir os portões da constituição para esta entrega e registrar o resultado na seção "Constitution Check" de `specs/002-home-discovery/plan.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende da Phase 1 — **bloqueia as duas histórias**
- **US1 (Phase 3)**: depende da Phase 2
- **US2 (Phase 4)**: depende da Phase 2; o T020 depende do T013
- **Polish (Phase 5)**: depende das histórias entregues

### User Story Dependencies

- **US1 (P1)**: entrega o caminho completo — listas, cache e endpoint. É o MVP
- **US2 (P2)**: acrescenta a manutenção (job) e a distinção explícita de indisponibilidade. O T017
  testa comportamentos que a US1 já produz por construção (ler do cache, falhar quando não há
  nada) — o valor dele é **provar** o que a US1 afirma, não implementar de novo

### Within Each User Story

Testes escritos e falhando → repositório/DTOs → serviço → controller → registro no módulo → contrato.

### Parallel Opportunities

- Phase 1: T003 em paralelo com T001 e T002
- Phase 2: T006 em paralelo com T001–T005 (arquivo distinto)
- US1: T009, T010 e T011 em paralelo (três arquivos de teste distintos)
- US2: T017 e T018 em paralelo
- Polish: T021, T022 e T023 em paralelo

---

## Implementation Strategy

### MVP First

1. Phase 1 → Phase 2 (bloqueante) → Phase 3 (US1)
2. **PARAR e VALIDAR**: C1 e C2 do quickstart, e a suíte verde
3. US1 sozinha já resolve o problema declarado — a home de uma conta nova deixa de ser vazia

### Incremental Delivery

1. Setup + Foundational → estrutura pronta
2. US1 → a home tem conteúdo e adicionar funciona (demo de C1 e C2)
3. US2 → as listas sobrevivem ao provedor fora, e a atualização periódica as mantém frescas (C3 e C5)
4. Polish → C1–C6 completos, contrato em paridade, portões conferidos

### O que **não** fazer

- Não alterar `src/catalog/catalog.service.ts`, `src/library/` nem `src/tracking/`. O `FR-008` é
  satisfeito pelo desenho das tabelas (R-001), não por mudança no caminho existente
- Não criar um segundo agendador: a atualização entra no job que já existe
- Não inserir séries resumidas na tabela `series`: isso quebraria a invariante que faz o
  `ensureCached` funcionar
