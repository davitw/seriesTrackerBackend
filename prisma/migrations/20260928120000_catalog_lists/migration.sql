-- Listas de destaques para a home (feature 002).
--
-- Os itens são AUTOCONTIDOS: não referenciam `series`. É deliberado.
--
-- A tabela `series` contém apenas séries COMPLETAS (com temporadas e episódios), porque só
-- entra ali pelo caminho da adição ao perfil, que carrega os detalhes. É essa invariante que
-- permite ao `ensureCached` tratar um acerto de cache como suficiente.
--
-- Se as listas referenciassem `series`, seria preciso inserir séries só com o resumo, a
-- invariante cairia, e adicionar uma série vinda da home produziria um perfil SEM EPISÓDIOS,
-- sem nenhum erro aparecer. Ver specs/002-home-discovery/research.md R-001.

create table if not exists catalog_lists (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  name       text not null,
  synced_at  timestamptz(6),
  created_at timestamptz(6) not null default now(),
  constraint catalog_lists_key_key unique (key)
);

create table if not exists catalog_list_items (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references catalog_lists (id) on delete cascade,
  external_id    integer not null,
  title          text not null,
  first_air_date date,
  poster_path    text,
  position       integer not null,
  constraint catalog_list_items_list_external_key unique (list_id, external_id)
);

-- A leitura é sempre "os itens desta lista, nesta ordem".
create index if not exists catalog_list_items_list_position_idx
  on catalog_list_items (list_id, position);

-- As três listas existem desde a migração: a chave ganha um dono único e o endpoint não
-- precisa criá-las em tempo de requisição. `synced_at` fica nulo — é o que sinaliza
-- "nunca obtida" e dispara a busca na primeira abertura (R-004).
insert into catalog_lists (key, name) values
  ('popular', 'Populares'),
  ('on_the_air', 'Em exibição'),
  ('top_rated', 'Mais bem avaliadas')
on conflict (key) do nothing;
