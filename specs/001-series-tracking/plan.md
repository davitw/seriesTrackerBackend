# Implementation Plan: Backend de Acompanhamento de Séries

**Branch**: `001-series-tracking` (nenhuma branch git criada — este diretório não é um repositório git) | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-series-tracking/spec.md`

## Summary

Construir o serviço HTTP que alimenta o aplicativo SeriesTracker: autenticação por e-mail e senha
com JWT, busca de séries em catálogo externo, adição ao perfil do usuário, listagem do perfil,
marcação de episódios assistidos e progresso por temporada com datas de estreia futuras.

Abordagem técnica (decidida por instrução do usuário em 2026-09-23 + pesquisa em
[research.md](./research.md)): **Node.js + TypeScript com NestJS**, autenticação **JWT** própria
(access token curto + refresh token revogável), persistência em **PostgreSQL (Supabase)** via
**Prisma** com migrações versionadas, e isolamento de dados por usuário garantido por **Row Level
Security no banco** combinada com transação escopada por requisição — defesa em profundidade exigida
pelo Princípio I da constituição. Metadados vêm do **TMDB** atrás de um adapter único com cache
local, de modo que o núcleo do produto continue funcionando com o provedor externo indisponível
(Princípio II, FR-018).

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 26.x (runtime presente no ambiente: v26.9.0;
alvo mínimo declarado: Node.js 22 LTS)

**Primary Dependencies**: NestJS 11 (HTTP), `@nestjs/jwt` + `@nestjs/passport` (autenticação),
Prisma 6 + `pg` (persistência), `argon2` (hash de senha), `@nestjs/swagger` (contrato OpenAPI
gerado do código), `nestjs-pino` + `pino` (log estruturado), `@nestjs/schedule` (atualização de
catálogo), `class-validator` + `class-transformer` (validação de entrada HTTP), `zod` (validação de
resposta do catálogo externo), cliente HTTP via `undici`/`fetch` nativo

**Storage**: PostgreSQL 15+ hospedado no Supabase (conexão direta por string de conexão; o
`supabase-js` não é usado no servidor). Tabelas: `users`, `refresh_tokens`, `series`, `seasons`,
`episodes`, `user_series`, `user_episode_progress`

**Testing**: Jest (unidade), Supertest + `@nestjs/testing` (integração/contrato HTTP), testes de
isolamento com dois usuários reais contra PostgreSQL real (RLS não é emulável em dublê). Testes de
unidade e de adapter não tocam a rede — fixtures gravadas do TMDB

**Target Platform**: Serviço HTTP (Linux/container), consumido pelo aplicativo React Native em
`../frontend`. API REST versionada em `/v1`

**Project Type**: web-service (backend único, sem frontend neste repositório)

**Performance Goals**: refinamento mensurável de SC-009, que pede leitura abaixo de 1 segundo no
perfil de escala descrito nele: p95 abaixo de 500 ms para listagem de perfil e consulta de progresso; p95
abaixo de 800 ms para marcação de episódio (inclui transação escopada); busca no catálogo p95
abaixo de 1,2 s em cache miss e abaixo de 100 ms em cache hit. Meta de escala: 1.000 contas ativas,
50 séries por conta, 5.000 episódios por série (SC-009)

**Constraints**: sem rede durante testes automatizados; chave do TMDB e string de conexão somente
por variável de ambiente; nenhum dado pessoal, token ou senha em log; datas de calendário
armazenadas como `DATE` e instantes como `TIMESTAMPTZ` em UTC; toda requisição com dado de usuário
executa em transação com escopo de usuário definido

**Scale/Scope**: MVP de validação de mercado — ordem de milhares de contas; 20 requisitos
funcionais; 3 jornadas de usuário; ~14 operações HTTP; 7 tabelas

**Riscos de ambiente (verificados)**: a sandbox atual bloqueia rede, então `npm install`,
`prisma migrate` contra o Supabase e chamadas ao TMDB exigirão aprovação de rede fora dos testes.
`docker` está instalado mas com `~/.docker/config.json` ilegível no sandbox — testes de integração
devem usar `DATABASE_URL_TEST` apontando para uma instância Postgres acessível, e devem falhar com
mensagem explícita (não pular em silêncio) quando ela não estiver configurada.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Evidência / mecanismo |
|-----------|----------|-----------------------|
| I. Isolamento de Dados por Usuário (NON-NEGOTIABLE) | **PASS** | RLS habilitada em `users`, `refresh_tokens`, `user_series`, `user_episode_progress` com política por operação; role da aplicação sem `BYPASSRLS`; `SET LOCAL app.current_user_id` por transação; `ON DELETE CASCADE` em toda referência a `users`; recurso alheio responde 404; teste obrigatório de acesso cruzado entre dois usuários |
| II. Fronteira Externa Isolada (TMDB) | **PASS** | Um único `TmdbAdapter` (nenhuma chamada HTTP ao TMDB fora dele); resposta validada com Zod antes de persistir; cache local em `series`/`seasons`/`episodes`; falha do provedor degrada para cache e não bloqueia listar/marcar/progresso; chave só em env; testes com fixtures, sem rede |
| III. Test-First (NON-NEGOTIABLE) | **PASS** | Jest configurado com cobertura obrigatória para autorização, derivação de progresso e mapeamento do TMDB; `Clock` injetável torna determinística a regra de "estreia futura"; testes de unidade sem rede, banco ou relógio real |
| IV. Progresso Derivado, Nunca Duplicado | **PASS** | Nenhuma coluna de contador; progresso calculado por agregação na leitura; `UNIQUE(user_id, episode_id)` com `ON CONFLICT` garante idempotência; `watched_at` registrado; desmarcar remove a linha; episódio não liberado recusado com 422 e `airDate`; ordenação das recentes por `user_series.last_watched_at` atualizado na mesma transação da marcação |
| V. Simplicidade e Observabilidade do MVP | **PASS** | Prisma Migrate versionado, sem alteração manual de schema; log JSON com request id e `user_id` e redaction de credenciais; catálogo de códigos de erro estáveis; UTC; escopo limitado ao PRD vigente (sem push, social, vídeo, gamificação, recomendações) |

**Sem violações.** Não há necessidade de justificar complexidade excedente; a seção de rastreio de
complexidade fica registrada abaixo apenas com as decisões estruturais que decorrem de princípios
não-negociáveis.

**Re-avaliação pós-Phase 1 (após data-model, contratos e quickstart)**: os cinco princípios
continuam **PASS**, agora com evidência concreta de design em vez de intenção:

- **I** — as quatro tabelas com dado de usuário têm política por operação definida em
  [data-model.md](./data-model.md) §10, incluindo a ausência deliberada de política de `UPDATE` em
  `user_episode_progress`; `refresh_tokens`, `user_series` e `user_episode_progress` declaram
  `ON DELETE CASCADE` para `users`; o cenário C5 do [quickstart.md](./quickstart.md) verifica o
  isolamento também direto no banco, provando que a garantia é da RLS e não apenas do código.
- **II** — nenhuma operação de contrato exige o provedor externo além de
  `GET /v1/catalog/series/search` e da adição de série ainda não cacheada; todas as demais leem do
  cache local (C6).
- **III** — o `Clock` injetável (R-008) é o que torna C4 e FR-013 determinísticos; os cenários de
  quickstart são a forma de teste ponta a ponta e os testes de unidade não dependem de rede nem de
  banco.
- **IV** — `SeasonProgress` no contrato é um objeto derivado, sem campo persistido correspondente;
  o invariante `watchedEpisodes + remainingAired = airedEpisodes` (SC-004) está declarado como
  critério de aceite em C3.
- **V** — o catálogo de erros tem um código por causa distinguível (FR-019) e o contrato fixa códigos
  estáveis em vez de mensagens; nenhuma rota responde 200 com erro no corpo.

Nenhum gate foi introduzido pelo design que exija emenda da constituição.

**Verificação final dos portões (T072, após a implementação):**

1. **Suíte passa com teste escrito antes** — 6 suítes de unidade, 7 de contrato e 8 de integração
   verdes; cada fase foi executada no ciclo vermelho → verde (os testes da US1 falharam com 404 e
   `TokenService` inexistente antes da implementação).
2. **Migração versionada junto da mudança de schema** — três migrações em
   `prisma/migrations/` (inicial com RLS, função de registro devolvendo id, funções de sessão);
   nenhuma alteração manual de schema.
3. **Teste de isolamento para recurso novo** — `test/integration/rls.spec.ts` prova a garantia na
   camada de dados; `library.spec.ts` e `tracking.spec.ts` provam o 404 para recurso de outra conta.
4. **Sem segredo no diff** — `.env` ignorado pelo `.gitignore`; nenhum segredo em código;
   `test/integration/logging-redaction.spec.ts` verifica que senha e tokens não aparecem no log.
5. **Contrato atualizado na mesma entrega** — `contracts/openapi.yaml` recebeu `429 RATE_LIMITED`
   nas rotas públicas, e `test/contract/openapi-parity.spec.ts` compara o contrato com as rotas que
   a aplicação realmente expõe.

**Desvio registrado:** o runtime efetivamente usado é Node.js 26.9 (não o mínimo de 22 declarado) e
`air_date`, `first_air_date` e `seasons.air_date` são datas de calendário, como a constituição exige;
nenhum princípio foi afetado.

**Pendência documental (fora do escopo desta skill)**: o item `TODO(TECH_STACK_BACKEND)` da Seção 2
de `.specify/memory/constitution.md` está resolvido por esta decisão (Node/TypeScript/NestJS/JWT +
PostgreSQL Supabase), mas a constituição ainda o descreve em aberto. Recomendo rodar
`/speckit-constitution` para fechar o TODO e registrar a stack na Seção 2. Isso **não bloqueia** o
plano: nenhum princípio é violado pela stack escolhida.

## Project Structure

### Documentation (this feature)

```text
specs/001-series-tracking/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── openapi.yaml
│   └── errors.md
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/                 # migrações versionadas (inclui SQL de RLS e funções de auth)
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/                     # leitura e validação de variáveis de ambiente
│   ├── common/
│   │   ├── clock/                  # provider de tempo injetável (testes determinísticos)
│   │   ├── errors/                 # catálogo de códigos + filtro global de exceções
│   │   ├── logging/                # configuração do log estruturado e redaction
│   │   └── pagination/
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── user-scope.ts           # transação com escopo de usuário (SET LOCAL) + AsyncLocalStorage
│   ├── auth/                       # registrar, entrar, renovar, sair, guards, estratégia JWT
│   ├── users/                      # perfil próprio e encerramento de conta
│   ├── catalog/                    # TmdbAdapter, validação, cache e atualização agendada
│   ├── library/                    # perfil de séries: adicionar, listar, remover, detalhes+progresso
│   └── tracking/                   # marcar/desmarcar episódio assistido
├── test/
│   ├── unit/                       # regras puras (progresso, mapeamento TMDB, datas)
│   ├── integration/                # RLS/isolamento, idempotência, fluxos com Postgres real
│   └── contract/                   # endpoints HTTP conforme contracts/openapi.yaml
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

**Structure Decision**: projeto único de serviço HTTP na raiz deste repositório (`backend/`), já que
o frontend vive em repositório separado (`../frontend`, React Native) e não há bibliotecas
compartilhadas a extrair neste MVP. Os módulos são separados por domínio de negócio (`auth`,
`users`, `catalog`, `library`, `tracking`) com infraestrutura transversal em `common/` e
`database/`, o que mantém cada requisito funcional rastreável a um módulo e permite testar
isolamento e progresso sem carregar o restante da aplicação.

## Complexity Tracking

Não há violações da constituição a justificar. As decisões abaixo elevam a complexidade acima do
trivial e decorrem de princípios MUST, não de preferência:

| Decisão | Por que é necessária | Alternativa mais simples rejeitada porque |
|---------|----------------------|-------------------------------------------|
| RLS no banco + funções `SECURITY DEFINER` para registro/credenciais + transação escopada por requisição | Princípio I exige RLS com política por operação; a aplicação precisa ler credenciais sem quebrar o escopo (login ocorre antes de haver usuário autenticado) | Autorizar só na camada de aplicação: uma cláusula `WHERE` esquecida vaza dados de outro usuário e o banco não impede — viola princípio MUST |
| Camada de cache de catálogo (`series`, `seasons`, `episodes`) no banco | Princípios II e FR-017/FR-018 exigem operar com o provedor externo indisponível | Consultar o TMDB a cada leitura: torna o provedor externo dependência síncrona do núcleo |
| Prisma encapsulado em transação por requisição via `AsyncLocalStorage` | Garante que `SET LOCAL` e as queries usem a mesma conexão, condição para a RLS funcionar | Acesso direto ao Prisma em cada serviço: torna o escopo opcional e fácil de esquecer |
