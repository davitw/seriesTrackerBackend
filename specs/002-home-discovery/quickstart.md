# Quickstart — validação do conteúdo de descoberta na home

**Feature**: `002-home-discovery` | **Date**: 2026-09-28

Guia de validação ponta a ponta. Não contém implementação: as unidades de trabalho ficam em
`tasks.md`. Contrato: [contracts/openapi.yaml](./contracts/openapi.yaml); modelo de dados:
[data-model.md](./data-model.md).

## Pré-requisitos

Os mesmos da feature 001 (ver `specs/001-series-tracking/quickstart.md`): banco acessível, variáveis
de ambiente preenchidas, migrações aplicadas e `scripts/setup-db.sql` executado — **incluindo o
grant das duas tabelas novas**.

```bash
npm ci
npx prisma migrate deploy
psql "$MIGRATE_DATABASE_URL" -f scripts/setup-db.sql
npm run start:dev
```

## Testes

```bash
npm test                  # unidade — mapeamento da resposta do provedor, sem rede
npm run test:integration  # cache, degradação e não-regressão (requer DATABASE_URL_TEST)
npm run test:contract     # o endpoint conforme contracts/openapi.yaml
npm run test:e2e          # integração + contrato
```

## Cenários de validação

### C1 — A home de quem acabou de se cadastrar tem conteúdo (FR-001, SC-001)

**Este é o cenário que justifica a feature.** Crie uma conta nova, sem adicionar nenhuma série, e
abra as listas:

```bash
TOKEN=$(curl -s -X POST localhost:3000/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"nova@example.com","password":"segredo123"}' | jq -r .accessToken)

curl -s localhost:3000/v1/catalog/lists -H "authorization: Bearer $TOKEN" | jq
```

**Esperado**: `200` com três listas identificadas (`popular`, `on_the_air`, `top_rated`), cada uma
com até vinte itens, e cada item com `externalId`, `title`, `firstAirDate` e `posterPath`. O perfil
dessa conta está vazio (`GET /v1/series` → `total: 0`) e mesmo assim a home tem conteúdo.

### C2 — Adicionar a partir da lista resulta em episódios (FR-008, SC-004)

**Este é o cenário do defeito latente.** Pegue um item de uma lista e adicione ao perfil:

```bash
EXTERNAL_ID=$(curl -s localhost:3000/v1/catalog/lists -H "authorization: Bearer $TOKEN" \
  | jq -r '.lists[0].items[0].externalId')

curl -s -X POST localhost:3000/v1/series -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d "{\"externalId\":$EXTERNAL_ID}" | jq '.id'

curl -s "localhost:3000/v1/series/$SERIES_ID" -H "authorization: Bearer $TOKEN" | jq '.seasons'
```

**Esperado**: a adição responde `201` e — o ponto do cenário — `GET /v1/series/{id}` devolve
**temporadas com episódios**, não uma lista vazia. Uma série adicionada a partir da home se comporta
como qualquer outra.

Repetir a adição responde `200` com `alreadyInProfile: true`, sem duplicar nem apagar progresso.

### C3 — Com o provedor fora, a home continua servida (FR-005, SC-003)

Com as listas já obtidas (C1 basta), torne o provedor indisponível e abra a home de novo.

**Esperado**: `200`, com o mesmo conteúdo de antes. Nenhum erro, nenhuma lista vazia. É a diferença
entre "o catálogo é uma dependência" e "o catálogo é uma dependência obrigatória da home".

### C4 — Nada do que já existia mudou (FR-010, SC-005)

Depois de usar as listas, exercite o caminho antigo: listar o perfil, buscar por título, abrir uma
série, marcar e desmarcar episódio, conferir o progresso.

**Esperado**: resultados e ordem idênticos aos de antes da feature. A verificação mais forte é a
suíte existente — os 97 testes da feature 001 devem continuar passando sem alteração.

### C5 — Sem cache e sem provedor, a resposta é explícita (FR-006, SC-006)

Com um banco novo (listas nunca sincronizadas) **e** o provedor indisponível, abra a home.

**Esperado**: `503 CATALOG_UNAVAILABLE` — nunca `200` com `items: []`. As duas respostas significam
coisas diferentes: uma diz "não consegui obter", a outra diria "não há destaques", e confundi-las
levaria a pessoa a acreditar na segunda.

### C6 — Lista genuinamente vazia não é erro (FR-007)

Com o provedor respondendo uma lista sem itens (dublê de teste), abra a home.

**Esperado**: `200` com aquela lista em `items: []` e as demais preenchidas. Ausência de destaques
não é falha.

## Critérios de aceite da validação

- C1–C6 executados com o resultado esperado registrado
- `npm run test:e2e` verde, incluindo os 97 testes da feature 001 sem alteração
- Nenhuma linha do caminho existente modificada (verificável por inspeção do diff em
  `src/catalog/catalog.service.ts`, `src/library/` e `src/tracking/`)
