-- Migração inicial do SeriesTracker.
-- Contém o que o schema.prisma não expressa: índice único funcional em lower(email),
-- Row Level Security com FORCE e política por operação, e as funções SECURITY DEFINER
-- usadas pelos dois acessos legítimos fora do escopo de usuário (registro e credenciais).
--
-- Esta migração MUST rodar como role privilegiada (owner das funções), porque
-- `app_find_credentials` precisa ler `users` antes de existir usuário autenticado.
-- A role da aplicação nunca recebe BYPASSRLS.

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists users (
  id            uuid primary key,
  email         text not null,
  password_hash text not null,
  created_at    timestamptz(6) not null default now(),
  updated_at    timestamptz(6) not null default now()
);
-- Unicidade sobre o e-mail normalizado: `Ana@x.com` e `ana@x.com` são a mesma conta.
create unique index if not exists users_email_lower_key on users (lower(email));

create table if not exists refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz(6) not null,
  revoked_at  timestamptz(6),
  replaced_by uuid references refresh_tokens (id) on delete set null,
  created_at  timestamptz(6) not null default now()
);
create index if not exists refresh_tokens_user_id_idx on refresh_tokens (user_id);

create table if not exists series (
  id             uuid primary key default gen_random_uuid(),
  external_id    integer not null unique,
  title          text not null,
  original_title text,
  first_air_date date,
  overview       text,
  poster_path    text,
  status         text,
  synced_at      timestamptz(6) not null default now()
);

create table if not exists seasons (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references series (id) on delete cascade,
  season_number integer not null,
  name          text,
  air_date      date,
  episode_count integer,
  poster_path   text,
  constraint seasons_series_season_key unique (series_id, season_number)
);
create index if not exists seasons_series_season_idx on seasons (series_id, season_number);

create table if not exists episodes (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references series (id) on delete cascade,
  season_id      uuid not null references seasons (id) on delete cascade,
  season_number  integer not null,
  episode_number integer not null,
  title          text,
  overview       text,
  air_date       date,
  runtime        integer,
  still_path     text,
  constraint episodes_series_season_episode_key unique (series_id, season_number, episode_number)
);
create index if not exists episodes_series_season_episode_idx
  on episodes (series_id, season_number, episode_number);
create index if not exists episodes_air_date_idx on episodes (air_date);

create table if not exists user_series (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (id) on delete cascade,
  series_id       uuid not null references series (id) on delete cascade,
  added_at        timestamptz(6) not null default now(),
  last_watched_at timestamptz(6),
  constraint user_series_user_series_key unique (user_id, series_id)
);
create index if not exists user_series_recent_idx
  on user_series (user_id, last_watched_at desc nulls last, added_at desc);

create table if not exists user_episode_progress (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  episode_id uuid not null references episodes (id) on delete cascade,
  watched_at timestamptz(6) not null,
  constraint user_episode_progress_user_episode_key unique (user_id, episode_id)
);
create index if not exists user_episode_progress_user_episode_idx
  on user_episode_progress (user_id, episode_id);
create index if not exists user_episode_progress_episode_idx
  on user_episode_progress (episode_id);

-- ---------------------------------------------------------------------------
-- Escopo de usuário e Row Level Security
-- ---------------------------------------------------------------------------
-- A variável de sessão `app.current_user_id` é definida por transação pela aplicação
-- (SET LOCAL) antes de qualquer consulta que toque dado de usuário.

create or replace function app_current_user_id() returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

comment on function app_current_user_id() is
  'Identificador do usuário autenticado na transação corrente. Nulo fora de escopo.';

-- FORCE garante que nem o owner da tabela escapa das políticas.
alter table users enable row level security;
alter table users force row level security;
alter table refresh_tokens enable row level security;
alter table refresh_tokens force row level security;
alter table user_series enable row level security;
alter table user_series force row level security;
alter table user_episode_progress enable row level security;
alter table user_episode_progress force row level security;

-- users: a pessoa enxerga e altera apenas a própria linha.
drop policy if exists users_select_self on users;
create policy users_select_self on users for select using (id = app_current_user_id());
drop policy if exists users_insert_self on users;
create policy users_insert_self on users for insert with check (id = app_current_user_id());
drop policy if exists users_update_self on users;
create policy users_update_self on users for update using (id = app_current_user_id())
  with check (id = app_current_user_id());
drop policy if exists users_delete_self on users;
create policy users_delete_self on users for delete using (id = app_current_user_id());

-- refresh_tokens: apenas as sessões da própria conta.
drop policy if exists refresh_tokens_select_own on refresh_tokens;
create policy refresh_tokens_select_own on refresh_tokens for select
  using (user_id = app_current_user_id());
drop policy if exists refresh_tokens_insert_own on refresh_tokens;
create policy refresh_tokens_insert_own on refresh_tokens for insert
  with check (user_id = app_current_user_id());
drop policy if exists refresh_tokens_update_own on refresh_tokens;
create policy refresh_tokens_update_own on refresh_tokens for update
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
drop policy if exists refresh_tokens_delete_own on refresh_tokens;
create policy refresh_tokens_delete_own on refresh_tokens for delete
  using (user_id = app_current_user_id());

-- user_series: apenas o próprio perfil.
drop policy if exists user_series_select_own on user_series;
create policy user_series_select_own on user_series for select
  using (user_id = app_current_user_id());
drop policy if exists user_series_insert_own on user_series;
create policy user_series_insert_own on user_series for insert
  with check (user_id = app_current_user_id());
drop policy if exists user_series_update_own on user_series;
create policy user_series_update_own on user_series for update
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
drop policy if exists user_series_delete_own on user_series;
create policy user_series_delete_own on user_series for delete
  using (user_id = app_current_user_id());

-- user_episode_progress: o estado assistido não se edita — cria-se e remove-se.
drop policy if exists user_episode_progress_select_own on user_episode_progress;
create policy user_episode_progress_select_own on user_episode_progress for select
  using (user_id = app_current_user_id());
drop policy if exists user_episode_progress_insert_own on user_episode_progress;
create policy user_episode_progress_insert_own on user_episode_progress for insert
  with check (user_id = app_current_user_id());
drop policy if exists user_episode_progress_delete_own on user_episode_progress;
create policy user_episode_progress_delete_own on user_episode_progress for delete
  using (user_id = app_current_user_id());

-- ---------------------------------------------------------------------------
-- Funções de autenticação (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- Os dois acessos legítimos fora do escopo de sessão: criar conta (ainda não há usuário
-- autenticado) e verificar credenciais (o login precisa achar a conta pelo e-mail).
-- Rodam com os privilégios de quem as criou, com search_path fixo.

create or replace function app_register_user(
  p_id uuid,
  p_email text,
  p_password_hash text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into users (id, email, password_hash) values (p_id, lower(p_email), p_password_hash);
exception
  when unique_violation then
    raise exception 'email_already_registered' using errcode = '23505';
end;
$$;

create or replace function app_find_credentials(p_email text)
returns table (id uuid, password_hash text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.password_hash from users u where lower(u.email) = lower(p_email)
$$;

revoke all on function app_register_user(uuid, text, text) from public;
revoke all on function app_find_credentials(text) from public;
