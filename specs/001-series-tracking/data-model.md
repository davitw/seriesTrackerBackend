# Phase 1 — Data Model: Backend de Acompanhamento de Séries

**Feature**: `001-series-tracking` | **Date**: 2026-09-23 | **Store**: PostgreSQL 15+ (Supabase)

Convenções: instantes em `TIMESTAMPTZ` armazenados em UTC; datas de calendário em `DATE` (estreia de
episódio, sem fuso); chaves primárias `uuid` geradas pela aplicação (`gen_random_uuid()` no banco
para registros de catálogo); nomes de coluna em `snake_case`.

---

## 1. `users`

Identidade da pessoa; dona de todo dado de perfil e progresso. (Entidade "Conta" da spec.)

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | gerado na aplicação, permite definir o escopo antes do `INSERT` (R-003) |
| `email` | `text` NOT NULL | `UNIQUE` sobre `lower(email)`; normalizado antes de gravar (FR-001) |
| `password_hash` | `text` NOT NULL | `argon2id`; nunca retornado por nenhuma rota, nunca logado |
| `created_at` | `timestamptz` NOT NULL | default `now()` |
| `updated_at` | `timestamptz` NOT NULL | atualizado em toda alteração |

Validações (FR-001): e-mail com formato válido; senha com no mínimo 6 caracteres; e-mail duplicado
recusado com `409 EMAIL_ALREADY_REGISTERED`.

Ciclo de vida (FR-020): encerramento de conta é `DELETE` da linha — os `ON DELETE CASCADE` removem
perfil, progresso e refresh tokens. Nenhum dado pessoal permanece.

RLS: habilitada. `SELECT`/`UPDATE`/`DELETE` apenas para `id = app_current_user_id()`. O `INSERT` de
registro ocorre com o escopo já definido para o novo id. Nenhuma política permite listar usuários.

---

## 2. `refresh_tokens`

Sessão renovável de uma conta. (Suporta FR-002 e FR-004.)

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL | FK → `users(id)` **ON DELETE CASCADE** |
| `token_hash` | `text` NOT NULL | `UNIQUE`; SHA-256 do valor opaco entregue ao cliente (R-004) |
| `expires_at` | `timestamptz` NOT NULL | 30 dias após a emissão |
| `revoked_at` | `timestamptz` NULL | preenchido no logout, na rotação ou no reuso detectado |
| `replaced_by` | `uuid` NULL | FK → `refresh_tokens(id)`; encadeia a rotação |
| `created_at` | `timestamptz` NOT NULL | default `now()` |

Regras de transição:
- **Emitido** → `revoked_at IS NULL AND expires_at > now()` (estado válido).
- **Rotacionado**: ao renovar, o token apresentado recebe `revoked_at = now()` e um novo é emitido
  com `replaced_by` preenchido.
- **Revogado**: logout marca `revoked_at`; apresentação de token revogado ou expirado é recusada
  com `401 INVALID_REFRESH_TOKEN`.
- **Reuso** (token já revogado apresentado de novo): a família é revogada por segurança.

Índice: `refresh_tokens(user_id)`; `refresh_tokens(token_hash)` único.

RLS: habilitada; todas as operações apenas para `user_id = app_current_user_id()`.

---

## 3. `series` — catálogo global (cache do provedor externo)

Não contém dado de usuário; é a cópia local dos metadados (FR-017). Escrita apenas pela aplicação.

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `external_id` | `integer` NOT NULL | `UNIQUE`; identificador no catálogo externo |
| `title` | `text` NOT NULL | |
| `original_title` | `text` NULL | |
| `first_air_date` | `date` NULL | usada para desambiguação de homônimas (FR-006, SC-005) |
| `overview` | `text` NULL | |
| `poster_path` | `text` NULL | caminho relativo; a montagem de URL é do cliente |
| `status` | `text` NULL | exibição/encerrada/cancelada — informativo, não altera progresso |
| `synced_at` | `timestamptz` NOT NULL | última sincronização com o provedor (TTL do job, R-006) |

---

## 4. `seasons`

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | |
| `series_id` | `uuid` NOT NULL | FK → `series(id)` **ON DELETE CASCADE** |
| `season_number` | `integer` NOT NULL | `UNIQUE(series_id, season_number)` |
| `name` | `text` NULL | |
| `air_date` | `date` NULL | estreia da temporada |
| `episode_count` | `integer` NULL | metadado informativo do provedor; **nunca** base do progresso (Princípio IV) |
| `poster_path` | `text` NULL | |

Índice: `seasons(series_id, season_number)`.

---

## 5. `episodes`

Unidade assistível (Entidade "Episódio" da spec). Fonte do total, dos faltantes e do próximo a
liberar.

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | |
| `series_id` | `uuid` NOT NULL | FK → `series(id)` **ON DELETE CASCADE** |
| `season_id` | `uuid` NOT NULL | FK → `seasons(id)` **ON DELETE CASCADE** |
| `season_number` | `integer` NOT NULL | desnormalizado de propósito: permite filtrar a temporada sem join |
| `episode_number` | `integer` NOT NULL | `UNIQUE(series_id, season_number, episode_number)` |
| `title` | `text` NULL | |
| `overview` | `text` NULL | |
| `air_date` | `date` NULL | **NULL ou futura ⇒ não liberado** (FR-013) |
| `runtime` | `integer` NULL | minutos |
| `still_path` | `text` NULL | |

Índices: `episodes(series_id, season_number, episode_number)` (ordenação e agregação de progresso);
`episodes(air_date)` (job de próximas estreias).

---

## 6. `user_series` — série acompanhada

Vínculo entre conta e série (Entidade "Série acompanhada" da spec).

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL | FK → `users(id)` **ON DELETE CASCADE** |
| `series_id` | `uuid` NOT NULL | FK → `series(id)` **ON DELETE CASCADE** |
| `added_at` | `timestamptz` NOT NULL | default `now()` |
| `last_watched_at` | `timestamptz` NULL | último episódio assistido **desta série**; base da ordenação das recentes (FR-008) |

`UNIQUE(user_id, series_id)` — é o que torna a adição idempotente (FR-007).
Índice: `user_series(user_id, last_watched_at DESC NULLS LAST, added_at DESC)`.

Regras:
- Adicionar série já presente: nenhuma escrita, resposta informa que já estava no perfil, progresso
  intacto.
- Remover (`FR-009`): na mesma transação, `DELETE` do vínculo **e** dos registros de
  `user_episode_progress` do usuário para episódios daquela série. Readicionar recomeça do zero.
- `last_watched_at` é atualizado apenas quando a marcação avança a data; desmarcar não o retrocede.

RLS: habilitada; todas as operações apenas para `user_id = app_current_user_id()`.

---

## 7. `user_episode_progress` — episódio assistido

Única fonte de verdade sobre o que foi assistido. A presença da linha **é** o estado assistido
(Entidade "Episódio assistido" da spec).

| Coluna | Tipo | Regras |
|--------|------|--------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL | FK → `users(id)` **ON DELETE CASCADE** |
| `episode_id` | `uuid` NOT NULL | FK → `episodes(id)` **ON DELETE CASCADE** |
| `watched_at` | `timestamptz` NOT NULL | momento da marcação; preenchido pelo `Clock` |

`UNIQUE(user_id, episode_id)` — base da idempotência (`INSERT ... ON CONFLICT DO NOTHING`).
Índices: `user_episode_progress(user_id, episode_id)`; `user_episode_progress(episode_id)` para o
cascade.

Regras de transição:
- **Marcar** (FR-011): `INSERT ... ON CONFLICT DO NOTHING`; se não havia linha, grava; se havia,
  mantém o `watched_at` original e a operação responde sucesso. Em ambos os casos atualiza
  `user_series.last_watched_at` se o novo instante for maior.
- **Desmarcar** (FR-012): `DELETE` da linha; idempotente (ausência de linha não é erro).
- **Recusa** (FR-013): episódio cujo `air_date` é nulo ou futuro não pode ser marcado — `422
  EPISODE_NOT_AIRED` com `airDate` (ou `null`) na resposta.
- Não existe escrita de progresso fora dessas duas operações: nenhuma coluna de contador, nenhuma
  edição direta (Princípio IV).

RLS: habilitada; todas as operações apenas para `user_id = app_current_user_id()`.

---

## 8. Progresso de temporada — visão derivada (não armazenada)

Entidade "Progresso de temporada" da spec. Calculada na leitura, dentro da transação escopada, a
partir de `episodes` e `user_episode_progress` da série e temporada solicitadas:

- `totalEpisodes`: episódios conhecidos da temporada.
- `airedEpisodes`: episódios com `air_date` não nulo e `<= hoje`.
- `watchedEpisodes`: linhas em `user_episode_progress` para episódios da temporada.
- `remainingAired`: `airedEpisodes - watchedEpisodes` (faltantes já disponíveis).
- `notAired`: episódios com `air_date` nulo ou futuro.
- `nextAirDate` / `nextEpisode`: menor `air_date` futuro da temporada, com número e título.
- Invariante verificável (SC-004): `watchedEpisodes + remainingAired = airedEpisodes`.

A série também expõe um resumo por temporada na listagem do perfil, sempre pela mesma derivação —
nunca por valor pré-calculado.

---

## 9. Relações

```text
users 1─N refresh_tokens        (cascade ao excluir conta)
users 1─N user_series           (cascade)
users 1─N user_episode_progress (cascade)
series 1─N seasons              (cascade)
series 1─N episodes             (cascade)
seasons 1─N episodes            (cascade)
series N─N users  via user_series
episodes N─N users via user_episode_progress
```

---

## 10. Políticas de RLS (resumo executável em migração)

Tabelas com dado de usuário: `users`, `refresh_tokens`, `user_series`, `user_episode_progress`.
Tabelas de catálogo (`series`, `seasons`, `episodes`): RLS não é exigida pelo Princípio I por não
conterem dado de usuário; o acesso é exclusivamente do servidor (nunca de um cliente).

```sql
-- função de escopo, usada por todas as políticas
create or replace function app_current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.current_user_id', true), '')::uuid $$;

-- exemplo de política por operação (padrão repetido nas quatro tabelas)
alter table user_episode_progress enable row level security;
create policy uep_select on user_episode_progress for select using (user_id = app_current_user_id());
create policy uep_insert on user_episode_progress for insert with check (user_id = app_current_user_id());
create policy uep_delete on user_episode_progress for delete using (user_id = app_current_user_id());
-- UPDATE deliberadamente ausente: o estado assistido não se edita, cria-se e remove-se
```

Funções `SECURITY DEFINER` para os dois acessos legítimos fora do escopo (R-003):
`app_register_user(email, password_hash, id)` e `app_find_credentials(email)` — ambas com
`set search_path = public, pg_temp` e `EXECUTE` concedido apenas à role da aplicação.

Roles: role da aplicação criada com `NOSUPERUSER NOBYPASSRLS`; chave de service role do Supabase
nunca usada nos serviços e nunca presente no cliente.
