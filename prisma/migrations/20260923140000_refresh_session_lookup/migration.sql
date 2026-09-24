-- Terceiro acesso legítimo fora do escopo de sessão: a renovação precisa achar a sessão
-- pelo hash da credencial, e nesse momento ainda não se sabe de quem ela é — a RLS exige
-- uma identidade que só existe depois de encontrá-la.
--
-- A função devolve apenas o necessário para decidir (dono, validade, revogação) e continua
-- exigindo que toda escrita em `refresh_tokens` aconteça com escopo de usuário definido.

create function app_find_refresh_session(p_token_hash text)
returns table (id uuid, user_id uuid, expires_at timestamptz, revoked_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, r.expires_at, r.revoked_at
  from refresh_tokens r
  where r.token_hash = p_token_hash
$$;

revoke all on function app_find_refresh_session(text) from public;

-- Revogação de família no reuso detectado: encerra todas as sessões da conta.
create function app_revoke_all_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  update refresh_tokens
     set revoked_at = now()
   where user_id = p_user_id
     and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function app_revoke_all_sessions(uuid) from public;
