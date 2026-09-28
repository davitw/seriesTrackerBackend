# Implementation Plan: Conteúdo de Descoberta na Home

**Branch**: `002-home-discovery` (o trabalho vai em `main`, sem branch separada) | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-home-discovery/spec.md`

## Summary

Oferecer listas de séries em destaque (populares, em exibição, mais bem avaliadas) para que a home
de quem acabou de se cadastrar nunca fique vazia. O conteúdo vem do catálogo externo já usado pela
busca, é **guardado localmente** e servido a partir do cache — de modo que a home continue
funcionando com o provedor fora do ar, que é exatamente quando ela mais importa (o primeiro acesso).

A decisão de design central está em [research.md](./research.md) R-001: os itens das listas são
**autocontidos** e não referenciam a tabela de séries. Isso mantém a invariante "a tabela de séries
guarda apenas séries completas" — e, como consequência, o `FR-008` (a série adicionada a partir da
home precisa ter episódios) é satisfeito **sem alterar o código existente**.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 26.x — mesmo runtime da feature 001

**Primary Dependencies**: nenhuma nova. Reusa o adapter do catálogo, o cliente HTTP e o job
agendado que já existem

**Storage**: PostgreSQL (Supabase). Duas tabelas novas: `catalog_lists` e `catalog_list_items`

**Testing**: Jest (unidade, com fixtures do provedor), Supertest (contrato), integração contra
PostgreSQL real. Sem rede, como o resto da suíte

**Target Platform**: mesmo serviço HTTP

**Project Type**: web-service (backend único)

**Performance Goals**: as listas vêm do cache local, então herdam o orçamento das leituras de
perfil — p95 abaixo de 500 ms, dentro de `SC-002` ("menos de 1 segundo"). A consulta ao provedor
externo acontece apenas na primeira execução e na atualização periódica.

**Constraints**: o endpoint exige sessão válida (`FR-003`); o serviço não reordena nem pontua o que
o provedor devolve (`FR-004`); indisponibilidade e ausência de destaques são respostas distintas
(`FR-006`)

**Scale/Scope**: três listas, vinte itens cada; duas tabelas; um endpoint; um job estendido

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Evidência / mecanismo |
|-----------|----------|-----------------------|
| I. Isolamento de Dados por Usuário (NON-NEGOTIABLE) | **PASS** | As listas são catálogo, não dado de usuário — não exigem RLS, como `series`/`seasons`/`episodes`. O que o princípio exige aqui é que **nenhuma pessoa alcance dado de outra**: o endpoint de listas não lê nem escreve dado pessoal, e o acesso exige sessão válida (`FR-003`). Nada nesta feature toca tabelas com escopo de usuário. |
| II. Fronteira Externa Isolada | **PASS** | O acesso ao provedor continua exclusivamente pelo adapter existente; a resposta é validada antes de ser guardada. Falha do provedor degrada para o cache (`FR-005`), e apenas a ausência de **qualquer** conteúdo produz indisponibilidade explícita (`FR-006`). |
| III. Test-First (NON-NEGOTIABLE) | **PASS** | Testes escritos e falhando antes da implementação, como na feature 001. O mapeamento da resposta do provedor é testado com fixtures; a degradação é testada desabilitando o adapter. |
| IV. Progresso Derivado, Nunca Duplicado | **PASS** | A feature não cria, lê nem altera progresso. As listas são conteúdo de catálogo. `FR-010` exige explicitamente que as operações existentes permaneçam idênticas. |
| V. Simplicidade e Observabilidade | **PASS** | Uma migração versionada; nenhuma dependência nova; nenhuma tabela adicional além das duas necessárias. A atualização usa o **job agendado existente** em vez de criar um segundo agendador. |

**Sem violações.** A seção de rastreio de complexidade registra abaixo as duas decisões que elevam
a complexidade acima do trivial, ambas exigidas por princípios ou pela spec.

**Re-avaliação pós-Phase 1 (após data-model e contratos)**: os cinco princípios continuam **PASS**.

- **I** — verificado no [data-model.md](./data-model.md): as tabelas novas não têm coluna de usuário
  e nenhuma política de RLS é criada para elas; não há caminho pelo qual a feature toque dado
  pessoal. O contrato exige `Authorization` no endpoint novo ([contracts/openapi.yaml](./contracts/openapi.yaml)).
- **II** — o desenho de degradação está explícito no contrato: `200` com o último conteúdo
  conhecido, `503 CATALOG_UNAVAILABLE` apenas quando não há conteúdo algum e o provedor falhou.
- **III** — os cenários C1–C4 do [quickstart.md](./quickstart.md) são escritos como testes que devem
  falhar antes de qualquer implementação.
- **IV** — o contrato novo não adiciona nenhuma rota que escreva estado; `FR-010` está coberto por
  C4, que exerce as operações existentes depois de usar as listas.
- **V** — uma migração, duas tabelas, um endpoint. Nenhum agendador novo.

**Descoberta relevante para o deploy**: a migração `20260924150000_revoke_anon_privileges` revogou os
privilégios **padrão** do schema `public` para `anon` e `authenticated`. Efeito colateral positivo:
as duas tabelas novas **já nascem sem exposição** ao PostgREST público. A contrapartida é que
`scripts/setup-db.sql` precisa listar as tabelas novas explicitamente, porque o privilégio da role
da aplicação vem de concessão nomeada, não de padrão.

**Verificação final dos portões (T025, após a implementação):**

1. **Suíte passa com teste escrito antes** — 38 de unidade, 36 de integração e 41 de contrato
   verdes (115 no total, mais os 3 de fumaça). Os testes de contrato e integração da US1 foram
   escritos e executados **falhando** (o endpoint respondia 404) antes de o serviço existir.
   **Desvio registrado**: o teste de unidade do mapeamento da lista foi escrito *depois* do método
   no adapter, porque o plano coloca a fronteira externa na fase foundational — ele passou de
   primeira e não chegou a falhar. É a única tarefa desta feature que não seguiu o ciclo vermelho.
2. **Migração versionada junto da mudança de schema** — `20260928120000_catalog_lists`, aplicada
   com `prisma migrate deploy` nos bancos de teste e do Supabase; nenhuma alteração manual.
3. **Teste de isolamento para recurso novo** — a feature não expõe dado de usuário: as tabelas de
   lista não têm coluna de usuário e o endpoint exige sessão válida, verificado no contrato
   (`401 UNAUTHENTICATED` sem token).
4. **Sem segredo no diff** — nenhuma credencial nova; `.env` continua ignorado.
5. **Contrato atualizado na mesma entrega** — o endpoint foi propagado para
   `specs/001-series-tracking/contracts/openapi.yaml` (10 paths agora), e
   `test/contract/openapi-parity.spec.ts` passa com o novo path incluído nas asserções de
   completude.

**Não-regressão em números**: os 97 testes da feature 001 continuam passando sem nenhuma alteração
em `src/catalog/catalog.service.ts`, `src/library/` ou `src/tracking/` — o caminho existente não foi
tocado, como o `FR-010` exige.

## Project Structure

### Documentation (this feature)

```text
specs/002-home-discovery/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output — só o recorte desta feature
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/catalog/
├── catalog.lists.repository.ts   # leitura e escrita das listas (novo)
├── catalog.lists.service.ts      # cache primeiro, provedor como fallback (novo)
├── dto/discover.response.ts      # classes de resposta documentadas no Swagger (novo)
├── catalog.controller.ts         # + GET /v1/catalog/lists (estendido)
├── tmdb.adapter.ts               # + getList(key, limit) (estendido)
├── tmdb.schemas.ts               # + schema da resposta de lista (estendido)
└── catalog.sync.job.ts           # + atualização periódica das listas (estendido)

prisma/
└── migrations/20260928120000_catalog_lists/migration.sql

scripts/
└── setup-db.sql                  # + grant das duas tabelas novas

test/
├── unit/discover-mapping.spec.ts        # mapeamento da resposta do provedor
├── contract/discover.spec.ts            # o endpoint, com o provedor simulado
└── integration/discover.spec.ts         # cache, degradação e não-regressão
```

**Structure Decision**: tudo entra no módulo `catalog` já existente, porque as listas são uma
extensão do mesmo domínio (conteúdo do catálogo externo) e compartilham a fronteira, o cliente HTTP
e o agendador. Criar um módulo novo duplicaria a configuração de acesso ao provedor sem
contrapartida — o serviço passaria a ter duas portas para a mesma dependência externa, o que o
Princípio II pede para evitar.

## Complexity Tracking

Não há violações da constituição a justificar. As duas decisões abaixo elevam a complexidade acima
do trivial e decorrem da spec:

| Decisão | Por que é necessária | Alternativa mais simples rejeitada porque |
|---------|----------------------|-------------------------------------------|
| Guardar as listas no banco em vez de consultar o provedor a cada abertura | `FR-005` e `SC-003` exigem que a home continue servindo conteúdo com o provedor fora do ar | Consulta ao vivo: a home fica vazia exatamente no primeiro acesso quando o provedor falha, que é o cenário que a feature existe para resolver |
| Duas tabelas (`catalog_lists` + `catalog_list_items`) em vez de uma só com a chave da lista repetida | `synced_at` por lista é o que permite ao job saber o que atualizar, e ao contrato informar quando o conteúdo foi obtido | Uma tabela só: o momento da última sincronização teria de ser replicado por item, ou derivado com agregação — mais frágil e sem ganho real |
