# Phase 0 — Research: Backend de Acompanhamento de Séries

**Feature**: `001-series-tracking` | **Date**: 2026-09-23

Todos os itens antes marcados como indefinidos no Technical Context foram resolvidos. Não restam
`NEEDS CLARIFICATION`.

---

## R-001 — Runtime e framework do serviço

**Decision**: Node.js + TypeScript com NestJS 11, API REST versionada em `/v1`.

**Rationale**: instrução direta do usuário (2026-09-23). NestJS traz injeção de dependência,
módulos por domínio, guards/interceptors e `@nestjs/swagger` — o que permite gerar o contrato
OpenAPI a partir do código e manter o `Clock` injetável exigido pelos testes determinísticos
(Princípio III).

**Alternatives considered**: Fastify puro (menos estrutura, contrato e validação teriam de ser
montados à mão); Express puro (sem ciclo de vida modular, mais código de infraestrutura);
NestJS sem TypeScript estrito (rejeitado — tipagem é o principal ganho).

---

## R-002 — Acesso a dados e migrações

**Decision**: Prisma 6 com `schema.prisma` versionado; migrações SQL geradas por Prisma Migrate e
complementadas manualmente para RLS, funções `SECURITY DEFINER`, índices e constraints.

**Rationale**: atende ao Princípio V (migração versionada obrigatória para toda mudança de schema)
e ao Princípio III (tipos gerados a partir do banco reduzem divergência entre código e schema).
A transação interativa (`$transaction(async (tx) => ...)`) mantém a mesma conexão, que é a
condição para `SET LOCAL` funcionar (ver R-003). O SQL complementar nas migrações é necessário
porque RLS e políticas não são expressáveis no schema do Prisma.

**Alternatives considered**: TypeORM (migrações menos determinísticas, histórico de divergência de
schema); Drizzle (bom controle de SQL, ecossistema menor e sem geração tão direta para este time);
SQL puro com `pg` (controle total, mas repositórios e mapeamento manuais elevam o custo de
manutenção do MVP).

---

## R-003 — Mecanismo de isolamento de dados por usuário (Princípio I, MUST)

**Decision**: defesa em profundidade com três camadas:
1. **Banco**: RLS habilitada em `users`, `refresh_tokens`, `user_series` e
   `user_episode_progress`, com política separada por operação
   (`USING`/`WITH CHECK` sobre `app_current_user_id()`), e a role da aplicação criada com
   `NOSUPERUSER NOBYPASSRLS`.
2. **Sessão**: toda requisição com dado de usuário executa dentro de uma transação que começa com
   `SET LOCAL app.current_user_id = '<uuid>'`. A transação é gerenciada por um interceptor e o
   cliente escopado é exposto por `AsyncLocalStorage`, de forma que nenhum serviço possa consultar
   o banco fora do escopo.
3. **Aplicação**: repositórios recebem o `userId` como parâmetro obrigatório; os dois pontos
   legítimos de acesso fora do escopo (registro e verificação de credenciais) usam funções
   `SECURITY DEFINER` com `search_path` fixo, que não expõem a tabela.

Complementos exigidos pelo princípio: `ON DELETE CASCADE` em toda referência a `users`; resposta
404 (não 403) para recurso de outro usuário; chave de service role nunca no cliente; teste de
acesso cruzado entre dois usuários como condição de entrada do recurso.

**Rationale**: o Princípio I é NON-NEGOTIABLE e exige RLS com política por operação. Como o login
ocorre antes de existir usuário autenticado, o escopo por sessão não pode cobrir esse caso — daí as
funções `SECURITY DEFINER`, que preservam a RLS estrita em vez de abrir uma exceção ampla.

**Alternatives considered**:
- *Autorizar somente na aplicação*: rejeitada — uma cláusula `WHERE` ausente vaza dados e o banco
  não impede, contrariando MUST do Princípio I.
- *Delegar autenticação ao Supabase Auth + PostgREST*: rejeitada — o usuário definiu JWT próprio
  com NestJS; também acoplaria o modelo de autorização a um fornecedor.
- *Role com BYPASSRLS e escopo só no código*: rejeitada pelo mesmo motivo da primeira; anula a
  defesa em profundidade.
- *Usuário de banco por requisição*: rejeitada — custo de conexão e complexidade operacional
  incompatíveis com o MVP.

---

## R-004 — Autenticação: tokens e proteção de senha

**Decision**:
- **Senha**: `argon2id` (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1 — parâmetros OWASP),
  hash e verificação no módulo `auth`, nunca logado.
- **Access token**: JWT HS256, validade de 15 minutos, claims `sub` (id do usuário), `email`, `iat`,
  `exp`, `jti`; segredo por variável de ambiente (`JWT_ACCESS_SECRET`).
- **Refresh token**: valor opaco aleatório (32 bytes), armazenado apenas como hash SHA-256 em
  `refresh_tokens`, validade de 30 dias, **rotação a cada uso** (o token usado é revogado e um novo
  é emitido, com `replaced_by` apontando para o sucessor).
- **Logout**: revoga o refresh token apresentado. Sessão persistente até logout ou expiração —
  atende FR-002 e FR-004.

**Rationale**: access token curto limita o dano de vazamento e o refresh revogável entrega a
"saída" exigida pela spec sem manter sessão de servidor. Guardar só o hash do refresh token evita
que um vazamento de banco conceda sessões.

**Alternatives considered**: sessão em cookie (o cliente é aplicativo nativo, não navegador);
refresh como JWT de vida longa (não revogável — conflita com FR-004); bcrypt cost 12 (aceitável,
mas argon2id é a primeira escolha atual); armazenar refresh em claro (vazamento concederia sessão).

---

## R-005 — Provedor de metadados de séries

**Decision**: TMDB como catálogo externo, acessado exclusivamente por `TmdbAdapter`, com respostas
validadas por Zod e mapeadas para o modelo interno antes de persistir.

**Rationale**: o PRD do projeto (`series_tracker_mvp_prd.md`) fixa o TMDB como fonte obrigatória de
séries, temporadas, episódios, datas de estreia e imagens. O adapter único é o que torna o Princípio
II verificável; a validação na fronteira protege o banco de campos ausentes ou de tipo inesperado.

**Alternatives considered**: TVDB e OMDb (menor cobertura de datas de estreia futuras); catálogo
próprio (fora do escopo do MVP). **Ponto a confirmar com o usuário**: esta decisão é herdada do PRD
e não foi repetida na instrução de stack — se o provedor for outro, apenas o adapter muda.

**Formato da credencial (2026-09-24)**: a credencial do TMDB MUST ser um **Read Access Token
(v4)** enviado no cabeçalho `Authorization: Bearer <token>`. Enviá-la como `?api_key=`, que é o
formato da API Key v3, devolve **401** — verificado contra a API real em 2026-09-24 (401 contra
200). O `.env.example` documenta o formato esperado, porque as duas credenciais convivem no painel
do provedor e são fáceis de confundir.

---

## R-006 — Atualização e cache de metadados

**Decision**: cache local obrigatório em `series`/`seasons`/`episodes`, alimentado (a) na busca e na
adição de uma série e (b) por job agendado (`@nestjs/schedule`) que atualiza séries em exibição com
mais de 24 h desde a última sincronização. Toda leitura do produto usa o cache; o provedor externo é
consultado apenas quando o dado está ausente ou expirado.

**Rationale**: é o que sustenta FR-017/FR-018 e SC-007 — listar, marcar e ver progresso precisam
funcionar com o provedor indisponível. O TTL de metadados é independente das marcações do usuário,
que nunca são afetadas por sincronização.

**Alternatives considered**: consulta ao vivo a cada requisição (quebra FR-018); cache apenas em
memória (perde o dado em reinício e não cobre séries antigas).

---

## R-007 — Derivação de progresso (Princípio IV, MUST)

**Decision**: nenhuma coluna de contador. O progresso por temporada é calculado por agregação sobre
`episodes` e `user_episode_progress` no momento da leitura, dentro da transação escopada. Índices de
apoio: `episodes(series_id, season_number, episode_number)`,
`user_episode_progress(user_id, episode_id)` e `user_series(user_id, last_watched_at DESC)`.

**Rationale**: cumpre o princípio e elimina por construção a divergência entre lista e contador
(SC-004). A marcação atualiza `user_series.last_watched_at` na mesma transação, mantendo a ordenação
das recentes correta (FR-008).

**Alternatives considered**: colunas `watched_count`/`total_count` (exigiriam justificativa de
performance medida — inexistente nesta escala; e criam risco de divergência); view materializada
(refresh adiciona latência e complexidade operacional desnecessárias para 5.000 episódios).

---

## R-008 — Determinação de "episódio não liberado" e tempo

**Decision**: um `Clock` injetável fornece "hoje" para toda regra temporal. Episódio é não liberado
quando `air_date` é nulo ou maior que hoje (data de calendário, sem fuso). Marcação de episódio não
liberado é recusada com 422 e o campo `airDate` na resposta.

**Rationale**: FR-013 só é testável de forma determinística com tempo controlado (Princípio III).
Tratar data nula como "não liberado" evita que uma lacuna de metadados permita marcar episódio
inexistente.

**Alternatives considered**: usar `new Date()` diretamente nos serviços (testes dependentes de
relógio real e flaky); usar `air_date >= CURRENT_DATE` no SQL (compara no fuso do banco e torna a
regra intestável sem banco).

---

## R-009 — Contrato de API

**Decision**: contrato REST documentado em `contracts/openapi.yaml` como artefato de design, e
gerado a partir dos decorators do `@nestjs/swagger` em tempo de execução; teste de contrato
comparando as rotas registradas com o documento.

**Rationale**: o frontend é um aplicativo React Native em repositório separado, ainda sem camada de
API (verificado: nenhuma chamada HTTP em `frontend/src`); o contrato é a única interface acordada
entre os dois. Mantê-lo como artefato revisável atende ao portão 5 da constituição.

**Alternatives considered**: GraphQL (o cliente não pede seleção de campos e a agregação de
progresso é simples); geração de cliente tipado a partir do OpenAPI (útil depois, não bloqueia o
MVP).

---

## R-010 — Erros e observabilidade

**Decision**: filtro global de exceções que traduz erros de domínio para HTTP com código estável
(`snake_case` em maiúsculas, catálogo em `contracts/errors.md`), `requestId` por requisição, e log
estruturado JSON via `nestjs-pino` com redaction de `authorization`, `password`, `refreshToken` e
segredos. Nada de 200 com erro no corpo.

**Rationale**: Princípio V e FR-019/SC-010. Código estável é o que permite ao aplicativo distinguir
"não autorizado" de "não encontrado" e de "provedor indisponível" sem interpretar texto.

**Alternatives considered**: `HttpException` ad hoc espalhada (códigos divergentes entre módulos,
impossível documentar); log em texto livre (não consultável).

---

## R-011 — Estratégia de testes

**Decision**:
- **Unidade (Jest)**: regras puras — cálculo de progresso, classificação liberado/não liberado,
  mapeamento TMDB→modelo interno, geração/validação de token. Sem rede, sem banco, tempo injetado.
- **Integração (Jest + Postgres real)**: isolamento entre dois usuários (leitura e escrita
  cruzadas), idempotência de adicionar série e de marcar episódio, recusa de episódio não liberado,
  descarte de progresso ao remover série, e teste direto das políticas de RLS.
- **Contrato (Supertest)**: cada operação descrita em `contracts/openapi.yaml`.
- Banco de teste por `DATABASE_URL_TEST`, migrações aplicadas antes da suíte. Ausência de banco
  configurado **falha com mensagem explícita**, não pula em silêncio.
- Fixtures gravadas do TMDB versionadas em `test/fixtures/tmdb/`; nenhum teste acessa a rede.
- **Fumaça (fora da suíte padrão)**: `npm run test:smoke` exercita o `TmdbAdapter` real contra a
  rede, validando credencial e contrato do provedor. Não entra em `npm test`, que continua
  determinístico e sem rede.

**Rationale**: Princípio III exige teste que falha antes e determinismo; RLS não pode ser verificada
contra dublê, então os testes de isolamento usam banco real.

**Lição registrada (2026-09-24)**: uma suíte baseada em fixtures é estruturalmente cega para
defeitos de fronteira — credencial inválida, formato de autenticação errado, mudança de contrato do
provedor. Nenhum dos 93 testes da suíte detectou que a busca por título estava quebrada contra a API
real. Fixtures continuam sendo a escolha certa para o dia a dia; a verificação de fumaça existe para
cobrir exatamente o que elas substituem.

**Alternatives considered**: dublê de banco nos testes de isolamento (não prova a política de RLS);
testcontainers (preferível, mas `docker` está inutilizável no ambiente atual — registrado como risco
no plano).
