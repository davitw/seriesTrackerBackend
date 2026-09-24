-- Revoga os privilégios de `anon` e `authenticated` nas tabelas do schema `public`.
--
-- Contexto: o Supabase configura ALTER DEFAULT PRIVILEGES no schema `public`, de modo que
-- toda tabela criada ali nasce com privilégios para `anon`, `authenticated` e
-- `service_role`. As duas primeiras são alcançáveis pelo PostgREST com a anon key, que é
-- distribuída a aplicativos cliente e, por isso, tratada como pública.
--
-- Este backend não usa PostgREST: o acesso é exclusivamente pelo Prisma com a role
-- `series_tracker_app`, que recebe os próprios privilégios em scripts/setup-db.sql.
-- Mantidos, os grants dariam a quem tem a anon key leitura **e escrita** nas tabelas de
-- catálogo (que não têm RLS por não conterem dado de usuário) e no controle de migrações.
-- As quatro tabelas de dado de usuário continuariam protegidas pela RLS — mas depender
-- apenas da RLS onde o privilégio é desnecessário é confiar em uma única camada.
--
-- A segunda metade do arquivo não é menos importante que a primeira: sem alterar os
-- privilégios **padrão**, a próxima migração que criar uma tabela volta a expô-la.
--
-- Nada aqui toca a role da aplicação: o REVOKE nomeia apenas `anon` e `authenticated`.
--
-- Escrito em bloco condicional porque essas roles existem no Supabase e não existem em um
-- PostgreSQL comum — a mesma migração precisa rodar nos dois ambientes, e um deploy do
-- zero roda esta migração antes de a role da aplicação existir.

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables    in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke all on all functions in schema public from %I', role_name);

      execute format(
        'alter default privileges in schema public revoke all on tables    from %I',
        role_name
      );
      execute format(
        'alter default privileges in schema public revoke all on sequences from %I',
        role_name
      );
      execute format(
        'alter default privileges in schema public revoke all on functions from %I',
        role_name
      );
    end if;
  end loop;
end
$$;
