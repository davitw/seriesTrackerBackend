-- Privilégios da role da aplicação.
--
-- Rode DEPOIS de `prisma migrate deploy`, como role privilegiada:
--   psql "$MIGRATE_DATABASE_URL" -f scripts/setup-db.sql
--
-- A role da aplicação NUNCA recebe SUPERUSER nem BYPASSRLS: é isso que faz a Row Level
-- Security valer como defesa em profundidade, e não apenas como intenção.
--
-- No Supabase, troque `series_tracker_app` pela role usada pelo serviço.

\set app_role series_tracker_app

-- Acesso ao schema
grant usage on schema public to :"app_role";

-- Dados de usuário: a RLS restringe as linhas; o grant apenas abre a operação.
grant select, insert, update, delete on users to :"app_role";
grant select, insert, update, delete on refresh_tokens to :"app_role";
grant select, insert, update, delete on user_series to :"app_role";
grant select, insert, delete on user_episode_progress to :"app_role";
-- Sem UPDATE em user_episode_progress: o estado assistido cria-se e remove-se,
-- nunca se edita (Princípio IV).

-- Catálogo: dado global, sem RLS, escrito pela aplicação a partir do provedor externo.
grant select, insert, update, delete on series to :"app_role";
grant select, insert, update, delete on seasons to :"app_role";
grant select, insert, update, delete on episodes to :"app_role";

-- Funções de escopo e de autenticação
grant execute on function app_current_user_id() to :"app_role";
grant execute on function app_register_user(uuid, text, text) to :"app_role";
grant execute on function app_find_credentials(text) to :"app_role";
grant execute on function app_find_refresh_session(text) to :"app_role";
grant execute on function app_revoke_all_sessions(uuid) to :"app_role";
