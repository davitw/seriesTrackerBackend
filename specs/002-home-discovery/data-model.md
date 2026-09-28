# Phase 1 — Data Model: Conteúdo de Descoberta na Home

**Feature**: `002-home-discovery` | **Date**: 2026-09-28 | **Store**: PostgreSQL (Supabase)

Convenções iguais às da feature 001: instantes em `TIMESTAMPTZ` (UTC), datas de calendário em
`DATE`, chaves `uuid` geradas pelo banco.

---

## 1. `catalog_lists`

Conjunto nomeado de destaques. Não contém dado de usuário.

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `key` | `text` NOT NULL | `UNIQUE`. Identificador estável usado na API (`popular`, `on_the_air`, `top_rated`) |
| `name` | `text` NOT NULL | Rótulo legível, para a interface não precisar traduzir a chave |
| `synced_at` | `timestamptz` NULL | Momento da última obtenção bem-sucedida. **`NULL` significa "nunca sincronizada"** — é o que dispara a busca na primeira abertura |
| `created_at` | `timestamptz` NOT NULL | default `now()` |

As três listas são inseridas pela própria migração, para que existam antes de qualquer requisição
e a chave tenha um dono único.

---

## 2. `catalog_list_items`

Posição de uma série dentro de uma lista. **Autocontido** — não referencia `series` (ver
[research.md](./research.md) R-001).

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `list_id` | `uuid` NOT NULL | FK → `catalog_lists(id)` **ON DELETE CASCADE** |
| `external_id` | `integer` NOT NULL | Identificador da série no catálogo externo. É o valor aceito em `POST /v1/series` |
| `title` | `text` NOT NULL | |
| `first_air_date` | `date` NULL | Ano de estreia, para distinguir homônimas |
| `poster_path` | `text` NULL | Caminho relativo; a montagem da URL é do cliente |
| `position` | `integer` NOT NULL | Ordem **do provedor**, preservada sem reordenação (`FR-004`) |

`UNIQUE(list_id, external_id)` — impede a mesma série duas vezes na mesma lista, inclusive quando o
provedor devolve duplicata.
Índice: `(list_id, position)` — a leitura é sempre "os itens desta lista, nesta ordem".

### Atualização

Cada ciclo substitui os itens da lista: remove os existentes e insere os obtidos, dentro de uma
transação. É o que faz a ordem nova valer e séries que saíram dos destaques desaparecerem.

Consequência aceita: durante a substituição não há estado intermediário visível (a transação
garante), mas o histórico de posições anteriores não é preservado — não é requisito.

---

## 3. Relações

```text
catalog_lists 1─N catalog_list_items   (cascade ao remover a lista)

       (sem relação com series, seasons, episodes, users, user_series
        ou user_episode_progress — por decisão de projeto)
```

---

## 4. A invariante que esta feature protege

`series` contém **apenas séries completas**: toda linha tem temporadas e episódios conhecidos,
porque só entra ali pelo caminho da adição ao perfil, que carrega os detalhes.

Essa invariante é o que permite ao `ensureCached` tratar um acerto de cache como suficiente — ele
devolve o identificador sem verificar completude. Se `catalog_list_items` referenciasse `series`,
seria preciso inserir séries resumidas, a invariante cairia, e adicionar uma série vinda da home
produziria um perfil **sem episódios, sem erro visível**.

Manter os itens autocontidos é o que sustenta `FR-008` sem alterar o caminho existente.

---

## 5. Segurança

**RLS**: não se aplica. As duas tabelas guardam catálogo, não dado de usuário — mesma decisão já
tomada para `series`, `seasons` e `episodes`. O Princípio I continua satisfeito porque nenhuma
pessoa alcança dado de outra: não há coluna de usuário nestas tabelas, e o endpoint exige sessão
válida (`FR-003`).

**Privilégios**: as tabelas herdam a situação do schema. Como a migração
`20260924150000_revoke_anon_privileges` revogou os privilégios **padrão** de `anon` e
`authenticated`, as tabelas novas **já nascem sem exposição** ao PostgREST público — não é preciso
revogar nada.

A contrapartida: `scripts/setup-db.sql` precisa listar as duas tabelas explicitamente, porque o
acesso da role da aplicação vem de concessão nomeada. Sem isso a API sobe e a leitura falha com
`permission denied`, como aconteceria com qualquer tabela nova.

---

## 6. Progresso de temporada

Não é afetado. A feature não cria, lê nem altera marcações de episódio — o conteúdo das listas é
independente do que a pessoa acompanha (`FR-010`, `SC-005`).
